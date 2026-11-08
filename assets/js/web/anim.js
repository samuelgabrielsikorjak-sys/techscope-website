// Animácie a navigácia nového webu.
// - sekcie s [data-anim] dostanú triedu .in, keď prídu do zorného poľa (animácia sa prehrá raz)
// - hlavička nad gradientom: po scrollnutí za hero prepne na svetlé sklo
// - rozbaľovacie menu: klik / Esc pre dotykové zariadenia a klávesnicu
(function () {
  'use strict';

  var animated = document.querySelectorAll('[data-anim]');
  // Na mobile sú ilustrácie statické: hneď ukážeme ich výsledný stav (CSS vypne animácie).
  var mobile = window.matchMedia('(max-width: 760px)').matches;
  if (mobile) {
    animated.forEach(function (el) { el.classList.add('in'); });
  } else if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0, rootMargin: '0px 0px -20% 0px' });
    animated.forEach(function (el) { io.observe(el); });
  } else {
    animated.forEach(function (el) { el.classList.add('in'); });
  }

  // Ukážka v hero: plátno 780 × 600 px sa prispôsobí obrazovke.
  // Vedľa textu môže siahať až po pravý okraj okna a zmestí sa na výšku obrazovky notebooku.
  // Pod textom (tablet) sa zmestí do šírky stĺpca a vycentruje sa.
  var pm = document.querySelector('.pm');
  var heroText = document.querySelector('.hero__text');
  if (pm) {
    var fit = function () {
      if (window.innerWidth <= 760) { pm.style.removeProperty('--pm-s'); pm.style.removeProperty('--pm-x'); return; }
      var r = pm.getBoundingClientRect();
      var side = heroText && Math.abs(pm.offsetTop - heroText.offsetTop) < 40;
      var w = side ? window.innerWidth - r.left - 16 : pm.clientWidth;
      var h = side ? window.innerHeight - (r.top + window.scrollY) - 16 : Infinity;
      var s = Math.max(0.55, Math.min(1.05, w / 780, h / 600));
      pm.style.setProperty('--pm-s', s.toFixed(4));
      pm.style.setProperty('--pm-x', side ? '0px' : Math.max(0, (pm.clientWidth - 780 * s) / 2) + 'px');
    };
    window.addEventListener('resize', fit);
    fit();
    if ('ResizeObserver' in window) { new ResizeObserver(fit).observe(pm); } else { window.addEventListener('resize', fit); }
  }

  // techscope dev AI: panel vpravo dole (otvorí sa klikom, zavrie Esc, krížikom alebo klikom mimo)
  var devai = document.querySelector('[data-devai]');
  if (devai) {
    var toggle = devai.querySelector('[data-devai-toggle]');
    var panel = devai.querySelector('#devai-panel');
    var setOpen = function (open) {
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { panel.querySelector('.devai__title').focus(); }
    };
    toggle.addEventListener('click', function () { setOpen(panel.hidden); });
    devai.querySelector('[data-devai-close]').addEventListener('click', function () { setOpen(false); toggle.focus(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { setOpen(false); toggle.focus(); } });
    document.addEventListener('click', function (e) { if (!panel.hidden && !devai.contains(e.target)) { setOpen(false); } });
  }

  var header = document.querySelector('[data-header]');
  var hero = document.querySelector('.hero');
  if (header && hero && header.classList.contains('site-header--on-color')) {
    var onColor = true;
    var update = function () {
      var past = hero.getBoundingClientRect().bottom < 120;
      if (past === onColor) {
        onColor = !past;
        header.classList.toggle('site-header--on-color', onColor);
      }
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  var items = document.querySelectorAll('.nav-item');
  function closeAll(except) {
    items.forEach(function (item) {
      if (item === except) return;
      item.classList.remove('is-open');
      var b = item.querySelector('button');
      if (b) b.setAttribute('aria-expanded', 'false');
    });
  }
  items.forEach(function (item) {
    var btn = item.querySelector('button');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var open = !item.classList.contains('is-open');
      closeAll(item);
      item.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.nav-item')) closeAll(null);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAll(null);
  });
})();

// ---------------------------------------------------------------------------
// Interaktívny výkres: zameriavací kríž namiesto kurzora, 3D náklon a vytiahnutie
// znaku podľa pohybu myši, zvýraznenie najbližšieho kroku.
// ---------------------------------------------------------------------------
(function () {
  'use strict';
  var fig = document.querySelector('[data-drawing]');
  if (!fig) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var svg = fig.querySelector('svg');
  var sec = fig.closest('[data-crosshair]') || fig;
  var tag = sec.querySelector('.drawing__tag');
  var calls = Array.prototype.slice.call(fig.querySelectorAll('.bp-call'));
  var layers = Array.prototype.slice.call(fig.querySelectorAll('.bp-extrude path'));
  if (!svg || !fine) return;

  var MAX_TILT = 14;   // stupne
  var DEPTH = 3.2;     // px posun jednej vrstvy pri plnom náklone
  var frame = null, last = null;

  function apply() {
    frame = null;
    if (!last) return;
    var r = fig.getBoundingClientRect();
    var x = last.clientX - r.left, y = last.clientY - r.top;
    var nx = x / r.width - 0.5, ny = y / r.height - 0.5;     // -0.5 .. 0.5
    var sr = sec.getBoundingClientRect();
    sec.style.setProperty('--mx', (last.clientX - sr.left) + 'px');
    sec.style.setProperty('--my', (last.clientY - sr.top) + 'px');

    if (!reduce) {
      fig.style.setProperty('--ry', (nx * 2 * MAX_TILT).toFixed(2) + 'deg');
      fig.style.setProperty('--rx', (-ny * 2 * MAX_TILT).toFixed(2) + 'deg');
      var ox = -nx * 2 * DEPTH, oy = -ny * 2 * DEPTH;
      layers.forEach(function (p) {
        var i = +p.getAttribute('data-i');
        p.setAttribute('transform', 'translate(' + (ox * i).toFixed(1) + ' ' + (oy * i + i * 1.2).toFixed(1) + ')');
      });
    }

    // súradnice v jednotkách výkresu
    var pt = svg.createSVGPoint(); pt.x = last.clientX; pt.y = last.clientY;
    var ctm = svg.getScreenCTM();
    if (!ctm) return;
    var p = pt.matrixTransform(ctm.inverse());
    tag.textContent = 'x ' + String(Math.max(0, Math.round(p.x))).padStart(3, '0') + ' · y ' + String(Math.max(0, Math.round(p.y))).padStart(3, '0');

    var best = null, bestD = 150;
    calls.forEach(function (c) {
      var dx = p.x - +c.getAttribute('data-x'), dy = p.y - +c.getAttribute('data-y');
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = c; }
    });
    calls.forEach(function (c) { c.classList.toggle('is-active', c === best); });
    fig.classList.toggle('has-active', !!best);
  }

  fig.addEventListener('pointerenter', function () { fig.classList.add('is-hover'); sec.classList.add('is-hover'); });
  fig.addEventListener('pointermove', function (e) {
    last = e;
    if (!frame) frame = requestAnimationFrame(apply);
  });
  fig.addEventListener('pointerleave', function () {
    last = null;
    fig.classList.remove('is-hover', 'has-active');
    sec.classList.remove('is-hover');
    fig.style.setProperty('--rx', '0deg');
    fig.style.setProperty('--ry', '0deg');
    calls.forEach(function (c) { c.classList.remove('is-active'); });
    layers.forEach(function (p) { p.removeAttribute('transform'); });
  });
})();

// ---------------------------------------------------------------------------
// Striedajúce sa položky: kroky postupu ([data-steps]) a odvetvia ([data-tabs]).
// Bežia len keď je sekcia na obrazovke; hover/focus/klik vyberie položku a pozastaví.
// ---------------------------------------------------------------------------
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function rotator(root, itemSel, onSelect, interval, pauseEl) {
    var items = Array.prototype.slice.call(root.querySelectorAll(itemSel));
    if (!items.length) return;
    var idx = 0, timer = null, visible = false, paused = false;

    function select(i) {
      idx = (i + items.length) % items.length;
      onSelect(idx, items);
      // reštart animácie progress baru
      var bar = items[idx].querySelector('i');
      if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
    }
    function schedule() {
      clearTimeout(timer);
      if (reduce || !visible || paused) return;
      timer = setTimeout(function () { select(idx + 1); schedule(); }, interval);
    }
    function pause(on) {
      paused = on;
      pauseEl.classList.toggle('is-paused', on);
      schedule();
    }
    items.forEach(function (el, i) {
      el.addEventListener('mouseenter', function () { select(i); pause(true); });
      el.addEventListener('focus', function () { select(i); pause(true); });
      el.addEventListener('click', function () { select(i); pause(true); });
    });
    pauseEl.addEventListener('mouseleave', function () { pause(false); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible) { select(idx); }
        schedule();
      }, { threshold: 0.35 }).observe(root);
    }
    select(0);
    return { pause: pause };
  }

  var steps = document.querySelector('[data-steps]');
  if (steps) {
    var list = steps.querySelector('.steps');
    var dot = steps.querySelector('.steps__dot');
    var buildParts = Array.prototype.slice.call(steps.querySelectorAll('.bd'));
    steps.style.setProperty('--step-dur', '3.2s');
    rotator(steps, '.step', function (i, items) {
      items.forEach(function (el, j) {
        el.classList.toggle('is-active', j === i);
        el.classList.toggle('is-done', j < i);
      });
      if (dot) dot.style.setProperty('--dot', ((i + 0.5) / items.length * 100) + '%');
      // mobil: kroky sú vodorovný pás, aktívny krok posunieme do obrazu (iba vodorovne)
      if (list.scrollWidth > list.clientWidth + 4) {
        list.scrollTo({ left: Math.max(0, items[i].offsetLeft - 16), behavior: reduce ? 'auto' : 'smooth' });
      }
      buildParts.forEach(function (g) {
        var from = +g.getAttribute('data-from');
        var until = g.hasAttribute('data-until') ? +g.getAttribute('data-until') : 99;
        g.classList.toggle('on', i >= from && i <= until);
      });
    }, 3200, list);
  }

  // referencie: točiace sa projekty, klik otvorí detail
  var refsRoot = document.querySelector('[data-refs]');
  if (refsRoot) {
    var track = refsRoot.querySelector('.refs');
    var cards = Array.prototype.slice.call(refsRoot.querySelectorAll('.ref'));
    var dotsWrap = refsRoot.querySelector('.ref-dots');
    var refRot = rotator(refsRoot, '.ref-dot', function (i, items) {
      items.forEach(function (el, j) {
        el.classList.toggle('is-active', j === i);
        el.classList.toggle('is-done', j < i);
      });
      cards.forEach(function (c, j) { c.classList.toggle('is-active', j === i); });
      track.style.setProperty('--ref', i);
    }, 4500, dotsWrap);
    cards.forEach(function (c) {
      c.addEventListener('mouseenter', function () { refRot.pause(true); });
      c.addEventListener('mouseleave', function () { refRot.pause(false); });
    });
    refsRoot.querySelectorAll('[data-ref-open]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var d = document.getElementById(btn.getAttribute('data-ref-open'));
        if (d && d.showModal) { d.showModal(); refRot.pause(true); }
      });
    });
    refsRoot.querySelectorAll('.ref-modal').forEach(function (d) {
      d.addEventListener('click', function (e) { var r = d.getBoundingClientRect();
        var out = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        if (out || e.target.hasAttribute('data-ref-close')) d.close(); });
      d.addEventListener('close', function () { refRot.pause(false); });
    });
  }

  var tabsRoot = document.querySelector('[data-tabs]');
  if (tabsRoot) {
    var tablist = tabsRoot.querySelector('.ind-tabs');
    var panels = Array.prototype.slice.call(tabsRoot.querySelectorAll('.ind-panel'));
    rotator(tabsRoot, '.ind-tab', function (i, items) {
      items.forEach(function (el, j) {
        el.classList.toggle('is-active', j === i);
        el.setAttribute('aria-selected', j === i ? 'true' : 'false');
      });
      panels.forEach(function (p, j) { p.classList.toggle('is-active', j === i); });
    }, 5000, tablist);
  }
})();
