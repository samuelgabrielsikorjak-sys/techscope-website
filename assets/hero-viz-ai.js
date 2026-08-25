// TECH-SCOPE — ai-riesenia.html hero data visualization ("hero-viz").
//
// Fork of assets/hero-viz.js (Data Compass / homepage) — identical engine
// (full-bleed ambient canvas behind the hero, paired terminal code block,
// depth-tiered points, cached blur sprites, ambient star-field, particle
// dissolve/form transition between scenes, typing effect, parallax,
// prefers-reduced-motion + mobile handling). Only the four scenes
// themselves are new, themed for "AI riešenia": document extraction,
// a human-in-the-loop decision route, an automated task loop, and an
// accuracy/outlier cluster.

(function () {
  window.__tsStartHeroViz = init;

  document.addEventListener('DOMContentLoaded', function () {
    if (window.__tsSplashSkip) init();
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

    // rounded-rect path — document/field boxes read as "interface", not
    // generic data-viz shapes.
    function roundRectPath(x, y, w, h, r) {
      var rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }

    // gradient line with an arrowhead once it's mostly drawn — the
    // decision-route scene reuses this instead of a plain edge so
    // direction reads clearly.
    function drawArrow(ax, ay, bx, by, alpha, progress) {
      if (progress <= 0) return;
      var x = lerp(ax, bx, progress), y = lerp(ay, by, progress);
      drawGradientLine(ax, ay, x, y, alpha * 0.55, alpha, 1.4, blue);
      if (progress > 0.85) {
        var angle = Math.atan2(by - ay, bx - ax);
        var headLen = 6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - headLen * Math.cos(angle - Math.PI / 7), y - headLen * Math.sin(angle - Math.PI / 7));
        ctx.lineTo(x - headLen * Math.cos(angle + Math.PI / 7), y - headLen * Math.sin(angle + Math.PI / 7));
        ctx.closePath();
        ctx.fillStyle = blue(alpha);
        ctx.fill();
      }
    }

    // ---------- depth system ----------
    var USE_BLUR = !isMobile;
    var PARALLAX_MAX = 13;
    var DEPTH_TIERS = [
      { blur: 1.6, sizeMul: 0.58, alphaMul: 0.32, parallax: 0.18, glowBlur: 6 },
      { blur: 0.6, sizeMul: 0.85, alphaMul: 0.62, parallax: 0.5, glowBlur: 8 },
      { blur: 0, sizeMul: 1.2, alphaMul: 1.0, parallax: 1.0, glowBlur: 12 }
    ];
    function pickTier() {
      var r = Math.random();
      return r < 0.4 ? 0 : (r < 0.75 ? 1 : 2);
    }

    var DENSITY_REFERENCE_AREA = 510 * 200;
    var DENSITY_SCALE_CAP = 2;
    function scaleCount(w, h, base) {
      var scale = Math.min(Math.sqrt((w * h) / DENSITY_REFERENCE_AREA), DENSITY_SCALE_CAP);
      return Math.max(base, Math.round(base * scale));
    }

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
            var d = p.r * 2.9;
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

    // ---------- scene 1: document processing ----------
    // A document (a few thin "text line" strokes) decomposes into
    // smaller structured field boxes — unstructured text becoming
    // structured data. The last text line has no matching field and
    // just stays put, so the document doesn't fully vanish.
    function genScene1(w, h) {
      var docX = w * 0.1, docY = h * 0.14, docW = w * 0.32, docH = h * 0.72;
      var lineCount = 5;
      var lines = [];
      for (var i = 0; i < lineCount; i++) {
        lines.push({
          x: docX + docW * 0.1,
          y: docY + docH * (0.16 + i * 0.17),
          w: docW * (0.55 + Math.random() * 0.35),
          appearAt: i * 300
        });
      }
      var fieldW = w * 0.16, fieldH = h * 0.1;
      var fieldPos = [
        { x: w * 0.6, y: h * 0.22 }, { x: w * 0.8, y: h * 0.22 },
        { x: w * 0.6, y: h * 0.44 }, { x: w * 0.8, y: h * 0.44 }
      ];
      var fields = [];
      for (var f = 0; f < fieldPos.length; f++) {
        fields.push({ x: fieldPos[f].x, y: fieldPos[f].y, w: fieldW, h: fieldH, flyStart: 2600 + f * 350 });
      }
      return {
        doc: { x: docX, y: docY, w: docW, h: docH }, lines: lines, fields: fields,
        ambient: genAmbient(w, h, scaleCount(w, h, isMobile ? 8 : 16))
      };
    }

    function drawScene1(w, h, t, data, px, py) {
      drawAmbient(data.ambient, t, px, py);
      var doc = data.doc, pulsing = t >= 6200;

      var docAlpha = 0.32 * clamp01(t / 500);
      roundRectPath(doc.x, doc.y, doc.w, doc.h, 4);
      ctx.strokeStyle = ink(docAlpha);
      ctx.lineWidth = 1.2;
      ctx.stroke();

      var i;
      for (i = 0; i < data.lines.length; i++) {
        var ln = data.lines[i];
        if (t < ln.appearAt) continue;
        var field = data.fields[i];

        if (!field || t < field.flyStart) {
          var inAlpha = 0.32 * clamp01((t - ln.appearAt) / 300);
          drawGradientLine(ln.x, ln.y, ln.x + ln.w, ln.y, inAlpha, inAlpha, 1.4, ink);
          continue;
        }

        var flyProg = easeInOutCubic(clamp01((t - field.flyStart) / 700));
        if (flyProg < 1) {
          var curX = lerp(ln.x, field.x, flyProg);
          var curY = lerp(ln.y, field.y + field.h / 2, flyProg);
          var curW = lerp(ln.w, field.w, flyProg);
          var curH = lerp(2, field.h, flyProg);
          roundRectPath(curX, curY - curH / 2, curW, curH, Math.min(4, curH / 2));
          ctx.fillStyle = blue(0.18 + 0.24 * flyProg);
          ctx.fill();
        } else {
          var boxAlpha = 0.3;
          if (pulsing) boxAlpha *= 0.75 + 0.25 * (0.5 + 0.5 * Math.sin((t - 6200) / 1300 * Math.PI * 2 + i));
          roundRectPath(field.x, field.y, field.w, field.h, 5);
          if (pulsing) { ctx.shadowBlur = 8; ctx.shadowColor = blue(0.4); }
          ctx.fillStyle = blue(boxAlpha);
          ctx.fill();
          ctx.strokeStyle = blue(Math.min(0.6, boxAlpha * 2));
          ctx.lineWidth = 1.3;
          ctx.stroke();
          if (pulsing) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }
        }
      }
    }

    // ---------- scene 2: AI decision route (human-in-the-loop) ----------
    // input -> a first decision node, which branches: one path goes
    // straight to an "auto-processed" endpoint, the other passes through
    // a second decision node on its way to a "human review" endpoint —
    // the two different output kinds are the whole point of the scene.
    function genScene2(w, h) {
      return {
        input: { x: w * 0.08, y: h * 0.5 },
        d1: { x: w * 0.38, y: h * 0.5 },
        outA: { x: w * 0.86, y: h * 0.26 },
        d2: { x: w * 0.62, y: h * 0.76 },
        outB: { x: w * 0.86, y: h * 0.8 },
        ambient: genAmbient(w, h, scaleCount(w, h, isMobile ? 8 : 16))
      };
    }

    function drawScene2(w, h, t, data, px, py) {
      drawAmbient(data.ambient, t, px, py);
      var input = data.input, d1 = data.d1, d2 = data.d2, outA = data.outA, outB = data.outB;
      var pulsing = t >= 6000;

      drawNodePoint(input, 0.5 * clamp01(t / 600), 6, t >= 600, px, py, 2);
      if (t < 900) return;

      var p1 = easeInOutCubic(clamp01((t - 900) / 900));
      drawArrow(input.x, input.y, d1.x, d1.y, 0.45, p1);
      var d1Alpha = 0.55 * clamp01((p1 - 0.7) / 0.3);
      if (d1Alpha > 0) drawNodePoint(d1, d1Alpha, 6, pulsing, px, py, 2);
      if (t < 1900) return;

      var pA = easeInOutCubic(clamp01((t - 1900) / 900));
      drawArrow(d1.x, d1.y, outA.x, outA.y, 0.42, pA);
      var outAAlpha = 0.55 * clamp01((pA - 0.7) / 0.3);
      if (outAAlpha > 0) drawNodePoint(outA, outAAlpha, 5.5, pulsing || pA >= 0.999, px, py, 2);

      var pB = easeInOutCubic(clamp01((t - 1900) / 900));
      drawArrow(d1.x, d1.y, d2.x, d2.y, 0.42, pB);
      var d2Alpha = 0.55 * clamp01((pB - 0.7) / 0.3);
      if (d2Alpha > 0) drawNodePoint(d2, d2Alpha, 5.5, pulsing || pB >= 0.999, px, py, 2);
      if (t < 3100) return;

      var pC = easeInOutCubic(clamp01((t - 3100) / 900));
      drawArrow(d2.x, d2.y, outB.x, outB.y, 0.42, pC);
      var outBAlpha = 0.55 * clamp01((pC - 0.7) / 0.3);
      if (outBAlpha > 0) drawNodePoint(outB, outBAlpha, 5.5, pulsing || pC >= 0.999, px, py, 2);
    }

    // ---------- scene 3: automated task loop ----------
    // Five nodes on a ring; once the ring is fully drawn, a single glowing
    // point travels continuously around it — an unattended, repeating
    // process rather than a one-shot animation.
    function genScene3(w, h) {
      var n = 5;
      var cx = w * 0.5, cy = h * 0.52;
      var radius = Math.min(w, h) * 0.28;
      var nodes = [];
      for (var i = 0; i < n; i++) {
        var angle = (-90 + i * (360 / n)) * Math.PI / 180;
        nodes.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, appearAt: i * 350 });
      }
      return { nodes: nodes, ambient: genAmbient(w, h, scaleCount(w, h, isMobile ? 8 : 16)) };
    }

    function drawScene3(w, h, t, data, px, py) {
      drawAmbient(data.ambient, t, px, py);
      var nodes = data.nodes, i;
      var ringDoneAt = (nodes.length - 1) * 350 + 500;
      var ringDone = t >= ringDoneAt;

      if (ringDone) {
        for (i = 0; i < nodes.length; i++) {
          var a = nodes[i], b = nodes[(i + 1) % nodes.length];
          drawGradientLine(a.x, a.y, b.x, b.y, 0.2, 0.2, 1, ink);
        }
      }

      for (i = 0; i < nodes.length; i++) {
        var nd = nodes[i];
        if (t < nd.appearAt) continue;
        var alpha = 0.5 * clamp01((t - nd.appearAt) / 300);
        drawNodePoint(nd, alpha, 5, false, px, py, 2);
      }

      if (ringDone) {
        var period = 2600;
        var lt = (t - ringDoneAt) % period;
        var segT = (lt / period) * nodes.length;
        var segIdx = Math.floor(segT) % nodes.length;
        var segProg = segT - Math.floor(segT);
        var a2 = nodes[segIdx], b2 = nodes[(segIdx + 1) % nodes.length];
        var dotX = lerp(a2.x, b2.x, segProg), dotY = lerp(a2.y, b2.y, segProg);
        withGlow(11, blue(0.7), function () {
          ctx.beginPath();
          ctx.arc(dotX, dotY, 3.4, 0, Math.PI * 2);
          ctx.fillStyle = blue(0.9);
          ctx.fill();
        });
      }
    }

    // ---------- scene 4: accuracy / quality control ----------
    // A scatter of points drifts toward a tight central cluster (high
    // accuracy), while one or two "outliers" stay put near the edges and
    // blink in blue instead of settling — the cases that need a human
    // to look at them.
    function genScene4(w, h) {
      var n = scaleCount(w, h, isMobile ? 12 : 22);
      var outlierCount = 2;
      var cx = w * 0.55, cy = h * 0.5;
      var clusterR = Math.min(w, h) * 0.09;
      var padX = w * 0.1, padY = h * 0.14;
      var points = [];
      for (var i = 0; i < n; i++) {
        var isOutlier = i >= n - outlierCount;
        var target;
        if (isOutlier) {
          var oa = Math.random() * Math.PI * 2, or_ = Math.min(w, h) * (0.32 + Math.random() * 0.08);
          target = { x: cx + Math.cos(oa) * or_, y: cy + Math.sin(oa) * or_ };
        } else {
          var ca = Math.random() * Math.PI * 2, cr = Math.sqrt(Math.random()) * clusterR;
          target = { x: cx + Math.cos(ca) * cr, y: cy + Math.sin(ca) * cr };
        }
        points.push({
          start: { x: randRange(padX, w - padX), y: randRange(padY, h - padY) },
          target: target, appearAt: i * (1200 / n), isOutlier: isOutlier,
          pulseOffset: Math.random() * Math.PI * 2, tier: pickTier()
        });
      }
      return { points: points, ambient: genAmbient(w, h, scaleCount(w, h, isMobile ? 8 : 16)) };
    }

    function drawScene4(w, h, t, data, px, py) {
      drawAmbient(data.ambient, t, px, py);
      var points = data.points, pulsing = t >= 5800, arr = [];
      for (var i = 0; i < points.length; i++) {
        var p = points[i];
        if (t < p.appearAt) continue;
        var fadeT = clamp01((t - p.appearAt) / 300);
        var eased = easeInOutCubic(clamp01((t - 1000) / 4000));
        var x = lerp(p.start.x, p.target.x, eased);
        var y = lerp(p.start.y, p.target.y, eased);
        var cfg = DEPTH_TIERS[p.tier];
        var alpha;
        if (p.isOutlier) {
          var blink = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t / 650 + p.pulseOffset));
          alpha = blink * fadeT * cfg.alphaMul;
        } else {
          alpha = 0.55 * fadeT * cfg.alphaMul;
          if (pulsing) alpha *= 0.8 + 0.2 * (0.5 + 0.5 * Math.sin((t - 5800) / 1200 * Math.PI * 2 + p.pulseOffset));
        }
        arr.push({ x: x, y: y, tier: p.tier, r: 3.4 * cfg.sizeMul, alpha: alpha, color: p.isOutlier ? 'blue' : 'ink', glow: p.isOutlier });
      }
      drawDepthPoints(arr, px, py);
    }

    // ---------- code blocks (exact wording; kw = keyword highlight) ----------
    var KW = '<span class="kw">';
    var KWE = '</span>';
    var SCENES = [
      {
        duration: 7000, generate: genScene1, draw: drawScene1, filename: 'extract.py',
        code: [
          KW + 'def' + KWE + ' ' + KW + 'extract' + KWE + '(document):',
          '    fields = ai_model.parse(document)',
          '    ' + KW + 'return' + KWE + ' normalize(fields)'
        ]
      },
      {
        duration: 7000, generate: genScene2, draw: drawScene2, filename: 'router.py',
        code: [
          'decision = ' + KW + 'route' + KWE + '(decision, confidence)',
          KW + 'if' + KWE + ' decision.confidence >= THRESHOLD:',
          '    auto_process(decision)',
          KW + 'else' + KWE + ':',
          '    flag_for_review(decision)'
        ]
      },
      {
        duration: 7000, generate: genScene3, draw: drawScene3, filename: 'automation.py',
        code: [
          KW + 'while' + KWE + ' ' + KW + 'True' + KWE + ':',
          '    task = queue.next()',
          '    ' + KW + 'automate' + KWE + '(task_loop, task)'
        ]
      },
      {
        duration: 7000, generate: genScene4, draw: drawScene4, filename: 'validate.py',
        code: [
          'scores = [' + KW + 'validate' + KWE + '(accuracy, x) ' + KW + 'for' + KWE + ' x ' + KW + 'in' + KWE + ' outputs]',
          'outliers = [s ' + KW + 'for' + KWE + ' s ' + KW + 'in' + KWE + ' scores ' + KW + 'if' + KWE + ' s < THRESHOLD]',
          KW + 'print' + KWE + '(f"{len(outliers)} flagged for review")'
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
    function extractAnchorPoints(idx, data) {
      var pts = [], i;
      switch (idx) {
        case 0:
          pts.push({ x: data.doc.x + data.doc.w / 2, y: data.doc.y + data.doc.h / 2 });
          for (i = 0; i < data.fields.length; i++) {
            var f = data.fields[i];
            pts.push({ x: f.x + f.w / 2, y: f.y + f.h / 2 });
          }
          break;
        case 1:
          pts.push({ x: data.input.x, y: data.input.y });
          pts.push({ x: data.d1.x, y: data.d1.y });
          pts.push({ x: data.d2.x, y: data.d2.y });
          pts.push({ x: data.outA.x, y: data.outA.y });
          pts.push({ x: data.outB.x, y: data.outB.y });
          break;
        case 2:
          for (i = 0; i < data.nodes.length; i++) pts.push({ x: data.nodes[i].x, y: data.nodes[i].y });
          break;
        case 3:
          for (i = 0; i < data.points.length; i++) pts.push({ x: data.points[i].target.x, y: data.points[i].target.y });
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
