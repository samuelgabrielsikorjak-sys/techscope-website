// TECH-SCOPE — exit-intent / neaktivita popup, spoločný pre všetky verejné
// stránky (nie rezervacia.html — rušil by booking flow, nie admin.html).
//
// Zobrazí sa raz za session pri prvej z dvoch podmienok:
//   1. 30s bez pohybu myši / scrollu / kliku
//   2. exit-intent (len desktop, pointer:fine) — kurzor smeruje k hornej
//      hrane okna (mouseleave, clientY blízko 0)
// Ani jedna podmienka nemôže spustiť popup skôr než 5s po načítaní stránky,
// a sessionStorage flag zaisťuje, že sa popup nezobrazí viac než raz.
//
// HTML štruktúra popupu sa generuje dynamicky (nie je kopírovaná do
// každého HTML súboru) a vkladá sa do <body> až pri prvom triggeri.

(function () {
  var STORAGE_KEY = 'techscope_exit_popup_shown';
  var MIN_TIME_MS = 5000;
  var INACTIVITY_MS = 30000;

  if (sessionStorage.getItem(STORAGE_KEY)) return;

  document.addEventListener('DOMContentLoaded', function () {
    if (sessionStorage.getItem(STORAGE_KEY)) return;

    var pageLoadedAt = Date.now();
    var popupShown = false;
    var inactivityTimer = null;
    var isDesktopPointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;

    function elapsedEnough() {
      return Date.now() - pageLoadedAt >= MIN_TIME_MS;
    }

    function trigger() {
      if (popupShown) return;
      if (sessionStorage.getItem(STORAGE_KEY)) return;
      if (!elapsedEnough()) return;
      popupShown = true;
      sessionStorage.setItem(STORAGE_KEY, '1');
      if (inactivityTimer) clearTimeout(inactivityTimer);
      showPopup();
    }

    function resetInactivityTimer() {
      if (popupShown) return;
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(trigger, INACTIVITY_MS);
    }

    var activityEvents = ['mousemove', 'scroll', 'click', 'keydown', 'touchstart'];
    for (var i = 0; i < activityEvents.length; i++) {
      document.addEventListener(activityEvents[i], resetInactivityTimer, { passive: true });
    }
    resetInactivityTimer();

    if (isDesktopPointer) {
      document.addEventListener('mouseleave', function (e) {
        if (e.clientY <= 0) trigger();
      });
    }
  });

  function showPopup() {
    var overlay = document.createElement('div');
    overlay.className = 'exit-popup-overlay';
    overlay.innerHTML =
      '<div class="exit-popup" role="dialog" aria-modal="true" aria-labelledby="exit-popup-title">' +
        '<button type="button" class="exit-popup-close" aria-label="Zavrieť">&times;</button>' +
        '<div class="exit-popup-body">' +
          '<h3 id="exit-popup-title">Nechajte nám váš kontakt a my sa vám ozveme!</h3>' +
          '<p>Žiadny záväzok — stačí email alebo telefón, ozveme sa do 1 pracovného dňa.</p>' +
          '<form id="exit-popup-form" novalidate>' +
            '<div class="form-row">' +
              '<label for="exit-popup-kontakt">E-mail alebo telefón *</label>' +
              '<input type="text" id="exit-popup-kontakt" name="kontakt" autocomplete="email" placeholder="vas@email.sk alebo +421 900 123 456">' +
              '<span class="field-error">Zadajte prosím platný e-mail alebo telefónne číslo.</span>' +
            '</div>' +
            '<div class="form-row">' +
              '<label for="exit-popup-meno">Meno (nepovinné)</label>' +
              '<input type="text" id="exit-popup-meno" name="meno" autocomplete="name">' +
            '</div>' +
            '<div class="form-banner-error"></div>' +
            '<button type="submit" class="btn btn-primary btn-block">Odoslať</button>' +
          '</form>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    // reflow pred pridaním .show, nech prebehne CSS transition (fade + scale-up)
    void overlay.offsetWidth;
    overlay.classList.add('show');

    var closeBtn = overlay.querySelector('.exit-popup-close');
    var form = overlay.querySelector('#exit-popup-form');
    var kontaktInput = overlay.querySelector('#exit-popup-kontakt');
    var menoInput = overlay.querySelector('#exit-popup-meno');
    var banner = overlay.querySelector('.form-banner-error');
    var submitBtn = form.querySelector('button[type="submit"]');

    function closePopup() {
      overlay.classList.remove('show');
      document.removeEventListener('keydown', onKeydown);
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 300);
    }

    function onKeydown(e) {
      if (e.key === 'Escape') closePopup();
    }
    document.addEventListener('keydown', onKeydown);

    closeBtn.addEventListener('click', closePopup);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closePopup();
    });

    function isValidContact(value) {
      var v = value.trim();
      if (!v) return false;
      var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      var phoneRe = /^[+]?[\d\s()-]{6,}$/;
      return emailRe.test(v) || phoneRe.test(v);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      banner.classList.remove('show');

      var kontaktValue = kontaktInput.value.trim();
      var valid = isValidContact(kontaktValue);
      var row = kontaktInput.closest('.form-row');
      if (row) row.classList.toggle('invalid', !valid);
      if (!valid) return;

      if (!window.supabaseClient) {
        banner.textContent = 'Systém sa nepodarilo načítať. Napíšte nám prosím na contact@techscope.sk.';
        banner.classList.add('show');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Odosielam…';

      var isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(kontaktValue);
      var payload = {
        email: isEmail ? kontaktValue : null,
        telefon: isEmail ? null : kontaktValue,
        meno: menoInput.value.trim() || null,
        zdrojova_stranka: window.location.pathname
      };

      window.supabaseClient.from('exit_leads').insert(payload).then(function (res) {
        if (res.error) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Odoslať';
          banner.textContent = 'Nepodarilo sa odoslať. Skúste to prosím znova alebo nám napíšte na contact@techscope.sk.';
          banner.classList.add('show');
          return;
        }
        showThanks(overlay, closePopup);
      }).catch(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Odoslať';
        banner.textContent = 'Nepodarilo sa odoslať. Skúste to prosím znova alebo nám napíšte na contact@techscope.sk.';
        banner.classList.add('show');
      });
    });
  }

  function showThanks(overlay, closePopup) {
    var body = overlay.querySelector('.exit-popup-body');
    body.innerHTML =
      '<div class="exit-popup-thanks">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="var(--money)" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>' +
        '<h3>Ďakujeme, ozveme sa vám čoskoro!</h3>' +
      '</div>';
    setTimeout(closePopup, 2500);
  }
})();
