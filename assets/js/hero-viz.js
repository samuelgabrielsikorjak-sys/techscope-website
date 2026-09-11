// TECH-SCOPE — homepage hero data visualization ("hero-viz").
//
// Canvas is a full-bleed ambient layer behind the ENTIRE hero (both the
// text column and the terminal column), low-opacity and z-index'd under
// all content — paired with a terminal window (multi-line code block) in
// the right column (assets/js/splash.js gates the start of this file's
// cycle — see window.__tsStartHeroViz below).
//
// Cycle: type a code block (multi-line, char by char) -> pause -> run its
// paired scene for ~7s while the block stays static -> erase the block ->
// type the next block -> repeat. Six scenes, six blocks, fixed 1:1
// pairing, looping forever. prefers-reduced-motion shows one static block
// + scene 1's richest frame, no cycling, no typing, no parallax.
//
// "3D" depth system: every scene draws its points/nodes across 3 depth
// tiers (back/mid/front). Each tier gets its own size/opacity multiplier,
// blur amount (real gaussian blur, baked once into a small cached sprite
// per tier/color via `ctx.filter` — never live per-frame, to keep this
// cheap) and parallax sensitivity, plus every
// scene sits on a shared "ambient" star-field layer for atmosphere, which
// also drifts slowly and independently (~20-40s cycle) so the background
// stays alive between each scene's own main "story". On mouse move over
// the hero the tiers drift at different speeds (front more, back barely)
// for a subtle parallax; on touch/mobile there's no pointer to track so a
// slow autonomous drift replaces it instead. A scroll listener adds a
// slower-than-content parallax translateY on top of all of that.

(function () {
  window.__tsStartHeroViz = init;

  document.addEventListener('DOMContentLoaded', function () {
    if (window.__tsSplashSkip) init();
    // otherwise assets/js/splash.js calls window.__tsStartHeroViz() itself
    // once the intro animation finishes.
  });

  var started = false;

  function init() {
    if (started) return;
    started = true;

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var frameEl = document.querySelector('.hero-bg-canvas-wrap');
    var canvas = document.querySelector('.hero-viz-canvas');
    var codeBlockEl = document.querySelector('.hero-code-block');
    var filenameEl = document.querySelector('.hero-editor-filename');
    if (!frameEl || !canvas || !codeBlockEl || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    var isMobile = window.innerWidth < 768;

    // ---------- helpers ----------
    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
    function clampRange(x, a, b) { return x < a ? a : x > b ? b : x; }
    function easeInOutCubic(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
    function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
    function randRange(a, b) { return a + Math.random() * (b - a); }

    var rootStyles = getComputedStyle(document.documentElement);
    var inkRgb = (rootStyles.getPropertyValue('--ink-rgb') || '245,247,250').trim();
    var sceneBlueRgb = (rootStyles.getPropertyValue('--scene-blue-rgb') || '59,130,246').trim();
    function ink(a) { return 'rgba(' + inkRgb + ',' + a + ')'; }
    function blue(a) { return 'rgba(' + sceneBlueRgb + ',' + a + ')'; }

    function withGlow(blur, colorStr, fn) {
      ctx.shadowBlur = blur;
      ctx.shadowColor = colorStr;
      fn();
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    }

    // ---------- depth system ----------
    // back / mid / front. blur uses real ctx.filter (skipped on mobile —
    // filter passes are the one part of this that isn't free, and mobile
    // already has far fewer points so the depth cue matters less).
    var USE_BLUR = !isMobile;
    var PARALLAX_MAX = 13; // px, subtle on purpose
    var DEPTH_TIERS = [
      { blur: 1.6, sizeMul: 0.58, alphaMul: 0.32, parallax: 0.18, glowBlur: 6 },
      { blur: 0.6, sizeMul: 0.85, alphaMul: 0.62, parallax: 0.5, glowBlur: 8 },
      { blur: 0, sizeMul: 1.2, alphaMul: 1.0, parallax: 1.0, glowBlur: 12 }
    ];
    function pickTier() {
      var r = Math.random();
      return r < 0.4 ? 0 : (r < 0.75 ? 1 : 2);
    }

    // Every scene's point/node count was tuned for the old ~510x200
    // confined panel. Now the canvas is the full hero (~10-15x the area),
    // so every base count gets scaled up for "richer, more space-filling"
    // — sqrt of the area ratio, not linear (a straight area multiple would
    // be both overwhelming to look at and a real fps cost), and capped so
    // a very large/ultrawide hero can't runaway into hundreds of points.
    var DENSITY_REFERENCE_AREA = 510 * 200;
    var DENSITY_SCALE_CAP = 2;
    function scaleCount(w, h, base) {
      var scale = Math.min(Math.sqrt((w * h) / DENSITY_REFERENCE_AREA), DENSITY_SCALE_CAP);
      return Math.max(base, Math.round(base * scale));
    }

    // Blurred back/mid-tier points are drawn from a small pre-rendered
    // sprite (ctx.filter used once, at sprite creation) instead of live
    // ctx.filter per point per frame — a whole-canvas-cost operation that
    // tanks fps once dozens of points redraw it every tier, every frame.
    // Front tier (blur:0) still draws a plain crisp arc, unchanged.
    var BLUR_SPRITE_SIZE = 48;
    var blurSprites = {};
    function makeBlurSprite(blurPx, colorFn) {
      var size = BLUR_SPRITE_SIZE;
      var off = document.createElement('canvas');
      off.width = size; off.height = size;
      var octx = off.getContext('2d');
      octx.filter = blurPx > 0 ? ('blur(' + blurPx + 'px)') : 'none';
      octx.beginPath();
      octx.arc(size / 2, size / 2, size / 2 - blurPx * 2 - 3, 0, Math.PI * 2);
      octx.fillStyle = colorFn(1);
      octx.fill();
      return off;
    }
    function getBlurSprite(tier, colorKey) {
      var key = tier + '_' + colorKey;
      if (!blurSprites[key]) {
        blurSprites[key] = makeBlurSprite(DEPTH_TIERS[tier].blur, colorKey === 'blue' ? blue : ink);
      }
      return blurSprites[key];
    }

    // pts: [{x,y,tier,r,alpha,color:'ink'|'blue',glow}]
    function drawDepthPoints(pts, px, py) {
      for (var tier = 0; tier < 3; tier++) {
        var cfg = DEPTH_TIERS[tier];
        var useSprite = USE_BLUR && cfg.blur > 0;
        var sprites = useSprite ? { ink: getBlurSprite(tier, 'ink'), blue: getBlurSprite(tier, 'blue') } : null;
        for (var i = 0; i < pts.length; i++) {
          var p = pts[i];
          if (p.tier !== tier || p.alpha <= 0) continue;
          var sx = p.x + px * PARALLAX_MAX * cfg.parallax;
          var sy = p.y + py * PARALLAX_MAX * cfg.parallax;
          if (useSprite) {
            var d = p.r * 2.9; // sprite bakes in blur falloff padding
            ctx.globalAlpha = p.alpha;
            ctx.drawImage(sprites[p.color === 'blue' ? 'blue' : 'ink'], sx - d / 2, sy - d / 2, d, d);
            ctx.globalAlpha = 1;
          } else {
            if (p.glow) { ctx.shadowBlur = cfg.glowBlur; ctx.shadowColor = blue(0.45); }
            ctx.beginPath();
            ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
            ctx.fillStyle = p.color === 'blue' ? blue(p.alpha) : ink(p.alpha);
            ctx.fill();
            if (p.glow) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }
          }
        }
      }
    }

    // Ambient star-field behind every scene — pure atmosphere, unrelated
    // to each scene's own data. Mostly back/mid tier (never sharp), a
    // minority rendered as small glowing "light source" points. Each also
    // wanders slowly (independent random period per point, ~20-40s) so
    // the background stays visibly alive between each scene's own main
    // "story" beats, not just twinkling in place.
    function genAmbient(w, h, count) {
      var pts = [];
      for (var i = 0; i < count; i++) {
        pts.push({
          x: randRange(0, w), y: randRange(0, h),
          tier: Math.random() < 0.55 ? 0 : 1,
          isLight: Math.random() < 0.3,
          speed: randRange(0.5, 1.3), phase: Math.random() * Math.PI * 2,
          baseR: randRange(1, 2.1),
          driftPeriod: randRange(20000, 40000), driftPhase: Math.random() * Math.PI * 2,
          driftAmpX: randRange(18, 46), driftAmpY: randRange(14, 36)
        });
      }
      return pts;
    }
    function drawAmbient(pts, t, px, py) {
      if (!pts.length) return;
      var arr = [];
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        var twinkle = 0.5 + 0.5 * Math.sin(t / 1000 * p.speed + p.phase);
        var cfg = DEPTH_TIERS[p.tier];
        var driftT = (t / p.driftPeriod) * Math.PI * 2 + p.driftPhase;
        arr.push({
          x: p.x + Math.sin(driftT) * p.driftAmpX,
          y: p.y + Math.cos(driftT * 0.8) * p.driftAmpY,
          tier: p.tier, r: p.baseR * cfg.sizeMul,
          alpha: (0.1 + 0.2 * twinkle) * cfg.alphaMul * (p.isLight ? 1.4 : 0.7),
          color: p.isLight ? 'blue' : 'ink',
          glow: false
        });
      }
      drawDepthPoints(arr, px, py);
    }

    // Straight line whose opacity fades from a to b across its length —
    // "disappearing into the distance" instead of one flat tone.
    function drawGradientLine(ax, ay, bx, by, alphaA, alphaB, width, colorFn) {
      if (alphaA <= 0 && alphaB <= 0) return;
      var grad = ctx.createLinearGradient(ax, ay, bx, by);
      grad.addColorStop(0, colorFn(Math.max(0, alphaA)));
      grad.addColorStop(1, colorFn(Math.max(0, alphaB)));
      ctx.strokeStyle = grad;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    // Same idea for a multi-point polyline (curve/line-chart) — gradient
    // runs start-to-end across the whole path.
    function drawGradientPolyline(pts, alphaStart, alphaEnd, width, glow, colorFn) {
      if (pts.length < 2) return;
      var first = pts[0], last = pts[pts.length - 1];
      var grad = ctx.createLinearGradient(first.x, first.y, last.x, last.y);
      grad.addColorStop(0, colorFn(alphaStart));
      grad.addColorStop(1, colorFn(alphaEnd));
      function paint() {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
        ctx.strokeStyle = grad;
        ctx.lineWidth = width;
        ctx.stroke();
      }
      if (glow) withGlow(12, colorFn(0.45), paint); else paint();
    }

    function catmullRomSample(pts, samplesTotal) {
      var n = pts.length;
      if (n < 2) return pts.slice();
      function getPt(i) { return pts[Math.max(0, Math.min(n - 1, i))]; }
      var out = [];
      for (var i = 0; i < n - 1; i++) {
        var p0 = getPt(i - 1), p1 = getPt(i), p2 = getPt(i + 1), p3 = getPt(i + 2);
        var segCount = Math.max(4, Math.round(samplesTotal / (n - 1)));
        for (var s = 0; s < segCount; s++) {
          var tt = s / segCount, tt2 = tt * tt, tt3 = tt2 * tt;
          var x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * tt + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * tt3);
          var y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * tt + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * tt3);
          out.push({ x: x, y: y });
        }
      }
      out.push(pts[n - 1]);
      return out;
    }

    function drawNodePoint(p, alpha, r, glow, px, py, tier) {
      if (alpha <= 0) return;
      var cfg = DEPTH_TIERS[tier == null ? 2 : tier];
      var sx = p.x + px * PARALLAX_MAX * cfg.parallax;
      var sy = p.y + py * PARALLAX_MAX * cfg.parallax;
      function paint() {
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = ink(alpha);
        ctx.fill();
      }
      if (glow) withGlow(10, blue(0.5), paint); else paint();
    }

    function drawEdgeProgress(a, b, progress, alpha) {
      if (progress <= 0) return;
      var x = lerp(a.x, b.x, progress);
      var y = lerp(a.y, b.y, progress);
      drawGradientLine(a.x, a.y, x, y, alpha * 0.6, alpha, 1.4, blue);
    }

    // ---------- scene 1: fitting curve (depth-scattered points) ----------
    function genScene1(w, h) {
      var n = isMobile ? scaleCount(w, h, 9) + Math.floor(Math.random() * 3) : scaleCount(w, h, 20) + Math.floor(Math.random() * 11);
      var padX = w * 0.1, padY = h * 0.14;
      var innerW = w - padX * 2, innerH = h - padY * 2;
      var points = [];
      for (var i = 0; i < n; i++) {
        var xFrac = i / (n - 1);
        var noise = (Math.random() - 0.5) * 0.3;
        var valFrac = clamp01(0.12 + 0.68 * xFrac + noise);
        points.push({
          x: padX + xFrac * innerW,
          y: padY + (1 - valFrac) * innerH,
          appearAt: i * (1800 / (n - 1)),
          tier: pickTier()
        });
      }
      var curveSrc = points.slice().sort(function (a, b) { return a.x - b.x; });
      return {
        points: points,
        curvePts: catmullRomSample(curveSrc, isMobile ? 60 : 130),
        ambient: genAmbient(w, h, scaleCount(w, h, isMobile ? 10 : 20))
      };
    }

    function drawScene1(w, h, t, data, px, py) {
      drawAmbient(data.ambient, t, px, py);
      var points = data.points, curvePts = data.curvePts, i;
      var pulsing = t >= 5000;
      var pulse = pulsing ? 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(((t - 5000) / 2000) * Math.PI * 2)) : 1;

      var arr = [];
      for (i = 0; i < points.length; i++) {
        var p = points[i];
        if (t < p.appearAt) continue;
        var fadeT = clamp01((t - p.appearAt) / 300);
        var cfg = DEPTH_TIERS[p.tier];
        arr.push({
          x: p.x, y: p.y, tier: p.tier, r: 3.4 * cfg.sizeMul,
          alpha: 0.45 * fadeT * pulse * cfg.alphaMul, color: 'ink',
          glow: pulsing && p.tier === 2
        });
      }
      drawDepthPoints(arr, px, py);

      if (t >= 2000) {
        var progress = easeInOutCubic(clamp01((t - 2000) / 3000));
        var count = Math.max(2, Math.round(curvePts.length * progress));
        drawGradientPolyline(curvePts.slice(0, count), 0.28 * pulse, 0.68 * pulse, 2, pulsing, blue);
      }
    }

    // ---------- scene 2: rising line chart ----------
    function genScene2(w, h) {
      var padX = w * 0.08, padY = h * 0.14;
      var axisY = h - padY;
      var innerW = w - padX * 2;
      var plotTop = padY * 1.3, innerH = axisY - plotTop;
      var n = 48;
      var dipCount = 3 + Math.floor(Math.random() * 2);
      var dips = [];
      for (var d = 0; d < dipCount; d++) {
        dips.push({ c: randRange(0.15, 0.85), w: randRange(0.06, 0.13), depth: randRange(0.14, 0.28) });
      }
      var pts = [];
      for (var i = 0; i < n; i++) {
        var xFrac = i / (n - 1);
        var val = 0.15 + 0.62 * xFrac;
        for (var k = 0; k < dips.length; k++) {
          var dip = dips[k], dx = xFrac - dip.c;
          val -= dip.depth * Math.exp(-(dx * dx) / (2 * dip.w * dip.w));
        }
        val = clamp01(val);
        pts.push({ x: padX + xFrac * innerW, y: plotTop + (1 - val) * innerH });
      }
      return {
        pts: pts, axisY: axisY, padLeft: padX, padRight: w - padX,
        ambient: genAmbient(w, h, scaleCount(w, h, isMobile ? 8 : 16))
      };
    }

    function drawScene2(w, h, t, data, px, py) {
      drawAmbient(data.ambient, t, px, py);
      var pts = data.pts;
      ctx.beginPath();
      ctx.moveTo(data.padLeft, data.axisY);
      ctx.lineTo(data.padRight, data.axisY);
      ctx.strokeStyle = ink(0.18);
      ctx.lineWidth = 1;
      ctx.stroke();

      // constant-speed reveal (intentionally linear, not eased — see scene brief)
      var progress = clamp01(t / 6500);
      var count = Math.max(2, Math.round(pts.length * progress));
      drawGradientPolyline(pts.slice(0, count), 0.2, 0.72, 2, false, blue);

      var lead = pts[Math.min(pts.length - 1, count - 1)];
      withGlow(11, blue(0.6), function () {
        ctx.beginPath();
        ctx.arc(lead.x, lead.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = blue(0.9);
        ctx.fill();
      });
    }

    // ---------- scene 3: node network with data pulse (depth-layered) ----------
    function genScene3(w, h) {
      var n = isMobile ? scaleCount(w, h, 6) + Math.round(Math.random()) : scaleCount(w, h, 12) + Math.floor(Math.random() * 4);
      var padX = w * 0.12, padY = h * 0.16;
      var minDist = Math.min(w, h) * (isMobile ? 0.16 : 0.1);
      var nodes = [], attempts = 0;
      while (nodes.length < n && attempts < 600) {
        attempts++;
        var cand = { x: randRange(padX, w - padX), y: randRange(padY, h - padY) };
        var ok = true;
        for (var i = 0; i < nodes.length; i++) {
          var dx = cand.x - nodes[i].x, dy = cand.y - nodes[i].y;
          if (Math.sqrt(dx * dx + dy * dy) < minDist) { ok = false; break; }
        }
        if (ok) { cand.appearAt = nodes.length * (1500 / n); cand.tier = pickTier(); nodes.push(cand); }
      }
      while (nodes.length < n) {
        nodes.push({ x: randRange(padX, w - padX), y: randRange(padY, h - padY), appearAt: nodes.length * (1500 / n), tier: pickTier() });
      }

      var edgeCount = isMobile ? scaleCount(w, h, 4) + Math.floor(Math.random() * 2) : scaleCount(w, h, 8) + Math.floor(Math.random() * 5);
      var edges = [], used = {}, eAttempts = 0;
      while (edges.length < edgeCount && eAttempts < 800) {
        eAttempts++;
        var a = Math.floor(Math.random() * n), b = Math.floor(Math.random() * n);
        if (a === b) continue;
        var key = Math.min(a, b) + '-' + Math.max(a, b);
        if (used[key]) continue;
        used[key] = true;
        edges.push({ a: a, b: b, appearAt: 1500 + edges.length * (1500 / edgeCount) });
      }

      var pulses = [], tcursor = 3000;
      while (tcursor < 6600) {
        pulses.push({ start: tcursor, edgeIdx: Math.floor(Math.random() * edges.length), reverse: Math.random() < 0.5 });
        tcursor += randRange(500, 700);
      }

      return { nodes: nodes, edges: edges, pulses: pulses, ambient: genAmbient(w, h, scaleCount(w, h, isMobile ? 7 : 14)) };
    }

    function drawScene3(w, h, t, data, px, py) {
      drawAmbient(data.ambient, t, px, py);
      var nodes = data.nodes, edges = data.edges, i;

      for (i = 0; i < edges.length; i++) {
        var e = edges[i];
        if (t < e.appearAt) continue;
        var fadeT = clamp01((t - e.appearAt) / 400);
        var a = nodes[e.a], b = nodes[e.b];
        var alphaA = 0.22 * fadeT * DEPTH_TIERS[a.tier].alphaMul;
        var alphaB = 0.22 * fadeT * DEPTH_TIERS[b.tier].alphaMul;
        drawGradientLine(a.x, a.y, b.x, b.y, alphaA, alphaB, 1.1, blue);
      }

      for (i = 0; i < data.pulses.length; i++) {
        var pu = data.pulses[i];
        if (t < pu.start || t > pu.start + 550) continue;
        var e2 = edges[pu.edgeIdx];
        var na = nodes[e2.a], nb = nodes[e2.b];
        if (pu.reverse) { var tmp = na; na = nb; nb = tmp; }
        var prog = easeInOutCubic(clamp01((t - pu.start) / 550));
        withGlow(10, blue(0.7), function () {
          ctx.beginPath();
          ctx.arc(lerp(na.x, nb.x, prog), lerp(na.y, nb.y, prog), 3, 0, Math.PI * 2);
          ctx.fillStyle = blue(0.85);
          ctx.fill();
        });
      }

      var arr = [];
      for (i = 0; i < nodes.length; i++) {
        var nd = nodes[i];
        if (t < nd.appearAt) continue;
        var cfg = DEPTH_TIERS[nd.tier];
        arr.push({
          x: nd.x, y: nd.y, tier: nd.tier, r: 4.6 * cfg.sizeMul,
          alpha: 0.55 * clamp01((t - nd.appearAt) / 300) * cfg.alphaMul,
          color: 'ink', glow: nd.tier === 2
        });
      }
      drawDepthPoints(arr, px, py);
    }

    // ---------- scene 4: clustering (depth-scattered points) ----------
    function genScene4(w, h) {
      var n = isMobile ? scaleCount(w, h, 9) + Math.floor(Math.random() * 3) : scaleCount(w, h, 22) + Math.floor(Math.random() * 7);
      var padX = w * 0.1, padY = h * 0.14;
      var clusterJitter = Math.min(w, h) * 0.06;
      var targets = [
        { x: w * 0.22, y: h * 0.22 },
        { x: w * 0.8, y: h * 0.78 },
        { x: w * 0.88, y: h * 0.42 }
      ];
      var points = [];
      for (var i = 0; i < n; i++) {
        var targetIdx = i % 3;
        points.push({
          start: { x: randRange(padX, w - padX), y: randRange(padY, h - padY) },
          target: { x: targets[targetIdx].x + randRange(-clusterJitter, clusterJitter), y: targets[targetIdx].y + randRange(-clusterJitter, clusterJitter) },
          appearAt: i * (800 / n),
          pulseOffset: Math.random() * Math.PI * 2,
          tier: pickTier()
        });
      }
      return { points: points, ambient: genAmbient(w, h, scaleCount(w, h, isMobile ? 9 : 18)) };
    }

    function drawScene4(w, h, t, data, px, py) {
      drawAmbient(data.ambient, t, px, py);
      var points = data.points, pulsing = t >= 5000, arr = [];
      for (var i = 0; i < points.length; i++) {
        var p = points[i];
        if (t < p.appearAt) continue;
        var fadeT = clamp01((t - p.appearAt) / 300);
        var eased = easeInOutCubic(clamp01((t - 1000) / 4000));
        var x = lerp(p.start.x, p.target.x, eased);
        var y = lerp(p.start.y, p.target.y, eased);
        var cfg = DEPTH_TIERS[p.tier];

        var alpha = 0.55 * fadeT * cfg.alphaMul;
        if (pulsing) {
          alpha = (0.42 + 0.2 * (0.5 + 0.5 * Math.sin((t - 5000) / 1000 * Math.PI * 2 + p.pulseOffset))) * cfg.alphaMul;
        }
        arr.push({ x: x, y: y, tier: p.tier, r: 3.6 * cfg.sizeMul, alpha: alpha, color: 'blue', glow: pulsing && p.tier === 2 });
      }
      drawDepthPoints(arr, px, py);
    }

    // ---------- scene 5: bar chart with recompute ----------
    function genScene5(w, h) {
      var barCount = 6, padX = w * 0.1, padY = h * 0.16, baseY = h - padY;
      var plotH = h - padY * 2, gap = w * 0.025;
      var barW = (w - padX * 2 - gap * (barCount - 1)) / barCount;

      var h1 = [], h2 = [], i;
      for (i = 0; i < barCount; i++) h1.push(randRange(0.2, 0.9));
      for (i = 0; i < barCount; i++) h2.push(randRange(0.2, 0.9));
      var changedEnough = 0;
      for (i = 0; i < barCount; i++) if (Math.abs(h2[i] - h1[i]) >= 0.15) changedEnough++;
      var idx = 0;
      while (changedEnough < 4) {
        if (Math.abs(h2[idx] - h1[idx]) < 0.15) {
          var dir = Math.random() < 0.5 ? -1 : 1;
          var nv = clamp01(h1[idx] + dir * randRange(0.18, 0.35));
          if (Math.abs(nv - h1[idx]) < 0.15) nv = clamp01(h1[idx] - dir * randRange(0.18, 0.35));
          h2[idx] = nv;
          changedEnough++;
        }
        idx = (idx + 1) % barCount;
      }

      var bars = [];
      for (i = 0; i < barCount; i++) {
        bars.push({ x: padX + i * (barW + gap), w: barW, h1: h1[i], h2: h2[i], growStart: i * 250, pulseOffset: Math.random() * Math.PI * 2 });
      }
      return { bars: bars, baseY: baseY, plotH: plotH, ambient: genAmbient(w, h, scaleCount(w, h, isMobile ? 8 : 16)) };
    }

    function drawScene5(w, h, t, data, px, py) {
      drawAmbient(data.ambient, t, px, py);
      var bars = data.bars, baseY = data.baseY, plotH = data.plotH, pulsing = t >= 5500;
      for (var i = 0; i < bars.length; i++) {
        var b = bars[i];
        if (t < b.growStart) continue;
        var growFrac = easeOutCubic(clamp01((t - b.growStart) / 250)) * b.h1;

        var hFrac;
        if (t < 4000) hFrac = growFrac;
        else if (t < 5500) hFrac = lerp(b.h1, b.h2, easeInOutCubic(clamp01((t - 4000) / 1500)));
        else hFrac = b.h2;

        var alpha = 0.32, strokeAlpha = 0.6;
        if (pulsing) {
          var pulse = 0.75 + 0.25 * (0.5 + 0.5 * Math.sin((t - 5500) / 1500 * Math.PI * 2 + b.pulseOffset));
          alpha = 0.32 * pulse; strokeAlpha = 0.6 * pulse;
        }

        var barH = hFrac * plotH, y = baseY - barH;
        function paint() {
          ctx.fillStyle = ink(alpha);
          ctx.fillRect(b.x, y, b.w, barH);
          ctx.strokeStyle = blue(strokeAlpha);
          ctx.lineWidth = 1.5;
          ctx.strokeRect(b.x + 0.75, y + 0.75, b.w - 1.5, Math.max(0, barH - 1.5));
        }
        if (pulsing) withGlow(9, blue(0.4), paint); else paint();
      }
    }

    // ---------- scene 6: decision tree ----------
    function genScene6(w, h) {
      return {
        root: { x: w * 0.5, y: h * 0.14 },
        l1: [{ x: w * 0.32, y: h * 0.48 }, { x: w * 0.68, y: h * 0.48 }],
        l2: [
          { x: w * 0.2, y: h * 0.84 }, { x: w * 0.42, y: h * 0.84 },
          { x: w * 0.58, y: h * 0.84 }, { x: w * 0.8, y: h * 0.84 }
        ],
        ambient: genAmbient(w, h, scaleCount(w, h, isMobile ? 8 : 16))
      };
    }

    function drawScene6(w, h, t, data, px, py) {
      drawAmbient(data.ambient, t, px, py);
      var root = data.root, l1 = data.l1, l2 = data.l2, i;
      var pulsing = t >= 5500;

      drawNodePoint(root, 0.5 * clamp01(t / 700), 6, false, px, py, 2);
      if (t < 1000) return;

      var bProg = easeInOutCubic(clamp01((t - 1000) / 2000));
      for (i = 0; i < 2; i++) drawEdgeProgress(root, l1[i], bProg, 0.4);
      var l1Alpha = 0.5 * clamp01((bProg - 0.7) / 0.3);
      for (i = 0; i < 2; i++) drawNodePoint(l1[i], l1Alpha, 6, false, px, py, 2);
      if (t < 3000) return;

      var leftProg = easeInOutCubic(clamp01((t - 3000) / 1250));
      drawEdgeProgress(l1[0], l2[0], leftProg, 0.4);
      drawEdgeProgress(l1[0], l2[1], leftProg, 0.4);
      var leftNodeAlpha = 0.5 * clamp01((leftProg - 0.7) / 0.3);

      var rightProg = t >= 4250 ? easeInOutCubic(clamp01((t - 4250) / 1250)) : 0;
      if (t >= 4250) {
        drawEdgeProgress(l1[1], l2[2], rightProg, 0.4);
        drawEdgeProgress(l1[1], l2[3], rightProg, 0.4);
      }
      var rightNodeAlpha = t >= 4250 ? 0.5 * clamp01((rightProg - 0.7) / 0.3) : 0;

      if (pulsing) {
        var pulse = 0.7 * (0.6 + 0.4 * (0.5 + 0.5 * Math.sin((t - 5500) / 1500 * Math.PI * 2)));
        leftNodeAlpha = pulse; rightNodeAlpha = pulse;
      }
      drawNodePoint(l2[0], leftNodeAlpha, 5, pulsing, px, py, 2);
      drawNodePoint(l2[1], leftNodeAlpha, 5, pulsing, px, py, 2);
      drawNodePoint(l2[2], rightNodeAlpha, 5, pulsing, px, py, 2);
      drawNodePoint(l2[3], rightNodeAlpha, 5, pulsing, px, py, 2);
    }

    // ---------- code blocks (exact wording; kw = keyword highlight) ----------
    var KW = '<span class="kw">';
    var KWE = '</span>';
    var SCENES = [
      {
        duration: 7000, generate: genScene1, draw: drawScene1, filename: 'analysis.py',
        code: [
          KW + 'import' + KWE + ' numpy as np',
          KW + 'from' + KWE + ' sklearn.linear_model ' + KW + 'import' + KWE + ' ' + KW + 'LinearRegression' + KWE,
          '',
          'model = ' + KW + 'LinearRegression' + KWE + '()',
          'model.fit(X_train, y_train)',
          'print(f"R² score: {model.score(X_test, y_test):.2f}")'
        ]
      },
      {
        duration: 7000, generate: genScene2, draw: drawScene2, filename: 'query.sql',
        code: [
          KW + 'SELECT' + KWE + ' date_trunc(\'week\', order_date) ' + KW + 'AS' + KWE + ' week,',
          'SUM(revenue) ' + KW + 'AS' + KWE + ' total_revenue',
          KW + 'FROM' + KWE + ' sales',
          KW + 'GROUP BY' + KWE + ' week',
          KW + 'ORDER BY' + KWE + ' week ' + KW + 'ASC' + KWE + ';'
        ]
      },
      {
        duration: 7000, generate: genScene3, draw: drawScene3, filename: 'graph.js',
        code: [
          KW + 'const' + KWE + ' graph = buildGraph(dataPoints);',
          'graph.nodes.' + KW + 'forEach' + KWE + '(node => {',
          'node.connections = findRelated(node, graph);',
          '});',
          'graph.propagate();'
        ]
      },
      {
        duration: 7000, generate: genScene4, draw: drawScene4, filename: 'segments.py',
        code: [
          KW + 'from' + KWE + ' sklearn.cluster ' + KW + 'import' + KWE + ' ' + KW + 'KMeans' + KWE,
          '',
          'kmeans = ' + KW + 'KMeans' + KWE + '(n_clusters=3, random_state=42)',
          'segments = kmeans.fit_predict(customer_data)',
          'print(f"Identifikované segmenty: {len(set(segments))}")'
        ]
      },
      {
        duration: 7000, generate: genScene5, draw: drawScene5, filename: 'summary.r',
        code: [
          'summary &lt;- ' + KW + 'aggregate' + KWE + '(revenue ~ category,',
          'data = quarterly_data,',
          'FUN = sum)',
          'summary &lt;- summary[' + KW + 'order' + KWE + '(-summary$revenue), ]',
          KW + 'print' + KWE + '(summary)'
        ]
      },
      {
        duration: 7000, generate: genScene6, draw: drawScene6, filename: 'tree.py',
        code: [
          KW + 'from' + KWE + ' sklearn.tree ' + KW + 'import' + KWE + ' ' + KW + 'DecisionTreeClassifier' + KWE,
          '',
          'tree = ' + KW + 'DecisionTreeClassifier' + KWE + '(max_depth=3)',
          'tree.fit(features, outcomes)',
          'recommendation = tree.predict(new_case)'
        ]
      }
    ];

    function stripTags(html) {
      return html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    }

    // ---------- sizing (dpr-aware, confined to the right-column frame) ----------
    var W = 440, H = 330;
    function sizeCanvas() {
      var rect = frameEl.getBoundingClientRect();
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      isMobile = window.innerWidth < 768;
      USE_BLUR = !isMobile;
      var dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 1.75);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
    sizeCanvas();
    window.addEventListener('resize', sizeCanvas);

    // ---------- parallax (mouse on desktop, autonomous idle drift on
    // mobile/touch — never active under reduced-motion, which never
    // enters the animation loop below at all) ----------
    var targetParX = 0, targetParY = 0, curParX = 0, curParY = 0;
    if (!reduceMotion && !isMobile) {
      frameEl.style.pointerEvents = 'auto';
      frameEl.addEventListener('mousemove', function (e) {
        var rect = frameEl.getBoundingClientRect();
        targetParX = clampRange(((e.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
        targetParY = clampRange(((e.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
      });
      frameEl.addEventListener('mouseleave', function () {
        targetParX = 0; targetParY = 0;
      });
    }

    // ---------- scroll parallax ----------
    // Background drifts slightly slower than the page scrolls (a translateY
    // on the whole canvas wrapper, capped so it never drifts far enough to
    // reveal a gap at the section edge). rAF-throttled; skipped entirely
    // under reduced-motion.
    if (!reduceMotion) {
      var scrollTicking = false;
      window.addEventListener('scroll', function () {
        if (scrollTicking) return;
        scrollTicking = true;
        requestAnimationFrame(function () {
          var offset = Math.min(window.scrollY * 0.12, 60);
          frameEl.style.transform = 'translateY(' + offset + 'px)';
          scrollTicking = false;
        });
      }, { passive: true });
    }

    // ---------- reduced motion: one static block + scene 1 richest frame ----------
    if (reduceMotion) {
      if (filenameEl) filenameEl.textContent = SCENES[0].filename;
      codeBlockEl.innerHTML = SCENES[0].code.map(function (l, idx) {
        return '<div class="code-line"><span class="code-line-num">' + (idx + 1) + '</span>' +
          '<span class="code-line-code">' + (l || '&nbsp;') + '</span></div>';
      }).join('');
      var staticData = SCENES[0].generate(W, H);
      ctx.clearRect(0, 0, W, H);
      SCENES[0].draw(W, H, SCENES[0].duration, staticData, 0, 0);
      return;
    }

    // ---------- code block typing engine ----------
    // Each .code-line is <num><code>; only the .code-line-code span's
    // innerHTML gets swapped for the syntax-highlighted version once a
    // line finishes typing, so the line number never gets clobbered.
    var cursorEl = document.createElement('span');
    cursorEl.className = 'code-cursor';

    function typeCodeBlock(lines, filename, onDone) {
      if (filenameEl) filenameEl.textContent = filename;
      codeBlockEl.innerHTML = '';
      var lineIdx = 0;
      function typeLine() {
        if (lineIdx >= lines.length) { if (onDone) onDone(); return; }
        var lineEl = document.createElement('div');
        lineEl.className = 'code-line';
        var numEl = document.createElement('span');
        numEl.className = 'code-line-num';
        numEl.textContent = String(lineIdx + 1);
        lineEl.appendChild(numEl);
        var codeEl = document.createElement('span');
        codeEl.className = 'code-line-code';
        var textNode = document.createTextNode('');
        codeEl.appendChild(textNode);
        lineEl.appendChild(codeEl);
        codeBlockEl.appendChild(lineEl);
        codeEl.appendChild(cursorEl);
        // Container-scoped only — never scrollIntoView() here. That walks
        // every scrollable ancestor including the page itself, and once
        // escalated it can drag the whole viewport down (this was the
        // cause of the page auto-scrolling to the hero CTA on load).
        // Direct scrollTop assignment can only ever move this element.
        codeBlockEl.scrollTop = codeBlockEl.scrollHeight;

        var plain = stripTags(lines[lineIdx]);
        if (!plain.length) {
          lineIdx++;
          setTimeout(typeLine, 140);
          return;
        }
        var charIdx = 0;
        function typeChar() {
          if (charIdx >= plain.length) {
            codeEl.innerHTML = lines[lineIdx];
            lineIdx++;
            setTimeout(typeLine, 90 + Math.random() * 60);
            return;
          }
          charIdx++;
          textNode.textContent = plain.slice(0, charIdx);
          setTimeout(typeChar, 13 + Math.random() * 20);
        }
        typeChar();
      }
      typeLine();
    }

    function eraseCodeBlock(onDone) {
      function eraseLine() {
        var lines = codeBlockEl.querySelectorAll('.code-line');
        if (!lines.length) { if (onDone) onDone(); return; }
        var lineEl = lines[lines.length - 1];
        var codeEl = lineEl.querySelector('.code-line-code');
        var text = codeEl.textContent;
        codeEl.textContent = text;
        codeEl.appendChild(cursorEl);
        var textNode = codeEl.firstChild;

        function backspace() {
          var t = textNode.textContent;
          if (!t.length) {
            codeBlockEl.appendChild(cursorEl);
            codeBlockEl.removeChild(lineEl);
            setTimeout(eraseLine, 50);
            return;
          }
          textNode.textContent = t.slice(0, -1);
          setTimeout(backspace, 6 + Math.random() * 9);
        }
        if (!text.length) {
          codeBlockEl.removeChild(lineEl);
          setTimeout(eraseLine, 50);
          return;
        }
        backspace();
      }
      eraseLine();
    }

    // ---------- inter-scene particle-cloud transition ----------
    // Replaces the old instant clearRect + blank wait for typing: the
    // outgoing scene's own points/nodes dissolve into a small drifting
    // cloud near canvas center, hold there breathing for a beat, then
    // glide out into the incoming scene's point layout — which itself
    // fades up underneath during the last stretch, so hand-off to the
    // scene's own draw() is a crossfade, not a cut.
    // Per-scene adapter: pulls plain {x,y} anchors out of each scene's
    // own (very differently shaped) generate() output.
    function extractAnchorPoints(idx, data) {
      var pts = [], i;
      switch (idx) {
        case 0:
          for (i = 0; i < data.points.length; i++) pts.push({ x: data.points[i].x, y: data.points[i].y });
          break;
        case 1:
          for (i = 0; i < data.pts.length; i += 3) pts.push({ x: data.pts[i].x, y: data.pts[i].y });
          break;
        case 2:
          for (i = 0; i < data.nodes.length; i++) pts.push({ x: data.nodes[i].x, y: data.nodes[i].y });
          break;
        case 3:
          for (i = 0; i < data.points.length; i++) pts.push({ x: data.points[i].target.x, y: data.points[i].target.y });
          break;
        case 4:
          for (i = 0; i < data.bars.length; i++) {
            var b = data.bars[i];
            pts.push({ x: b.x + b.w / 2, y: data.baseY - b.h2 * data.plotH });
          }
          break;
        case 5:
          pts.push({ x: data.root.x, y: data.root.y });
          for (i = 0; i < data.l1.length; i++) pts.push({ x: data.l1[i].x, y: data.l1[i].y });
          for (i = 0; i < data.l2.length; i++) pts.push({ x: data.l2[i].x, y: data.l2[i].y });
          break;
      }
      return pts;
    }

    function drawTransitionParticles(particles, t, DISSOLVE, HOLD, FORM, OVERLAP) {
      var formStart = DISSOLVE + HOLD;
      var total = formStart + FORM;
      var overlapStart = total - OVERLAP;
      for (var i = 0; i < particles.length; i++) {
        var pt = particles[i], x, y, alpha;
        if (t < DISSOLVE) {
          var prog = easeInOutCubic(clamp01(t / DISSOLVE));
          x = lerp(pt.from.x, pt.cloud.x, prog);
          y = lerp(pt.from.y, pt.cloud.y, prog);
          alpha = pt.alpha * easeOutCubic(clamp01(t / (DISSOLVE * 0.6)));
        } else if (t < formStart) {
          var ht = t - DISSOLVE;
          x = pt.cloud.x + Math.sin(ht / 1000 * pt.driftFreq * Math.PI * 2 + pt.driftPhase) * pt.driftAmp;
          y = pt.cloud.y + Math.cos(ht / 1000 * pt.driftFreq * 1.3 * Math.PI * 2 + pt.driftPhase) * pt.driftAmp;
          alpha = pt.alpha * (0.85 + 0.15 * Math.sin(ht / 1000 * 2.2 * Math.PI + pt.driftPhase));
        } else {
          var ft = t - formStart;
          var prog2 = easeInOutCubic(clamp01(ft / FORM));
          var settle = 1 - prog2;
          x = lerp(pt.cloud.x, pt.to.x, prog2) + Math.sin(ft / 1000 * pt.driftFreq * Math.PI * 2 + pt.driftPhase) * pt.driftAmp * settle;
          y = lerp(pt.cloud.y, pt.to.y, prog2) + Math.cos(ft / 1000 * pt.driftFreq * 1.3 * Math.PI * 2 + pt.driftPhase) * pt.driftAmp * settle;
          alpha = t < overlapStart ? pt.alpha : pt.alpha * (1 - easeInOutCubic(clamp01((t - overlapStart) / OVERLAP)));
        }
        if (alpha <= 0.004) continue;
        if (pt.glow) { ctx.shadowBlur = 7; ctx.shadowColor = blue(0.4); }
        ctx.beginPath();
        ctx.arc(x, y, pt.r, 0, Math.PI * 2);
        ctx.fillStyle = blue(alpha);
        ctx.fill();
        if (pt.glow) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }
      }
    }

    function runTransition(fromIdx, toIdx, fromData, onDone) {
      var DISSOLVE = 900, HOLD = 500, FORM = 900, OVERLAP = 400;
      var TOTAL = DISSOLVE + HOLD + FORM;
      var overlapStart = TOTAL - OVERLAP;

      var toData = SCENES[toIdx].generate(W, H);
      var fromPts = extractAnchorPoints(fromIdx, fromData);
      var toPts = extractAnchorPoints(toIdx, toData);

      var cx = W / 2, cy = H / 2;
      var cloudR = Math.min(W, H) * (isMobile ? 0.1 : 0.12);
      var COUNT = scaleCount(W, H, isMobile ? 16 : 30);

      var particles = [];
      for (var i = 0; i < COUNT; i++) {
        var fp = fromPts.length ? fromPts[Math.floor(Math.random() * fromPts.length)] : { x: cx, y: cy };
        var tp = toPts.length ? toPts[Math.floor(Math.random() * toPts.length)] : { x: cx, y: cy };
        var ang = Math.random() * Math.PI * 2, rad = Math.sqrt(Math.random()) * cloudR;
        particles.push({
          from: fp, to: tp,
          cloud: { x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad },
          alpha: randRange(0.2, 0.6),
          r: randRange(1.2, 1.8),
          glow: Math.random() < 0.28,
          driftPhase: Math.random() * Math.PI * 2,
          driftFreq: randRange(0.6, 1.3),
          driftAmp: randRange(2.5, 5.5)
        });
      }

      var start = performance.now();
      function frame(now) {
        var t = now - start;

        if (isMobile) {
          curParX = Math.sin(now / 4200) * 0.5;
          curParY = Math.cos(now / 5300) * 0.4;
        } else {
          curParX = lerp(curParX, targetParX, 0.06);
          curParY = lerp(curParY, targetParY, 0.06);
        }

        ctx.clearRect(0, 0, W, H);
        if (t >= overlapStart) {
          SCENES[toIdx].draw(W, H, clampRange(t - overlapStart, 0, OVERLAP), toData, curParX, curParY);
        }
        drawTransitionParticles(particles, t, DISSOLVE, HOLD, FORM, OVERLAP);

        if (t < TOTAL) {
          rafId = requestAnimationFrame(frame);
        } else {
          ctx.clearRect(0, 0, W, H);
          onDone(toData, OVERLAP);
        }
      }
      rafId = requestAnimationFrame(frame);
    }

    // ---------- scene orchestrator (strictly sequential, per spec) ----------
    var rafId = null;

    function runScene(idx, preData, initialElapsed) {
      var scene = SCENES[idx];
      var data = preData || scene.generate(W, H);
      var start = performance.now() - (initialElapsed || 0);

      function frame(now) {
        var t = Math.min(now - start, scene.duration);

        if (isMobile) {
          // no pointer to track on touch — slow autonomous sway instead
          curParX = Math.sin(now / 4200) * 0.5;
          curParY = Math.cos(now / 5300) * 0.4;
        } else {
          curParX = lerp(curParX, targetParX, 0.06);
          curParY = lerp(curParY, targetParY, 0.06);
        }

        ctx.clearRect(0, 0, W, H);
        scene.draw(W, H, t, data, curParX, curParY);
        if (now - start < scene.duration) {
          rafId = requestAnimationFrame(frame);
        } else {
          var nextIdx = (idx + 1) % SCENES.length;
          eraseCodeBlock(function () {
            typeCodeBlock(SCENES[nextIdx].code, SCENES[nextIdx].filename, function () {});
          });
          runTransition(idx, nextIdx, data, function (nextData, elapsedOffset) {
            runScene(nextIdx, nextData, elapsedOffset);
          });
        }
      }
      rafId = requestAnimationFrame(frame);
    }

    typeCodeBlock(SCENES[0].code, SCENES[0].filename, function () {
      setTimeout(function () { runScene(0); }, 300 + Math.random() * 200);
    });
  }
})();
