// TECH-SCOPE — rezervácia strategy callu (Krok 1: termín, Krok 2: formulár,
// Krok 3: submit cez Supabase RPC, Krok 4: potvrdenie).
//
// Poznámka k dynamickému obsahu: markup vkladaný sem cez innerHTML zámerne
// nepoužíva triedu .reveal — ten mechanizmus (assets/script.js) sleduje len
// prvky prítomné v DOM pri DOMContentLoaded, takže neskôr pridané .reveal
// prvky by ostali navždy neviditeľné (opacity:0).

(function () {
  var PRODUKT_LABELS = {
    web_mobile_app: 'Launch Sprint — Web/Mobile Apps',
    softver_na_mieru: 'Garantovaný Systém — Softvér na mieru'
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

    if (produktKey !== 'web_mobile_app' && produktKey !== 'softver_na_mieru') {
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
      '<div class="branch-grid">' +
        '<div class="branch-card">' +
          '<div class="eyebrow">Web / Mobile Apps</div>' +
          '<h3>Launch Sprint</h3>' +
          '<p class="outcome">Appka, ktorá vám prestane strácať zákazníkov — alebo rýchly, validovaný launch.</p>' +
          '<a href="rezervacia.html?produkt=web_mobile_app" class="btn btn-primary btn-block">Vybrať Launch Sprint →</a>' +
        '</div>' +
        '<div class="branch-card">' +
          '<div class="eyebrow">Softvér na mieru</div>' +
          '<h3>Garantovaný Systém</h3>' +
          '<p class="outcome">Interný systém na mieru, ktorý nahradí manuálne procesy a drahé SaaS nástroje.</p>' +
          '<a href="rezervacia.html?produkt=softver_na_mieru" class="btn btn-primary btn-block">Vybrať Garantovaný Systém →</a>' +
        '</div>' +
      '</div>';
  }

  function initBooking(app, produktKey) {
    var produktLabel = PRODUKT_LABELS[produktKey];
    var selectedSlot = null;
    var today = new Date().toISOString().slice(0, 10);

    app.innerHTML =
      '<div class="section-head" id="step-heading">' +
        '<div class="eyebrow green">' + produktLabel + '</div>' +
        '<h2>Krok 1 — Vyberte si termín</h2>' +
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

    function renderSlots(slots) {
      if (!slots.length) {
        slotArea.innerHTML = '<p>Momentálne nemáme voľné termíny. Napíšte nám priamo na <a href="mailto:contact@techscope.sk">contact@techscope.sk</a> a dohodneme sa individuálne.</p>';
        return;
      }

      var groups = [];
      var lastDatum = null;
      for (var i = 0; i < slots.length; i++) {
        if (slots[i].datum !== lastDatum) {
          groups.push({ datum: slots[i].datum, items: [] });
          lastDatum = slots[i].datum;
        }
        groups[groups.length - 1].items.push(slots[i]);
      }

      var html = '';
      for (var g = 0; g < groups.length; g++) {
        var group = groups[g];
        html += '<div class="slot-day"><h4>' + formatDate(group.datum) + '</h4><div class="slot-row">';
        for (var s = 0; s < group.items.length; s++) {
          var slot = group.items[s];
          html += '<button type="button" class="slot-btn" data-slot-id="' + slot.id + '">' +
            slot.cas_od.slice(0, 5) + '–' + slot.cas_do.slice(0, 5) + '</button>';
        }
        html += '</div></div>';
      }
      slotArea.innerHTML = html;

      var buttons = slotArea.querySelectorAll('.slot-btn');
      for (var b = 0; b < buttons.length; b++) {
        buttons[b].addEventListener('click', function () {
          for (var k = 0; k < buttons.length; k++) { buttons[k].classList.remove('selected'); }
          this.classList.add('selected');
          var slotId = this.getAttribute('data-slot-id');
          var match = null;
          for (var m = 0; m < slots.length; m++) {
            if (slots[m].id === slotId) { match = slots[m]; break; }
          }
          selectedSlot = match;
          renderForm();
        });
      }
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
