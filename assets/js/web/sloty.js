// Skutočné voľné termíny zo Supabase (tabuľka call_slots).
// - [data-slots="N"]  zoznam N najbližších termínov (odkazy na rezervacia.html)
// - [data-next-slot]  štítok v hero s najbližším termínom
// Žiadne innerHTML s dátami z databázy; pri chybe ostane záložný text.
(function () {
  'use strict';
  var lists = document.querySelectorAll('[data-slots]');
  var pills = document.querySelectorAll('[data-next-slot]');
  if (!lists.length && !pills.length) return;

  function label(slot, long) {
    var d = new Date(slot.datum + 'T00:00:00');
    var opts = long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'long', day: 'numeric', month: 'numeric' };
    var text = d.toLocaleDateString('sk-SK', opts);
    return text.charAt(0).toUpperCase() + text.slice(1) + ', ' + slot.cas_od.slice(0, 5);
  }

  function fallback(list) {
    var li = document.createElement('li');
    li.appendChild(document.createTextNode('Napíšte nám na '));
    var a = document.createElement('a');
    a.href = 'mailto:contact@techscope.sk';
    a.textContent = 'contact@techscope.sk';
    li.appendChild(a);
    list.replaceChildren(li);
  }

  function render(slots) {
    lists.forEach(function (list) {
      var n = parseInt(list.getAttribute('data-slots'), 10) || 3;
      var items = slots.slice(0, n);
      if (!items.length) { fallback(list); return; }
      list.replaceChildren();
      items.forEach(function (slot) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = 'rezervacia.html';
        a.className = 'slots__slot';
        a.textContent = label(slot, true);
        li.appendChild(a);
        list.appendChild(li);
      });
    });
    if (slots.length) {
      pills.forEach(function (pill) {
        var arrow = document.createElement('span');
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '›';
        pill.replaceChildren(document.createTextNode('Najbližší voľný termín stretnutia: ' + label(slots[0], false) + ' '), arrow);
      });
    }
  }

  function fail() { lists.forEach(fallback); }

  if (!window.supabaseClient) { fail(); return; }
  // Lokálny dátum (nie UTC) a iba termíny, ktoré začínajú najskôr o MIN_HODIN hodín.
  // Obsadené termíny filtruje už databáza (dostupny = true).
  var MIN_HODIN = 2;
  var now = new Date();
  var today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  function upcoming(slots) {
    var limit = now.getTime() + MIN_HODIN * 3600 * 1000;
    return slots.filter(function (s) {
      return new Date(s.datum + 'T' + s.cas_od.slice(0, 5) + ':00').getTime() >= limit;
    });
  }
  window.supabaseClient
    .from('call_slots')
    .select('id,datum,cas_od,cas_do')
    .eq('dostupny', true)
    .gte('datum', today)
    .order('datum', { ascending: true })
    .order('cas_od', { ascending: true })
    .limit(30)
    .then(function (res) {
      if (res.error) { fail(); return; }
      render(upcoming(res.data || []));
    })
    .catch(fail);
})();
