// TECH-SCOPE — shared hero "code typing" background engine.
//
// Used on the homepage and every product page. Each page declares its own
// content (and optionally a tone) via a small inline script placed BEFORE
// this file:
//
//   <script>
//     window.CODE_SEQUENCES = [ { lines: ['...', '...'] }, ... ];
//   </script>
//   <script src="assets/code-typer.js"></script>
//
// The tone (default/money/gold — see .code-bg.tone-* in style.css) is set
// purely via a class on the .code-bg element in the page's HTML, so this
// engine only ever deals with content and timing, never color.
//
// Mechanism: two independent panels (.code-panel.left/.right inside
// .code-bg) each run their own typewriter loop — type a random sequence
// line by line, character by character, with an occasional simulated
// typo+backspace, pause, erase bottom-up, then pick a new random sequence
// (never repeating the one just shown) and repeat. Respects
// prefers-reduced-motion by rendering one static sequence per panel with
// no cursor and no movement.

document.addEventListener('DOMContentLoaded', function () {
  var codePanels = document.querySelectorAll('.code-panel');
  var codeSequences = window.CODE_SEQUENCES;
  if (!codePanels.length || !codeSequences || !codeSequences.length) return;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduceMotion) {
    for (var rp = 0; rp < codePanels.length; rp++) {
      var staticSeq = codeSequences[rp % codeSequences.length];
      for (var rl = 0; rl < staticSeq.lines.length; rl++) {
        var staticLine = document.createElement('div');
        staticLine.className = 'code-line';
        staticLine.textContent = staticSeq.lines[rl];
        codePanels[rp].appendChild(staticLine);
      }
    }
    return;
  }

  for (var cp = 0; cp < codePanels.length; cp++) {
    startCodeTypewriter(codePanels[cp], codeSequences, cp * 900);
  }

  function startCodeTypewriter(panel, sequences, startDelay) {
    var lastIndex = -1;
    var cursorEl = document.createElement('span');
    cursorEl.className = 'code-cursor';

    function charDelay() { return 25 + Math.random() * 45; }

    function pickSequence() {
      if (sequences.length === 1) return sequences[0];
      var idx;
      do { idx = Math.floor(Math.random() * sequences.length); } while (idx === lastIndex);
      lastIndex = idx;
      return sequences[idx];
    }

    function typeSequence() {
      var seq = pickSequence();
      var lineIdx = 0;

      function typeLine() {
        if (lineIdx >= seq.lines.length) {
          setTimeout(eraseSequence, 1300 + Math.random() * 700);
          return;
        }
        var lineEl = document.createElement('div');
        lineEl.className = 'code-line';
        var textNode = document.createTextNode('');
        lineEl.appendChild(textNode);
        panel.appendChild(lineEl);
        lineEl.appendChild(cursorEl);

        var fullText = seq.lines[lineIdx];
        var charIdx = 0;
        var typoAt = -1;
        if (fullText.length > 8 && Math.random() < 0.22) {
          typoAt = 3 + Math.floor(Math.random() * (fullText.length - 4));
        }

        function typeChar() {
          if (charIdx === typoAt) {
            var wrongChar = charIdx > 0 ? fullText.charAt(charIdx - 1) : 'x';
            textNode.textContent = fullText.slice(0, charIdx) + wrongChar;
            typoAt = -1;
            setTimeout(function () {
              textNode.textContent = fullText.slice(0, charIdx);
              setTimeout(typeChar, charDelay());
            }, 300 + Math.random() * 250);
            return;
          }
          if (charIdx >= fullText.length) {
            lineIdx++;
            setTimeout(typeLine, 220 + Math.random() * 200);
            return;
          }
          charIdx++;
          textNode.textContent = fullText.slice(0, charIdx);
          setTimeout(typeChar, charDelay());
        }
        typeChar();
      }
      typeLine();
    }

    function eraseSequence() {
      function eraseCurrentLine() {
        var lines = panel.querySelectorAll('.code-line');
        if (!lines.length) {
          setTimeout(typeSequence, 300);
          return;
        }
        var lineEl = lines[lines.length - 1];
        lineEl.appendChild(cursorEl);
        var textNode = lineEl.firstChild;

        function backspace() {
          var text = textNode.textContent;
          if (!text.length) {
            panel.appendChild(cursorEl);
            panel.removeChild(lineEl);
            setTimeout(eraseCurrentLine, 60);
            return;
          }
          textNode.textContent = text.slice(0, -1);
          setTimeout(backspace, 8 + Math.random() * 14);
        }
        backspace();
      }
      eraseCurrentLine();
    }

    setTimeout(typeSequence, startDelay);
  }
});
