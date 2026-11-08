// TECH-SCOPE — rezervácia strategy callu (Krok 1: termín, Krok 2: formulár,
// Krok 3: submit cez Supabase RPC, Krok 4: potvrdenie).
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
    app.innerHTML =
      '<div id="slot-area"><p>Načítavam dostupné termíny…</p></div>' +
      '<div id="form-area"></div>';

    var stepHeading = document.getElementById('step-heading');
    var slotArea = document.getElementById('slot-area');
    var formArea = document.getElementById('form-area');

    fetchSlots();

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
          '<div class="rz-times" id="cal-times"><p class="rz-times__placeholder">Vyberte si deň v kalendári.</p></div>' +
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
        var html = '<h4>' + formatDate(selectedDate) + '</h4><div class="rz-slots">';
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
            renderForm();
          });
        }
      }

      renderCalendar(false);
    }

    function renderForm() {
      if (!selectedSlot) return;
      var summary = formatDate(selectedSlot.datum) + ', ' + selectedSlot.cas_od.slice(0, 5) + '-' + selectedSlot.cas_do.slice(0, 5);
      var isFirstRender = !formArea.querySelector('form');

      if (isFirstRender) {
        formArea.innerHTML = buildFormHtml();
        wireForm();
        // E-mail zadaný na homepage (rezervacia.html?email=...) predvyplníme do formulára.
        var emailFromUrl = new URLSearchParams(window.location.search).get('email');
        var emailInput = formArea.querySelector('#f-email');
        if (emailFromUrl && emailInput && !emailInput.value) emailInput.value = emailFromUrl.trim().slice(0, 254);
      }
      var summaryEl = document.getElementById('selected-slot-summary');
      if (summaryEl) summaryEl.textContent = summary;

      scrollToFormIfNeeded(isFirstRender);
    }

    // Always jump to the form on the very first slot pick (that's the
    // whole point — no manual scrolling). On later re-picks (user changes
    // their mind about the time) only re-scroll if the form has actually
    // scrolled out of view — otherwise it'd yank the page around every
    // time someone taps a different slot while already looking at the form.
    function scrollToFormIfNeeded(isFirstRender) {
      var firstInput = formArea.querySelector('#f-meno');
      if (!firstInput) return;
      if (!isFirstRender && isInViewport(firstInput)) return;

      firstInput.style.scrollMarginTop = '90px'; // clears the sticky nav
      firstInput.scrollIntoView({ behavior: 'smooth', block: 'start' });

      var focused = false;
      function doFocus() {
        if (focused) return;
        focused = true;
        firstInput.focus({ preventScroll: true });
      }
      // Fires as soon as the smooth-scroll animation actually settles;
      // the timeout is just a fallback for browsers without 'scrollend'
      // (in which case it's the only thing that fires).
      if ('onscrollend' in window) {
        window.addEventListener('scrollend', doFocus, { once: true });
      }
      setTimeout(doFocus, 700);
    }

    // "Already there" has to mean more than "technically overlaps the
    // viewport" — a field barely peeking in at the very bottom edge
    // isn't usable and should still trigger a scroll. Require it to sit
    // in the upper half, roughly where our own scroll-margin-top:90
    // would place it anyway.
    function isInViewport(el) {
      var top = el.getBoundingClientRect().top;
      return top >= -100 && top <= window.innerHeight * 0.5;
    }

    function wireForm() {
      var form = formArea.querySelector('form');
      var banner = formArea.querySelector('.rz-form__error');
      var submitBtn = form.querySelector('button[type="submit"]');
      var currentStep = 1;
      var STEP_TITLES = { 1: 'Na koho máme poslať pozvánku?', 2: 'Pár slov o vás', 3: 'Čo chcete prebrať?' };

      function stepValid(n) {
        if (n !== 1) return true;
        var ok = validateField(form.meno_priezvisko, form.meno_priezvisko.value.trim() !== '');
        ok = validateField(form.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.value.trim())) && ok;
        return ok;
      }

      function goToStep(n) {
        if (n > currentStep && !stepValid(currentStep)) return;
        currentStep = n;
        var cards = form.querySelectorAll('.rz-card');
        for (var i = 0; i < cards.length; i++) {
          var on = Number(cards[i].getAttribute('data-step')) === n;
          cards[i].hidden = !on;
          if (on) { cards[i].classList.remove('rz-card--in'); void cards[i].offsetWidth; cards[i].classList.add('rz-card--in'); }
        }
        document.getElementById('rz-step-title').textContent = STEP_TITLES[n];
        document.getElementById('rz-step-label').textContent = 'Krok ' + n + ' z 3';
        var dots = formArea.querySelectorAll('.rz-dots i');
        for (var d = 0; d < dots.length; d++) { dots[d].classList.toggle('is-on', d < n); }
        var first = form.querySelector('.rz-card[data-step="' + n + '"] .field');
        if (first) first.focus({ preventScroll: true });
        // Ak je začiatok karty schovaný pod hlavičkou, posuň ju do obrazu.
        var top = formArea.getBoundingClientRect().top;
        if (top < 100 || top > window.innerHeight * 0.6) {
          window.scrollBy({ top: top - 110, behavior: 'smooth' });
        }
      }

      form.addEventListener('click', function (e) {
        if (e.target.closest('[data-next]')) { goToStep(currentStep + 1); }
        else if (e.target.closest('[data-back]')) { goToStep(currentStep - 1); }
      });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        banner.classList.remove('rz-form__error--show');

        if (!selectedSlot) {
          banner.textContent = 'Najprv si prosím vyberte termín hovoru vyššie.';
          banner.classList.add('rz-form__error--show');
          return;
        }

        if (currentStep < 3) { goToStep(currentStep + 1); return; }

        var values = {
          meno_priezvisko: form.meno_priezvisko.value.trim(),
          nazov_firmy: form.nazov_firmy.value.trim(),
          pozicia: '',
          produkt: produktFromUrl(),
          email: form.email.value.trim(),
          telefon: form.telefon.value.trim(),
          rozpocet: form.rozpocet.value || 'neuvedené',
          urgencia: 'neuvedené',
          popis_projektu: form.popis_projektu.value.trim(),
          zdroj: '',
          gdpr_suhlas: form.gdpr_suhlas.checked
        };

        if (!stepValid(1)) { goToStep(1); return; }
        var valid = validateCheckbox(form.gdpr_suhlas);
        if (!valid) return;

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
            submitBtn.textContent = 'Rezervovať stretnutie';
            if (res.error.message && res.error.message.indexOf('slot_obsadeny') !== -1) {
              banner.textContent = 'Tento termín je už bohužiaľ obsadený. Vyberte si prosím iný nižšie.';
              banner.classList.add('rz-form__error--show');
              selectedSlot = null;
              fetchSlots();
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
          submitBtn.textContent = 'Rezervovať stretnutie';
          banner.textContent = 'Nepodarilo sa odoslať rezerváciu. Skúste to prosím znova alebo nám napíšte na contact@techscope.sk.';
          banner.classList.add('rz-form__error--show');
        });
      });
    }

    function renderConfirmation(values, summary) {
      stepHeading.style.display = 'none';
      slotArea.style.display = 'none';
      formArea.innerHTML =
        '<div class="rz-confirm">' +
          '<h3>Ďakujeme, stretnutie je rezervované.</h3>' +
          '<p class="rz-confirm__when"><strong>' + summary + '</strong> · online cez Google Meet</p>' +
          '<p>Pozvánku s odkazom na stretnutie sme poslali na <strong>' + escapeHtml(values.email) + '</strong>. Ak ju do pár minút nevidíte, pozrite sa aj do priečinka Spam.</p>' +
          '<p>Potrebujete termín zmeniť? Odpovedzte na pozvánku alebo napíšte na <a href="mailto:contact@techscope.sk">contact@techscope.sk</a>.</p>' +
          '<a class="btn btn--dark" href="index.html">Späť na web <span class="arr" aria-hidden="true">›</span></a>' +
        '</div>';
    }
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

  // Formulár po kartách: 1) kontakt, 2) nepovinné údaje o firme, 3) téma a súhlas.
  // Polia, ktoré sme z formulára vyradili (pozícia, urgencia, služba, zdroj), posielame do RPC
  // s neutrálnou hodnotou, aby tvar payloadu vytvorit_rezervaciu ostal presne rovnaký.
  function buildFormHtml() {
    return (
      '<div class="rz-form">' +
        '<div class="rz-form__top">' +
          '<h3 id="rz-step-title">Na koho máme poslať pozvánku?</h3>' +
          '<p class="rz-form__progress"><span id="rz-step-label">Krok 1 z 3</span>' +
            '<span class="rz-dots" aria-hidden="true"><i class="is-on"></i><i></i><i></i></span></p>' +
        '</div>' +
        '<p class="rz-form__slot">Vybraný termín: <strong id="selected-slot-summary"></strong></p>' +
        '<div class="rz-form__error" role="alert"></div>' +
        '<form novalidate>' +
          '<fieldset class="rz-card" data-step="1">' +
            '<legend class="sr-only">Kontakt</legend>' +
            '<div class="rz-row">' +
              '<label for="f-meno">Meno a priezvisko</label>' +
              '<input type="text" class="field" id="f-meno" name="meno_priezvisko" autocomplete="name" required>' +
              '<span class="rz-row__error">Zadajte prosím meno a priezvisko.</span>' +
            '</div>' +
            '<div class="rz-row">' +
              '<label for="f-email">E-mail</label>' +
              '<input type="email" class="field" id="f-email" name="email" autocomplete="email" required>' +
              '<span class="rz-row__error">Zadajte prosím platný e-mail.</span>' +
            '</div>' +
            '<div class="rz-card__nav"><button type="button" class="btn btn--dark" data-next>Pokračovať <span class="arr" aria-hidden="true">›</span></button></div>' +
          '</fieldset>' +
          '<fieldset class="rz-card" data-step="2" hidden>' +
            '<legend class="sr-only">O vás, nepovinné</legend>' +
            '<p class="rz-card__hint">Všetko na tejto karte je nepovinné. Pomôže nám pripraviť sa.</p>' +
            '<div class="rz-row">' +
              '<label for="f-firma">Názov firmy <span class="rz-opt">(nepovinné)</span></label>' +
              '<input type="text" class="field" id="f-firma" name="nazov_firmy" autocomplete="organization">' +
            '</div>' +
            '<div class="rz-row">' +
              '<label for="f-telefon">Telefón <span class="rz-opt">(nepovinné)</span></label>' +
              '<input type="tel" class="field" id="f-telefon" name="telefon" autocomplete="tel">' +
            '</div>' +
            '<div class="rz-row">' +
              '<label for="f-rozpocet">Orientačný rozpočet <span class="rz-opt">(nepovinné)</span></label>' +
              '<select class="field" id="f-rozpocet" name="rozpocet">' +
                '<option value="">Nechcem uviesť</option>' +
                '<option value="do 8 000 €">Do 8 000 €</option>' +
                '<option value="8 000 – 18 000 €">8 000 – 18 000 €</option>' +
                '<option value="18 000 – 28 000 €">18 000 – 28 000 €</option>' +
                '<option value="28 000 – 42 000 €">28 000 – 42 000 €</option>' +
                '<option value="42 000 € a viac">42 000 € a viac</option>' +
                '<option value="neviem odhadnúť">Neviem odhadnúť</option>' +
              '</select>' +
            '</div>' +
            '<div class="rz-card__nav"><button type="button" class="btn btn--outline" data-back>‹ Späť</button><button type="button" class="btn btn--dark" data-next>Pokračovať <span class="arr" aria-hidden="true">›</span></button></div>' +
          '</fieldset>' +
          '<fieldset class="rz-card" data-step="3" hidden>' +
            '<legend class="sr-only">Téma stretnutia</legend>' +
            '<div class="rz-row">' +
              '<label for="f-popis">Čo by ste chceli prebrať? <span class="rz-opt">(nepovinné)</span></label>' +
              '<textarea class="field" id="f-popis" name="popis_projektu" rows="4" placeholder="Napríklad: provízie dnes počítame v Exceli a zaberá to dva dni mesačne."></textarea>' +
            '</div>' +
            '<div class="rz-row rz-row--checkbox">' +
              '<label class="rz-checkbox">' +
                '<input type="checkbox" name="gdpr_suhlas" required> ' +
                '<span>Súhlasím so <a href="ochrana-udajov.html" target="_blank" rel="noopener">spracovaním osobných údajov</a> na účel stretnutia.</span>' +
              '</label>' +
              '<span class="rz-row__error">Bez súhlasu nie je možné rezerváciu odoslať.</span>' +
            '</div>' +
            '<div class="rz-card__nav"><button type="button" class="btn btn--outline" data-back>‹ Späť</button><button type="submit" class="btn btn--dark">Rezervovať stretnutie</button></div>' +
          '</fieldset>' +
        '</form>' +
        '<p class="rz-form__note">Stretnutie je nezáväzné a bezplatné. Pozvánku do Google Meet dostanete e-mailom.</p>' +
      '</div>'
    );
  }

})();
