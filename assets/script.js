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

  // Shared "typing accordion" — a button+panel pair whose panel height
  // animates via CSS grid-template-rows (0fr/1fr, see style.css) while its
  // <p> text is revealed with a per-character typing effect, instead of a
  // native <details> instant snap. Used by both the "ako pracujeme"
  // step-cards and the level-2 items inside "Riešenia" — one implementation,
  // reused, not duplicated. Opening sets .is-open (starts the height
  // transition) AND clears the paragraph to empty in the same synchronous
  // click handler, so the browser never paints the full original text
  // first (that gap was the old "flash of full text" glitch). Highlighted
  // phrases stay marked up in the source (<strong class="step-hl">) and
  // are flattened once, up front, into a single ordered char stream so
  // they type at the same steady pace as the rest of the sentence.
  // `card` (optional) gets .is-open toggled too, for the outer bordered
  // card/row's own hover-adjacent open styling.
  var reduceMotionUI = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function escapeHtmlChar(ch) {
    if (ch === '&') return '&amp;';
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    return ch;
  }

  function initTypingAccordion(card, trigger, panel) {
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
      if (reduceMotionUI) {
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
    initTypingAccordion(stepCard, stepCard.querySelector('.step-card-trigger'), stepCard.querySelector('.step-card-panel'));
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
  // index * 360/8, x/y = cos/sin * radius), then a CSS animation spins the
  // whole ring while each node's inner wrapper runs the identical-duration
  // animation in reverse so the two cancel out and node text stays upright
  // — see the .value-nodes/.value-node-counter rules in style.css for the
  // mechanism. Opening a node pauses both animations (freezing wherever
  // the ring currently is) and draws a connecting line from the hub using
  // real getBoundingClientRect() coordinates, so it's correct regardless
  // of the frozen angle. Below the 768px breakpoint this is skipped
  // entirely — CSS replaces the circle with a plain vertical list.
  var valueWheelEl = document.querySelector('.value-wheel');
  if (valueWheelEl) {
    var valueRing = valueWheelEl.querySelector('.value-nodes');
    var valueHub = valueWheelEl.querySelector('.value-hub');
    var valueRaySvg = valueWheelEl.querySelector('.value-wheel-ray');
    var valueRayLine = valueRaySvg ? valueRaySvg.querySelector('line') : null;
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
      }
    }
    valueLayout();

    function valueSetSpinning(on) {
      if (!valueRing) return;
      if (reduceMotionUI || !valueIsDesktop()) { valueRing.classList.remove('is-spinning'); return; }
      valueRing.classList.toggle('is-spinning', on);
    }
    valueSetSpinning(true);

    window.addEventListener('resize', function () {
      valueLayout();
      valueSetSpinning(!valueOpenNode);
    });

    function valueShowRay(node) {
      if (!valueRaySvg || !valueRayLine || !valueHub || !valueIsDesktop()) return;
      var wheelRect = valueWheelEl.getBoundingClientRect();
      var hubRect = valueHub.getBoundingClientRect();
      var dot = node.querySelector('.value-node-dot');
      var dotRect = dot.getBoundingClientRect();
      valueRayLine.setAttribute('x1', hubRect.left + hubRect.width / 2 - wheelRect.left);
      valueRayLine.setAttribute('y1', hubRect.top + hubRect.height / 2 - wheelRect.top);
      valueRayLine.setAttribute('x2', dotRect.left + dotRect.width / 2 - wheelRect.left);
      valueRayLine.setAttribute('y2', dotRect.top + dotRect.height / 2 - wheelRect.top);
      valueRaySvg.classList.add('is-visible');
    }
    function valueHideRay() {
      if (valueRaySvg) valueRaySvg.classList.remove('is-visible');
    }

    function valuePositionPanel(node) {
      var panel = node.querySelector('.value-node-panel');
      if (!valueIsDesktop()) { panel.removeAttribute('data-placement'); return; }
      var wheelRect = valueWheelEl.getBoundingClientRect();
      var dotRect = node.querySelector('.value-node-dot').getBoundingClientRect();
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
    }

    function valueOpenNodeFn(node) {
      if (valueOpenNode && valueOpenNode !== node) valueCloseNode(valueOpenNode);
      var trigger = node.querySelector('.value-node-trigger');
      var panel = node.querySelector('.value-node-panel');
      valueSetSpinning(false);
      valuePositionPanel(node);
      node.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      panel.classList.add('is-open');
      valueOpenNode = node;
      valueShowRay(node);
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
            valueHideRay();
            valueSetSpinning(true);
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
        valueHideRay();
        valueSetSpinning(true);
      }
    });
  }

  // hero code-typing background — see assets/code-typer.js. That file is
  // only loaded on pages that need it (homepage + product pages) and
  // reads its content from a page-specific window.CODE_SEQUENCES set in
  // an inline <script> just before it.
});
