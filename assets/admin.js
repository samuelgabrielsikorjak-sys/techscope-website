// TECH-SCOPE — admin.html: prihlásenie (Supabase Auth), správa call_slots,
// prehľad leads. Prístup je obmedzený cez RLS politiky pre rolu
// "authenticated" (viď supabase-schema.sql) — každý, kto sa vie prihlásiť,
// má plný prístup, keďže v projekte neexistuje žiadna verejná registrácia
// (účty sa vytvárajú len ručne v Supabase dashboarde).

(function () {
  // softver_na_mieru a web_mobile_app už nie sú aktívne produkty (zrušené),
  // ale mapovanie ostáva kvôli historickým leadom uloženým v databáze pred
  // prechodom na jediný produkt Data Compass.
  var PRODUKT_LABELS = {
    ai_faktury: 'AI spracovanie faktúr',
    ai_asistent: 'AI zákaznícky asistent',
    dochadzka_system: 'Dochádzkový systém',
    softver_na_mieru: 'Softvér na mieru (zrušené)',
    web_mobile_app: 'Webová a mobilná aplikácia (zrušené)',
    data_compass: 'Data Compass'
  };
  var STATUS_LABELS = { novy: 'Nový', kontaktovany: 'Kontaktovaný', uzavrety: 'Uzavretý' };

  // Služby ponúkané na produktových stránkach (projects.sluzba) — odlišné
  // od PRODUKT_LABELS vyššie, ktorá patrí len historickému leads.produkt.
  var SLUZBA_LABELS = {
    data_compass: 'Data Compass',
    web_mobile: 'Web & Mobilné aplikácie',
    softver_na_mieru: 'Softvér na mieru',
    ai_riesenia: 'AI riešenia'
  };
  var PROJECT_STATUS_LABELS = { aktivny: 'Aktívny', pozastaveny: 'Pozastavený', dokonceny: 'Dokončený' };
  var FAZY = [
    { key: 'vstupna_analyza', label: 'Vstupná analýza' },
    { key: 'definicia_metrik', label: 'Definícia metrík a cieľov' },
    { key: 'navrh_architektury', label: 'Návrh architektúry' },
    { key: 'vyvoj', label: 'Vývoj' },
    { key: 'testovanie_review', label: 'Testovanie a review' },
    { key: 'odovzdanie_zaskolenie', label: 'Odovzdanie a zaškolenie' }
  ];

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
      loadExitLeads();
      loadProjects();
      loadClientsForDropdown();
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
    var exitLeadsTbody = document.getElementById('exit-leads-tbody');

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

    function loadExitLeads() {
      if (!exitLeadsTbody) return;
      exitLeadsTbody.innerHTML = '<tr><td colspan="5">Načítavam…</td></tr>';
      window.supabaseClient
        .from('exit_leads')
        .select('*')
        .order('created_at', { ascending: false })
        .then(function (res) {
          if (res.error) {
            exitLeadsTbody.innerHTML = '<tr><td colspan="5">Exit leady sa nepodarilo načítať.</td></tr>';
            return;
          }
          renderExitLeads(res.data || []);
        });
    }

    function renderExitLeads(leads) {
      if (!leads.length) {
        exitLeadsTbody.innerHTML = '<tr><td colspan="5">Zatiaľ žiadne exit leady.</td></tr>';
        return;
      }
      var html = '';
      for (var i = 0; i < leads.length; i++) {
        var l = leads[i];
        html += '<tr>' +
          '<td>' + formatDateTime(l.created_at) + '</td>' +
          '<td>' + escapeHtml(l.meno || '—') + '</td>' +
          '<td>' + escapeHtml(l.email || l.telefon || '—') + '</td>' +
          '<td>' + escapeHtml(l.zdrojova_stranka) + '</td>' +
          '<td><button type="button" class="btn btn-ghost exit-lead-delete-btn" data-id="' + l.id + '">Zmazať</button></td>' +
        '</tr>';
      }
      exitLeadsTbody.innerHTML = html;

      var exitDeleteButtons = exitLeadsTbody.querySelectorAll('.exit-lead-delete-btn');
      for (var d = 0; d < exitDeleteButtons.length; d++) {
        exitDeleteButtons[d].addEventListener('click', function () {
          var btn = this;
          var leadId = btn.getAttribute('data-id');
          confirmPasswordAndDeleteExitLead(leadId, btn);
        });
      }
    }

    // Rovnaká ochrana heslom ako pri mazaní leadov — exit_leads tiež obsahuje
    // osobné kontaktné údaje (email/telefón/meno), takže mazanie musí byť
    // rovnako nevratné a chránené re-authom, nielen obyčajným confirm().
    function confirmPasswordAndDeleteExitLead(leadId, btn) {
      var heslo = window.prompt('Pre zmazanie exit leadu znova zadajte svoje heslo:');
      if (heslo === null) return;
      if (!heslo) {
        window.alert('Heslo je povinné, exit lead nebol zmazaný.');
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
            window.alert('Nesprávne heslo. Exit lead nebol zmazaný.');
            return;
          }

          if (!window.confirm('Naozaj natrvalo zmazať tento exit lead? Táto akcia sa nedá vrátiť späť.')) {
            btn.disabled = false;
            return;
          }

          window.supabaseClient.from('exit_leads').delete().eq('id', leadId).select().then(function (res) {
            if (res.error) {
              btn.disabled = false;
              window.alert('Exit lead sa nepodarilo zmazať: ' + res.error.message);
              return;
            }
            if (!res.data || res.data.length === 0) {
              btn.disabled = false;
              window.alert('Exit lead sa nezmazal — databáza nevrátila žiadny zmazaný riadok. Skontroluj, či je v Supabase spustená DELETE politika pre rolu authenticated na tabuľke exit_leads.');
              return;
            }
            loadExitLeads();
          });
        });
      });
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

    // ---------------- ZÁKAZKY (projects) ----------------
    var projectsTbody = document.getElementById('projects-tbody');
    var projectDetailEl = document.getElementById('project-detail');
    var newProjectToggleBtn = document.getElementById('new-project-toggle-btn');
    var newProjectCard = document.getElementById('new-project-card');
    var newProjectForm = document.getElementById('new-project-form');
    var newProjectError = document.getElementById('new-project-error');
    var npKlientSelect = document.getElementById('np-klient');
    var npNewClientFields = document.getElementById('np-new-client-fields');
    var currentProjects = [];
    var openProjectId = null;

    if (newProjectToggleBtn) {
      newProjectToggleBtn.addEventListener('click', function () {
        newProjectCard.style.display = (newProjectCard.style.display === 'none') ? '' : 'none';
      });
    }

    if (npKlientSelect) {
      npKlientSelect.addEventListener('change', function () {
        npNewClientFields.style.display = (npKlientSelect.value === '__new__') ? '' : 'none';
      });
    }

    function loadProjects() {
      if (!projectsTbody) return;
      projectsTbody.innerHTML = '<tr><td colspan="5">Načítavam…</td></tr>';
      window.supabaseClient
        .from('projects')
        .select('id,nazov_projektu,sluzba,status,faza,client_id,clients(meno_priezvisko,nazov_firmy)')
        .order('created_at', { ascending: false })
        .then(function (res) {
          if (res.error) {
            projectsTbody.innerHTML = '<tr><td colspan="5">Zákazky sa nepodarilo načítať.</td></tr>';
            return;
          }
          currentProjects = res.data || [];
          renderProjects();
        });
    }

    function fazaLabel(key) {
      for (var i = 0; i < FAZY.length; i++) { if (FAZY[i].key === key) return FAZY[i].label; }
      return key;
    }

    function fazaOptionsHtml(selected) {
      var html = '';
      for (var i = 0; i < FAZY.length; i++) {
        html += '<option value="' + FAZY[i].key + '"' + (FAZY[i].key === selected ? ' selected' : '') + '>' + FAZY[i].label + '</option>';
      }
      return html;
    }

    function projectStatusOptionsHtml(selected) {
      var keys = ['aktivny', 'pozastaveny', 'dokonceny'];
      var html = '';
      for (var i = 0; i < keys.length; i++) {
        html += '<option value="' + keys[i] + '"' + (keys[i] === selected ? ' selected' : '') + '>' + PROJECT_STATUS_LABELS[keys[i]] + '</option>';
      }
      return html;
    }

    function clientDisplayName(clients) {
      if (!clients) return '—';
      return clients.meno_priezvisko + (clients.nazov_firmy ? ' — ' + clients.nazov_firmy : '');
    }

    function renderProjects() {
      if (!projectsTbody) return;
      if (!currentProjects.length) {
        projectsTbody.innerHTML = '<tr><td colspan="5">Zatiaľ žiadne zákazky.</td></tr>';
        return;
      }
      var html = '';
      for (var i = 0; i < currentProjects.length; i++) {
        var p = currentProjects[i];
        html += '<tr class="project-row' + (p.id === openProjectId ? ' is-open' : '') + '" data-id="' + p.id + '">' +
          '<td>' + escapeHtml(p.nazov_projektu) + '</td>' +
          '<td>' + escapeHtml(clientDisplayName(p.clients)) + '</td>' +
          '<td>' + escapeHtml(SLUZBA_LABELS[p.sluzba] || p.sluzba) + '</td>' +
          '<td>' + escapeHtml(fazaLabel(p.faza)) + '</td>' +
          '<td><span class="status-badge ' + p.status + '">' + (PROJECT_STATUS_LABELS[p.status] || p.status) + '</span></td>' +
        '</tr>';
      }
      projectsTbody.innerHTML = html;

      var rows = projectsTbody.querySelectorAll('.project-row');
      for (var r = 0; r < rows.length; r++) {
        rows[r].addEventListener('click', function () {
          var id = this.getAttribute('data-id');
          openProjectId = (openProjectId === id) ? null : id;
          renderProjects();
          if (openProjectId) {
            var project = currentProjects.filter(function (pp) { return pp.id === openProjectId; })[0];
            renderProjectDetail(project);
            projectDetailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } else {
            projectDetailEl.innerHTML = '';
          }
        });
      }
    }

    function renderProjectDetail(project) {
      projectDetailEl.innerHTML =
        '<div class="portal-card">' +
          '<div class="portal-header">' +
            '<div><h3 style="margin:0 0 4px;">' + escapeHtml(project.nazov_projektu) + '</h3><div class="portal-service">' + escapeHtml(clientDisplayName(project.clients)) + '</div></div>' +
            '<button type="button" class="btn btn-danger" id="pd-delete-project-btn">Zmazať projekt</button>' +
          '</div>' +
          '<div class="admin-toolbar" style="margin-top:20px;">' +
            '<div class="form-row"><label for="pd-faza">Fáza</label><select id="pd-faza">' + fazaOptionsHtml(project.faza) + '</select></div>' +
            '<div class="form-row"><label for="pd-status">Status</label><select id="pd-status">' + projectStatusOptionsHtml(project.status) + '</select></div>' +
          '</div>' +
        '</div>' +

        '<div class="portal-card">' +
          '<h4 style="margin:0 0 14px;">Aktualizácie</h4>' +
          '<div class="form-row"><textarea id="pd-update-text" class="admin-textarea" placeholder="Nová aktualizácia pre klienta…"></textarea></div>' +
          '<button type="button" class="btn btn-primary" id="pd-add-update-btn">Pridať aktualizáciu</button>' +
          '<div id="pd-updates-list" style="margin-top:18px;"><p style="color:var(--ink-faint);">Načítavam…</p></div>' +
        '</div>' +

        '<div class="portal-card">' +
          '<h4 style="margin:0 0 14px;">Dokumenty</h4>' +
          '<div class="admin-toolbar" style="margin-bottom:6px;">' +
            '<div class="form-row"><label for="pd-doc-name">Názov dokumentu</label><input type="text" id="pd-doc-name"></div>' +
            '<div class="form-row"><label for="pd-doc-file">Súbor</label><input type="file" id="pd-doc-file"></div>' +
            '<button type="button" class="btn btn-primary" id="pd-upload-doc-btn">Nahrať</button>' +
          '</div>' +
          '<div class="form-banner-error" id="pd-doc-error"></div>' +
          '<div id="pd-documents-list" style="margin-top:10px;"><p style="color:var(--ink-faint);">Načítavam…</p></div>' +
        '</div>' +

        '<div class="portal-card">' +
          '<h4 style="margin:0 0 14px;">Doplňujúce otázky pre klienta</h4>' +
          '<div class="form-row"><textarea id="pd-question-text" class="admin-textarea" style="min-height:56px;" placeholder="Otázka pre klienta…"></textarea></div>' +
          '<button type="button" class="btn btn-primary" id="pd-add-question-btn">Poslať otázku klientovi</button>' +
          '<div id="pd-questions-list" style="margin-top:18px;"><p style="color:var(--ink-faint);">Načítavam…</p></div>' +
        '</div>';

      wireProjectDetail(project);
      loadProjectUpdates(project.id);
      loadProjectDocuments(project.id);
      loadProjectQuestions(project.id);
    }

    function wireProjectDetail(project) {
      var fazaSelect = document.getElementById('pd-faza');
      fazaSelect.addEventListener('change', function () {
        var val = fazaSelect.value;
        var previous = project.faza;
        fazaSelect.disabled = true;
        window.supabaseClient.from('projects').update({ faza: val, updated_at: new Date().toISOString() }).eq('id', project.id).then(function (res) {
          fazaSelect.disabled = false;
          if (res.error) {
            window.alert('Fázu sa nepodarilo uložiť: ' + res.error.message);
            fazaSelect.value = previous;
            return;
          }
          project.faza = val;
          loadProjects();
        });
      });

      var statusSelect = document.getElementById('pd-status');
      statusSelect.addEventListener('change', function () {
        var val = statusSelect.value;
        var previous = project.status;
        statusSelect.disabled = true;
        window.supabaseClient.from('projects').update({ status: val, updated_at: new Date().toISOString() }).eq('id', project.id).then(function (res) {
          statusSelect.disabled = false;
          if (res.error) {
            window.alert('Status sa nepodarilo uložiť: ' + res.error.message);
            statusSelect.value = previous;
            return;
          }
          project.status = val;
          loadProjects();
        });
      });

      document.getElementById('pd-add-update-btn').addEventListener('click', function () {
        var btn = this;
        var textarea = document.getElementById('pd-update-text');
        var text = textarea.value.trim();
        if (!text) { window.alert('Napíšte prosím text aktualizácie.'); return; }
        btn.disabled = true;
        window.supabaseClient.from('project_updates').insert({ project_id: project.id, text: text }).then(function (res) {
          btn.disabled = false;
          if (res.error) { window.alert('Aktualizáciu sa nepodarilo pridať: ' + res.error.message); return; }
          textarea.value = '';
          loadProjectUpdates(project.id);
        });
      });

      document.getElementById('pd-upload-doc-btn').addEventListener('click', function () {
        var btn = this;
        var nameInput = document.getElementById('pd-doc-name');
        var fileInput = document.getElementById('pd-doc-file');
        var errorEl = document.getElementById('pd-doc-error');
        errorEl.classList.remove('show');

        var file = fileInput.files && fileInput.files[0];
        var nazov = nameInput.value.trim();
        if (!file) { errorEl.textContent = 'Vyberte prosím súbor.'; errorEl.classList.add('show'); return; }
        if (!nazov) { errorEl.textContent = 'Zadajte prosím názov dokumentu.'; errorEl.classList.add('show'); return; }

        btn.disabled = true;
        btn.textContent = 'Nahrávam…';

        var safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        var path = project.id + '/' + Date.now() + '_' + safeName;

        window.supabaseClient.storage.from('project-documents').upload(path, file).then(function (uploadRes) {
          if (uploadRes.error) {
            btn.disabled = false;
            btn.textContent = 'Nahrať';
            errorEl.textContent = 'Súbor sa nepodarilo nahrať: ' + uploadRes.error.message;
            errorEl.classList.add('show');
            return;
          }
          window.supabaseClient.from('project_documents').insert({ project_id: project.id, nazov: nazov, storage_path: path }).then(function (res) {
            btn.disabled = false;
            btn.textContent = 'Nahrať';
            if (res.error) {
              errorEl.textContent = 'Súbor sa nahral, ale záznam sa nepodarilo uložiť: ' + res.error.message;
              errorEl.classList.add('show');
              return;
            }
            nameInput.value = '';
            fileInput.value = '';
            loadProjectDocuments(project.id);
          });
        });
      });

      document.getElementById('pd-add-question-btn').addEventListener('click', function () {
        var btn = this;
        var textarea = document.getElementById('pd-question-text');
        var text = textarea.value.trim();
        if (!text) { window.alert('Napíšte prosím text otázky.'); return; }
        btn.disabled = true;
        window.supabaseClient.from('project_questions').insert({ project_id: project.id, otazka: text, zodpovedane: false }).then(function (res) {
          btn.disabled = false;
          if (res.error) { window.alert('Otázku sa nepodarilo pridať: ' + res.error.message); return; }
          textarea.value = '';
          loadProjectQuestions(project.id);
        });
      });

      document.getElementById('pd-delete-project-btn').addEventListener('click', function () {
        var deleteBtn = this;
        var confirmed = window.confirm(
          "Naozaj chcete natrvalo zmazať projekt '" + project.nazov_projektu + "'? " +
          'Zmažú sa aj všetky jeho aktualizácie, dokumenty a otázky. Táto akcia sa nedá vrátiť.'
        );
        if (!confirmed) return;

        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Mažem…';

        function deleteProjectRow() {
          window.supabaseClient.from('projects').delete().eq('id', project.id).then(function (res) {
            if (res.error) {
              deleteBtn.disabled = false;
              deleteBtn.textContent = 'Zmazať projekt';
              window.alert('Projekt sa nepodarilo zmazať: ' + res.error.message);
              return;
            }
            currentProjects = currentProjects.filter(function (p) { return p.id !== project.id; });
            openProjectId = null;
            projectDetailEl.innerHTML = '';
            renderProjects();
          });
        }

        // CASCADE v DB zmaže len riadky project_documents, nie reálne súbory
        // v Storage bucket-e — tie treba zmazať explicitne, inak zostanú
        // "osirotené" (zaberajú miesto, nie sú z ničoho dostupné).
        window.supabaseClient
          .from('project_documents')
          .select('storage_path')
          .eq('project_id', project.id)
          .then(function (docsRes) {
            if (docsRes.error) {
              deleteBtn.disabled = false;
              deleteBtn.textContent = 'Zmazať projekt';
              window.alert('Nepodarilo sa načítať dokumenty projektu, mazanie prerušené: ' + docsRes.error.message);
              return;
            }
            var paths = (docsRes.data || []).map(function (d) { return d.storage_path; });

            if (!paths.length) {
              deleteProjectRow();
              return;
            }

            window.supabaseClient.storage.from('project-documents').remove(paths).then(function (removeRes) {
              if (removeRes.error) {
                deleteBtn.disabled = false;
                deleteBtn.textContent = 'Zmazať projekt';
                window.alert('Súbory v Storage sa nepodarilo zmazať, projekt NEBOL zmazaný: ' + removeRes.error.message);
                return;
              }
              deleteProjectRow();
            });
          });
      });
    }

    function loadProjectUpdates(projectId) {
      var el = document.getElementById('pd-updates-list');
      if (!el) return;
      window.supabaseClient
        .from('project_updates')
        .select('id,text,created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .then(function (res) {
          if (res.error) { el.innerHTML = '<p style="color:var(--ink-faint);">Aktualizácie sa nepodarilo načítať.</p>'; return; }
          var rows = res.data || [];
          if (!rows.length) { el.innerHTML = '<p style="color:var(--ink-faint);">Zatiaľ žiadne aktualizácie.</p>'; return; }
          var html = '';
          for (var i = 0; i < rows.length; i++) {
            html += '<div class="update-row"><div class="update-row-date">' + formatDateTime(rows[i].created_at) + '</div><p>' + escapeHtml(rows[i].text) + '</p></div>';
          }
          el.innerHTML = html;
        });
    }

    function loadProjectDocuments(projectId) {
      var el = document.getElementById('pd-documents-list');
      if (!el) return;
      window.supabaseClient
        .from('project_documents')
        .select('id,nazov,storage_path,created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .then(function (res) {
          if (res.error) { el.innerHTML = '<p style="color:var(--ink-faint);">Dokumenty sa nepodarilo načítať.</p>'; return; }
          var rows = res.data || [];
          if (!rows.length) { el.innerHTML = '<p style="color:var(--ink-faint);">Zatiaľ žiadne dokumenty.</p>'; return; }
          var html = '';
          for (var i = 0; i < rows.length; i++) {
            html += '<div class="doc-row"><div><div class="doc-row-name">' + escapeHtml(rows[i].nazov) + '</div><div class="doc-row-date">' + formatDateTime(rows[i].created_at) + '</div></div>' +
              '<button type="button" class="btn btn-ghost doc-admin-delete-btn" data-id="' + rows[i].id + '" data-path="' + escapeHtml(rows[i].storage_path) + '">Zmazať</button></div>';
          }
          el.innerHTML = html;

          var delBtns = el.querySelectorAll('.doc-admin-delete-btn');
          for (var b = 0; b < delBtns.length; b++) {
            delBtns[b].addEventListener('click', function () {
              var btn = this;
              if (!window.confirm('Naozaj zmazať tento dokument?')) return;
              var docId = btn.getAttribute('data-id');
              var path = btn.getAttribute('data-path');
              btn.disabled = true;
              window.supabaseClient.storage.from('project-documents').remove([path]).then(function () {
                window.supabaseClient.from('project_documents').delete().eq('id', docId).then(function (res) {
                  if (res.error) { btn.disabled = false; window.alert('Dokument sa nepodarilo zmazať: ' + res.error.message); return; }
                  loadProjectDocuments(projectId);
                });
              });
            });
          }
        });
    }

    function loadProjectQuestions(projectId) {
      var el = document.getElementById('pd-questions-list');
      if (!el) return;
      window.supabaseClient
        .from('project_questions')
        .select('id,otazka,odpoved,zodpovedane,created_at,zodpovedane_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .then(function (res) {
          if (res.error) { el.innerHTML = '<p style="color:var(--ink-faint);">Otázky sa nepodarilo načítať.</p>'; return; }
          var rows = res.data || [];
          if (!rows.length) { el.innerHTML = '<p style="color:var(--ink-faint);">Zatiaľ žiadne otázky.</p>'; return; }
          var html = '';
          for (var i = 0; i < rows.length; i++) {
            var q = rows[i];
            if (q.zodpovedane) {
              html += '<div class="question-card is-answered"><p class="question-text">' + escapeHtml(q.otazka) + '</p>' +
                '<p class="answer-text">' + escapeHtml(q.odpoved || '') + '</p>' +
                '<div class="answered-at">Zodpovedané ' + formatDateTime(q.zodpovedane_at || q.created_at) + '</div></div>';
            } else {
              html += '<div class="question-card"><p class="question-text">' + escapeHtml(q.otazka) + '</p>' +
                '<span class="status-badge pozastaveny" style="margin-top:6px; display:inline-block;">Čaká na odpoveď</span></div>';
            }
          }
          el.innerHTML = html;
        });
    }

    function loadClientsForDropdown() {
      if (!npKlientSelect) return;
      window.supabaseClient
        .from('clients')
        .select('id,meno_priezvisko,nazov_firmy')
        .order('meno_priezvisko', { ascending: true })
        .then(function (res) {
          if (res.error) return;
          var clients = res.data || [];
          var html = '<option value="">— Vyberte klienta —</option>';
          for (var i = 0; i < clients.length; i++) {
            html += '<option value="' + clients[i].id + '">' + escapeHtml(clientDisplayName(clients[i])) + '</option>';
          }
          html += '<option value="__new__">+ Nový klient</option>';
          npKlientSelect.innerHTML = html;
        });
    }

    if (newProjectForm) {
      newProjectForm.addEventListener('submit', function (e) {
        e.preventDefault();
        newProjectError.classList.remove('show');

        var nazov = document.getElementById('np-nazov').value.trim();
        var klientVal = npKlientSelect.value;
        var sluzba = document.getElementById('np-sluzba').value;
        var faza = document.getElementById('np-faza').value;

        if (!nazov) { newProjectError.textContent = 'Zadajte prosím názov projektu.'; newProjectError.classList.add('show'); return; }
        if (!klientVal) { newProjectError.textContent = 'Vyberte prosím klienta.'; newProjectError.classList.add('show'); return; }

        var submitBtn = newProjectForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Vytváram…';

        function createProjectForClient(clientId, isNewClient) {
          window.supabaseClient.from('projects').insert({
            nazov_projektu: nazov, client_id: clientId, sluzba: sluzba, faza: faza, status: 'aktivny'
          }).then(function (res) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Vytvoriť projekt';
            if (res.error) {
              newProjectError.textContent = 'Projekt sa nepodarilo vytvoriť: ' + res.error.message;
              newProjectError.classList.add('show');
              return;
            }
            newProjectForm.reset();
            npNewClientFields.style.display = 'none';
            newProjectCard.style.display = 'none';
            loadClientsForDropdown();
            loadProjects();
            if (isNewClient) {
              window.alert('Projekt aj profil klienta boli vytvorené.\n\nNEZABUDNITE: klientovi ešte treba manuálne vytvoriť prihlasovací účet v Supabase dashboarde (Authentication → Add user) a prepojiť ho s profilom cez stĺpec clients.auth_user_id — presne ako pri admin účte. Bez tohto prepojenia sa klient do klient.html neprihlási / uvidí prázdny portál.');
            }
          });
        }

        if (klientVal === '__new__') {
          var meno = document.getElementById('np-klient-meno').value.trim();
          var firma = document.getElementById('np-klient-firma').value.trim();
          var email = document.getElementById('np-klient-email').value.trim();
          if (!meno) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Vytvoriť projekt';
            newProjectError.textContent = 'Zadajte prosím meno nového klienta.';
            newProjectError.classList.add('show');
            return;
          }
          window.supabaseClient
            .from('clients')
            .insert({ meno_priezvisko: meno, nazov_firmy: firma || null, email: email || null })
            .select()
            .then(function (res) {
              if (res.error || !res.data || !res.data[0]) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Vytvoriť projekt';
                newProjectError.textContent = 'Nového klienta sa nepodarilo vytvoriť: ' + (res.error ? res.error.message : 'neznáma chyba');
                newProjectError.classList.add('show');
                return;
              }
              createProjectForClient(res.data[0].id, true);
            });
        } else {
          createProjectForClient(klientVal, false);
        }
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
