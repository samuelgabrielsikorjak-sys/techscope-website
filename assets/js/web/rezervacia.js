// techscope — rezervácia online stretnutia.
// Krok 1: kontakt (telefón, meno, priezvisko, e-mail) → Krok 2: kalendár s časmi
// → Krok 3: „Rezervovať“ (Supabase RPC) → Krok 4: potvrdenie + okno s ďalšími krokmi.
// Tvar volaní rpc('vytvorit_rezervaciu') a functions.invoke('create-meet-event') sa nemení.
//
// Poznámka k dynamickému obsahu: markup vkladaný sem cez innerHTML zámerne
// nepoužíva triedu .reveal — ten mechanizmus (assets/js/script.js) sleduje len
// prvky prítomné v DOM pri DOMContentLoaded, takže neskôr pridané .reveal
// prvky by ostali navždy neviditeľné (opacity:0).
//
// Služba (leads.produkt): select vo formulári, predvyplnený z URL parametra
// ?produkt=<kľúč PRODUKTY> — CTA odkazy na produktových stránkach ho nastavujú.

(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var app = document.getElementById('rezervacia-app');
    if (!app) return;

    if (!window.supabaseClient) {
      app.innerHTML = '<p>Rezervačný systém sa nepodarilo načítať. Napíšte nám prosím na <a href="mailto:contact@techscope.sk">contact@techscope.sk</a>.</p>';
      return;
    }

    initBooking(app);
  });

  var PRODUKTY = {
    softver_na_mieru: 'Softvér na mieru',
    portal: 'Klientsky portál',
    mobilna_aplikacia: 'Mobilná aplikácia',
    integracie: 'Integrácie',
    nahrada_systemu: 'Náhrada starého systému',
    ai_automatizacia: 'Automatizácia s AI',
    neurcene: 'Neviem ešte, poradíme sa na stretnutí'
  };

  function initBooking(app) {
    var selectedSlot = null;
    var _n = new Date();
    var today = _n.getFullYear() + '-' + String(_n.getMonth() + 1).padStart(2, '0') + '-' + String(_n.getDate()).padStart(2, '0');

    // Nadpis (#step-heading s <h1>) je statický v rezervacia.html kvôli SEO;
    // JS ho už nevkladá, len ho skryje po potvrdení rezervácie.
    app.innerHTML = '<div id="form-area"></div>';

    var stepHeading = document.getElementById('step-heading');
    var calStage = document.getElementById('rezervacia-cal');   // kalendár je pod formulárom, cez celú šírku
    var slotArea = document.getElementById('slot-area');
    var formArea = document.getElementById('form-area');
    var submitArea = document.getElementById('submit-area');
    var contact = null;   // údaje z kroku 1

    renderContactForm();

    // Termín sa ponúka, iba ak začína najskôr o MIN_HODIN hodín (dnešné už prebehnuté sa nezobrazia).
    // Obsadené termíny filtruje už databáza (dostupny = true).
    var MIN_HODIN = 2;
    function upcoming(slots) {
      var limit = Date.now() + MIN_HODIN * 3600 * 1000;
      return slots.filter(function (s) {
        return new Date(s.datum + 'T' + s.cas_od.slice(0, 5) + ':00').getTime() >= limit;
      });
    }

    function fetchSlots() {
      return window.supabaseClient
        .from('call_slots')
        .select('id,datum,cas_od,cas_do')
        .eq('dostupny', true)
        .gte('datum', today)
        .order('datum', { ascending: true })
        .order('cas_od', { ascending: true })
        .limit(50)
        .then(function (res) {
          if (res.error) {
            slotArea.innerHTML = '<p>Termíny sa nepodarilo načítať. Napíšte nám prosím na <a href="mailto:contact@techscope.sk">contact@techscope.sk</a>.</p>';
            return;
          }
          renderSlots(upcoming(res.data || []));
        })
        .catch(function () {
          slotArea.innerHTML = '<p>Termíny sa nepodarilo načítať. Napíšte nám prosím na <a href="mailto:contact@techscope.sk">contact@techscope.sk</a>.</p>';
        });
    }

    // Calendly-style two-step picker: Krok A je mesačný kalendárový grid
    // (klik na deň s dostupnými termínmi), Krok B sú časové sloty pre
    // vybraný deň (.rz-slot, presne ako predtým). Dáta zo slots poľa sa
    // len preskupia podľa dátumu do byDate mapy — fetchSlots()/query sa
    // nemení, len tento render.
    function renderSlots(slots) {
      if (!slots.length) {
        slotArea.innerHTML = '<p>Momentálne nemáme voľné termíny. Napíšte nám priamo na <a href="mailto:contact@techscope.sk">contact@techscope.sk</a> a dohodneme sa individuálne.</p>';
        return;
      }

      var byDate = {};
      for (var i = 0; i < slots.length; i++) {
        var datum = slots[i].datum;
        if (!byDate[datum]) byDate[datum] = [];
        byDate[datum].push(slots[i]);
      }

      var firstAvailable = Object.keys(byDate).sort()[0];
      var firstAvailableDate = new Date(firstAvailable + 'T00:00:00');
      var viewYear = firstAvailableDate.getFullYear();
      var viewMonth = firstAvailableDate.getMonth();
      var todayDate = new Date(today + 'T00:00:00');
      var selectedDate = null;

      slotArea.innerHTML =
        '<div class="rz-calendar">' +
          '<div class="rz-calendar__col">' +
            '<div class="rz-calendar__nav">' +
              '<button type="button" class="rz-calendar__nav-btn" id="cal-prev" aria-label="Predchádzajúci mesiac">‹</button>' +
              '<div class="rz-calendar__title" id="cal-title"></div>' +
              '<button type="button" class="rz-calendar__nav-btn" id="cal-next" aria-label="Nasledujúci mesiac">›</button>' +
            '</div>' +
            '<div class="rz-calendar__weekdays"><span>Po</span><span>Ut</span><span>St</span><span>Št</span><span>Pi</span><span>So</span><span>Ne</span></div>' +
            '<div class="rz-calendar__grid" id="cal-grid"></div>' +
            '<p class="rz-calendar__note" id="cal-empty-note"></p>' +
          '</div>' +
          '<div class="rz-times" id="cal-times"><p class="rz-times__placeholder">Vyberte si deň v kalendári, potom čas.</p></div>' +
        '</div>';

      var calTitle = document.getElementById('cal-title');
      var calGrid = document.getElementById('cal-grid');
      var calTimes = document.getElementById('cal-times');
      var calEmptyNote = document.getElementById('cal-empty-note');
      var prevBtn = document.getElementById('cal-prev');
      var nextBtn = document.getElementById('cal-next');

      var MONTH_NAMES = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December'];

      prevBtn.addEventListener('click', function () {
        viewMonth--;
        if (viewMonth < 0) { viewMonth = 11; viewYear--; }
        renderCalendar(true);
      });
      nextBtn.addEventListener('click', function () {
        viewMonth++;
        if (viewMonth > 11) { viewMonth = 0; viewYear++; }
        renderCalendar(true);
      });

      function pad(n) { return n < 10 ? '0' + n : '' + n; }

      function renderCalendar(animate) {
        calTitle.textContent = MONTH_NAMES[viewMonth] + ' ' + viewYear;
        prevBtn.disabled = (viewYear === todayDate.getFullYear() && viewMonth === todayDate.getMonth());

        var firstOfMonth = new Date(viewYear, viewMonth, 1);
        var startOffset = (firstOfMonth.getDay() + 6) % 7; // Po=0 ... Ne=6
        var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

        var html = '';
        for (var e = 0; e < startOffset; e++) {
          html += '<div class="rz-day rz-day--empty"></div>';
        }
        var anyAvailable = false;
        for (var day = 1; day <= daysInMonth; day++) {
          var iso = viewYear + '-' + pad(viewMonth + 1) + '-' + pad(day);
          var available = byDate.hasOwnProperty(iso) && iso >= today;
          if (available) anyAvailable = true;

          var classes = 'rz-day';
          if (iso === today) classes += ' rz-day--today';
          classes += available ? ' rz-day--available' : ' rz-day--disabled';
          if (available && iso === selectedDate) classes += ' rz-day--selected';

          html += '<button type="button" class="' + classes + '"' +
            (available ? ' data-date="' + iso + '"' : ' disabled') +
            '>' + day + '</button>';
        }

        calGrid.innerHTML = html;
        calEmptyNote.textContent = anyAvailable ? '' : 'V tomto mesiaci nie sú žiadne voľné termíny.';

        if (animate) {
          calGrid.classList.remove('rz-fade-in');
          void calGrid.offsetWidth;
          calGrid.classList.add('rz-fade-in');
        }

        var dayButtons = calGrid.querySelectorAll('.rz-day--available');
        for (var b = 0; b < dayButtons.length; b++) {
          dayButtons[b].addEventListener('click', function () {
            var prevSelected = calGrid.querySelector('.rz-day--selected');
            if (prevSelected) prevSelected.classList.remove('rz-day--selected');
            this.classList.add('rz-day--selected');
            selectedDate = this.getAttribute('data-date');
            renderTimes();
          });
        }
      }

      function renderTimes() {
        if (!selectedDate || !byDate[selectedDate]) {
          calTimes.innerHTML = '<p class="rz-times__placeholder">Vyberte si deň v kalendári.</p>';
          return;
        }
        var daySlots = byDate[selectedDate];
        var html = '<h4>' + formatDate(selectedDate) + '</h4><p class="rz-times__hint">Vyberte si čas, stretnutie trvá 30 minút.</p><div class="rz-slots">';
        for (var s = 0; s < daySlots.length; s++) {
          var slot = daySlots[s];
          html += '<button type="button" class="rz-slot" data-slot-id="' + slot.id + '">' +
            slot.cas_od.slice(0, 5) + '-' + slot.cas_do.slice(0, 5) + '</button>';
        }
        html += '</div>';
        calTimes.innerHTML = html;
        calTimes.classList.remove('rz-times--in');
        void calTimes.offsetWidth;
        calTimes.classList.add('rz-times--in');

        var buttons = calTimes.querySelectorAll('.rz-slot');
        for (var b = 0; b < buttons.length; b++) {
          buttons[b].addEventListener('click', function () {
            for (var k = 0; k < buttons.length; k++) { buttons[k].classList.remove('rz-slot--selected'); }
            this.classList.add('rz-slot--selected');
            var slotId = this.getAttribute('data-slot-id');
            var match = null;
            for (var m = 0; m < daySlots.length; m++) {
              if (daySlots[m].id === slotId) { match = daySlots[m]; break; }
            }
            selectedSlot = match;
            renderSubmit();
          });
        }
      }

      renderCalendar(false);
    }

    // Krok 1: kontakt. Po „Pokračovať“ sa odomkne kalendár a stránka sa naň posunie.
    function renderContactForm() {
      formArea.innerHTML = buildContactHtml();
      var form = formArea.querySelector('form');
      var emailFromUrl = new URLSearchParams(window.location.search).get('email');
      var remembered = ''; try { remembered = localStorage.getItem('ts_email') || ''; } catch (err) {}
      if (emailFromUrl) form.email.value = emailFromUrl.trim().slice(0, 254); else if (remembered) form.email.value = remembered;

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var ok = validateField(form.telefon, /^[0-9 ]{6,15}$/.test(form.telefon.value.trim()));
        ok = validateField(form.meno, form.meno.value.trim() !== '') && ok;
        ok = validateField(form.priezvisko, form.priezvisko.value.trim() !== '') && ok;
        ok = validateField(form.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.value.trim())) && ok;
        if (!ok) { var bad = form.querySelector('.rz-row--invalid .field'); if (bad) bad.focus(); return; }
        try { localStorage.setItem('ts_email', form.email.value.trim()); } catch (err) {}
        contact = {
          meno_priezvisko: form.meno.value.trim() + ' ' + form.priezvisko.value.trim(),
          email: form.email.value.trim(),
          telefon: form.predvolba.value + ' ' + form.telefon.value.trim().replace(/\s+/g, ' ')
        };
        // kontakt je hotový: zamkneme kartu (dá sa upraviť), odomkneme kalendár
        var fields = form.querySelectorAll('.field, select, button');
        for (var i = 0; i < fields.length; i++) fields[i].disabled = true;
        formArea.classList.add('rz-done');
        var edit = formArea.querySelector('[data-edit]');
        edit.hidden = false;
        calStage.hidden = false;
        calStage.classList.add('rz-unlock');
        if (!slotArea.getAttribute('data-loaded')) { slotArea.setAttribute('data-loaded', '1'); fetchSlots(); }
        scrollTo(calStage);
      });
      formArea.addEventListener('click', function (e) {
        if (!e.target.closest('[data-edit]')) return;
        var fields = form.querySelectorAll('.field, select, button');
        for (var i = 0; i < fields.length; i++) fields[i].disabled = false;
        formArea.classList.remove('rz-done');
        formArea.querySelector('[data-edit]').hidden = true;
        form.meno.focus();
      });
    }

    // Krok 3: vybraný termín + tlačidlo Rezervovať.
    function renderSubmit() {
      if (!selectedSlot) return;
      var summary = formatDate(selectedSlot.datum) + ', ' + selectedSlot.cas_od.slice(0, 5) + '–' + selectedSlot.cas_do.slice(0, 5);
      var first = !submitArea.querySelector('form');
      if (first) { submitArea.innerHTML = buildSubmitHtml(); wireSubmit(); }
      submitArea.hidden = false;
      document.getElementById('selected-slot-summary').textContent = summary;
      scrollTo(submitArea, true);
    }

    // Kalendár sa posunie tak, aby bol celý v obraze (hore pod lištou); blok Rezervovať len ak treba.
    function scrollTo(el, nearest) {
      el.style.scrollMarginTop = '92px';
      el.style.scrollMarginBottom = '16px';
      el.scrollIntoView({ behavior: 'smooth', block: nearest ? 'nearest' : 'start' });
    }

    function wireSubmit() {
      var form = submitArea.querySelector('form');
      var banner = submitArea.querySelector('.rz-form__error');
      var submitBtn = form.querySelector('button[type="submit"]');

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        banner.classList.remove('rz-form__error--show');

        if (!selectedSlot) {
          banner.textContent = 'Najprv si prosím vyberte termín hovoru vyššie.';
          banner.classList.add('rz-form__error--show');
          return;
        }
        if (!contact) { scrollTo(formArea); return; }

        // Polia, ktoré formulár nemá (firma, pozícia, rozpočet, urgencia, popis, zdroj), idú do RPC
        // s neutrálnou hodnotou, aby tvar payloadu vytvorit_rezervaciu ostal presne rovnaký.
        // Súhlas so spracovaním údajov dal klient kliknutím na „Pokračovať“ v kroku 1 (text pod tlačidlom).
        var values = {
          meno_priezvisko: contact.meno_priezvisko,
          nazov_firmy: '',
          pozicia: '',
          produkt: produktFromUrl(),
          email: contact.email,
          telefon: contact.telefon,
          rozpocet: 'neuvedené',
          urgencia: 'neuvedené',
          popis_projektu: '',
          zdroj: zdrojFromUrl(),
          gdpr_suhlas: true
        };

        submitBtn.disabled = true;
        submitBtn.textContent = 'Odosielam…';

        window.supabaseClient.rpc('vytvorit_rezervaciu', {
          p_meno_priezvisko: values.meno_priezvisko,
          p_nazov_firmy: values.nazov_firmy,
          p_pozicia: values.pozicia,
          p_produkt: values.produkt,
          p_email: values.email,
          p_telefon: values.telefon,
          p_rozpocet: values.rozpocet,
          p_urgencia: values.urgencia,
          p_popis_projektu: values.popis_projektu || null,
          p_zdroj: values.zdroj || null,
          p_gdpr_suhlas: values.gdpr_suhlas,
          p_slot_id: selectedSlot.id
        }).then(function (res) {
          if (res.error) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Rezervovať';
            if (res.error.message && res.error.message.indexOf('slot_obsadeny') !== -1) {
              banner.textContent = 'Tento termín je už bohužiaľ obsadený. Vyberte si prosím iný v kalendári.';
              banner.classList.add('rz-form__error--show');
              selectedSlot = null;
              submitArea.hidden = true;
              fetchSlots();
              scrollTo(slotArea);
            } else {
              banner.textContent = 'Nepodarilo sa odoslať rezerváciu. Skúste to prosím znova alebo nám napíšte na contact@techscope.sk.';
              banner.classList.add('rz-form__error--show');
            }
            return;
          }
          var summary = formatDate(selectedSlot.datum) + ', ' + selectedSlot.cas_od.slice(0, 5) + '-' + selectedSlot.cas_do.slice(0, 5);
          renderConfirmation(values, summary);

          // Vytvorenie Google Meet eventu (Edge Function "create-meet-event").
          // Database Webhook na INSERT do leads v tomto projekte nefunguje
          // (chýbajúca/poškodená supabase_functions.http_request()), preto ju
          // voláme rovno odtiaľto — hneď po úspešnom vytvor_rezervaciu, ale
          // zámerne BEZ await a mimo hlavného .then/.catch reťazca vyššie:
          // rezervácia je v DB už hotová a potvrdenie je zobrazené, takže
          // pomalá alebo zlyhaná Meet-integrácia nesmie užívateľa nijako
          // zdržať ani mu zobraziť chybu. Payload kopíruje tvar, aký by inak
          // poslal Database Webhook (type/table/schema/record/old_record),
          // aby create-meet-event vedela čítať rovnaké record.* polia.
          window.supabaseClient.functions.invoke('create-meet-event', {
            body: {
              type: 'INSERT',
              table: 'leads',
              schema: 'public',
              record: {
                id: res.data,
                slot_id: selectedSlot.id,
                meno_priezvisko: values.meno_priezvisko,
                nazov_firmy: values.nazov_firmy,
                email: values.email
              },
              old_record: null
            }
          }).then(function (meetRes) {
            if (meetRes.error) {
              console.error('create-meet-event vrátila chybu (rezervácia je napriek tomu v poriadku):', meetRes.error);
            }
          }).catch(function (err) {
            console.error('create-meet-event volanie zlyhalo (rezervácia je napriek tomu v poriadku):', err);
          });
        }).catch(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Rezervovať';
          banner.textContent = 'Nepodarilo sa odoslať rezerváciu. Skúste to prosím znova alebo nám napíšte na contact@techscope.sk.';
          banner.classList.add('rz-form__error--show');
        });
      });
    }

    function renderConfirmation(values, summary) {
      stepHeading.style.display = 'none';
      calStage.style.display = 'none';
      formArea.style.display = 'none';
      submitArea.style.display = 'none';
      // okno s ďalšími krokmi
      var dlg = document.getElementById('rz-thanks');
      if (dlg && dlg.showModal) {
        var when = document.getElementById('rz-thanks-when');
        if (when) when.textContent = summary;
        var mail = document.getElementById('rz-thanks-email');
        if (mail) mail.textContent = values.email;
        // kalendárny lístok: mesiac, deň a čas
        var dt = new Date(selectedSlot.datum + 'T12:00:00');
        var setT = function (id, v) { var n = document.getElementById(id); if (n) n.textContent = v; };
        setT('rz-thanks-month', dt.toLocaleDateString('sk-SK', { month: 'long' }));
        setT('rz-thanks-day', String(dt.getDate()));
        setT('rz-thanks-time', dt.toLocaleDateString('sk-SK', { weekday: 'long' }) + ', ' + selectedSlot.cas_od.slice(0, 5));
        // odkaz „Pridať do kalendára“ (Google Kalendár), čas v miestnom pásme
        var cal = document.getElementById('rz-thanks-cal');
        if (cal) {
          var d = selectedSlot.datum.replace(/-/g, ''), t1 = selectedSlot.cas_od.slice(0, 5).replace(':', '') + '00', t2 = selectedSlot.cas_do.slice(0, 5).replace(':', '') + '00';
          cal.href = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('Online stretnutie s techscope') +
            '&dates=' + d + 'T' + t1 + '/' + d + 'T' + t2 + '&ctz=Europe%2FBratislava&details=' + encodeURIComponent('Odkaz na Google Meet nájdete v pozvánke od techscope.');
        }
        dlg.tabIndex = -1;
        dlg.showModal();
        dlg.focus();
        dlg.querySelectorAll('[data-thanks-close]').forEach(function (b) { b.addEventListener('click', function () { dlg.close(); }); });
      }
      app.insertAdjacentHTML('beforeend', '<div id="confirm-area"></div>');
      document.getElementById('confirm-area').innerHTML =
        '<div class="rz-confirm">' +
          '<h3>Ďakujeme, stretnutie je rezervované.</h3>' +
          '<p class="rz-confirm__when"><strong>' + summary + '</strong> · online cez Google Meet</p>' +
          '<p>Pozvánku s odkazom na stretnutie sme poslali na <strong>' + escapeHtml(values.email) + '</strong>. Ak ju do pár minút nevidíte, pozrite sa aj do priečinka Spam.</p>' +
          '<p>Potrebujete termín zmeniť? Odpovedzte na pozvánku alebo napíšte na <a href="mailto:contact@techscope.sk">contact@techscope.sk</a>.</p>' +
          '<a class="btn btn--dark" href="index.html">Späť na web <span class="arr" aria-hidden="true">›</span></a>' +
        '</div>';
    }
  }

  // Landing page portálu posiela ?zdroj=lp-<varianta>, aby sa booknutý hovor pripísal správnej variante A/B testu.
  // Tvar payloadu vytvorit_rezervaciu sa nemení, mení sa iba hodnota p_zdroj (predtým vždy prázdna).
  function zdrojFromUrl() {
    var z = new URLSearchParams(window.location.search).get('zdroj') || '';
    return /^[a-z0-9-]{1,60}$/i.test(z) ? z : '';
  }

  function produktFromUrl() {
    var fromUrl = new URLSearchParams(window.location.search).get('produkt');
    return PRODUKTY[fromUrl] ? fromUrl : 'neurcene';
  }

  function produktOptionsHtml() {
    // Bez ?produkt= (homepage CTA) alebo s neznámym kľúčom je predvolené 'neurcene'.
    var fromUrl = new URLSearchParams(window.location.search).get('produkt');
    var selected = PRODUKTY[fromUrl] ? fromUrl : 'neurcene';
    return Object.keys(PRODUKTY).map(function (key) {
      return '<option value="' + key + '"' + (key === selected ? ' selected' : '') + '>' + PRODUKTY[key] + '</option>';
    }).join('');
  }

  function validateField(input, isValid) {
    var row = input.closest('.rz-row');
    if (row) row.classList.toggle('rz-row--invalid', !isValid);
    return isValid;
  }

  function validateCheckbox(input) {
    var isValid = input.checked;
    var row = input.closest('.rz-row');
    if (row) row.classList.toggle('rz-row--invalid', !isValid);
    return isValid;
  }

  function formatDate(datum) {
    var d = new Date(datum + 'T00:00:00');
    var label = d.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Krok 1: jednoduchý kontakt. Predvoľba je predvolená na +421, dá sa zmeniť.
  var PREDVOLBY = [['+421', 'SK'], ['+420', 'CZ'], ['+43', 'AT'], ['+36', 'HU'], ['+48', 'PL'], ['+49', 'DE'], ['+44', 'UK']];
  function buildContactHtml() {
    var opts = PREDVOLBY.map(function (p) { return '<option value="' + p[0] + '"' + (p[0] === '+421' ? ' selected' : '') + '>' + p[1] + ' ' + p[0] + '</option>'; }).join('');
    return (
      '<div class="rz-form rz-contact">' +
        '<div class="rz-form__top"><h3>Na koho máme poslať pozvánku?</h3><button type="button" class="rz-edit" data-edit hidden>Upraviť</button></div>' +
        '<form novalidate>' +
          '<div class="rz-row">' +
            '<label for="f-telefon">Telefón</label>' +
            '<div class="rz-phone"><select class="field rz-phone__code" name="predvolba" aria-label="Predvoľba">' + opts + '</select>' +
            '<input type="tel" class="field" id="f-telefon" name="telefon" inputmode="tel" autocomplete="tel-national" placeholder="915 099 230" required></div>' +
            '<span class="rz-row__error">Zadajte prosím telefónne číslo.</span>' +
          '</div>' +
          '<div class="rz-grid2">' +
            '<div class="rz-row"><label for="f-meno">Krstné meno</label><input type="text" class="field" id="f-meno" name="meno" autocomplete="given-name" required><span class="rz-row__error">Zadajte meno.</span></div>' +
            '<div class="rz-row"><label for="f-priezvisko">Priezvisko</label><input type="text" class="field" id="f-priezvisko" name="priezvisko" autocomplete="family-name" required><span class="rz-row__error">Zadajte priezvisko.</span></div>' +
          '</div>' +
          '<div class="rz-row">' +
            '<label for="f-email">E-mail</label>' +
            '<input type="email" class="field" id="f-email" name="email" autocomplete="email" required>' +
            '<span class="rz-row__error">Zadajte prosím platný e-mail.</span>' +
          '</div>' +
          '<button type="submit" class="btn btn--dark rz-contact__next">Pokračovať <span class="arr" aria-hidden="true">›</span></button>' +
          '<p class="rz-consent">Kliknutím na Pokračovať súhlasíte so <a href="ochrana-udajov.html" target="_blank" rel="noopener">spracovaním osobných údajov</a> na účel stretnutia a s <a href="obchodne-podmienky.html" target="_blank" rel="noopener">obchodnými podmienkami</a>.</p>' +
        '</form>' +
      '</div>'
    );
  }

  // Krok 3: vybraný termín a tlačidlo Rezervovať.
  function buildSubmitHtml() {
    return (
      '<div class="rz-form rz-submit">' +
        '<p class="rz-submit__meta">30 min · online cez Google Meet</p>' +
        '<p class="rz-form__slot">Vybraný termín: <strong id="selected-slot-summary"></strong></p>' +
        '<div class="rz-form__error" role="alert"></div>' +
        '<form novalidate><button type="submit" class="btn btn--dark">Rezervovať</button></form>' +
      '</div>'
    );
  }

})();
