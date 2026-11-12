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

  // Hodvábne vlny v hero sa hýbu len vtedy, keď je hero vidieť (šetrí výkon pri scrollovaní nižšie).
  var silk = document.querySelector('.silk');
  if (silk && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      silk.classList.toggle('is-paused', !entries[0].isIntersecting);
    }).observe(silk);
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
      // vedľa textu: ukážka nesmie presahovať pravý okraj obsahu (zarovnanie s lištou navigácie)
      var cont = pm.closest('.container'), cr = cont ? cont.getBoundingClientRect().right : window.innerWidth - 16;
      var w = side ? cr - r.left - 6 : pm.clientWidth;
      var h = side ? window.innerHeight - (r.top + window.scrollY) - 16 : Infinity;
      var s = Math.max(0.55, Math.min(1.3, w / 700, h / 500));
      pm.style.setProperty('--pm-s', s.toFixed(4));
      var heroEl = pm.closest('.hero'); if (heroEl) heroEl.style.setProperty('--pm-s', s.toFixed(4));
      pm.style.setProperty('--pm-x', side ? '0px' : Math.max(0, (pm.clientWidth - 700 * s) / 2) + 'px');
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

  // Gradientové pásy mimo obrazovky pozastavíme, aby zbytočne nekreslili.
  if ('IntersectionObserver' in window) {
    var meshIo = new IntersectionObserver(function (es) {
      es.forEach(function (e) { e.target.classList.toggle('is-off', !e.isIntersecting); });
    }, { rootMargin: '100px 0px' });
    document.querySelectorAll('.mesh').forEach(function (m) { meshIo.observe(m); });
  }

  // Hlavička: v hero plná biela, po odscrollovaní sklenená; nad tmavými sekciami biele písmo
  var header = document.querySelector('[data-header]');
  var hero = document.querySelector('.hero');
  if (header && hero) {
    var darkSecs = Array.prototype.slice.call(document.querySelectorAll('.process-sec, .section--ink'));
    var glass = false, onDark = false, ticking = false;
    var updateHeader = function () {
      ticking = false;
      var hb = hero.getBoundingClientRect().bottom;
      var g = hb < 72;
      var mid = 44, d = false;
      for (var i = 0; i < darkSecs.length; i++) { var r = darkSecs[i].getBoundingClientRect(); if (r.top <= mid && r.bottom >= mid) { d = true; break; } }
      if (g !== glass) { glass = g; header.classList.toggle('site-header--glass', glass); }
      if (d !== onDark) { onDark = d; header.classList.toggle('site-header--on-color', onDark); }
    };
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(updateHeader); } }, { passive: true });
    window.addEventListener('resize', updateHeader);
    updateHeader();
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
    // osi výkresu: začiatok v strede znaku (260, 210), x doprava, y nahor
    var ax = Math.round(p.x - 260), ay = Math.round(210 - p.y);
    var fmt = function (v) { return (v < 0 ? '−' : '+') + String(Math.abs(v)).padStart(3, '0'); };
    tag.textContent = 'x ' + fmt(ax) + ' · y ' + fmt(ay);

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
    // ťahanie pásu myšou alebo prstom: po pustení sa pás zarovná na najbližší projekt
    (function () {
      var x0 = null, dx = 0, moved = false, cur = 0;
      var stepW = function () { var r = cards[0].getBoundingClientRect(); return r.width + 24; };
      track.addEventListener('pointerdown', function (e) {
        if (e.button) return;
        x0 = e.clientX; dx = 0; moved = false; cur = +track.style.getPropertyValue('--ref') || 0;
      });
      track.addEventListener('pointermove', function (e) {
        if (x0 === null) return;
        dx = e.clientX - x0;
        if (!moved && Math.abs(dx) > 6) { moved = true; track.classList.add('is-dragging'); refRot.pause(true); try { track.setPointerCapture(e.pointerId); } catch (err) {} }
        if (moved) track.style.transform = 'translateX(' + (-cur * stepW() + dx) + 'px)';
      });
      var end = function (e) {
        if (x0 === null) return;
        x0 = null;
        if (!moved) return;
        track.classList.remove('is-dragging');
        track.style.transform = '';
        var w = stepW(), next = cur;
        if (dx < -w * 0.18) next = Math.min(cards.length - 1, cur + 1);
        if (dx > w * 0.18) next = Math.max(0, cur - 1);
        var dot = refsRoot.querySelectorAll('.ref-dot')[next];
        if (dot) dot.click();
        refRot.pause(true);
      };
      track.addEventListener('pointerup', end);
      track.addEventListener('pointercancel', end);
      // klik po ťahaní neotvorí detail
      track.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
    })();
    var refDots = refsRoot.querySelectorAll('.ref-dot');
    var refCur = function () { return +track.style.getPropertyValue('--ref') || 0; };
    var prevBtn = refsRoot.querySelector('[data-ref-prev]'), nextBtn = refsRoot.querySelector('[data-ref-next]');
    if (prevBtn) prevBtn.addEventListener('click', function () { refDots[(refCur() - 1 + refDots.length) % refDots.length].click(); });
    if (nextBtn) nextBtn.addEventListener('click', function () { refDots[(refCur() + 1) % refDots.length].click(); });
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

// ---------------------------------------------------------------------------
// Hero: ukážky systémov na tablete a mobile. Obrazovky sa prepínajú posunom do strany
// (každých 6 s, po ťahaní alebo kliknutí na názov); výška sa nikdy nemení.
// ---------------------------------------------------------------------------
(function () {
  'use strict';
  var root = document.querySelector('[data-show]');
  if (!root) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var tracks = [root.querySelector('[data-show-track]'), root.querySelector('[data-show-phone]')].filter(Boolean);
  var dots = Array.prototype.slice.call(root.querySelectorAll('.show__dot'));
  var n = dots.length, idx = 0, timer = null, visible = false, paused = false, resume = null;
  root.style.setProperty('--show-dur', '6s');

  function go(i) {
    idx = (i + n) % n;
    tracks.forEach(function (t) { t.style.setProperty('--i', idx); t.style.transform = ''; });
    dots.forEach(function (d, j) {
      d.classList.toggle('is-active', j === idx);
      d.setAttribute('aria-selected', j === idx ? 'true' : 'false');
      var bar = d.querySelector('i');
      if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
    });
  }
  function schedule() {
    clearTimeout(timer);
    if (reduce || !visible || paused) return;
    timer = setTimeout(function () { go(idx + 1); schedule(); }, 6000);
  }
  function pause(on) { paused = on; root.classList.toggle('is-paused', on); schedule(); }
  function pauseFor(ms) { clearTimeout(resume); pause(true); resume = setTimeout(function () { pause(false); }, ms); }

  dots.forEach(function (d, i) { d.addEventListener('click', function () { go(i); pauseFor(12000); }); });
  root.addEventListener('mouseenter', function () { pause(true); });
  root.addEventListener('mouseleave', function () { clearTimeout(resume); pause(false); });

  // ťahanie prstom alebo myšou, obe obrazovky sa hýbu spolu
  root.querySelectorAll('.tab__screen, .ph__screen').forEach(function (scr) {
    var x0 = null, dx = 0, w = 1, moved = false;
    scr.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      x0 = e.clientX; dx = 0; moved = false; w = scr.getBoundingClientRect().width;
      scr.setPointerCapture(e.pointerId);
    });
    scr.addEventListener('pointermove', function (e) {
      if (x0 === null) return;
      dx = e.clientX - x0;
      if (!moved && Math.abs(dx) > 5) { moved = true; root.classList.add('is-dragging'); pause(true); }
      if (moved) {
        var pct = dx / w * 100;
        if ((idx === 0 && pct > 0) || (idx === n - 1 && pct < 0)) pct *= 0.3;
        tracks.forEach(function (t) { t.style.transform = 'translateX(calc(' + (-idx * 100) + '% + ' + pct.toFixed(2) + '%))'; });
      }
    });
    var end = function () {
      if (x0 === null) return;
      x0 = null;
      if (!moved) return;
      root.classList.remove('is-dragging');
      if (dx < -w * 0.18) go(idx + 1); else if (dx > w * 0.18) go(idx - 1); else go(idx);
      pauseFor(12000);
    };
    scr.addEventListener('pointerup', end);
    scr.addEventListener('pointercancel', end);
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; schedule(); }, { threshold: 0.3 }).observe(root);
  } else { visible = true; schedule(); }
  go(0);

  // Pamäť e-mailu: hero formulár, brána k prípadovým štúdiám, rezervácia
  var EMAIL_KEY = 'ts_email';
  var getEmail = function () { try { return localStorage.getItem(EMAIL_KEY) || ''; } catch (e) { return ''; } };
  var setEmail = function (v) { try { localStorage.setItem(EMAIL_KEY, v); } catch (e) {} };
  var validEmail = function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); };
  document.querySelectorAll('form.email-form').forEach(function (f) {
    var inp = f.querySelector('input[type="email"]');
    if (inp && !inp.value && getEmail()) inp.value = getEmail();
    f.addEventListener('submit', function () { var v = inp ? inp.value.trim() : ''; if (validEmail(v)) setEmail(v); });
  });
  var gate = document.getElementById('cs-gate');
  if (gate) {
    var gateForm = gate.querySelector('form'), gateInp = gate.querySelector('input'), gateErr = gate.querySelector('.cs-gate__err'), gateNames = gate.querySelectorAll('[data-gate-name]'), gateBtn = gateForm.querySelector('button[type="submit"]');
    var gateLocked = gate.querySelector('[data-gate-locked]'), gateUnlocked = gate.querySelector('[data-gate-unlocked]');
    var setLock = function (open) { gate.classList.toggle('is-open', open); gateBtn.disabled = !open; if (gateLocked) gateLocked.hidden = open; if (gateUnlocked) gateUnlocked.hidden = !open; };
    gateInp.addEventListener('input', function () { gateErr.hidden = true; setLock(validEmail(gateInp.value.trim())); });
    var target = '';
    var go = function (href, email) { window.location.href = href + (href.indexOf('?') < 0 ? '?' : '&') + 'email=' + encodeURIComponent(email); };
    document.querySelectorAll('[data-cs]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (e.defaultPrevented) return;
        e.preventDefault();
        var known = getEmail();
        if (known) { go(a.getAttribute('href'), known); return; }
        target = a.getAttribute('href');
        gateNames.forEach(function (n) { n.textContent = a.getAttribute('data-cs') || ''; });
        gateErr.hidden = true; gateInp.value = ''; setLock(false);
        if (gate.showModal) gate.showModal(); else gate.setAttribute('open', '');
        setTimeout(function () { gateInp.focus(); }, 50);
      });
    });
    gateForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = gateInp.value.trim();
      if (!validEmail(v)) { gateErr.hidden = false; gateInp.focus(); return; }
      setEmail(v);
      gate.classList.add('is-leaving');
      setTimeout(function () { go(target, v); }, 450);
    });
    gate.addEventListener('click', function (e) { if (e.target === gate || e.target.hasAttribute('data-gate-close')) gate.close(); });
  }
})();
