// TECH-SCOPE — vizuálna vrstva marketingových stránok (index + 4 service
// stránky, <body class="fx">). Rezervácia/admin/klient túto triedu nemajú,
// takže nič odtiaľto sa ich netýka. ES5 ako zvyšok webu.
//
//   1. dynamické pozadie podľa sekcie v strede viewportu (--bg-dynamic)
//   2. stagger pre deti zoznamov, ktoré sa odkrývajú ako jeden .reveal
//   3. flip tlačidlá (predná/zadná strana)
//   4. case studies: spojovacia čiara + skladanie médií podľa scrollu
//   5. pauza hero animácií mimo obrazovky
//   ?snap=1 v URL zapne voliteľný scroll-snap (na porovnanie oboch verzií).

(function () {
  var body = document.body;
  if (!body || !body.classList.contains('fx')) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };

  if (/[?&]snap=1\b/.test(location.search)) document.documentElement.classList.add('snap');

  // 1 · dynamické pozadie — súvislá rampa okolo --bg / --bg-soft, ktorá sa
  // k case studies prehĺbi do jemne modrej a potom vráti; tmavý CTA pás
  // prepne body na --dark, aby plynulo nadviazal na footer.
  var RAMP = ['#FBFBFC', '#F6F8FB', '#F1F4F8', '#ECF1F8', '#E7EDF8', '#EAEFF7', '#EEF1F6', '#F2F4F8'];
  var screens = document.querySelectorAll('body.fx > header, body.fx > section');
  each(screens, function (s, i) {
    s.setAttribute('data-bg', s.classList.contains('band-dark') ? '#111A2E' : RAMP[Math.min(i, RAMP.length - 1)]);
  });
  if (hasIO) {
    var bgIo = new IntersectionObserver(function (entries) {
      each(entries, function (e) {
        if (e.isIntersecting) body.style.setProperty('--bg-dynamic', e.target.getAttribute('data-bg'));
      });
    }, { rootMargin: '-50% 0px -50% 0px' });
    each(screens, function (s) { bgIo.observe(s); });
  }

  // 2 · stagger — zoznamy, ktoré sú jeden .reveal blok (free ponuky, value
  // stack, timeline, FAQ), odkryjú položky postupne v poradí čítania.
  var staggers = Array.prototype.slice.call(document.querySelectorAll('.hx-free-grid.reveal, .hx-stack.reveal, .hx-timeline.reveal'));
  each(document.querySelectorAll('.faq-item'), function (f) {
    var p = f.parentNode;
    if (p.classList.contains('reveal') && staggers.indexOf(p) < 0) staggers.push(p);
  });
  each(staggers, function (el) {
    el.classList.add('reveal-stagger');
    each(el.children, function (c, i) { c.style.setProperty('--i', i); });
  });
  // script.js necháva sibling-stagger delay na elemente navždy, čo potom
  // oneskoruje aj hover prechody — po odkrytí ho zmažeme.
  document.addEventListener('transitionend', function (e) {
    var t = e.target;
    if (t.classList && t.classList.contains('reveal') && t.classList.contains('in')) t.style.transitionDelay = '';
  });

  // 3 · flip tlačidlá — obsah sa rozdelí na prednú a zadnú stranu; hover
  // otočenie a touch fallback rieši CSS (@media hover).
  each(document.querySelectorAll('a.btn-primary, a.btn-ghost'), function (b) {
    b.classList.add('btn-flip');
    b.innerHTML = '<span class="btn-flip-in"><span class="btn-front">' + b.innerHTML + '</span>' +
      '<span class="btn-back" aria-hidden="true">' + (b.getAttribute('data-back') || 'Poďme na to →') + '</span></span>';
  });

  // 4 · case studies
  var cases = document.getElementById('pripadove-studie');
  var grid = cases && cases.querySelector('.hx-case-grid');
  if (grid) {
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.hx-case'));
    // appendChild (nie prepend) — .hx-case:nth-child(even) layout ostáva
    var thread = document.createElement('span');
    thread.className = 'case-thread';
    thread.setAttribute('aria-hidden', 'true');
    thread.innerHTML = '<span class="case-thread-fill"></span><span class="case-thread-head"></span>';
    grid.appendChild(thread);
    var fill = thread.firstChild, head = thread.lastChild;
    each(cards, function (c) {
      var media = c.querySelector('.hx-case-media');
      for (var k = 1; k <= 3; k++) {
        var f = document.createElement('span');
        f.className = 'case-frag case-frag--' + k;
        media.appendChild(f);
      }
    });

    var clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
    var threadH = 0, ticking = false;
    var update = function () {
      ticking = false;
      // najprv všetky čítania, potom zápisy (žiadny layout thrash)
      var vh = window.innerHeight;
      var r = grid.getBoundingClientRect();
      var tops = cards.map(function (c) { return c.getBoundingClientRect().top; });
      if (!threadH) threadH = thread.offsetHeight;
      var p = clamp((vh * 0.6 - r.top) / r.height);
      fill.style.transform = 'scaleY(' + p.toFixed(4) + ')';
      head.style.transform = 'translate3d(0,' + (p * threadH).toFixed(1) + 'px,0)';
      head.style.opacity = p > 0 && p < 1 ? 1 : 0;
      cards.forEach(function (c, i) {
        c.style.setProperty('--p', clamp((vh - tops[i]) / (vh * 0.55)).toFixed(3));
      });
    };
    var onScroll = function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    };
    var onResize = function () { threadH = 0; onScroll(); };

    if (reduce || !hasIO) {
      // statický, zložený stav (CSS default --p:1)
      fill.style.transform = 'none';
      head.style.display = 'none';
    } else {
      update();
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          window.addEventListener('scroll', onScroll, { passive: true });
          window.addEventListener('resize', onResize);
          onScroll();
        } else {
          window.removeEventListener('scroll', onScroll);
          window.removeEventListener('resize', onResize);
        }
      }, { rootMargin: '200px 0px' }).observe(cases);
    }
  }

  // 5 · hero animácie (mesh / service SVG) bežia len keď je hero vidieť
  var hero = document.querySelector('body.fx > header');
  if (hero && hasIO) {
    new IntersectionObserver(function (entries) {
      hero.classList.toggle('is-offscreen', !entries[0].isIntersecting);
    }).observe(hero);
  }
})();
