/* Súhlas s cookies pre techscope.sk a stránky kampaní (*.techscope.sk). Rovnaký súbor je na webe aj v portáli.
   Voľba sa uloží do cookie ts_consent na celej doméne .techscope.sk, takže návštevník sa nepýta dvakrát.
   Kategórie: nevyhnutné (vždy zapnuté) a marketingové (Facebook Pixel, iba so súhlasom).
   Použitie: <script src=".../consent.js" data-pixel="ID" data-policy="https://techscope.sk/ochrana-udajov.html"></script>
   Stránka sa pýta window.tsConsent() (true = marketing povolený) alebo počúva udalosť "ts:consent".
   Lištu znova otvorí každý prvok s atribútom data-consent-open. */
(function () {
  "use strict";
  var me = document.currentScript, NAME = "ts_consent", DAYS = 180, VERSION = "1";
  var pixelId = (me && me.getAttribute("data-pixel")) || "";
  var policy = (me && me.getAttribute("data-policy")) || "https://techscope.sk/ochrana-udajov.html";

  function domain() {
    var h = location.hostname;
    return /(^|\.)techscope\.sk$/.test(h) ? "; domain=.techscope.sk" : "";
  }
  function read() {
    var m = document.cookie.match(/(?:^|;\s*)ts_consent=([^;]*)/);
    if (m) {
      var v = decodeURIComponent(m[1]).split(".");  // "1.m1" = verzia 1, marketing áno
      if (v[0] === VERSION && (v[1] === "m1" || v[1] === "m0")) return v[1] === "m1";
    }
    try {  // staršia voľba zo stránok kampaní (localStorage)
      var old = localStorage.getItem(NAME);
      if (old === "yes" || old === "no") { write(old === "yes"); localStorage.removeItem(NAME); return old === "yes"; }
    } catch (e) {}
    return null;
  }
  function write(marketing) {
    document.cookie = NAME + "=" + VERSION + ".m" + (marketing ? 1 : 0) + "; path=/; max-age=" + DAYS * 86400 +
      "; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : "") + domain();
  }

  var state = read();
  window.tsConsent = function () { return state === true; };

  function pixel() {
    if (!pixelId || window.fbq) return;
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    window.fbq("init", pixelId); window.fbq("track", "PageView");
  }
  function apply(fire) {
    if (state === true) pixel();
    if (fire) { try { document.dispatchEvent(new CustomEvent("ts:consent", {detail: {marketing: state === true}})); } catch (e) {} }
  }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  var bar = null, box = null;
  function build() {
    bar = el("div", "ck"); bar.setAttribute("role", "dialog"); bar.setAttribute("aria-label", "Nastavenia cookies"); bar.hidden = true;
    var p = el("p", "ck__text", "Nevyhnutné cookies potrebujeme, aby stránka fungovala. Marketingové cookies (Facebook Pixel) nám pomáhajú merať, či reklamy fungujú. Spustíme ich iba s vaším súhlasom. ");
    var a = el("a", "", "Viac v ochrane osobných údajov"); a.href = policy; p.appendChild(a); p.appendChild(document.createTextNode("."));
    bar.appendChild(p);
    box = el("div", "ck__opts"); box.hidden = true;
    var need = el("label", "ck__opt"), c1 = el("input"); c1.type = "checkbox"; c1.checked = true; c1.disabled = true;
    need.appendChild(c1); need.appendChild(el("span", "", "Nevyhnutné: fungovanie stránky a formulárov, vždy zapnuté"));
    var mk = el("label", "ck__opt"), c2 = el("input"); c2.type = "checkbox"; c2.setAttribute("data-ck-marketing", "");
    mk.appendChild(c2); mk.appendChild(el("span", "", "Marketingové: Facebook Pixel na meranie reklám"));
    box.appendChild(need); box.appendChild(mk); bar.appendChild(box);
    var row = el("div", "ck__row");
    var yes = el("button", "ck__btn ck__btn--main", "Prijať všetky"), no = el("button", "ck__btn", "Iba nevyhnutné"),
        set = el("button", "ck__btn ck__btn--link", "Nastavenia"), save = el("button", "ck__btn ck__btn--main", "Uložiť výber");
    [yes, no, set, save].forEach(function (b) { b.type = "button"; });
    save.hidden = true;
    yes.addEventListener("click", function () { choose(true); });
    no.addEventListener("click", function () { choose(false); });
    save.addEventListener("click", function () { choose(c2.checked); });
    set.addEventListener("click", function () { c2.checked = state === true; box.hidden = false; set.hidden = true; save.hidden = false; });
    row.appendChild(yes); row.appendChild(no); row.appendChild(set); row.appendChild(save); bar.appendChild(row);
    document.body.appendChild(bar);
    bar._reset = function () { box.hidden = true; set.hidden = false; save.hidden = true; };
  }
  function show() { if (!bar) build(); bar._reset(); bar.hidden = false; }
  function choose(marketing) {
    var was = state; state = !!marketing; write(state); bar.hidden = true;
    if (was === true && !state && window.fbq) { location.reload(); return; }  // odvolaný súhlas: Pixel z pamäte stránky odstráni až nové načítanie
    apply(true);
  }

  function start() {
    var opens = document.querySelectorAll("[data-consent-open]");
    if (!opens.length) {  // na webe pridá odkaz do pätičky sám, aby sa nemuseli meniť všetky stránky
      var nav = document.querySelector(".site-footer nav") || document.querySelector("footer");
      if (nav) { var b = el("button", "ck-open", "Nastavenia cookies"); b.type = "button"; b.setAttribute("data-consent-open", ""); nav.appendChild(b); opens = [b]; }
    }
    Array.prototype.forEach.call(opens, function (o) { o.hidden = false; o.addEventListener("click", function (e) { e.preventDefault(); show(); }); });
    if (state === null) show();
  }
  apply(false);
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
})();
