// TECH-SCOPE — shared site behaviour (ES5 for broad browser compatibility)

// scarcity counter je zatiaľ statický 2/3, prepojiť na Supabase neskôr, keď budú reálne dáta o kapacite.

document.addEventListener('DOMContentLoaded', function () {
  // mobile nav toggle
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    var navAnchors = links.querySelectorAll('a');
    for (var n = 0; n < navAnchors.length; n++) {
      navAnchors[n].addEventListener('click', function () { links.classList.remove('open'); });
    }
  }

  // scroll reveal — with a safety net so content can never get stuck
  // invisible if IntersectionObserver misbehaves or isn't supported.
  var revealEls = document.querySelectorAll('.reveal');

  // stagger: reveal elements that share a parent (e.g. cards in a grid,
  // rows in a table) fade in with a small delay between each instead of
  // all at once. Elements with no reveal siblings get 0ms — unaffected.
  for (var si = 0; si < revealEls.length; si++) {
    var siblingIdx = 0;
    for (var sj = 0; sj < si; sj++) {
      if (revealEls[sj].parentElement === revealEls[si].parentElement) siblingIdx++;
    }
    if (siblingIdx > 0) {
      // step-cards and solu-categories get a slightly more deliberate
      // stagger than the site-wide default — a beat slower reads more
      // "considered" for a premium feel.
      var isPremiumStagger = revealEls[si].classList.contains('step-card') || revealEls[si].classList.contains('solu-category');
      var staggerMs = isPremiumStagger ? 110 : 90;
      revealEls[si].style.transitionDelay = (siblingIdx * staggerMs) + 'ms';
    }
  }

  function revealAll() {
    for (var i = 0; i < revealEls.length; i++) { revealEls[i].classList.add('in'); }
  }
  if ('IntersectionObserver' in window && revealEls.length) {
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          entries[i].target.classList.add('in');
          io.unobserve(entries[i].target);
        }
      }
    }, { threshold: 0.12 });
    for (var j = 0; j < revealEls.length; j++) { io.observe(revealEls[j]); }
    // fallback: force-reveal anything still hidden after 1.5s
    setTimeout(revealAll, 1500);
  } else {
    revealAll();
  }

  // hero ambient background — "živá dátová mapa" (living data map).
  // Layer 1 (static dot grid) is pure CSS (.geo-bg::before). This block
  // only drives layer 2: sparse animated .geo-point / .geo-link elements,
  // snapped onto the same grid so they read as points appearing on real
  // coordinates. Points/links are plain divs faded via CSS transitions —
  // no canvas, no external libs. A missing/broken script just leaves the
  // static grid, same fallback philosophy as the rest of this file.
  var geoBgs = document.querySelectorAll('.geo-bg');
  if (geoBgs.length && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    var GEO_GRID = 34;
    var GEO_NARROW = window.innerWidth < 768;
    var GEO_MAX_ACTIVE = 3;
    var GEO_MIN_DELAY = GEO_NARROW ? 4000 : 2000;
    var GEO_MAX_DELAY = GEO_NARROW ? 10000 : 5000;
    var GEO_FADE_MS = 1100;

    for (var gi = 0; gi < geoBgs.length; gi++) {
      scheduleGeoLayer(geoBgs[gi]);
    }
  }

  function scheduleGeoLayer(container) {
    var active = 0;

    function randomGridPoint() {
      var cols = Math.max(1, Math.floor(container.clientWidth / GEO_GRID));
      var rows = Math.max(1, Math.floor(container.clientHeight / GEO_GRID));
      return {
        x: Math.round(Math.random() * cols) * GEO_GRID,
        y: Math.round(Math.random() * rows) * GEO_GRID
      };
    }

    function spawnPoint() {
      var p = randomGridPoint();
      var el = document.createElement('div');
      el.className = 'geo-point';
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      container.appendChild(el);
      requestAnimationFrame(function () { el.classList.add('in'); });
      return { el: el, x: p.x, y: p.y };
    }

    function spawnLink(a, b) {
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var length = Math.sqrt(dx * dx + dy * dy);
      var angle = Math.atan2(dy, dx) * 180 / Math.PI;
      var el = document.createElement('div');
      el.className = 'geo-link';
      el.style.left = a.x + 'px';
      el.style.top = a.y + 'px';
      el.style.width = length + 'px';
      el.style.transform = 'rotate(' + angle + 'deg)';
      container.appendChild(el);
      requestAnimationFrame(function () { el.classList.add('in'); });
      return el;
    }

    function fadeOutAndRemove(el) {
      el.classList.remove('in');
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, GEO_FADE_MS);
    }

    function runEvent() {
      if (active >= GEO_MAX_ACTIVE) { scheduleNext(); return; }
      active++;

      var a = spawnPoint();
      var b = null;
      var link = null;
      var withSecond = Math.random() < 0.35;

      if (withSecond) {
        setTimeout(function () {
          b = spawnPoint();
          link = spawnLink(a, b);
        }, 300 + Math.random() * 400);
      }

      var holdMs = 2000 + Math.random() * 1000;
      setTimeout(function () {
        fadeOutAndRemove(a.el);
        if (b) fadeOutAndRemove(b.el);
        if (link) fadeOutAndRemove(link);
        setTimeout(function () { active--; }, GEO_FADE_MS);
      }, (withSecond ? 700 : 0) + holdMs);

      scheduleNext();
    }

    function scheduleNext() {
      var delay = GEO_MIN_DELAY + Math.random() * (GEO_MAX_DELAY - GEO_MIN_DELAY);
      setTimeout(runEvent, delay);
    }

    scheduleNext();
  }

  // count-up on scroll-into-view — for numeric callouts like PONUKA prices.
  // Markup already holds the final formatted value as static text (so
  // no-JS and prefers-reduced-motion visitors always see the right
  // number); this only replaces it with an animated count-up on entry.
  var countEls = document.querySelectorAll('.countup');
  var reduceMotionCount = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (countEls.length && !reduceMotionCount && 'IntersectionObserver' in window) {
    function formatCount(n) {
      return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }
    function easeOutCubicCount(x) { return 1 - Math.pow(1 - x, 3); }
    var countIo = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        countIo.unobserve(entries[i].target);
        // IIFE so each intersecting element gets its own el/target/startTime —
        // without it, "var" hoists these to the shared callback scope and
        // when two elements intersect in the same batch, the second one's
        // values clobber the first's before either rAF callback runs.
        (function (el) {
          var target = parseFloat(el.getAttribute('data-target'));
          var suffix = el.getAttribute('data-suffix') || '';
          var duration = 1100;
          var startTime = null;
          function step(ts) {
            if (!startTime) startTime = ts;
            var p = Math.min(1, (ts - startTime) / duration);
            el.textContent = formatCount(target * easeOutCubicCount(p)) + (p >= 1 ? suffix : '');
            if (p < 1) requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
        })(entries[i].target);
      }
    }, { threshold: 0.4 });
    for (var cj = 0; cj < countEls.length; cj++) countIo.observe(countEls[cj]);
  }

  // "pain points" carousel — 5 cards, one visible at a time via a
  // translateX'd flex track. Autoplay is a setInterval; any interaction
  // (hover, focus, click, touch/swipe) stops it immediately and schedules
  // a resume a few seconds later, so it never fights someone reading a
  // card or fires again mid-swipe. Dots give direct access to any card.
  var painCarousel = document.querySelector('.pain-carousel');
  if (painCarousel) {
    var painTrack = painCarousel.querySelector('.pain-carousel-track');
    var painSlides = painCarousel.querySelectorAll('.pain-card');
    var painDotsWrap = painCarousel.querySelector('.pain-carousel-dots');
    var painPrevBtn = painCarousel.querySelector('.pain-carousel-prev');
    var painNextBtn = painCarousel.querySelector('.pain-carousel-next');
    var painCount = painSlides.length;
    var painReduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var painAutoMs = 4500;
    var painResumeMs = 3000;
    var painIndex = 0;
    var painTimer = null;
    var painResumeTimer = null;
    var painDots = [];

    for (var pd = 0; pd < painCount; pd++) {
      (function (idx) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'pain-carousel-dot';
        dot.setAttribute('role', 'tab');
        dot.setAttribute('aria-label', 'Zobraziť kartu ' + (idx + 1) + ' z ' + painCount);
        dot.addEventListener('click', function () { painGoTo(idx, true); });
        painDotsWrap.appendChild(dot);
        painDots.push(dot);
      })(pd);
    }

    function painRender() {
      painTrack.style.transform = 'translateX(-' + (painIndex * 100) + '%)';
      for (var i = 0; i < painCount; i++) {
        painDots[i].classList.toggle('is-active', i === painIndex);
        painDots[i].setAttribute('aria-selected', i === painIndex ? 'true' : 'false');
      }
    }

    function painGoTo(idx, isManual) {
      painIndex = (idx + painCount) % painCount;
      painRender();
      if (isManual) painPauseThenResume();
    }

    function painStopAuto() {
      if (painTimer) { clearInterval(painTimer); painTimer = null; }
      if (painResumeTimer) { clearTimeout(painResumeTimer); painResumeTimer = null; }
    }
    function painStartAuto() {
      if (painReduceMotion) return;
      painStopAuto();
      painTimer = setInterval(function () { painGoTo(painIndex + 1); }, painAutoMs);
    }
    function painPauseThenResume() {
      painStopAuto();
      painResumeTimer = setTimeout(painStartAuto, painResumeMs);
    }

    if (painPrevBtn) painPrevBtn.addEventListener('click', function () { painGoTo(painIndex - 1, true); });
    if (painNextBtn) painNextBtn.addEventListener('click', function () { painGoTo(painIndex + 1, true); });

    painCarousel.addEventListener('mouseenter', painStopAuto);
    painCarousel.addEventListener('mouseleave', painPauseThenResume);
    painCarousel.addEventListener('focusin', painStopAuto);
    painCarousel.addEventListener('focusout', painPauseThenResume);

    var painTouchStartX = null;
    painCarousel.addEventListener('touchstart', function (e) {
      painTouchStartX = e.touches[0].clientX;
      painStopAuto();
    }, { passive: true });
    painCarousel.addEventListener('touchend', function (e) {
      if (painTouchStartX === null) return;
      var dx = e.changedTouches[0].clientX - painTouchStartX;
      painTouchStartX = null;
      if (Math.abs(dx) > 40) painGoTo(painIndex + (dx < 0 ? 1 : -1), true);
      else painPauseThenResume();
    });

    painRender();
    painStartAuto();
  }

  // Shared accordion — a button+panel pair whose panel height animates via
  // CSS grid-template-rows (0fr/1fr, see style.css) instead of a native
  // <details> instant snap. Used by both the "ako pracujeme" step-cards
  // and the level-2 items inside "Riešenia" — one implementation, reused,
  // not duplicated. Highlighted phrases stay marked up in the source
  // (<strong class="step-hl">) and are flattened once, up front, into a
  // single ordered char stream. `card` (optional) gets .is-open toggled
  // too, for the outer bordered card/row's own hover-adjacent open styling.
  // `instant` (optional) skips the per-character typing effect entirely —
  // the full (highlighted) text renders in one shot and just fades in via
  // CSS (.step-card-panel-inner p transitions opacity on .is-open, see
  // style.css) instead of typing out. Used by the step-cards; solu-items
  // still get the full typing effect.
  var reduceMotionUI = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function escapeHtmlChar(ch) {
    if (ch === '&') return '&amp;';
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    return ch;
  }

  function initTypingAccordion(card, trigger, panel, instant) {
    var p = panel ? panel.querySelector('p') : null;
    if (!trigger || !panel || !p) return null;

    var chars = [];
    var childNodes = p.childNodes;
    for (var cn = 0; cn < childNodes.length; cn++) {
      var node = childNodes[cn];
      if (node.nodeType === 3) {
        var text = node.textContent;
        for (var ci = 0; ci < text.length; ci++) chars.push({ ch: text.charAt(ci), hl: false });
      } else if (node.nodeType === 1) {
        var htext = node.textContent;
        for (var hi = 0; hi < htext.length; hi++) chars.push({ ch: htext.charAt(hi), hl: true });
      }
    }

    // renders chars[0..count), grouping consecutive same-highlight runs
    // into single <strong class="step-hl"> wrappers. When flash is true,
    // the most-recently revealed char additionally gets its own
    // .type-char-new span (brief bright/glow, see CSS) — only meaningful
    // mid-typing, so the reduced-motion one-shot render passes flash:false
    // to render plain final text with no flash artifact on the last char.
    function renderChars(count, showCursor, flash) {
      var html = '';
      var lastIdx = count - 1;
      var groupEnd = flash ? lastIdx : count;
      var i = 0;
      while (i < groupEnd) {
        var hl = chars[i].hl;
        var start = i;
        while (i < groupEnd && chars[i].hl === hl) i++;
        var run = '';
        for (var j = start; j < i; j++) run += escapeHtmlChar(chars[j].ch);
        html += hl ? '<strong class="step-hl">' + run + '</strong>' : run;
      }
      if (flash && lastIdx >= 0) {
        var lastRun = '<span class="type-char-new">' + escapeHtmlChar(chars[lastIdx].ch) + '</span>';
        html += chars[lastIdx].hl ? '<strong class="step-hl">' + lastRun + '</strong>' : lastRun;
      }
      if (showCursor) html += '<span class="step-typing-cursor"></span>';
      p.innerHTML = html;
    }

    // guards a still-running rAF loop from a fast close+reopen — each
    // open bumps the token, and stale ticks from a superseded run bail.
    var typingToken = 0;

    function typeText() {
      var myToken = ++typingToken;

      // precompute a jittered cumulative reveal-time schedule up front,
      // then on each rAF frame reveal however many chars are "due" by
      // elapsed real time. A naive "count++ once >=15-25ms has passed
      // since the last tick" instead quantizes to whole display-refresh
      // frames (~16.7ms @60Hz) — since most of the 15-25ms range rounds
      // up to 2 frames (~33ms), that silently ran the whole effect at
      // nearly half the intended speed. Driving it off a time schedule
      // keeps the actual pace matching the requested per-char delay
      // regardless of refresh rate, while staying rAF-driven (no setTimeout).
      var schedule = [];
      var t = 0;
      for (var k = 0; k < chars.length; k++) {
        t += 15 + Math.random() * 10;
        schedule.push(t);
      }
      var startTs = null;
      var count = 0;

      function tick(ts) {
        if (myToken !== typingToken) return;
        if (startTs === null) startTs = ts;
        var elapsed = ts - startTs;
        var newCount = count;
        while (newCount < schedule.length && schedule[newCount] <= elapsed) newCount++;
        if (newCount !== count) {
          count = newCount;
          renderChars(count, true, true);
        }
        if (count >= chars.length) {
          // settle: fade the last character's glow back to normal,
          // leave the cursor blinking gently for as long as it's open.
          setTimeout(function () {
            if (myToken !== typingToken) return;
            var lastSpan = p.querySelector('.type-char-new');
            if (lastSpan) lastSpan.classList.remove('type-char-new');
          }, 60);
          return;
        }
        requestAnimationFrame(tick);
      }
      p.innerHTML = '';
      requestAnimationFrame(tick);
    }

    function open() {
      if (card) card.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      panel.classList.add('is-open');
      if (instant || reduceMotionUI) {
        typingToken++;
        renderChars(chars.length, false, false);
      } else {
        typeText();
      }
    }

    function close() {
      typingToken++;
      if (card) card.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      panel.classList.remove('is-open');
    }

    trigger.addEventListener('click', function () {
      if (trigger.getAttribute('aria-expanded') === 'true') close(); else open();
    });

    return { open: open, close: close };
  }

  // "ako pracujeme" step-cards
  var stepCardEls = document.querySelectorAll('.step-card');
  for (var sc = 0; sc < stepCardEls.length; sc++) {
    var stepCard = stepCardEls[sc];
    initTypingAccordion(stepCard, stepCard.querySelector('.step-card-trigger'), stepCard.querySelector('.step-card-panel'), true);
  }

  // "riešenia" two-level accordion — level 1 (.solu-category) is a plain
  // height/arrow accordion (no typing, it only ever shows a category name)
  // where opening one closes any other open category; level 2 (.solu-item),
  // nested inside, reuses initTypingAccordion() exactly like the step-cards
  // above and has no such mutual-exclusion — several items may stay open
  // within the open category at once.
  var soluCategoryEls = document.querySelectorAll('.solu-category');
  if (soluCategoryEls.length) {
    var soluCategoryList = Array.prototype.slice.call(soluCategoryEls);

    for (var scat = 0; scat < soluCategoryList.length; scat++) {
      (function (cat) {
        var trigger = cat.querySelector('.solu-category-trigger');
        var panel = cat.querySelector('.solu-category-panel');
        if (!trigger || !panel) return;

        function openCat() {
          for (var oc = 0; oc < soluCategoryList.length; oc++) {
            var other = soluCategoryList[oc];
            if (other !== cat && other.classList.contains('is-open')) {
              other.classList.remove('is-open');
              other.querySelector('.solu-category-trigger').setAttribute('aria-expanded', 'false');
              other.querySelector('.solu-category-panel').classList.remove('is-open');
            }
          }
          cat.classList.add('is-open');
          trigger.setAttribute('aria-expanded', 'true');
          panel.classList.add('is-open');
        }
        function closeCat() {
          cat.classList.remove('is-open');
          trigger.setAttribute('aria-expanded', 'false');
          panel.classList.remove('is-open');
        }

        trigger.addEventListener('click', function () {
          if (trigger.getAttribute('aria-expanded') === 'true') closeCat(); else openCat();
        });

        var soluItemEls = cat.querySelectorAll('.solu-item');
        for (var it = 0; it < soluItemEls.length; it++) {
          var item = soluItemEls[it];
          initTypingAccordion(item, item.querySelector('.solu-item-trigger'), item.querySelector('.solu-item-panel'));
        }
      })(soluCategoryList[scat]);
    }
  }

  // "value wheel" — 8 benefit nodes arranged in a circle around a static
  // "RAST" hub. Node rest-positions are computed by trigonometry (angle =
  // index * 360/8, x/y = cos/sin * radius) once on load/resize — never
  // per animation frame. Three independent layers then sit on top of
  // each other, each animated with plain CSS transform/opacity:
  //   .value-orbit-rings — static guide circles, pure CSS, JS never
  //     touches them (sized as fixed % of .value-wheel).
  //   .value-spokes — one SVG <line> per node, hub → that node's rest
  //     position (endpoints set once by valueLayout(), same trig as the
  //     node positions so they can never drift apart).
  //   .value-nodes — the node markers/cards.
  // .value-spokes and .value-nodes both get the *same* rotate animation
  // (see valueSetSpinning) started in the same tick, so they stay in
  // lockstep without being nested — that's what lets spokes render
  // *behind* the hub while node cards render *above* it. Each node's own
  // .value-node-counter runs that rotation in reverse at the same
  // duration so its marker+label cancels the spin and stays upright —
  // only its position orbits, never its content.
  //
  // Opening a node pauses all three rotations (freezing wherever the
  // ring currently is) and opens a floating detail panel. Whichever node
  // is nearest 12 o'clock gets a highlight (.is-top — see style.css):
  // since rotation is CSS-driven and linear, we don't need to read the
  // animated transform back — VALUE_ROTATE_MS (kept equal to the CSS
  // animation-duration) plus elapsed time since the ring last restarted
  // is enough to compute which of the 8 evenly-spaced nodes is currently
  // closest to the top, the same trigonometry valueLayout() uses for
  // rest positions. A manually-opened node (.is-open) reuses the exact
  // same highlight treatment, applied to both the node and its spoke via
  // valueSetSpokeLit(). Below 768px there's no ring to track, so a plain
  // round-robin timer cycles the highlight down the static list instead
  // — the "no physical rotation" fallback. Either mode is fully off
  // under prefers-reduced-motion (one node stays highlighted, static).
  var valueWheelEl = document.querySelector('.value-wheel');
  if (valueWheelEl) {
    var valueRing = valueWheelEl.querySelector('.value-nodes');
    var valueSpokesSvg = valueWheelEl.querySelector('.value-spokes');
    var valueSpokeGradient = valueWheelEl.querySelector('#value-spoke-gradient');
    var valueSpokeEls = Array.prototype.slice.call(valueWheelEl.querySelectorAll('.value-spoke'));
    var valueNodeEls = Array.prototype.slice.call(valueWheelEl.querySelectorAll('.value-node'));
    var valueOpenNode = null;

    function valueIsDesktop() {
      return window.matchMedia && window.matchMedia('(min-width:768px)').matches;
    }

    function valueLayout() {
      if (!valueIsDesktop()) return;
      var size = valueWheelEl.clientWidth;
      var radius = size / 2 - size * 0.15;
      var cx = size / 2;
      var cy = size / 2;
      if (valueSpokeGradient) {
        valueSpokeGradient.setAttribute('cx', cx);
        valueSpokeGradient.setAttribute('cy', cy);
        valueSpokeGradient.setAttribute('r', radius);
      }
      for (var i = 0; i < valueNodeEls.length; i++) {
        var angleDeg = i * (360 / valueNodeEls.length) - 90;
        var angleRad = angleDeg * Math.PI / 180;
        var x = cx + radius * Math.cos(angleRad);
        var y = cy + radius * Math.sin(angleRad);
        valueNodeEls[i].style.left = x + 'px';
        valueNodeEls[i].style.top = y + 'px';
        var cos = Math.cos(angleRad);
        var side = cos > 0.3 ? 'right' : (cos < -0.3 ? 'left' : 'center');
        valueNodeEls[i].setAttribute('data-side', side);
        // "center" (top or bottom of the circle) needs to know which,
        // so its marker can sit on the hub-facing edge of the card —
        // see [data-vpos="top"] in style.css.
        if (side === 'center') valueNodeEls[i].setAttribute('data-vpos', Math.sin(angleRad) < 0 ? 'top' : 'bottom');
        else valueNodeEls[i].removeAttribute('data-vpos');
        if (valueSpokeEls[i]) {
          valueSpokeEls[i].setAttribute('x1', cx);
          valueSpokeEls[i].setAttribute('y1', cy);
          valueSpokeEls[i].setAttribute('x2', x);
          valueSpokeEls[i].setAttribute('y2', y);
        }
      }
    }
    valueLayout();

    function valueSetSpinning(on) {
      if (!valueRing) return;
      if (reduceMotionUI || !valueIsDesktop()) {
        valueRing.classList.remove('is-spinning');
        if (valueSpokesSvg) valueSpokesSvg.classList.remove('is-spinning');
        return;
      }
      valueRing.classList.toggle('is-spinning', on);
      if (valueSpokesSvg) valueSpokesSvg.classList.toggle('is-spinning', on);
    }
    valueSetSpinning(true);

    function valueSetSpokeLit(idx, on) {
      if (valueSpokeEls[idx]) valueSpokeEls[idx].classList.toggle('is-lit', on);
    }

    // must match .value-nodes.is-spinning's animation-duration in style.css —
    // this is how valueRefreshHighlightCycle() derives the ring's current
    // rotation without reading the animated transform back from the DOM.
    var VALUE_ROTATE_MS = 56000;
    var VALUE_MOBILE_CYCLE_MS = 3500;
    var valueHighlightTimer = null;
    var valueHighlightIndex = -1;

    function valueApplyHighlight(idx) {
      if (idx === valueHighlightIndex) return;
      if (valueHighlightIndex !== -1) valueSetSpokeLit(valueHighlightIndex, false);
      valueHighlightIndex = idx;
      for (var i = 0; i < valueNodeEls.length; i++) {
        valueNodeEls[i].classList.toggle('is-top', i === idx);
      }
      valueSetSpokeLit(idx, true);
    }

    function valueStopHighlightCycle() {
      if (valueHighlightTimer) { clearInterval(valueHighlightTimer); valueHighlightTimer = null; }
    }

    // desktop: the ring's CSS rotation restarts from 0deg every time
    // valueSetSpinning(true) (re)applies .is-spinning, so `epoch` tracks
    // that same restart — elapsed/VALUE_ROTATE_MS*360 is then the ring's
    // current rotation, and node i's rest angle (identical formula to
    // valueLayout()) plus that rotation gives its live angle. Polling
    // every 400ms is plenty for a 7s-per-node changeover; the actual
    // visual crossfade comes from the CSS transition on .is-top.
    function valueStartRingHighlight() {
      var epoch = performance.now();
      function tick() {
        var elapsed = performance.now() - epoch;
        var rotationDeg = (elapsed / VALUE_ROTATE_MS) * 360 % 360;
        var best = 0, bestDist = Infinity;
        for (var i = 0; i < valueNodeEls.length; i++) {
          var restAngle = i * (360 / valueNodeEls.length) - 90;
          var liveAngle = (restAngle + rotationDeg) % 360;
          if (liveAngle < 0) liveAngle += 360;
          var dist = Math.abs(liveAngle - 270);
          dist = Math.min(dist, 360 - dist);
          if (dist < bestDist) { bestDist = dist; best = i; }
        }
        valueApplyHighlight(best);
      }
      tick();
      valueHighlightTimer = setInterval(tick, 400);
    }

    // mobile: no ring to track, so just cycle down the static list —
    // the "cyclic fade without physical rotation" fallback.
    function valueStartListHighlight() {
      var idx = 0;
      valueApplyHighlight(idx);
      valueHighlightTimer = setInterval(function () {
        idx = (idx + 1) % valueNodeEls.length;
        valueApplyHighlight(idx);
      }, VALUE_MOBILE_CYCLE_MS);
    }

    function valueRefreshHighlightCycle() {
      valueStopHighlightCycle();
      if (valueOpenNode) return;
      if (reduceMotionUI) { valueApplyHighlight(0); return; }
      if (valueIsDesktop()) valueStartRingHighlight(); else valueStartListHighlight();
    }
    valueRefreshHighlightCycle();

    window.addEventListener('resize', function () {
      valueLayout();
      valueSetSpinning(!valueOpenNode);
      valueRefreshHighlightCycle();
    });

    function valuePositionPanel(node) {
      var panel = node.querySelector('.value-node-panel');
      if (!valueIsDesktop()) { panel.removeAttribute('data-placement'); return; }
      var wheelRect = valueWheelEl.getBoundingClientRect();
      var dotRect = node.querySelector('.value-node-trigger').getBoundingClientRect();
      var relY = dotRect.top - wheelRect.top;
      panel.setAttribute('data-placement', relY < wheelRect.height / 2 ? 'below' : 'above');
    }

    function valueClampPanel(node) {
      var panel = node.querySelector('.value-node-panel');
      if (!valueIsDesktop()) return;
      requestAnimationFrame(function () {
        var rect = panel.getBoundingClientRect();
        var bounds = valueWheelEl.closest('.container').getBoundingClientRect();
        var shift = 0;
        if (rect.left < bounds.left) shift = bounds.left - rect.left + 8;
        else if (rect.right > bounds.right) shift = bounds.right - rect.right - 8;
        panel.style.transform = shift ? 'translateX(calc(-50% + ' + shift + 'px))' : '';
      });
    }

    function valueCloseNode(node) {
      var trigger = node.querySelector('.value-node-trigger');
      var panel = node.querySelector('.value-node-panel');
      node.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      panel.classList.remove('is-open');
      panel.style.transform = '';
      // only unlight this node's spoke if it isn't also the current
      // rotation-highlight winner — closing shouldn't dim a spoke that
      // valueApplyHighlight() is independently keeping lit.
      if (parseInt(node.getAttribute('data-index'), 10) !== valueHighlightIndex) {
        valueSetSpokeLit(node.getAttribute('data-index'), false);
      }
    }

    function valueOpenNodeFn(node) {
      if (valueOpenNode && valueOpenNode !== node) valueCloseNode(valueOpenNode);
      var trigger = node.querySelector('.value-node-trigger');
      var panel = node.querySelector('.value-node-panel');
      valueSetSpinning(false);
      valueStopHighlightCycle();
      valuePositionPanel(node);
      node.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      panel.classList.add('is-open');
      valueOpenNode = node;
      valueSetSpokeLit(node.getAttribute('data-index'), true);
      valueClampPanel(node);
    }

    for (var vn = 0; vn < valueNodeEls.length; vn++) {
      (function (node) {
        var trigger = node.querySelector('.value-node-trigger');
        trigger.addEventListener('click', function (e) {
          e.stopPropagation();
          if (node.classList.contains('is-open')) {
            valueCloseNode(node);
            valueOpenNode = null;
            valueSetSpinning(true);
            valueRefreshHighlightCycle();
          } else {
            valueOpenNodeFn(node);
          }
        });
      })(valueNodeEls[vn]);
    }

    document.addEventListener('click', function (e) {
      if (valueOpenNode && !valueWheelEl.contains(e.target)) {
        valueCloseNode(valueOpenNode);
        valueOpenNode = null;
        valueSetSpinning(true);
        valueRefreshHighlightCycle();
      }
    });
  }

  // hero code-typing background — see assets/code-typer.js. That file is
  // only loaded on pages that need it (homepage + product pages) and
  // reads its content from a page-specific window.CODE_SEQUENCES set in
  // an inline <script> just before it.
});
