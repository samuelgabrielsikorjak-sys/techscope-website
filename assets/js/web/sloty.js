// Karta „Najbližšie voľné termíny“ v hero – 3 najbližšie sloty z call_slots.
// Žiadne innerHTML s dátami z databázy; pri chybe vždy záložný text.
(function () {
  var list = document.querySelector('.slots__list');
  if (!list) return;

  function showFallback() {
    var li = document.createElement('li');
    li.appendChild(document.createTextNode('Napíšte nám na '));
    var a = document.createElement('a');
    a.href = 'mailto:contact@techscope.sk';
    a.textContent = 'contact@techscope.sk';
    li.appendChild(a);
    list.replaceChildren(li);
  }

  function formatSlot(slot) {
    var d = new Date(slot.datum + 'T00:00:00');
    var text = d.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' });
    return text.charAt(0).toUpperCase() + text.slice(1) + ', ' + slot.cas_od.slice(0, 5);
  }

  function render(slots) {
    if (!slots.length) { showFallback(); return; }
    list.replaceChildren();
    slots.forEach(function (slot) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = 'rezervacia.html';
      a.className = 'slots__slot';
      a.textContent = formatSlot(slot);
      li.appendChild(a);
      list.appendChild(li);
    });
  }

  if (!window.supabaseClient) { showFallback(); return; }

  var today = new Date().toISOString().slice(0, 10);
  window.supabaseClient
    .from('call_slots')
    .select('id,datum,cas_od,cas_do')
    .eq('dostupny', true)
    .gte('datum', today)
    .order('datum', { ascending: true })
    .order('cas_od', { ascending: true })
    .limit(3)
    .then(function (res) {
      if (res.error) { showFallback(); return; }
      render(res.data || []);
    })
    .catch(showFallback);
})();
