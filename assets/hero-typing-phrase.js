// TECH-SCOPE — hero "<fixed lead-in> ___" cyclic typing effect, shared
// across every page's hero (data-compass.html, index.html, and the other
// three service pages). Types each phrase from .hero-typing-variable's
// data-phrases attribute (pipe-separated) character by character, holds
// it, backspaces it, then moves to the next (looping forever). The fixed
// lead-in text lives in .hero-typing-fixed's own markup and never changes
// here — only .hero-typing-variable's content. One script, per-page
// wording supplied entirely through the data attribute rather than a
// hardcoded array, so this file doesn't need forking per page the way
// the hero-viz canvas scenes do.
// Respects prefers-reduced-motion: renders the first phrase statically with
// no cursor and no timers.

document.addEventListener('DOMContentLoaded', function () {
  var variableEl = document.querySelector('.hero-typing-variable');
  if (!variableEl) return;

  var phrases = (variableEl.getAttribute('data-phrases') || '')
    .split('|')
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
  if (!phrases.length) phrases = ['váš úspech', 'váš rast', 'optimalizáciu procesov', 'lídrov v odbore'];

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    variableEl.textContent = phrases[0];
    return;
  }

  var idx = 0;

  function typeDelay() { return 45 + Math.random() * 40; }
  function eraseDelay() { return 25 + Math.random() * 20; }

  function typePhrase() {
    var text = phrases[idx];
    var charIdx = 0;

    function typeChar() {
      if (charIdx > text.length) {
        setTimeout(erasePhrase, 3000 + Math.random() * 1000);
        return;
      }
      variableEl.textContent = text.slice(0, charIdx);
      charIdx++;
      setTimeout(typeChar, typeDelay());
    }
    typeChar();
  }

  function erasePhrase() {
    function eraseChar() {
      var current = variableEl.textContent;
      if (!current.length) {
        idx = (idx + 1) % phrases.length;
        setTimeout(typePhrase, 250);
        return;
      }
      variableEl.textContent = current.slice(0, -1);
      setTimeout(eraseChar, eraseDelay());
    }
    eraseChar();
  }

  setTimeout(typePhrase, 700);
});
