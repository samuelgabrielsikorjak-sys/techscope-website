// Pop-up „Ozveme sa vám“: e-mail alebo telefón pre návštevníka, ktorý strávi čas na prípadovej štúdii
// alebo v rezervácii, ale stretnutie si nerezervuje.
// Ukladá sa do Supabase tabuľky exit_leads (verejnosť smie iba vkladať, aspoň e-mail alebo telefón).
// Admin ich vidí v sekcii exit leadov. Žiadne innerHTML s dátami, všetko sa skladá cez DOM.
//
// Použitie (po supabase-client.js):
//   <script src=".../lead-popup.js" data-delay="25000" data-source="popup · prípadová štúdia Medi Ready"
//           data-title="..." data-text="..." data-policy="../ochrana-udajov.html" defer></script>
//
// Kedy sa ukáže:
//   - po data-delay ms na stránke, alebo keď myš odchádza z okna hore (po 8 s na stránke),
//   - nie počas vypĺňania rezervácie (ostane len pri odchode z okna), nie po potvrdení rezervácie,
//   - nie, kým je otvorená lišta cookies,
//   - najviac raz za 3 dni a nikdy po odoslaní kontaktu.
(function () {
  'use strict';
  var me = document.currentScript;
  var attr = function (n, d) { return (me && me.getAttribute(n)) || d; };
  var DELAY = parseInt(attr('data-delay', '30000'), 10);
  var SOURCE = attr('data-source', 'popup · ' + location.pathname);
  var TITLE = attr('data-title', 'Chcete podobný systém pre vašu firmu?');
  var TEXT = attr('data-text', 'Nechajte nám e-mail alebo telefónne číslo. Ozveme sa vám a dohodneme 30-minútové online stretnutie.');
  var POLICY = attr('data-policy', 'ochrana-udajov.html');
  var DONE_KEY = 'ts_lead_popup_done', SEEN_KEY = 'ts_lead_popup_seen', EMAIL_KEY = 'ts_email';
  var PAUSE_MS = 3 * 24 * 3600 * 1000;

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* bez úložiska */ } }
  };
  if (store.get(DONE_KEY)) return;
  var seen = parseInt(store.get(SEEN_KEY) || '0', 10);
  if (seen && Date.now() - seen < PAUSE_MS) return;

  var start = Date.now(), shown = false, filling = false, timer = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  // ---------- obsah pop-upu ----------
  var dlg = el('dialog', 'lp');
  dlg.setAttribute('aria-labelledby', 'lp-title');
  dlg.tabIndex = -1;
  var close = el('button', 'lp__close', '×');
  close.type = 'button'; close.setAttribute('aria-label', 'Zavrieť');
  var h = el('h2', 'lp__title', TITLE); h.id = 'lp-title';
  var p = el('p', 'lp__text', TEXT);

  var form = el('form', 'lp__form'); form.noValidate = true;
  function field(id, label, type, ph, ac) {
    var wrap = el('label', 'lp__field');
    wrap.setAttribute('for', id);
    wrap.appendChild(el('span', 'lp__label', label));
    var inp = el('input', 'field'); inp.id = id; inp.name = id.replace('lp-', ''); inp.type = type;
    inp.placeholder = ph; inp.autocomplete = ac;
    wrap.appendChild(inp);
    form.appendChild(wrap);
    return inp;
  }
  var email = field('lp-email', 'E-mail', 'email', 'meno@firma.sk', 'email');
  var tel = field('lp-tel', 'Telefón', 'tel', '+421 900 000 000', 'tel');
  form.appendChild(el('p', 'lp__hint', 'Stačí jedno z nich.'));
  var hp = el('input', 'lp__hp'); hp.name = 'web'; hp.tabIndex = -1; hp.autocomplete = 'off'; hp.setAttribute('aria-hidden', 'true');
  form.appendChild(hp);
  var consent = el('label', 'lp__consent');
  var cb = el('input'); cb.type = 'checkbox'; cb.name = 'consent';
  var ct = el('span', '', 'Súhlasím, aby ma techscope kontaktoval ohľadom stretnutia. ');
  var pl = el('a', '', 'Ochrana osobných údajov'); pl.href = POLICY; pl.target = '_blank'; pl.rel = 'noopener';
  ct.appendChild(pl);
  consent.appendChild(cb); consent.appendChild(ct);
  form.appendChild(consent);
  var msg = el('p', 'lp__msg'); msg.setAttribute('role', 'status'); msg.hidden = true;
  form.appendChild(msg);
  var row = el('div', 'lp__row');
  var send = el('button', 'btn btn--blue', 'Ozvite sa mi '); send.type = 'submit';
  var arr = el('span', 'arr', '›'); arr.setAttribute('aria-hidden', 'true'); send.appendChild(arr);
  var later = el('button', 'lp__later', 'Teraz nie'); later.type = 'button';
  row.appendChild(send); row.appendChild(later);
  form.appendChild(row);

  dlg.appendChild(close); dlg.appendChild(h); dlg.appendChild(p); dlg.appendChild(form);
  document.body.appendChild(dlg);

  // ---------- zobrazenie ----------
  function booked() { var t = document.getElementById('rz-thanks'); return !!(t && t.open); }
  function blocked() {
    if (document.querySelector('dialog[open]:not(.lp)')) return true; // iné okno je otvorené
    var ck = document.querySelector('.ck');
    return !!(ck && !ck.hidden);                                  // lišta cookies ešte čaká na voľbu
  }
  function show(reason) {
    if (shown) return;
    if (reason === 'timer' && filling) return;
    if (booked()) { shown = true; return; }                       // rezervácia je hotová, pop-up už netreba
    if (blocked()) { setTimeout(function () { show(reason); }, 4000); return; }
    shown = true;
    store.set(SEEN_KEY, String(Date.now()));
    var known = store.get(EMAIL_KEY);
    if (known && !email.value) email.value = known;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    dlg.focus();                                                  // bez rámčeka na krížiku hneď po otvorení
  }
  function hide() { if (dlg.open) { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); } }

  timer = setTimeout(function () { show('timer'); }, DELAY);
  // odchod z okna hore (desktop)
  document.addEventListener('mouseout', function (e) {
    if (e.relatedTarget || e.clientY > 0) return;
    if (Date.now() - start < 8000) return;
    show('exit');
  });
  // kto už vypĺňa rezerváciu, toho časovač nevyruší
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (t && t.form && t.form !== form && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) filling = true;
  });

  close.addEventListener('click', hide);
  later.addEventListener('click', hide);
  dlg.addEventListener('click', function (e) { if (e.target === dlg) hide(); });

  // ---------- odoslanie ----------
  function say(text, ok) {
    msg.hidden = false;
    msg.textContent = text;
    msg.className = 'lp__msg ' + (ok ? 'lp__msg--ok' : 'lp__msg--err');
  }
  var validEmail = function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); };
  var validTel = function (v) { return /^[+0-9 ()\/-]{7,24}$/.test(v) && v.replace(/\D/g, '').length >= 9; };

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (hp.value) { hide(); return; } // robot
    var em = (email.value || '').trim(), ph = (tel.value || '').trim();
    if (!em && !ph) { say('Zadajte e-mail alebo telefónne číslo.', false); email.focus(); return; }
    if (em && !validEmail(em)) { say('Skontrolujte e-mail.', false); email.focus(); return; }
    if (ph && !validTel(ph)) { say('Skontrolujte telefónne číslo.', false); tel.focus(); return; }
    if (!cb.checked) { say('Bez súhlasu vás nemôžeme kontaktovať.', false); return; }
    if (!window.supabaseClient) { say('Odoslanie sa teraz nepodarilo. Napíšte nám na contact@techscope.sk.', false); return; }
    send.disabled = true;
    window.supabaseClient.from('exit_leads')
      .insert({ email: em ? em.slice(0, 200) : null, telefon: ph ? ph.slice(0, 40) : null, zdrojova_stranka: SOURCE.slice(0, 200) })
      .then(function (res) {
        send.disabled = false;
        if (res.error) { say('Odoslanie sa nepodarilo. Skúste to znova alebo napíšte na contact@techscope.sk.', false); return; }
        store.set(DONE_KEY, '1');
        if (em) store.set(EMAIL_KEY, em);
        Array.prototype.forEach.call(form.querySelectorAll('input, button'), function (x) { if (x !== later) x.disabled = true; });
        later.textContent = 'Zavrieť';
        say('Ďakujeme, ozveme sa vám čo najskôr.', true);
      })
      .catch(function () { send.disabled = false; say('Odoslanie sa nepodarilo. Skontrolujte pripojenie.', false); });
  });
})();
