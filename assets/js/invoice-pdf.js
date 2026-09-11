// TECH-SCOPE — generovanie PDF faktúry (jsPDF + autotable, beží v prehliadači).
//
// window.invoicePdf.generate(data) -> Promise<Blob>  (application/pdf)
//
// Vizuál nadväzuje na techscope.sk: tmavá navy hlavička s logom "<techscope_",
// akcentová --scene-blue (#1B4DFF) na nadpisoch sekcií a na riadku celkovej
// sumy, inak čisté biele telo s čiernym textom a tenkými deliacimi čiarami —
// aby faktúra zostala dobre čitateľná pri tlači.
//
// Diakritika: zabudované fonty jsPDF (Helvetica) nevedia č/š/ž/ť/ď/ň/ľ/ô...,
// preto raz stiahneme DejaVu Sans (TTF, plná Latin Extended-A) z CDN a
// vložíme ho do dokumentu. Pri zlyhaní siete fallbackujeme na Helvetica.

(function () {
  var NAVY = [17, 26, 46];       // --dark  #111A2E
  var BLUE = [27, 77, 255];      // --accent #1B4DFF
  var INK = [20, 32, 58];        // --ink
  var MUTED = [120, 128, 140];
  var LINE = [210, 216, 224];

  var MARGIN = 16;
  var PAGE_W = 210;

  var _fontCache = null; // { regular: base64, bold: base64 } | 'failed'

  function abToBase64(buf) {
    var bytes = new Uint8Array(buf), bin = '', chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function loadFonts() {
    if (_fontCache) return Promise.resolve(_fontCache);
    var base = 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/';
    return Promise.all([
      fetch(base + 'DejaVuSans.ttf').then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); }),
      fetch(base + 'DejaVuSans-Bold.ttf').then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); })
    ]).then(function (bufs) {
      _fontCache = { regular: abToBase64(bufs[0]), bold: abToBase64(bufs[1]) };
      return _fontCache;
    }).catch(function () {
      _fontCache = 'failed';
      return _fontCache;
    });
  }

  function money(n) {
    var v = Number(n || 0);
    return v.toLocaleString('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }
  function qty(n) {
    var v = Number(n || 0);
    return (Math.round(v * 1000) / 1000).toLocaleString('sk-SK', { maximumFractionDigits: 3 });
  }
  function dateSk(d) {
    if (!d) return '—';
    var x = new Date(d + 'T00:00:00');
    if (isNaN(x)) return String(d);
    return x.toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric' });
  }
  function s(v) { return (v === null || v === undefined || v === '') ? '—' : String(v); }

  function generate(data) {
    return loadFonts().then(function (fonts) {
      var jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
      if (!jsPDFCtor) throw new Error('jsPDF sa nenačítal.');

      var doc = new jsPDFCtor({ unit: 'mm', format: 'a4' });
      var FONT = 'helvetica';
      if (fonts && fonts !== 'failed') {
        doc.addFileToVFS('DejaVuSans.ttf', fonts.regular);
        doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
        doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.bold);
        doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
        FONT = 'DejaVu';
      }

      // ---------- hlavička (navy pás s logom) ----------
      doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.rect(0, 0, PAGE_W, 30, 'F');

      // logo "<techscope_"  — < a _ v akcente, text biely (mono)
      doc.setFont('courier', 'bold');
      doc.setFontSize(17);
      var lx = MARGIN, ly = 18.5;
      doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]); doc.text('<', lx, ly);
      lx += doc.getTextWidth('<');
      doc.setTextColor(255, 255, 255); doc.text('techscope', lx, ly);
      lx += doc.getTextWidth('techscope');
      doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]); doc.text('_', lx, ly);

      // "FAKTÚRA" + číslo vpravo
      doc.setFont(FONT, 'bold');
      doc.setFontSize(20);
      doc.setTextColor(255, 255, 255);
      doc.text('FAKTÚRA', PAGE_W - MARGIN, 14, { align: 'right' });
      doc.setFontSize(11);
      doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
      doc.text('č. ' + s(data.cislo_faktury), PAGE_W - MARGIN, 21, { align: 'right' });
      doc.setFont(FONT, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(190, 200, 215);
      doc.text('Faktúra — daňový doklad', PAGE_W - MARGIN, 26, { align: 'right' });

      var y = 42;

      // ---------- dodávateľ / odberateľ ----------
      var colW = (PAGE_W - MARGIN * 2 - 8) / 2;
      var rx = MARGIN + colW + 8;

      function party(x, title, p, extraLabel, extraVal) {
        doc.setFont(FONT, 'bold'); doc.setFontSize(9);
        doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
        doc.text(title, x, y);
        doc.setFont(FONT, 'normal'); doc.setFontSize(9.5);
        doc.setTextColor(INK[0], INK[1], INK[2]);
        var yy = y + 6;
        doc.setFont(FONT, 'bold');
        doc.text(doc.splitTextToSize(s(p.meno), colW), x, yy); yy += 5;
        doc.setFont(FONT, 'normal');
        if (p.adresa) { var al = doc.splitTextToSize(String(p.adresa), colW); doc.text(al, x, yy); yy += 4.6 * al.length; }
        doc.setFontSize(8.5); doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
        doc.text('IČO: ' + s(p.ico), x, yy); yy += 4.4;
        doc.text('DIČ: ' + s(p.dic), x, yy); yy += 4.4;
        if (extraLabel) { doc.text(extraLabel + ': ' + s(extraVal), x, yy); yy += 4.4; }
        return yy;
      }

      var y1 = party(MARGIN, 'Dodávateľ', {
        meno: data.dodavatel_meno, adresa: data.dodavatel_adresa,
        ico: data.dodavatel_ico, dic: data.dodavatel_dic
      }, 'IČ DPH', data.je_platca_dph ? data.dodavatel_ic_dph : 'nie je platiteľ DPH');

      var y2 = party(rx, 'Odberateľ', {
        meno: data.odberatel_meno, adresa: data.odberatel_adresa,
        ico: data.odberatel_ico, dic: data.odberatel_dic
      });

      y = Math.max(y1, y2) + 6;

      // ---------- dátumy ----------
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.2);
      doc.line(MARGIN, y, PAGE_W - MARGIN, y); y += 6;
      doc.setFont(FONT, 'normal'); doc.setFontSize(9); doc.setTextColor(INK[0], INK[1], INK[2]);
      var third = (PAGE_W - MARGIN * 2) / 3;
      function dcell(i, label, val) {
        var x = MARGIN + third * i;
        doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]); doc.setFontSize(7.5);
        doc.text(label, x, y);
        doc.setTextColor(INK[0], INK[1], INK[2]); doc.setFontSize(9.5);
        doc.text(dateSk(val), x, y + 4.6);
      }
      dcell(0, 'Dátum vystavenia', data.datum_vystavenia);
      dcell(1, 'Dátum dodania', data.datum_dodania);
      dcell(2, 'Dátum splatnosti', data.datum_splatnosti);
      y += 12;

      // ---------- položky ----------
      var rows = (data.polozky || []).map(function (it) {
        var m = Number(it.mnozstvo || 0), c = Number(it.jednotkova_cena || 0);
        return [s(it.popis), qty(m), money(c), money(m * c)];
      });
      if (!rows.length) rows = [['—', '', '', money(0)]];

      doc.autoTable({
        startY: y,
        head: [['Popis položky', 'Množstvo', 'Jedn. cena', 'Spolu']],
        body: rows,
        theme: 'plain',
        styles: { font: FONT, fontSize: 9, cellPadding: 2.4, textColor: INK, lineColor: LINE, lineWidth: 0.15 },
        headStyles: { font: FONT, fontStyle: 'bold', fillColor: BLUE, textColor: [255, 255, 255], lineWidth: 0 },
        columnStyles: {
          0: { cellWidth: 'auto' },
          1: { halign: 'right', cellWidth: 24 },
          2: { halign: 'right', cellWidth: 30 },
          3: { halign: 'right', cellWidth: 32, fontStyle: 'bold' }
        },
        margin: { left: MARGIN, right: MARGIN }
      });

      y = doc.lastAutoTable.finalY + 8;

      // ---------- súčty (vpravo) ----------
      var boxW = 78, bx = PAGE_W - MARGIN - boxW;
      doc.setFont(FONT, 'normal'); doc.setFontSize(9.5); doc.setTextColor(INK[0], INK[1], INK[2]);

      function totRow(label, val, bold) {
        doc.setFont(FONT, bold ? 'bold' : 'normal');
        doc.text(label, bx, y);
        doc.text(val, PAGE_W - MARGIN, y, { align: 'right' });
        y += 6;
      }
      totRow('Základ dane', money(data.zaklad_dane));
      if (data.je_platca_dph) {
        totRow('DPH ' + qty(data.sadzba_dph) + ' %', money(data.vyska_dph));
      } else {
        doc.setFont(FONT, 'normal'); doc.setFontSize(8.5); doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
        var note = doc.splitTextToSize('Dodávateľ nie je platiteľom DPH. Fakturovaná suma je konečná.', boxW);
        doc.text(note, bx, y); y += 4.4 * note.length + 1.5;
        doc.setFontSize(9.5); doc.setTextColor(INK[0], INK[1], INK[2]);
      }

      // celková suma — akcentový pruh
      doc.setFillColor(BLUE[0], BLUE[1], BLUE[2]);
      doc.rect(bx - 3, y - 4.6, boxW + 3, 9, 'F');
      doc.setFont(FONT, 'bold'); doc.setFontSize(11); doc.setTextColor(255, 255, 255);
      doc.text('Celková suma', bx, y + 1);
      doc.text(money(data.celkova_suma), PAGE_W - MARGIN, y + 1, { align: 'right' });
      y += 14;
      doc.setTextColor(INK[0], INK[1], INK[2]);

      // ---------- platobné údaje (vľavo, na úrovni súčtov) ----------
      var py = doc.lastAutoTable.finalY + 8;
      doc.setFont(FONT, 'bold'); doc.setFontSize(9); doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
      doc.text('Platba', MARGIN, py); py += 6;
      doc.setFont(FONT, 'normal'); doc.setFontSize(9.5); doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text('IBAN: ' + s(data.iban), MARGIN, py); py += 5.5;
      doc.text('Variabilný symbol: ' + s(data.variabilny_symbol), MARGIN, py); py += 5.5;
      doc.text('Suma na úhradu: ' + money(data.celkova_suma), MARGIN, py);

      // ---------- pätička ----------
      var fy = 285;
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.2);
      doc.line(MARGIN, fy, PAGE_W - MARGIN, fy);
      doc.setFont(FONT, 'normal'); doc.setFontSize(7.5); doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text('Faktúra bola vystavená systémom TECH-SCOPE (techscope.sk).', MARGIN, fy + 5);
      doc.text('č. ' + s(data.cislo_faktury), PAGE_W - MARGIN, fy + 5, { align: 'right' });

      return doc.output('blob');
    });
  }

  window.invoicePdf = { generate: generate };
})();
