// TECH-SCOPE — homepage hero "skillset spine": a vertical line with 4
// nodes (one per service), each cross-fading through 2-3 short skill/tech
// labels every ~2.6s, with a brief glow pulse on the node's dot at the
// exact moment its label changes. Purely ambient (see .skillset-area in
// style.css — hidden below 960px, aria-hidden). Each node starts its own
// cycle on a small staggered delay so all 4 don't swap in lockstep.
// prefers-reduced-motion: leave the first label (already in markup)
// static, no timers at all.

document.addEventListener('DOMContentLoaded', function () {
  var nodes = document.querySelectorAll('.skillset-node');
  if (!nodes.length) return;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  for (var i = 0; i < nodes.length; i++) {
    (function (node, index) {
      var label = node.querySelector('.skillset-label');
      var dot = node.querySelector('.skillset-dot');
      if (!label) return;
      var skills = (label.getAttribute('data-skills') || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean);
      if (skills.length < 2) return;

      var idx = 0;
      function pulseDot() {
        if (!dot) return;
        dot.classList.remove('is-pulsing');
        void dot.offsetWidth; // reflow so the animation restarts every cycle, not just once
        dot.classList.add('is-pulsing');
      }
      function swap() {
        label.classList.add('is-swapping');
        setTimeout(function () {
          idx = (idx + 1) % skills.length;
          label.textContent = skills[idx];
          label.classList.remove('is-swapping');
          pulseDot();
        }, 350);
      }

      setTimeout(function () {
        setInterval(swap, 2600);
      }, 400 + index * 350);
    })(nodes[i], i);
  }
});
