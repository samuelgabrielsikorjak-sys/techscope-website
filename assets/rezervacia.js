// TECH-SCOPE — rezervácia strategy callu (Krok 1: termín, Krok 2: formulár,
// Krok 3: submit cez Supabase RPC, Krok 4: potvrdenie).
//
// Poznámka k dynamickému obsahu: markup vkladaný sem cez innerHTML zámerne
// nepoužíva triedu .reveal — ten mechanizmus (assets/script.js) sleduje len
// prvky prítomné v DOM pri DOMContentLoaded, takže neskôr pridané .reveal
// prvky by ostali navždy neviditeľné (opacity:0).

(function () {
  var PRODUKT_LABELS = {
    ai_faktury: 'AI spracovanie faktúr',
    ai_asistent: 'AI zákaznícky asistent',
    dochadzka_system: 'Dochádzkový systém',
    softver_na_mieru: 'Softvér na mieru',
    web_mobile_app: 'Webová a mobilná aplikácia'
  };

  document.addEventListener('DOMContentLoaded', function () {
    var app = document.getElementById('rezervacia-app');
    if (!app) return;

    if (!window.supabaseClient) {
      app.innerHTML = '<p>Rezervačný systém sa nepodarilo načítať. Napíšte nám prosím na <a href="mailto:contact@techscope.sk">contact@techscope.sk</a>.</p>';
      return;
    }

    var params = new URLSearchParams(window.location.search);
    var produktKey = params.get('produkt');

    if (!PRODUKT_LABELS.hasOwnProperty(produktKey)) {
      renderProductPicker(app);
      return;
    }

    initBooking(app, produktKey);
  });

  function renderProductPicker(app) {
    app.innerHTML =
      '<div class="section-head">' +
        '<div class="eyebrow">Krok 0 · Výber produktu</div>' +
        '<h2>Pre ktorý produkt chcete rezervovať strategy call?</h2>' +
      '</div>' +
      '<div class="branch-grid cols-3">' +
        '<div class="branch-card">' +
          '<div class="eyebrow">01</div>' +
          '<h3>AI spracovanie faktúr</h3>' +
          '<p class="outcome">Automaticky vyťažíme údaje z prijatých faktúr a zapíšeme ich priamo do vášho účtovného systému.</p>' +
          '<a href="rezervacia.html?produkt=ai_faktury" class="btn btn-primary btn-block">Vybrať AI spracovanie faktúr</a>' +
        '</div>' +
        '<div class="branch-card">' +
          '<div class="eyebrow">02</div>' +
          '<h3>AI zákaznícky asistent</h3>' +
          '<p class="outcome">Chatbot na vašej webovej stránke, ktorý okamžite odpovedá zákazníkom na základe znalostí o vašich produktoch.</p>' +
          '<a href="rezervacia.html?produkt=ai_asistent" class="btn btn-primary btn-block">Vybrať AI zákazníckeho asistenta</a>' +
        '</div>' +
        '<div class="branch-card">' +
          '<div class="eyebrow">03</div>' +
          '<h3>Dochádzkový systém</h3>' +
          '<p class="outcome">Digitálna evidencia dochádzky, dovoleniek a voľna na mieru vašich pravidiel, s exportom pre mzdové účtovníctvo.</p>' +
          '<a href="rezervacia.html?produkt=dochadzka_system" class="btn btn-primary btn-block">Vybrať Dochádzkový systém</a>' +
        '</div>' +
      '</div>' +
      '<div class="section-head" style="margin-top:56px; margin-bottom:28px;">' +
        '<div class="eyebrow">Alebo vlastné riešenie</div>' +
        '<p style="margin:0;">Potrebujete niečo úplne na mieru? Postavíme vám softvér alebo aplikáciu od nuly.</p>' +
      '</div>' +
      '<div class="branch-grid">' +
        '<div class="branch-card compact">' +
          '<div class="eyebrow">Softvér na mieru</div>' +
          '<p class="outcome">Interný systém na mieru, ktorý nahrádza manuálne procesy a drahé SaaS nástroje vo vašej firme.</p>' +
          '<a href="rezervacia.html?produkt=softver_na_mieru" class="btn btn-ghost btn-block">Vybrať Softvér na mieru</a>' +
        '</div>' +
        '<div class="branch-card compact">' +
          '<div class="eyebrow">Webová a mobilná aplikácia</div>' +
          '<p class="outcome">Weby, e-shopy a mobilné aplikácie navrhnuté a vyvinuté na mieru vášho biznisu — od analýzy až po nasadenie.</p>' +
          '<a href="rezervacia.html?produkt=web_mobile_app" class="btn btn-ghost btn-block">Vybrať Webovú a mobilnú aplikáciu</a>' +
        '</div>' +
      '</div>';
  }

  function initBooking(app, produktKey) {
    var produktLabel = PRODUKT_LABELS[produktKey];
    var selectedSlot = null;
    var today = new Date().toISOString().slice(0, 10);

    app.innerHTML =
      '<div id="step-heading" style="text-align:center; margin-bottom:20px;">' +
        '<p style="color:var(--ink-faint); font-size:1.05rem; font-weight:500; margin-bottom:14px;">Posledný krok k uskutočneniu vašej vízie — vyberte si termín.</p>' +
        '<div class="eyebrow green">' + produktLabel + '</div>' +
      '</div>' +
      '<div id="slot-area"><p>Načítavam dostupné termíny…</p></div>' +
      '<div id="form-area"></div>';

    var stepHeading = document.getElementById('step-heading');
    var slotArea = document.getElementById('slot-area');
    var formArea = document.getElementById('form-area');

    fetchSlots();

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
          renderSlots(res.data || []);
        })
        .catch(function () {
          slotArea.innerHTML = '<p>Termíny sa nepodarilo načítať. Napíšte nám prosím na <a href="mailto:contact@techscope.sk">contact@techscope.sk</a>.</p>';
        });
    }

    // Calendly-style two-step picker: Krok A je mesačný kalendárový grid
    // (klik na deň s dostupnými termínmi), Krok B sú časové sloty pre
    // vybraný deň (.slot-btn, presne ako predtým). Dáta zo slots poľa sa
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
        '<div class="calendar-wrap">' +
          '<div class="calendar-col">' +
            '<div class="calendar-nav">' +
              '<button type="button" class="calendar-nav-btn" id="cal-prev" aria-label="Predchádzajúci mesiac">‹</button>' +
              '<div class="calendar-title" id="cal-title"></div>' +
              '<button type="button" class="calendar-nav-btn" id="cal-next" aria-label="Nasledujúci mesiac">›</button>' +
            '</div>' +
            '<div class="calendar-weekdays"><span>Po</span><span>Ut</span><span>St</span><span>Št</span><span>Pi</span><span>So</span><span>Ne</span></div>' +
            '<div class="calendar-grid" id="cal-grid"></div>' +
            '<p class="calendar-empty-note" id="cal-empty-note"></p>' +
          '</div>' +
          '<div class="calendar-times" id="cal-times"><p class="calendar-times-placeholder">Vyberte si deň v kalendári.</p></div>' +
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
          html += '<div class="cal-day cal-day-empty"></div>';
        }
        var anyAvailable = false;
        for (var day = 1; day <= daysInMonth; day++) {
          var iso = viewYear + '-' + pad(viewMonth + 1) + '-' + pad(day);
          var available = byDate.hasOwnProperty(iso) && iso >= today;
          if (available) anyAvailable = true;

          var classes = 'cal-day';
          if (iso === today) classes += ' cal-day-today';
          classes += available ? ' cal-day-available' : ' cal-day-disabled';
          if (available && iso === selectedDate) classes += ' cal-day-selected';

          html += '<button type="button" class="' + classes + '"' +
            (available ? ' data-date="' + iso + '"' : ' disabled') +
            '>' + day + '</button>';
        }

        calGrid.innerHTML = html;
        calEmptyNote.textContent = anyAvailable ? '' : 'V tomto mesiaci nie sú žiadne voľné termíny.';

        if (animate) {
          calGrid.classList.remove('cal-fade-in');
          void calGrid.offsetWidth;
          calGrid.classList.add('cal-fade-in');
        }

        var dayButtons = calGrid.querySelectorAll('.cal-day-available');
        for (var b = 0; b < dayButtons.length; b++) {
          dayButtons[b].addEventListener('click', function () {
            var prevSelected = calGrid.querySelector('.cal-day-selected');
            if (prevSelected) prevSelected.classList.remove('cal-day-selected');
            this.classList.add('cal-day-selected');
            selectedDate = this.getAttribute('data-date');
            renderTimes();
          });
        }
      }

      function renderTimes() {
        if (!selectedDate || !byDate[selectedDate]) {
          calTimes.innerHTML = '<p class="calendar-times-placeholder">Vyberte si deň v kalendári.</p>';
          return;
        }
        var daySlots = byDate[selectedDate];
        var html = '<h4>' + formatDate(selectedDate) + '</h4><div class="slot-row">';
        for (var s = 0; s < daySlots.length; s++) {
          var slot = daySlots[s];
          html += '<button type="button" class="slot-btn" data-slot-id="' + slot.id + '">' +
            slot.cas_od.slice(0, 5) + '–' + slot.cas_do.slice(0, 5) + '</button>';
        }
        html += '</div>';
        calTimes.innerHTML = html;
        calTimes.classList.remove('cal-times-in');
        void calTimes.offsetWidth;
        calTimes.classList.add('cal-times-in');

        var buttons = calTimes.querySelectorAll('.slot-btn');
        for (var b = 0; b < buttons.length; b++) {
          buttons[b].addEventListener('click', function () {
            for (var k = 0; k < buttons.length; k++) { buttons[k].classList.remove('selected'); }
            this.classList.add('selected');
            var slotId = this.getAttribute('data-slot-id');
            var match = null;
            for (var m = 0; m < daySlots.length; m++) {
              if (daySlots[m].id === slotId) { match = daySlots[m]; break; }
            }
            selectedSlot = match;
            renderForm();
          });
        }
      }

      renderCalendar(false);
    }

    function renderForm() {
      if (!selectedSlot) return;
      var summary = formatDate(selectedSlot.datum) + ', ' + selectedSlot.cas_od.slice(0, 5) + '–' + selectedSlot.cas_do.slice(0, 5);

      if (!formArea.querySelector('form')) {
        formArea.innerHTML = buildFormHtml(produktLabel);
        wireForm(summary);
      }
      var summaryEl = document.getElementById('selected-slot-summary');
      if (summaryEl) summaryEl.textContent = summary;
    }

    function wireForm() {
      var form = formArea.querySelector('form');
      var banner = formArea.querySelector('.form-banner-error');
      var submitBtn = form.querySelector('button[type="submit"]');

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        banner.classList.remove('show');

        if (!selectedSlot) {
          banner.textContent = 'Najprv si prosím vyberte termín hovoru vyššie.';
          banner.classList.add('show');
          return;
        }

        var values = {
          meno_priezvisko: form.meno_priezvisko.value.trim(),
          nazov_firmy: form.nazov_firmy.value.trim(),
          pozicia: form.pozicia.value.trim(),
          email: form.email.value.trim(),
          telefon: form.telefon.value.trim(),
          rozpocet: form.rozpocet.value,
          urgencia: form.urgencia.value,
          popis_projektu: form.popis_projektu.value.trim(),
          zdroj: form.zdroj.value,
          gdpr_suhlas: form.gdpr_suhlas.checked
        };

        var valid = true;
        valid = validateField(form.meno_priezvisko, values.meno_priezvisko !== '') && valid;
        valid = validateField(form.nazov_firmy, values.nazov_firmy !== '') && valid;
        valid = validateField(form.pozicia, values.pozicia !== '') && valid;
        valid = validateField(form.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) && valid;
        valid = validateField(form.telefon, values.telefon !== '') && valid;
        valid = validateField(form.popis_projektu, values.popis_projektu !== '') && valid;
        valid = validateCheckbox(form.gdpr_suhlas) && valid;

        if (!valid) return;

        submitBtn.disabled = true;
        submitBtn.textContent = 'Odosielam…';

        window.supabaseClient.rpc('vytvorit_rezervaciu', {
          p_meno_priezvisko: values.meno_priezvisko,
          p_nazov_firmy: values.nazov_firmy,
          p_pozicia: values.pozicia,
          p_email: values.email,
          p_telefon: values.telefon,
          p_produkt: produktKey,
          p_rozpocet: values.rozpocet,
          p_urgencia: values.urgencia,
          p_popis_projektu: values.popis_projektu,
          p_zdroj: values.zdroj || null,
          p_gdpr_suhlas: values.gdpr_suhlas,
          p_slot_id: selectedSlot.id
        }).then(function (res) {
          if (res.error) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Odoslať rezerváciu';
            if (res.error.message && res.error.message.indexOf('slot_obsadeny') !== -1) {
              banner.textContent = 'Tento termín je už bohužiaľ obsadený. Vyberte si prosím iný nižšie.';
              banner.classList.add('show');
              selectedSlot = null;
              fetchSlots();
            } else {
              banner.textContent = 'Nepodarilo sa odoslať rezerváciu. Skúste to prosím znova alebo nám napíšte na contact@techscope.sk.';
              banner.classList.add('show');
            }
            return;
          }
          var summary = formatDate(selectedSlot.datum) + ', ' + selectedSlot.cas_od.slice(0, 5) + '–' + selectedSlot.cas_do.slice(0, 5);
          renderConfirmation(values, summary);
        }).catch(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Odoslať rezerváciu';
          banner.textContent = 'Nepodarilo sa odoslať rezerváciu. Skúste to prosím znova alebo nám napíšte na contact@techscope.sk.';
          banner.classList.add('show');
        });
      });
    }

    function renderConfirmation(values, summary) {
      stepHeading.style.display = 'none';
      slotArea.style.display = 'none';
      formArea.innerHTML =
        '<div class="confirm-card">' +
          '<div class="confirm-badge"><svg viewBox="0 0 24 24" fill="none" stroke="var(--money)" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg></div>' +
          '<h3>Rezervácia potvrdená, ' + escapeHtml(values.meno_priezvisko) + '!</h3>' +
          '<p>Váš strategy call na <strong>' + produktLabel + '</strong> je rezervovaný na <strong>' + summary + '</strong>.</p>' +
          '<p>Ozveme sa vám do 1 pracovného dňa na ' + escapeHtml(values.email) + ' alebo ' + escapeHtml(values.telefon) + ' s potvrdením detailov.</p>' +
        '</div>';
    }
  }

  function validateField(input, isValid) {
    var row = input.closest('.form-row');
    if (row) row.classList.toggle('invalid', !isValid);
    return isValid;
  }

  function validateCheckbox(input) {
    var isValid = input.checked;
    var row = input.closest('.form-row');
    if (row) row.classList.toggle('invalid', !isValid);
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

  function buildFormHtml(produktLabel) {
    return (
      '<div class="form-card" style="max-width:640px;margin:40px auto 0;">' +
        '<h3>Krok 2 — Vaše údaje</h3>' +
        '<p style="font-size:0.9rem;color:var(--ink-faint);margin-top:-10px;">Vybraný termín: <strong id="selected-slot-summary"></strong></p>' +
        '<div class="form-banner-error"></div>' +
        '<form novalidate>' +
          '<div class="form-row">' +
            '<label for="f-meno">Meno a priezvisko *</label>' +
            '<input type="text" id="f-meno" name="meno_priezvisko" required>' +
            '<span class="field-error">Zadajte prosím meno a priezvisko.</span>' +
          '</div>' +
          '<div class="form-row">' +
            '<label for="f-firma">Názov firmy *</label>' +
            '<input type="text" id="f-firma" name="nazov_firmy" required>' +
            '<span class="field-error">Zadajte prosím názov firmy.</span>' +
          '</div>' +
          '<div class="form-row">' +
            '<label for="f-pozicia">Pozícia *</label>' +
            '<input type="text" id="f-pozicia" name="pozicia" required>' +
            '<span class="field-error">Zadajte prosím vašu pozíciu.</span>' +
          '</div>' +
          '<div class="form-row">' +
            '<label for="f-email">E-mail *</label>' +
            '<input type="email" id="f-email" name="email" required>' +
            '<span class="field-error">Zadajte prosím platný e-mail.</span>' +
          '</div>' +
          '<div class="form-row">' +
            '<label for="f-telefon">Telefón *</label>' +
            '<input type="tel" id="f-telefon" name="telefon" required>' +
            '<span class="field-error">Zadajte prosím telefónne číslo.</span>' +
          '</div>' +
          '<div class="form-row">' +
            '<label for="f-produkt">Produkt</label>' +
            '<input type="text" id="f-produkt" name="produkt" value="' + produktLabel + '" readonly>' +
          '</div>' +
          '<div class="form-row">' +
            '<label for="f-rozpocet">Orientačný rozpočet</label>' +
            '<select id="f-rozpocet" name="rozpocet">' +
              '<option value="<10k">&lt;10k €</option>' +
              '<option value="10-20k">10-20k €</option>' +
              '<option value="20k+">20k+ €</option>' +
            '</select>' +
          '</div>' +
          '<div class="form-row">' +
            '<label for="f-urgencia">Urgencia</label>' +
            '<select id="f-urgencia" name="urgencia">' +
              '<option value="čo najskôr">Čo najskôr</option>' +
              '<option value="do 1-3 mesiacov">Do 1-3 mesiacov</option>' +
              '<option value="len prieskum">Len prieskum</option>' +
            '</select>' +
          '</div>' +
          '<div class="form-row">' +
            '<label for="f-popis">Popis projektu *</label>' +
            '<textarea id="f-popis" name="popis_projektu" rows="4" required></textarea>' +
            '<span class="field-error">Opíšte prosím krátko váš projekt.</span>' +
          '</div>' +
          '<div class="form-row">' +
            '<label for="f-zdroj">Ako ste sa o nás dozvedeli? (nepovinné)</label>' +
            '<select id="f-zdroj" name="zdroj">' +
              '<option value="">— Vyberte —</option>' +
              '<option value="Google">Google</option>' +
              '<option value="LinkedIn">LinkedIn</option>' +
              '<option value="Odporúčanie">Odporúčanie</option>' +
              '<option value="Iné">Iné</option>' +
            '</select>' +
          '</div>' +
          '<div class="form-row form-row-checkbox">' +
            '<label class="checkbox-label">' +
              '<input type="checkbox" name="gdpr_suhlas" required> ' +
              'Súhlasím so <a href="ochrana-udajov.html" target="_blank" rel="noopener">spracovaním osobných údajov</a> *' +
            '</label>' +
            '<span class="field-error">Bez súhlasu nie je možné rezerváciu odoslať.</span>' +
          '</div>' +
          '<button type="submit" class="btn btn-primary btn-block">Odoslať rezerváciu</button>' +
          '<p class="form-note">Odoslaním súhlasíte, že vás budeme kontaktovať ohľadom vašej rezervácie.</p>' +
        '</form>' +
      '</div>'
    );
  }
})();
