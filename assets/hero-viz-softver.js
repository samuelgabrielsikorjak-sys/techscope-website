// TECH-SCOPE — softver-na-mieru.html hero data visualization ("hero-viz").
//
// Fork of assets/hero-viz.js (Data Compass / homepage) — identical engine
// (full-bleed ambient canvas behind the hero, paired terminal code block,
// depth-tiered points, cached blur sprites, ambient star-field, particle
// dissolve/form transition between scenes, typing effect, parallax,
// prefers-reduced-motion + mobile handling). Only the four scenes
// themselves are new, and are themed for "Softvér na mieru" — custom
// internal systems — instead of data/analytics: process mapping, layered
// architecture, user roles, testing checklist.
//
// Cycle: type a code block (multi-line, char by char) -> pause -> run its
// paired scene for ~7s while the block stays static -> erase the block ->
// type the next block -> repeat. Four scenes, four blocks, fixed 1:1
// pairing, looping forever. prefers-reduced-motion shows one static block
// + scene 1's richest frame, no cycling, no typing, no parallax.

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

    // rounded-rect path — process boxes / architecture bands / checklist
    // squares all read as "system", not generic data-viz shapes.
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

    // gradient line with an arrowhead once it's mostly drawn — process
    // mapping / role fan-out reuse this instead of a plain edge so
    // direction/hierarchy reads clearly.
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

    // ---------- scene 1: process mapping ----------
    // Six process-step boxes drawn left-to-right with connecting arrows —
    // mapping an existing workflow before anything gets built.
    function genScene1(w, h) {
      var n = 6;
      var padX = w * 0.08, cy = h * 0.5;
      var innerW = w - padX * 2;
      var boxW = (innerW / n) * 0.62;
      var gap = (innerW - boxW * n) / (n - 1);
      var boxH = h * 0.16;
      var boxes = [];
      for (var i = 0; i < n; i++) {
        boxes.push({
          x: padX + i * (boxW + gap), y: cy - boxH / 2, w: boxW, h: boxH,
          appearAt: i * 550
        });
      }
      return { boxes: boxes, ambient: genAmbient(w, h, scaleCount(w, h, isMobile ? 8 : 16)) };
    }

    function drawScene1(w, h, t, data, px, py) {
      drawAmbient(data.ambient, t, px, py);
      var boxes = data.boxes, i, pulsing = t >= 6200;

      for (i = 0; i < boxes.length - 1; i++) {
        var a = boxes[i], b = boxes[i + 1];
        var edgeStart = a.appearAt + 350;
        if (t < edgeStart) continue;
        var prog = easeInOutCubic(clamp01((t - edgeStart) / 450));
        drawArrow(a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2, 0.5, prog);
      }

      for (i = 0; i < boxes.length; i++) {
        var bx = boxes[i];
        if (t < bx.appearAt) continue;
        var inAlpha = clamp01((t - bx.appearAt) / 350);
        var fillAlpha = 0.2 * inAlpha;
        if (pulsing) fillAlpha *= 0.75 + 0.25 * (0.5 + 0.5 * Math.sin((t - 6200) / 1300 * Math.PI * 2 + i));
        roundRectPath(bx.x, bx.y, bx.w, bx.h, 5);
        if (pulsing) { ctx.shadowBlur = 8; ctx.shadowColor = blue(0.4); }
        ctx.fillStyle = blue(fillAlpha);
        ctx.fill();
        ctx.strokeStyle = ink(0.4 * inAlpha);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        if (pulsing) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }
      }
    }

    // ---------- scene 2: system architecture ----------
    // Three horizontal bands (interface / logic / database) slide in top
    // to bottom, then thin vertical connectors appear between consecutive
    // bands once both are visible — a layered architecture forming itself.
    function genScene2(w, h) {
      var padX = w * 0.14, padY = h * 0.14;
      var innerW = w - padX * 2, innerH = h - padY * 2;
      var gap = innerH * 0.08;
      var bandH = (innerH - gap * 2) / 3;
      var bands = [];
      for (var i = 0; i < 3; i++) {
        bands.push({ x: padX, y: padY + i * (bandH + gap), w: innerW, h: bandH, appearAt: i * 900 });
      }
      var connectorsX = [padX + innerW * 0.25, padX + innerW * 0.5, padX + innerW * 0.75];
      return { bands: bands, connectorsX: connectorsX, ambient: genAmbient(w, h, scaleCount(w, h, isMobile ? 8 : 16)) };
    }

    function drawScene2(w, h, t, data, px, py) {
      drawAmbient(data.ambient, t, px, py);
      var bands = data.bands, i, pulsing = t >= 6000;

      for (i = 0; i < bands.length; i++) {
        var b = bands[i];
        if (t < b.appearAt) continue;
        var slideT = easeOutCubic(clamp01((t - b.appearAt) / 500));
        var y = b.y - (1 - slideT) * 14;
        var alpha = 0.5 * slideT;
        if (pulsing) alpha *= 0.75 + 0.25 * (0.5 + 0.5 * Math.sin((t - 6000) / 1400 * Math.PI * 2 + i));
        roundRectPath(b.x, y, b.w, b.h, 6);
        ctx.strokeStyle = ink(alpha);
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.fillStyle = blue(alpha * 0.16);
        ctx.fill();

        if (i < bands.length - 1) {
          var connStart = Math.max(b.appearAt + 500, bands[i + 1].appearAt);
          if (t >= connStart) {
            var connAlpha = 0.4 * clamp01((t - connStart) / 400);
            for (var c = 0; c < data.connectorsX.length; c++) {
              var cx = data.connectorsX[c];
              drawGradientLine(cx, b.y + b.h, cx, bands[i + 1].y, connAlpha, connAlpha, 1, blue);
            }
          }
        }
      }
    }

    // ---------- scene 3: user roles ----------
    // A central "system" node fans out into three role nodes (admin /
    // manager / user) — same hub-and-spoke language as a decision tree,
    // one level deep, each spoke drawing and its role node lighting up
    // in turn.
    function genScene3(w, h) {
      var cx = w * 0.28, cy = h * 0.5;
      var radius = Math.min(w, h) * 0.34;
      var angles = [-38, 0, 38];
      var roles = [];
      for (var i = 0; i < angles.length; i++) {
        var rad = angles[i] * Math.PI / 180;
        roles.push({ x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius, appearAt: 1200 + i * 700 });
      }
      return { root: { x: cx, y: cy }, roles: roles, ambient: genAmbient(w, h, scaleCount(w, h, isMobile ? 8 : 16)) };
    }

    function drawScene3(w, h, t, data, px, py) {
      drawAmbient(data.ambient, t, px, py);
      var root = data.root, roles = data.roles, i, pulsing = t >= 6000;

      drawNodePoint(root, 0.55 * clamp01(t / 700), 7, t >= 700, px, py, 2);

      for (i = 0; i < roles.length; i++) {
        var role = roles[i];
        if (t < role.appearAt) continue;
        var prog = easeInOutCubic(clamp01((t - role.appearAt) / 700));
        drawArrow(root.x, root.y, role.x, role.y, 0.42, prog);
        var nodeAlpha = 0.55 * clamp01((prog - 0.6) / 0.4);
        var lit = pulsing || prog >= 0.999;
        if (nodeAlpha > 0) drawNodePoint(role, nodeAlpha, 5.5, lit, px, py, 2);
      }
    }

    // ---------- scene 4: testing checklist ----------
    // Six squares in a row, each getting a hand-drawn checkmark in turn —
    // the pre-handover test pass, one item at a time.
    function genScene4(w, h) {
      var n = 6;
      var padX = w * 0.14;
      var innerW = w - padX * 2;
      var boxSize = Math.min(h * 0.14, (innerW / n) * 0.5);
      var gap = (innerW - boxSize * n) / (n - 1);
      var cy = h * 0.5;
      var boxes = [];
      for (var i = 0; i < n; i++) {
        boxes.push({
          x: padX + i * (boxSize + gap), y: cy - boxSize / 2, size: boxSize,
          appearAt: i * 300, checkAt: 2200 + i * 550
        });
      }
      return { boxes: boxes, ambient: genAmbient(w, h, scaleCount(w, h, isMobile ? 8 : 16)) };
    }

    function drawScene4(w, h, t, data, px, py) {
      drawAmbient(data.ambient, t, px, py);
      var boxes = data.boxes, i, pulsing = t >= 6200;

      for (i = 0; i < boxes.length; i++) {
        var b = boxes[i];
        if (t < b.appearAt) continue;
        var inAlpha = 0.45 * clamp01((t - b.appearAt) / 300);
        roundRectPath(b.x, b.y, b.size, b.size, 4);
        ctx.strokeStyle = ink(inAlpha);
        ctx.lineWidth = 1.3;
        ctx.stroke();

        if (t >= b.checkAt) {
          var cProg = clamp01((t - b.checkAt) / 400);
          var startX = b.x + b.size * 0.14, startY = b.y + b.size * 0.42;
          var midX = b.x + b.size * 0.28, midY = b.y + b.size * 0.55;
          var endX = b.x + b.size * 0.72, endY = b.y + b.size * 0.25;
          var checkAlpha = 0.75 * clamp01(cProg * 1.4);
          if (pulsing) checkAlpha *= 0.8 + 0.2 * (0.5 + 0.5 * Math.sin((t - 6200) / 1200 * Math.PI * 2 + i));
          if (pulsing) { ctx.shadowBlur = 8; ctx.shadowColor = blue(0.5); }
          ctx.strokeStyle = blue(checkAlpha);
          ctx.lineWidth = 2;
          ctx.beginPath();
          if (cProg <= 0.5) {
            var p1 = cProg / 0.5;
            ctx.moveTo(startX, startY);
            ctx.lineTo(lerp(startX, midX, p1), lerp(startY, midY, p1));
          } else {
            ctx.moveTo(startX, startY);
            ctx.lineTo(midX, midY);
            var p2 = (cProg - 0.5) / 0.5;
            ctx.lineTo(lerp(midX, endX, p2), lerp(midY, endY, p2));
          }
          ctx.stroke();
          if (pulsing) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }
        }
      }
    }

    // ---------- code blocks (exact wording; kw = keyword highlight) ----------
    var KW = '<span class="kw">';
    var KWE = '</span>';
    var SCENES = [
      {
        duration: 7000, generate: genScene1, draw: drawScene1, filename: 'process.py',
        code: [
          KW + 'def' + KWE + ' ' + KW + 'map_process' + KWE + '(steps):',
          '    graph = build_graph(steps)',
          '    ' + KW + 'return' + KWE + ' graph.linear_order()'
        ]
      },
      {
        duration: 7000, generate: genScene2, draw: drawScene2, filename: 'architecture.py',
        code: [
          KW + 'class' + KWE + ' ' + KW + 'Architecture' + KWE + ':',
          '    layers = [\'interface\', \'logic\', \'database\']',
          '',
          KW + 'define_architecture' + KWE + '(layers)'
        ]
      },
      {
        duration: 7000, generate: genScene3, draw: drawScene3, filename: 'roles.py',
        code: [
          'roles = [\'admin\', \'manager\', \'user\']',
          KW + 'for' + KWE + ' role ' + KW + 'in' + KWE + ' roles:',
          '    ' + KW + 'assign_roles' + KWE + '(system, role)'
        ]
      },
      {
        duration: 7000, generate: genScene4, draw: drawScene4, filename: 'tests.py',
        code: [
          'checklist = load_checklist()',
          KW + 'for' + KWE + ' check ' + KW + 'in' + KWE + ' checklist:',
          '    ' + KW + 'run_tests' + KWE + '(check)',
          KW + 'print' + KWE + '(f"{len(checklist)} checks passed")'
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
          for (i = 0; i < data.boxes.length; i++) {
            var bx = data.boxes[i];
            pts.push({ x: bx.x + bx.w / 2, y: bx.y + bx.h / 2 });
          }
          break;
        case 1:
          for (i = 0; i < data.bands.length; i++) {
            var bd = data.bands[i];
            pts.push({ x: bd.x + bd.w / 2, y: bd.y + bd.h / 2 });
          }
          break;
        case 2:
          pts.push({ x: data.root.x, y: data.root.y });
          for (i = 0; i < data.roles.length; i++) pts.push({ x: data.roles[i].x, y: data.roles[i].y });
          break;
        case 3:
          for (i = 0; i < data.boxes.length; i++) {
            var box = data.boxes[i];
            pts.push({ x: box.x + box.size / 2, y: box.y + box.size / 2 });
          }
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
