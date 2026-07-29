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

  // hero geometric background — floating outline shapes (hexagon/triangle/
  // circle/line), generated once per .geo-bg container. Pure CSS animation
  // (see @keyframes geo-float); JS only picks randomized size/position/
  // timing per shape and is not needed for the animation itself, so a
  // missing/broken script still leaves a clean, static hero.
  var geoBgs = document.querySelectorAll('.geo-bg');
  if (geoBgs.length) {
    var isNarrow = window.innerWidth < 768;
    var shapeCount = isNarrow ? 5 : 10;
    var variants = [
      { type: 'hexagon', tone: 'accent' },
      { type: 'triangle', tone: 'ink' },
      { type: 'circle', tone: 'accent' },
      { type: 'line', tone: 'ink' },
      { type: 'hexagon', tone: 'ink' },
      { type: 'circle', tone: 'ink' },
      { type: 'triangle', tone: 'accent' },
      { type: 'line', tone: 'accent' }
    ];

    var hexPoints = '95,50 72.5,89 27.5,89 5,50 27.5,11 72.5,11';
    var triPoints = '50,8 92,88 8,88';

    function edgeBiased() {
      if (Math.random() < 0.75) {
        return Math.random() < 0.5 ? Math.random() * 28 : 72 + Math.random() * 28;
      }
      return Math.random() * 100;
    }

    function randSign() { return Math.random() < 0.5 ? -1 : 1; }

    for (var g = 0; g < geoBgs.length; g++) {
      var container = geoBgs[g];
      for (var i = 0; i < shapeCount; i++) {
        var variant = variants[i % variants.length];
        var size = Math.round(40 + Math.random() * 120);
        var el = document.createElement('div');
        el.className = 'geo-shape ' + variant.tone +
          (variant.type === 'circle' ? ' is-circle' : '') +
          (variant.type === 'line' ? ' is-line' : '');

        el.style.top = edgeBiased() + '%';
        el.style.left = edgeBiased() + '%';
        el.style.width = size + 'px';
        if (variant.type !== 'line') { el.style.height = size + 'px'; }

        var duration = Math.round(60 + Math.random() * 60);
        el.style.animationDuration = duration + 's';
        el.style.animationDelay = (-(Math.random() * duration)) + 's';
        el.style.setProperty('--fx', (Math.round(20 + Math.random() * 20) * randSign()) + 'px');
        el.style.setProperty('--fy', (Math.round(20 + Math.random() * 20) * randSign()) + 'px');
        el.style.opacity = (0.08 + Math.random() * 0.07).toFixed(2);

        if (variant.type === 'hexagon') {
          el.innerHTML = '<svg viewBox="0 0 100 100"><polygon points="' + hexPoints + '" fill="none" stroke-width="2"/></svg>';
        } else if (variant.type === 'triangle') {
          el.innerHTML = '<svg viewBox="0 0 100 100"><polygon points="' + triPoints + '" fill="none" stroke-width="2"/></svg>';
        }

        container.appendChild(el);
      }
    }
  }

  // hero code-typing background — see assets/code-typer.js. That file is
  // only loaded on pages that need it (homepage + product pages) and
  // reads its content from a page-specific window.CODE_SEQUENCES set in
  // an inline <script> just before it.

  // booking form — client-side only for now.
  // Builds a mailto: link so the request reaches you even before a real
  // booking backend / calendar embed (e.g. Calendly) is wired in.
  var form = document.querySelector('.booking-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = new FormData(form);
      var name = data.get('name') || '';
      var company = data.get('company') || '';
      var email = data.get('email') || '';
      var phone = data.get('phone') || '';
      var message = data.get('message') || '';
      var service = form.getAttribute('data-service') || 'Nezaradené';

      var subject = encodeURIComponent('Dopyt: ' + service + ' — ' + (name || company));
      var body = encodeURIComponent(
        'Služba: ' + service + '\nMeno: ' + name + '\nFirma: ' + company +
        '\nEmail: ' + email + '\nTelefón: ' + phone + '\n\nSpráva:\n' + message
      );

      var success = form.querySelector('.form-success');
      if (success) success.classList.add('show');

      // TODO: replace with real endpoint / calendar booking integration.
      window.location.href = 'mailto:contact@techscope.sk?subject=' + subject + '&body=' + body;
      form.reset();
    });
  }
});
