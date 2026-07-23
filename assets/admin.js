// TECH-SCOPE — admin.html: prihlásenie (Supabase Auth), správa call_slots,
// prehľad leads. Prístup je obmedzený cez RLS politiky pre rolu
// "authenticated" (viď supabase-schema.sql) — každý, kto sa vie prihlásiť,
// má plný prístup, keďže v projekte neexistuje žiadna verejná registrácia
// (účty sa vytvárajú len ručne v Supabase dashboarde).

(function () {
  var PRODUKT_LABELS = {
    web_mobile_app: 'Launch Sprint',
    softver_na_mieru: 'Garantovaný Systém'
  };
  var STATUS_LABELS = { novy: 'Nový', kontaktovany: 'Kontaktovaný', uzavrety: 'Uzavretý' };

  document.addEventListener('DOMContentLoaded', function () {
    var loginSection = document.getElementById('login-section');
    var adminContent = document.getElementById('admin-content');
    var navActions = document.getElementById('admin-nav-actions');

    if (!window.supabaseClient) {
      loginSection.innerHTML = '<div class="container" style="max-width:420px;"><p>Rezervačný systém sa nepodarilo načítať.</p></div>';
      return;
    }

    var loginForm = document.getElementById('login-form');
    var loginError = document.getElementById('login-error');
    var loginSubmit = document.getElementById('login-submit');

    function showLoggedOut() {
      loginSection.style.display = '';
      adminContent.style.display = 'none';
      navActions.innerHTML = '';
    }

    function showLoggedIn() {
      loginSection.style.display = 'none';
      adminContent.style.display = '';
      navActions.innerHTML = '<button type="button" class="btn btn-ghost" id="logout-btn">Odhlásiť sa</button>';
      document.getElementById('logout-btn').addEventListener('click', function () {
        window.supabaseClient.auth.signOut();
      });
      loadSlots();
      loadLeads();
    }

    // onAuthStateChange vyšle aktuálny stav (session alebo null) hneď po
    // registrácii, takže sama osebe stačí ako jediný zdroj pravdy o stave
    // prihlásenia — netreba popri nej volať aj samostatné getSession().
    window.supabaseClient.auth.onAuthStateChange(function (event, session) {
      if (session) { showLoggedIn(); } else { showLoggedOut(); }
    });

    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      loginError.classList.remove('show');
      loginSubmit.disabled = true;
      loginSubmit.textContent = 'Prihlasujem…';

      var email = document.getElementById('login-email').value.trim();
      var heslo = document.getElementById('login-heslo').value;

      window.supabaseClient.auth.signInWithPassword({ email: email, password: heslo }).then(function (res) {
        loginSubmit.disabled = false;
        loginSubmit.textContent = 'Prihlásiť sa';
        if (res.error) {
          loginError.textContent = 'Nesprávny e-mail alebo heslo.';
          loginError.classList.add('show');
        }
      });
    });

    // ---------------- SLOTY ----------------
    var slotsTbody = document.getElementById('slots-tbody');
    var addSlotForm = document.getElementById('add-slot-form');
    var slotError = document.getElementById('slot-error');

function loadSlots() {
  slotsTbody.innerHTML = '<tr><td colspan="4">Načítavam…</td></tr>';
  window.supabaseClient
    .from('call_slots')
    .select('id,datum,cas_od,cas_do,dostupny')
    .order('datum', { ascending: true })
    .order('cas_od', { ascending: true })
    .then(function (res) {
      if (res.error) {
        slotsTbody.innerHTML = '<tr><td colspan="4">Sloty sa nepodarilo načítať.</td></tr>';
        return;
      }
      renderSlots(res.data || []);
    });
}

    function renderSlots(slots) {
      if (!slots.length) {
        slotsTbody.innerHTML = '<tr><td colspan="4">Zatiaľ žiadne termíny.</td></tr>';
        return;
      }
      var html = '';
      for (var i = 0; i < slots.length; i++) {
        var s = slots[i];
        var badge = s.dostupny
          ? '<span class="status-badge dostupny">Dostupný</span>'
          : '<span class="status-badge rezervovany">Rezervovaný</span>';
        html += '<tr>' +
          '<td>' + formatDateShort(s.datum) + '</td>' +
          '<td>' + s.cas_od.slice(0, 5) + '–' + s.cas_do.slice(0, 5) + '</td>' +
          '<td>' + badge + '</td>' +
          '<td><button type="button" class="btn btn-ghost slot-delete-btn" data-id="' + s.id + '" data-reserved="' + (!s.dostupny) + '">Zmazať</button></td>' +
        '</tr>';
      }
      slotsTbody.innerHTML = html;

      var delButtons = slotsTbody.querySelectorAll('.slot-delete-btn');
      for (var b = 0; b < delButtons.length; b++) {
        delButtons[b].addEventListener('click', function () {
          var id = this.getAttribute('data-id');
          var reserved = this.getAttribute('data-reserved') === 'true';
          var msg = reserved
            ? 'Tento termín je už rezervovaný. Naozaj ho chcete zmazať?'
            : 'Naozaj zmazať tento termín?';
          if (!window.confirm(msg)) return;
          window.supabaseClient.from('call_slots').delete().eq('id', id).select().then(function (res) {
            if (res.error) {
              window.alert('Termín sa nepodarilo zmazať: ' + res.error.message);
              return;
            }
            if (!res.data || res.data.length === 0) {
              window.alert('Termín sa nezmazal — databáza nevrátila žiadny zmazaný riadok (chýbajúca RLS politika?).');
              return;
            }
            loadSlots();
          });
        });
      }
    }

    addSlotForm.addEventListener('submit', function (e) {
      e.preventDefault();
      slotError.classList.remove('show');

      var datum = document.getElementById('slot-datum').value;
      var od = document.getElementById('slot-od').value;
      var doo = document.getElementById('slot-do').value;

      if (!datum || !od || !doo) {
        slotError.textContent = 'Vyplňte prosím dátum aj oba časy.';
        slotError.classList.add('show');
        return;
      }
      if (doo <= od) {
        slotError.textContent = 'Čas "do" musí byť neskôr ako čas "od".';
        slotError.classList.add('show');
        return;
      }

      window.supabaseClient.from('call_slots').insert({ datum: datum, cas_od: od, cas_do: doo, dostupny: true }).then(function (res) {
        if (res.error) {
          slotError.textContent = 'Slot sa nepodarilo pridať.';
          slotError.classList.add('show');
          return;
        }
        addSlotForm.reset();
        loadSlots();
      });
    });

    // ---------------- LEADY ----------------
    var leadsTbody = document.getElementById('leads-tbody');
    var leadSearchInput = document.getElementById('lead-search');
    var currentLeads = [];

    function loadLeads() {
      leadsTbody.innerHTML = '<tr><td colspan="14">Načítavam…</td></tr>';
      window.supabaseClient
        .from('leads')
        .select('*, call_slots!leads_slot_id_fkey(datum,cas_od,cas_do)')
        .order('created_at', { ascending: false })
        .then(function (res) {
          if (res.error) {
            leadsTbody.innerHTML = '<tr><td colspan="14">Leady sa nepodarilo načítať.</td></tr>';
            return;
          }
          currentLeads = res.data || [];
          applyLeadSearch();
        });
    }

    function applyLeadSearch() {
      var term = (leadSearchInput.value || '').trim().toLowerCase();
      if (!term) {
        renderLeads(currentLeads);
        return;
      }
      var filtered = currentLeads.filter(function (l) {
        var haystack = [
          l.meno_priezvisko, l.nazov_firmy, l.email, l.telefon, l.popis_projektu
        ].join(' ').toLowerCase();
        return haystack.indexOf(term) !== -1;
      });
      renderLeads(filtered);
    }

    if (leadSearchInput) {
      leadSearchInput.addEventListener('input', applyLeadSearch);
    }

    function renderLeads(leads) {
      if (!leads.length) {
        leadsTbody.innerHTML = '<tr><td colspan="14">' +
          (currentLeads.length ? 'Žiadny lead nezodpovedá hľadaniu.' : 'Zatiaľ žiadne leady.') +
          '</td></tr>';
        return;
      }
      var html = '';
      for (var i = 0; i < leads.length; i++) {
        var l = leads[i];
        var slotText = l.call_slots
          ? (formatDateShort(l.call_slots.datum) + ' ' + l.call_slots.cas_od.slice(0, 5))
          : '—';
        html += '<tr>' +
          '<td>' + formatDateTime(l.created_at) + '</td>' +
          '<td>' + escapeHtml(l.meno_priezvisko) + '</td>' +
          '<td>' + escapeHtml(l.nazov_firmy) + '</td>' +
          '<td>' + escapeHtml(l.pozicia) + '</td>' +
          '<td>' + escapeHtml(l.email) + '</td>' +
          '<td>' + escapeHtml(l.telefon) + '</td>' +
          '<td>' + escapeHtml(PRODUKT_LABELS[l.produkt] || l.produkt) + '</td>' +
          '<td>' + escapeHtml(l.rozpocet) + '</td>' +
          '<td>' + escapeHtml(l.urgencia) + '</td>' +
          '<td class="wrap" title="' + escapeHtml(l.popis_projektu) + '">' + escapeHtml(l.popis_projektu) + '</td>' +
          '<td>' + escapeHtml(l.zdroj || '—') + '</td>' +
          '<td>' + slotText + '</td>' +
          '<td>' + buildStatusSelect(l.id, l.status) + '</td>' +
          '<td><button type="button" class="btn btn-ghost lead-delete-btn" data-id="' + l.id + '">Zmazať</button></td>' +
        '</tr>';
      }
      leadsTbody.innerHTML = html;

      var selects = leadsTbody.querySelectorAll('.status-select');
      for (var s = 0; s < selects.length; s++) {
        selects[s].addEventListener('change', function () {
          var select = this;
          var leadId = select.getAttribute('data-lead-id');
          var previous = select.getAttribute('data-current');
          var next = select.value;
          select.disabled = true;
          window.supabaseClient.from('leads').update({ status: next }).eq('id', leadId).then(function (res) {
            select.disabled = false;
            if (res.error) {
              window.alert('Zmenu statusu sa nepodarilo uložiť.');
              select.value = previous;
              return;
            }
            select.setAttribute('data-current', next);
          });
        });
      }

      var deleteButtons = leadsTbody.querySelectorAll('.lead-delete-btn');
      for (var d = 0; d < deleteButtons.length; d++) {
        deleteButtons[d].addEventListener('click', function () {
          var btn = this;
          var leadId = btn.getAttribute('data-id');
          confirmPasswordAndDeleteLead(leadId, btn);
        });
      }
    }

    // Zmazanie leadu je nevratné a ide o osobné údaje záujemcu, preto pred
    // ním vyžadujeme opätovné zadanie hesla prihláseného admina (re-auth cez
    // signInWithPassword) — nielen obyčajné confirm() ako pri slotoch.
    function confirmPasswordAndDeleteLead(leadId, btn) {
      var heslo = window.prompt('Pre zmazanie leadu znova zadajte svoje heslo:');
      if (heslo === null) return;
      if (!heslo) {
        window.alert('Heslo je povinné, lead nebol zmazaný.');
        return;
      }

      btn.disabled = true;

      window.supabaseClient.auth.getSession().then(function (sessionRes) {
        var session = sessionRes.data && sessionRes.data.session;
        var email = session && session.user && session.user.email;
        if (!email) {
          btn.disabled = false;
          window.alert('Nepodarilo sa overiť prihláseného používateľa.');
          return;
        }

        window.supabaseClient.auth.signInWithPassword({ email: email, password: heslo }).then(function (authRes) {
          if (authRes.error) {
            btn.disabled = false;
            window.alert('Nesprávne heslo. Lead nebol zmazaný.');
            return;
          }

          if (!window.confirm('Naozaj natrvalo zmazať tohto leadu? Táto akcia sa nedá vrátiť späť.')) {
            btn.disabled = false;
            return;
          }

          // .select() na delete() nie je len kozmetika — bez neho Supabase
          // vráti "úspech" aj keď RLS ticho odfiltruje všetky riadky a v
          // skutočnosti sa nezmaže nič (presne bug, ktorý sme riešili pri
          // leads-tbody predtým). S .select() vidíme v res.data, či bol
          // reálne zmazaný nejaký riadok.
          window.supabaseClient.from('leads').delete().eq('id', leadId).select().then(function (res) {
            if (res.error) {
              btn.disabled = false;
              window.alert('Lead sa nepodarilo zmazať: ' + res.error.message);
              return;
            }
            if (!res.data || res.data.length === 0) {
              btn.disabled = false;
              window.alert('Lead sa nezmazal — databáza nevrátila žiadny zmazaný riadok. Skontroluj, či je v Supabase spustená DELETE politika "Admin moze mazat leady" pre rolu authenticated na tabuľke leads.');
              return;
            }
            loadLeads();
          });
        });
      });
    }

    function buildStatusSelect(id, current) {
      var options = ['novy', 'kontaktovany', 'uzavrety'];
      var html = '<select class="status-select" data-lead-id="' + id + '" data-current="' + current + '">';
      for (var i = 0; i < options.length; i++) {
        html += '<option value="' + options[i] + '"' + (options[i] === current ? ' selected' : '') + '>' + STATUS_LABELS[options[i]] + '</option>';
      }
      html += '</select>';
      return html;
    }

    function formatDateShort(datum) {
      var d = new Date(datum + 'T00:00:00');
      return d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric' });
    }

    function formatDateTime(iso) {
      var d = new Date(iso);
      return d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
    }

    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      var div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  });
})();
