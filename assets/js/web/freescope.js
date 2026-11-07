// freescope AI: prihlásenie na novinky o spustení.
// Ukladá sa do Supabase tabuľky exit_leads (verejnosť do nej smie iba vkladať) so zdrojom "freescope-waitlist".
// Portál ich načíta do Sales ako „freescope čakacia listina“. Žiadne innerHTML s dátami.
(function () {
  'use strict';
  var form = document.querySelector('[data-fs-signup]');
  if (!form) return;
  var msg = form.querySelector('[data-fs-msg]');
  var KEY = 'ts_freescope_signup';

  function say(text, ok) {
    msg.textContent = text;
    msg.className = 'fs-signup__msg ' + (ok ? 'fs-signup__msg--ok' : 'fs-signup__msg--err');
  }
  function done() {
    Array.prototype.forEach.call(form.querySelectorAll('input, button'), function (el) { el.disabled = true; });
    say('Ďakujeme, ste na zozname. Ozveme sa pri spustení.', true);
  }
  try { if (localStorage.getItem(KEY)) { done(); } } catch (e) { /* bez úložiska */ }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (form.web.value) { done(); return; } // robot
    var email = (form.email.value || '').trim();
    var name = (form.name.value || '').trim().slice(0, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { say('Zadajte platný e-mail.', false); form.email.focus(); return; }
    if (!form.consent.checked) { say('Bez súhlasu vám nemôžeme poslať e-mail o spustení.', false); return; }
    if (!window.supabaseClient) { say('Prihlásenie sa teraz nepodarilo. Napíšte nám na contact@techscope.sk.', false); return; }
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    window.supabaseClient.from('exit_leads')
      .insert({ meno: name || null, email: email.slice(0, 200), zdrojova_stranka: 'freescope-waitlist' })
      .then(function (res) {
        btn.disabled = false;
        if (res.error) { say('Prihlásenie sa nepodarilo. Skúste to znova alebo napíšte na contact@techscope.sk.', false); return; }
        try { localStorage.setItem(KEY, '1'); } catch (err) { /* nevadí */ }
        done();
      })
      .catch(function () { btn.disabled = false; say('Prihlásenie sa nepodarilo. Skontrolujte pripojenie.', false); });
  });
})();
