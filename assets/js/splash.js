// TECH-SCOPE — homepage intro splash: "<_>" -> "<techscope_>" -> shatter
// into data points -> hero.
//
// The inline script right after #splash in index.html already hid the
// overlay synchronously (before first paint) if this is a repeat visit
// this session (sessionStorage) or prefers-reduced-motion is on — in
// either case window.__tsSplashSkip is set and this file has nothing to
// animate. Otherwise: type "techscope" INSIDE the caret (the trailing "_"
// stays the cursor, "<" and ">" stay fixed) -> hold -> fade in the
// subheadline -> hold -> every character/word disintegrates into a small
// point that flies outward and fades, with a few connecting lines
// briefly linking freshly-spawned points (same visual language as the
// hero-viz scenes) -> quick fade-out reveals the hero, and only THEN does
// assets/js/hero-viz.js start its own typing cycle via window.__tsStartHeroViz().

document.addEventListener('DOMContentLoaded', function () {
  if (window.__tsSplashSkip) return;

  var splash = document.getElementById('splash');
  if (!splash) return;

  var markEl = splash.querySelector('.splash-mark');
  var typeEl = splash.querySelector('.splash-type');
  var subEl = splash.querySelector('.splash-sub');
  var text = 'techscope';
  var i = 0;

  function typeChar() {
    if (i >= text.length) {
      // "<techscope_>" holds fully visible for >= 2s before the subheadline appears.
      setTimeout(function () {
        subEl.classList.add('in');
        setTimeout(shatter, 900);
      }, 2000);
      return;
    }
    i++;
    typeEl.textContent = text.slice(0, i);
    setTimeout(typeChar, 60 + Math.random() * 55);
  }

  function escapeChar(ch) {
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    return ch;
  }

  function toCharSpans(container, str) {
    container.innerHTML = str.split('').map(function (ch) {
      return '<span class="shatter-src">' + escapeChar(ch) + '</span>';
    }).join('');
    return measureSpans(container);
  }

  function toWordSpans(container) {
    var words = container.textContent.trim().split(/\s+/);
    container.innerHTML = words.map(function (w) {
      return '<span class="shatter-src">' + w + '</span>';
    }).join(' ');
    return measureSpans(container);
  }

  function measureSpans(container) {
    var spans = container.querySelectorAll('.shatter-src');
    var positions = [];
    for (var i = 0; i < spans.length; i++) {
      var r = spans[i].getBoundingClientRect();
      positions.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    }
    return positions;
  }

  function spawnLink(layer, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    var angle = Math.atan2(dy, dx) * 180 / Math.PI;
    var link = document.createElement('div');
    link.className = 'splash-shatter-link';
    link.style.left = a.x + 'px';
    link.style.top = a.y + 'px';
    link.style.width = len + 'px';
    link.style.transform = 'rotate(' + angle + 'deg)';
    layer.appendChild(link);
    requestAnimationFrame(function () { link.style.opacity = '0'; });
    setTimeout(function () {
      if (link.parentNode) link.parentNode.removeChild(link);
    }, 380);
  }

  function shatter() {
    var markPositions = toCharSpans(markEl, '<' + text + '_>');
    var subPositions = toWordSpans(subEl);
    var positions = markPositions.concat(subPositions);

    var layer = document.createElement('div');
    layer.className = 'splash-shatter-layer';
    document.body.appendChild(layer);

    var spawned = [];
    for (var idx = 0; idx < positions.length; idx++) {
      (function (pos, order) {
        setTimeout(function () {
          var dot = document.createElement('div');
          dot.className = 'splash-shatter-dot';
          dot.style.left = pos.x + 'px';
          dot.style.top = pos.y + 'px';
          layer.appendChild(dot);
          spawned.push(pos);

          if (spawned.length > 1 && Math.random() < 0.4) {
            var other = spawned[Math.floor(Math.random() * (spawned.length - 1))];
            spawnLink(layer, pos, other);
          }

          var angle = Math.random() * Math.PI * 2;
          var dist = 40 + Math.random() * 80;
          var dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist;
          requestAnimationFrame(function () {
            dot.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
            dot.style.opacity = '0';
          });
        }, order * (20 + Math.random() * 20));
      })(positions[idx], idx);
    }

    // Tight bound, not a padded guess: the last unit's spawn is staggered
    // by at most (positions.length - 1) * 40ms (the upper end of the
    // per-unit `20 + Math.random()*20` delay above), and each dot's own
    // fly+fade transition is the .splash-shatter-dot CSS's 0.7s — so this
    // is exactly when the last dot finishes, not "that plus a safety
    // margin" (the previous +200ms buffer was pure unintended dead time).
    var shatterMs = (positions.length - 1) * 40 + 700;
    setTimeout(function () { finish(layer); }, shatterMs);
  }

  function finish(layer) {
    splash.classList.add('splash-hide');
    try { sessionStorage.setItem('tsSplashSeen', '1'); } catch (e) {}
    // Matches .splash's own transition duration (opacity/transform .5s in
    // style.css) exactly — was 400ms, cutting the fade-out short and
    // starting hero-viz while the overlay was still ~1/5 visible instead
    // of waiting the extra 100ms it actually needed.
    setTimeout(function () {
      splash.style.display = 'none';
      if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
      if (window.__tsStartHeroViz) window.__tsStartHeroViz();
    }, 500);
  }

  setTimeout(typeChar, 250);
});
