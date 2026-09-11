// TECH-SCOPE — admin.html: prihlásenie (Supabase Auth), správa call_slots,
// prehľad leads. Prístup je obmedzený cez RLS politiky pre rolu
// "authenticated" (viď sql/supabase-schema.sql) — každý, kto sa vie prihlásiť,
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
      loadCrmLeads();
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
          confirmPasswordAndDelete({
            table: 'leads', id: btn.getAttribute('data-id'), btn: btn, label: 'lead',
            onDeleted: loadLeads
          });
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
          confirmPasswordAndDelete({
            table: 'exit_leads', id: btn.getAttribute('data-id'), btn: btn, label: 'exit lead',
            onDeleted: loadExitLeads
          });
        });
      }
    }

    // Jedno zdieľané potvrdenie heslom pre VŠETKY tri nevratné mazania —
    // leads, exit_leads aj crm_leads. Každé z nich obsahuje osobné kontaktné
    // údaje, takže mazanie musí byť chránené opätovným zadaním hesla
    // prihláseného admina (re-auth cez signInWithPassword), nie len confirm()
    // ako pri slotoch. Predtým to boli tri takmer identické kópie tej istej
    // logiky (confirmPasswordAndDeleteLead / ...ExitLead).
    //
    // opts:
    //   table    — 'leads' | 'exit_leads' | 'crm_leads'
    //   id       — id mazaného riadku
    //   btn      — tlačidlo, ktoré sa počas operácie zablokuje (voliteľné)
    //   label    — ľudský názov pre hlášky, napr. 'lead' / 'exit lead' / 'CRM lead'
    //   onDeleted — callback po POTVRDENOM reálnom zmazaní (aktualizácia UI)
    function confirmPasswordAndDelete(opts) {
      var btn = opts.btn || null;
      var label = opts.label || 'záznam';
      var labelCap = label.charAt(0).toUpperCase() + label.slice(1);
      function reenable() { if (btn) btn.disabled = false; }

      var heslo = window.prompt('Pre zmazanie ' + label + 'u znova zadajte svoje heslo:');
      if (heslo === null) return;
      if (!heslo) {
        window.alert('Heslo je povinné, ' + label + ' nebol zmazaný.');
        return;
      }

      if (btn) btn.disabled = true;

      window.supabaseClient.auth.getSession().then(function (sessionRes) {
        var session = sessionRes.data && sessionRes.data.session;
        var email = session && session.user && session.user.email;
        if (!email) {
          reenable();
          window.alert('Nepodarilo sa overiť prihláseného používateľa.');
          return;
        }

        window.supabaseClient.auth.signInWithPassword({ email: email, password: heslo }).then(function (authRes) {
          if (authRes.error) {
            reenable();
            window.alert('Nesprávne heslo. ' + labelCap + ' nebol zmazaný.');
            return;
          }

          if (!window.confirm('Naozaj natrvalo zmazať tento ' + label + '? Táto akcia sa nedá vrátiť späť.')) {
            reenable();
            return;
          }

          // .select() na delete() nie je len kozmetika — bez neho Supabase
          // vráti "úspech" aj keď RLS ticho odfiltruje všetky riadky a v
          // skutočnosti sa nezmaže nič. S .select() vidíme v res.data, či
          // bol reálne zmazaný nejaký riadok. DELETE cieli výhradne na
          // opts.table (nikdy nie na prepojené tabuľky).
          window.supabaseClient.from(opts.table).delete().eq('id', opts.id).select().then(function (res) {
            if (res.error) {
              reenable();
              window.alert(labelCap + ' sa nepodarilo zmazať: ' + res.error.message);
              return;
            }
            if (!res.data || res.data.length === 0) {
              reenable();
              window.alert(labelCap + ' sa nezmazal — databáza nevrátila žiadny zmazaný riadok. Skontroluj, či je v Supabase spustená DELETE politika pre rolu authenticated na tabuľke ' + opts.table + '.');
              return;
            }
            if (opts.onDeleted) opts.onDeleted();
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
        '</div>' +

        '<div class="portal-card">' +
          '<div class="portal-header" style="align-items:center;">' +
            '<h4 style="margin:0;">Faktúry</h4>' +
            '<button type="button" class="btn btn-primary" id="pd-inv-toggle-btn">Vygenerovať faktúru</button>' +
          '</div>' +
          '<div id="pd-invoice-form" style="display:none; margin-top:18px;"></div>' +
          '<div id="pd-invoices-list" style="margin-top:18px;"><p style="color:var(--ink-faint);">Načítavam…</p></div>' +
        '</div>';

      wireProjectDetail(project);
      loadProjectUpdates(project.id);
      loadProjectDocuments(project.id);
      loadProjectQuestions(project.id);
      loadProjectInvoices(project.id);
      wireInvoiceSection(project);
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
          window.supabaseClient.from('project_documents').insert({ project_id: project.id, nazov: nazov, file_url: path }).then(function (res) {
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
          .select('file_url')
          .eq('project_id', project.id)
          .then(function (docsRes) {
            if (docsRes.error) {
              deleteBtn.disabled = false;
              deleteBtn.textContent = 'Zmazať projekt';
              window.alert('Nepodarilo sa načítať dokumenty projektu, mazanie prerušené: ' + docsRes.error.message);
              return;
            }
            var paths = (docsRes.data || []).map(function (d) { return d.file_url; });

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
        .select('id,nazov,file_url,uploaded_at')
        .eq('project_id', projectId)
        .order('uploaded_at', { ascending: false })
        .then(function (res) {
          if (res.error) { el.innerHTML = '<p style="color:var(--ink-faint);">Dokumenty sa nepodarilo načítať.</p>'; return; }
          var rows = res.data || [];
          if (!rows.length) { el.innerHTML = '<p style="color:var(--ink-faint);">Zatiaľ žiadne dokumenty.</p>'; return; }
          var html = '';
          for (var i = 0; i < rows.length; i++) {
            html += '<div class="doc-row"><div><div class="doc-row-name">' + escapeHtml(rows[i].nazov) + '</div><div class="doc-row-date">' + formatDateTime(rows[i].uploaded_at) + '</div></div>' +
              '<button type="button" class="btn btn-ghost doc-admin-delete-btn" data-id="' + rows[i].id + '" data-path="' + escapeHtml(rows[i].file_url) + '">Zmazať</button></div>';
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

    // ---------------- CRM / LEADY (crm_leads) ----------------
    // Dva zdroje riadkov: 'rezervacny_formular' (vkladá automaticky DB trigger
    // sync_lead_to_crm po každom novom leads riadku) a 'manualny' (tlačidlo
    // "+ Nový lead"). Detail sa rozbalí kliknutím na riadok — rovnaký vzor
    // ako "Prehľad zákaziek" vyššie (openCrmLeadId + is-open).
    var CRM_STATUS = {
      zaujemca:        { label: 'Záujemca',        cls: 'crm-zaujemca' },
      strategy_call:   { label: 'Strategy Call',   cls: 'crm-strategy_call' },
      odoslana_ponuka: { label: 'Odoslaná ponuka', cls: 'crm-odoslana_ponuka' },
      uzavrety:        { label: 'Uzavretý',        cls: 'crm-uzavrety' },
      zruseny:         { label: 'Zrušený',         cls: 'crm-zruseny' }
    };
    var CRM_STATUS_ORDER = ['zaujemca', 'strategy_call', 'odoslana_ponuka', 'uzavrety', 'zruseny'];

    var crmTbody = document.getElementById('crm-tbody');
    var crmDetailEl = document.getElementById('crm-detail');
    var crmNewToggleBtn = document.getElementById('crm-new-toggle-btn');
    var crmNewCard = document.getElementById('crm-new-card');
    var crmNewForm = document.getElementById('crm-new-form');
    var crmNewError = document.getElementById('crm-new-error');
    var crmTabsEl = document.getElementById('crm-tabs');
    var currentCrmLeads = [];
    var crmFilter = '';
    var openCrmLeadId = null;

    if (crmNewToggleBtn) {
      crmNewToggleBtn.addEventListener('click', function () {
        crmNewCard.style.display = (crmNewCard.style.display === 'none') ? '' : 'none';
      });
    }

    if (crmTabsEl) {
      var crmTabButtons = crmTabsEl.querySelectorAll('.crm-tab');
      for (var ct = 0; ct < crmTabButtons.length; ct++) {
        crmTabButtons[ct].addEventListener('click', function () {
          crmFilter = this.getAttribute('data-status') || '';
          for (var k = 0; k < crmTabButtons.length; k++) { crmTabButtons[k].classList.remove('is-active'); }
          this.classList.add('is-active');
          renderCrmLeads();
        });
      }
    }

    function loadCrmLeads() {
      if (!crmTbody) return;
      crmTbody.innerHTML = '<tr><td colspan="5">Načítavam…</td></tr>';
      window.supabaseClient
        .from('crm_leads')
        .select('*')
        .order('created_at', { ascending: false })
        .then(function (res) {
          if (res.error) {
            crmTbody.innerHTML = '<tr><td colspan="5">CRM leady sa nepodarilo načítať.</td></tr>';
            return;
          }
          currentCrmLeads = res.data || [];
          renderCrmLeads();
        });
    }

    function crmSourceLabel(zdroj) {
      return zdroj === 'rezervacny_formular'
        ? '<span class="crm-source">&#128203; Z formulára</span>'
        : '<span class="crm-source">&#9999;&#65039; Manuálny</span>';
    }

    function crmStatusBadge(status) {
      var s = CRM_STATUS[status] || { label: status, cls: '' };
      return '<span class="status-badge ' + s.cls + '">' + escapeHtml(s.label) + '</span>';
    }

    function crmStatusOptionsHtml(selected) {
      var html = '';
      for (var i = 0; i < CRM_STATUS_ORDER.length; i++) {
        var key = CRM_STATUS_ORDER[i];
        html += '<option value="' + key + '"' + (key === selected ? ' selected' : '') + '>' + CRM_STATUS[key].label + '</option>';
      }
      return html;
    }

    function renderCrmLeads() {
      if (!crmTbody) return;
      var rows = crmFilter
        ? currentCrmLeads.filter(function (l) { return l.status === crmFilter; })
        : currentCrmLeads;
      if (!rows.length) {
        crmTbody.innerHTML = '<tr><td colspan="5">' +
          (currentCrmLeads.length ? 'Žiadny lead v tomto statuse.' : 'Zatiaľ žiadne CRM leady.') + '</td></tr>';
        crmDetailEl.innerHTML = '';
        return;
      }
      var html = '';
      for (var i = 0; i < rows.length; i++) {
        var l = rows[i];
        html += '<tr class="crm-row' + (l.id === openCrmLeadId ? ' is-open' : '') + '" data-id="' + l.id + '">' +
          '<td>' + escapeHtml(l.firma || '—') + '</td>' +
          '<td>' + escapeHtml(l.kontaktna_osoba || '—') + '</td>' +
          '<td>' + crmStatusBadge(l.status) + '</td>' +
          '<td>' + crmSourceLabel(l.zdroj) + '</td>' +
          '<td>' + formatDateTime(l.created_at) + '</td>' +
        '</tr>';
      }
      crmTbody.innerHTML = html;

      var rowEls = crmTbody.querySelectorAll('.crm-row');
      for (var r = 0; r < rowEls.length; r++) {
        rowEls[r].addEventListener('click', function () {
          var id = this.getAttribute('data-id');
          openCrmLeadId = (openCrmLeadId === id) ? null : id;
          renderCrmLeads();
          if (openCrmLeadId) {
            var lead = currentCrmLeads.filter(function (x) { return x.id === openCrmLeadId; })[0];
            renderCrmDetail(lead);
            crmDetailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } else {
            crmDetailEl.innerHTML = '';
          }
        });
      }
    }

    // Každý zápis rovno uloží aj updated_at = now() (viď zadanie) a udrží
    // lokálnu kópiu v currentCrmLeads v synchrone, aby sa detail po
    // re-renderi nezobrazil so starými hodnotami.
    function crmUpdate(id, patch, onOk, onErr) {
      patch.updated_at = new Date().toISOString();
      window.supabaseClient.from('crm_leads').update(patch).eq('id', id).select().then(function (res) {
        if (res.error || !res.data || !res.data.length) {
          if (onErr) onErr(res.error);
          return;
        }
        var lead = currentCrmLeads.filter(function (x) { return x.id === id; })[0];
        if (lead) { for (var key in patch) { lead[key] = patch[key]; } }
        if (onOk) onOk(res.data[0]);
      });
    }

    function renderCrmDetail(lead) {
      if (!lead) { crmDetailEl.innerHTML = ''; return; }
      var canConvert = lead.status === 'uzavrety';
      crmDetailEl.innerHTML =
        '<div class="portal-card">' +
          '<div class="portal-header">' +
            '<div><h3 style="margin:0 0 4px;">' + escapeHtml(lead.firma || lead.kontaktna_osoba || 'Lead') + '</h3>' +
              '<div class="portal-service">' + crmSourceLabel(lead.zdroj) + ' · vytvorené ' + formatDateTime(lead.created_at) + '</div></div>' +
            '<div style="display:flex; gap:10px; align-items:flex-start; flex-wrap:wrap;">' +
              (canConvert ? '<button type="button" class="btn btn-primary" id="crm-to-project-btn">Vytvoriť zákazku</button>' : '') +
              '<button type="button" class="btn btn-danger" id="crm-delete-lead-btn">Zmazať lead</button>' +
            '</div>' +
          '</div>' +
          '<div class="form-banner-error" id="crm-detail-error"></div>' +
          '<div class="admin-toolbar" style="margin-top:20px;">' +
            '<div class="form-row"><label>Firma</label><input type="text" class="crm-field" data-field="firma" value="' + escapeHtml(lead.firma || '') + '"></div>' +
            '<div class="form-row"><label>Kontaktná osoba</label><input type="text" class="crm-field" data-field="kontaktna_osoba" value="' + escapeHtml(lead.kontaktna_osoba || '') + '"></div>' +
            '<div class="form-row"><label>Email</label><input type="email" class="crm-field" data-field="email" value="' + escapeHtml(lead.email || '') + '"></div>' +
            '<div class="form-row"><label>Telefón</label><input type="tel" class="crm-field" data-field="telefon" value="' + escapeHtml(lead.telefon || '') + '"></div>' +
            '<div class="form-row"><label for="crm-detail-status">Status</label><select id="crm-detail-status">' + crmStatusOptionsHtml(lead.status) + '</select></div>' +
          '</div>' +
          '<div class="form-row"><label for="crm-detail-poznamky">Poznámky</label><textarea id="crm-detail-poznamky" class="admin-textarea">' + escapeHtml(lead.poznamky || '') + '</textarea></div>' +
          '<button type="button" class="btn btn-secondary" id="crm-save-poznamky-btn">Uložiť poznámky</button>' +
        '</div>' +
        '<div id="crm-origin-context"></div>';

      wireCrmDetail(lead);
      if (lead.zdroj === 'rezervacny_formular' && lead.povodny_lead_id) {
        loadCrmOriginContext(lead.povodny_lead_id);
      }
    }

    function wireCrmDetail(lead) {
      var errEl = document.getElementById('crm-detail-error');

      var fields = crmDetailEl.querySelectorAll('.crm-field');
      for (var i = 0; i < fields.length; i++) {
        fields[i].addEventListener('blur', function () {
          var field = this.getAttribute('data-field');
          var val = this.value.trim();
          if ((lead[field] || '') === val) return;
          var input = this;
          input.disabled = true;
          var patch = {};
          patch[field] = val || null;
          crmUpdate(lead.id, patch, function () {
            input.disabled = false;
            renderCrmLeads();
          }, function (e) {
            input.disabled = false;
            errEl.textContent = 'Zmenu sa nepodarilo uložiť' + (e ? ': ' + e.message : '.');
            errEl.classList.add('show');
          });
        });
      }

      var statusSelect = document.getElementById('crm-detail-status');
      statusSelect.addEventListener('change', function () {
        var val = statusSelect.value;
        var previous = lead.status;
        statusSelect.disabled = true;
        crmUpdate(lead.id, { status: val }, function () {
          statusSelect.disabled = false;
          renderCrmLeads();
          renderCrmDetail(lead); // premietne tlačidlo "Vytvoriť zákazku"
        }, function (e) {
          statusSelect.disabled = false;
          statusSelect.value = previous;
          errEl.textContent = 'Status sa nepodarilo uložiť' + (e ? ': ' + e.message : '.');
          errEl.classList.add('show');
        });
      });

      document.getElementById('crm-save-poznamky-btn').addEventListener('click', function () {
        var btn = this;
        var val = document.getElementById('crm-detail-poznamky').value.trim();
        btn.disabled = true;
        crmUpdate(lead.id, { poznamky: val || null }, function () {
          btn.disabled = false;
          btn.textContent = 'Uložené ✓';
          setTimeout(function () { btn.textContent = 'Uložiť poznámky'; }, 1500);
        }, function (e) {
          btn.disabled = false;
          errEl.textContent = 'Poznámky sa nepodarilo uložiť' + (e ? ': ' + e.message : '.');
          errEl.classList.add('show');
        });
      });

      var toProjectBtn = document.getElementById('crm-to-project-btn');
      if (toProjectBtn) {
        toProjectBtn.addEventListener('click', function () { prefillNewProjectFromCrm(lead); });
      }

      // Trvalé zmazanie CRM leadu — cez zdieľané potvrdenie heslom.
      // DELETE cieli VÝHRADNE na crm_leads. Ak lead vznikol z rezervačného
      // formulára (má povodny_lead_id), jeho pôvodný riadok v `leads` zostáva
      // NEDOTKNUTÝ — FK crm_leads.povodny_lead_id -> leads(id) je na strane
      // dieťaťa, takže mazanie crm_leads riadku sa rodičovskej tabuľky nedotkne.
      var delLeadBtn = document.getElementById('crm-delete-lead-btn');
      if (delLeadBtn) {
        delLeadBtn.addEventListener('click', function () {
          confirmPasswordAndDelete({
            table: 'crm_leads',
            id: lead.id,
            btn: delLeadBtn,
            label: 'CRM lead',
            onDeleted: function () {
              currentCrmLeads = currentCrmLeads.filter(function (x) { return x.id !== lead.id; });
              openCrmLeadId = null;
              crmDetailEl.innerHTML = '';
              renderCrmLeads();
            }
          });
        });
      }
    }

    function loadCrmOriginContext(leadId) {
      var el = document.getElementById('crm-origin-context');
      if (!el) return;
      window.supabaseClient
        .from('leads')
        .select('popis_projektu,rozpocet,urgencia,pozicia,produkt,created_at')
        .eq('id', leadId)
        .maybeSingle()
        .then(function (res) {
          if (res.error || !res.data) { el.innerHTML = ''; return; }
          var d = res.data;
          el.innerHTML =
            '<div class="portal-card">' +
              '<h4 style="margin:0 0 4px;">Pôvodný dopyt z rezervačného formulára</h4>' +
              '<p style="color:var(--ink-faint); font-size:0.82rem; margin:0 0 16px;">Needitovateľný kontext z prepojeného záznamu (leads).</p>' +
              '<div class="crm-origin-grid">' +
                '<div><span>Produkt</span><p>' + escapeHtml(PRODUKT_LABELS[d.produkt] || d.produkt || '—') + '</p></div>' +
                '<div><span>Rozpočet</span><p>' + escapeHtml(d.rozpocet || '—') + '</p></div>' +
                '<div><span>Urgencia</span><p>' + escapeHtml(d.urgencia || '—') + '</p></div>' +
                '<div><span>Pozícia</span><p>' + escapeHtml(d.pozicia || '—') + '</p></div>' +
              '</div>' +
              '<div style="margin-top:16px;"><span style="font-family:var(--font-mono); font-size:0.72rem; color:var(--ink-faint); text-transform:uppercase; letter-spacing:0.03em;">Popis projektu</span>' +
              '<p style="margin:4px 0 0; white-space:pre-wrap;">' + escapeHtml(d.popis_projektu || '—') + '</p></div>' +
            '</div>';
        });
    }

    // Prevod leadu na zákazku: otvorí a predvyplní existujúci formulár
    // "+ Nový projekt" (cesta "nový klient"), aby admin neprepisoval údaje.
    function prefillNewProjectFromCrm(lead) {
      if (!newProjectCard) return;
      newProjectCard.style.display = '';
      if (npKlientSelect) {
        npKlientSelect.value = '__new__';
        if (npNewClientFields) npNewClientFields.style.display = '';
      }
      var meno = document.getElementById('np-klient-meno');
      var firma = document.getElementById('np-klient-firma');
      var email = document.getElementById('np-klient-email');
      var nazov = document.getElementById('np-nazov');
      if (meno) meno.value = lead.kontaktna_osoba || '';
      if (firma) firma.value = lead.firma || '';
      if (email) email.value = lead.email || '';
      if (nazov && !nazov.value) nazov.value = (lead.firma || lead.kontaktna_osoba || 'Nová') + ' — zákazka';
      newProjectCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    if (crmNewForm) {
      crmNewForm.addEventListener('submit', function (e) {
        e.preventDefault();
        crmNewError.classList.remove('show');
        var firma = document.getElementById('crm-firma').value.trim();
        var osoba = document.getElementById('crm-osoba').value.trim();
        var email = document.getElementById('crm-email').value.trim();
        var telefon = document.getElementById('crm-telefon').value.trim();
        var poznamky = document.getElementById('crm-poznamky').value.trim();
        var status = document.getElementById('crm-status').value;

        if (!firma && !osoba) {
          crmNewError.textContent = 'Zadajte aspoň firmu alebo kontaktnú osobu.';
          crmNewError.classList.add('show');
          return;
        }

        var submitBtn = crmNewForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        window.supabaseClient.from('crm_leads').insert({
          firma: firma || null, kontaktna_osoba: osoba || null,
          email: email || null, telefon: telefon || null,
          poznamky: poznamky || null, status: status, zdroj: 'manualny'
        }).select().then(function (res) {
          submitBtn.disabled = false;
          if (res.error) {
            crmNewError.textContent = 'Lead sa nepodarilo vytvoriť: ' + res.error.message;
            crmNewError.classList.add('show');
            return;
          }
          crmNewForm.reset();
          crmNewCard.style.display = 'none';
          loadCrmLeads();
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

    // ---------------- FAKTÚRY (invoices) ----------------
    // Číslo faktúry sa NIKDY neposiela z klienta — generuje ho DB trigger
    // trg_invoices_set_cislo cez atomickú funkciu generuj_cislo_faktury().
    // Tu ho po inserte iba prečítame cez .select() a zobrazíme.
    var INVOICE_STATUS = {
      vystavena:     { label: 'Vystavená',     cls: 'dostupny' },
      zaplatena:     { label: 'Zaplatená',     cls: 'aktivny' },
      po_splatnosti: { label: 'Po splatnosti', cls: 'rezervovany' }
    };
    var DODAVATEL_LS_KEY = 'ts_dodavatel_v1';

    function loadDodavatel() {
      try { return JSON.parse(localStorage.getItem(DODAVATEL_LS_KEY)) || {}; }
      catch (e) { return {}; }
    }
    function saveDodavatel(d) {
      try { localStorage.setItem(DODAVATEL_LS_KEY, JSON.stringify(d)); } catch (e) {}
    }
    function isoPlusDays(days) {
      var d = new Date(); d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    }
    function num(v) { var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; }
    function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
    function money(n) { return round2(num(n)).toLocaleString('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }

    function wireInvoiceSection(project) {
      var toggle = document.getElementById('pd-inv-toggle-btn');
      var formWrap = document.getElementById('pd-invoice-form');
      if (!toggle || !formWrap) return;
      toggle.addEventListener('click', function () {
        if (formWrap.style.display === 'none') {
          renderInvoiceForm(project);
          formWrap.style.display = '';
          toggle.textContent = 'Zrušiť';
        } else {
          formWrap.style.display = 'none';
          formWrap.innerHTML = '';
          toggle.textContent = 'Vygenerovať faktúru';
        }
      });
    }

    function invoiceItemRowHtml(it) {
      it = it || {};
      return '<div class="inv-item-row">' +
        '<input type="text" class="inv-popis" placeholder="Popis položky" value="' + escapeHtml(it.popis || '') + '">' +
        '<input type="text" inputmode="decimal" class="inv-mnozstvo" placeholder="Množstvo" value="' + escapeHtml(it.mnozstvo != null ? it.mnozstvo : '1') + '">' +
        '<input type="text" inputmode="decimal" class="inv-cena" placeholder="Jedn. cena" value="' + escapeHtml(it.jednotkova_cena != null ? it.jednotkova_cena : '') + '">' +
        '<span class="inv-riadok-spolu">0,00 €</span>' +
        '<button type="button" class="btn btn-ghost inv-item-remove" aria-label="Odobrať riadok">×</button>' +
      '</div>';
    }

    function renderInvoiceForm(project) {
      var formWrap = document.getElementById('pd-invoice-form');
      var dod = loadDodavatel();
      var client = project.clients || {};
      var odbMeno = client.nazov_firmy || client.meno_priezvisko || '';

      formWrap.innerHTML =
        '<div class="form-banner-error" id="inv-error"></div>' +

        '<label class="checkbox-label" style="margin-bottom:16px;">' +
          '<input type="checkbox" id="inv-neplatca" checked> Nie som platcom DPH' +
        '</label>' +

        '<div class="inv-two-col">' +
          '<div>' +
            '<h5 class="inv-sub">Dodávateľ</h5>' +
            fieldRow('inv-dod-meno', 'Meno / názov', dod.meno) +
            fieldRow('inv-dod-adresa', 'Adresa', dod.adresa) +
            fieldRow('inv-dod-ico', 'IČO', dod.ico) +
            fieldRow('inv-dod-dic', 'DIČ', dod.dic) +
            fieldRow('inv-dod-icdph', 'IČ DPH (ak platca)', dod.ic_dph) +
          '</div>' +
          '<div>' +
            '<h5 class="inv-sub">Odberateľ</h5>' +
            fieldRow('inv-odb-meno', 'Meno / názov', odbMeno) +
            fieldRow('inv-odb-adresa', 'Adresa', '') +
            fieldRow('inv-odb-ico', 'IČO', '') +
            fieldRow('inv-odb-dic', 'DIČ', '') +
          '</div>' +
        '</div>' +

        '<div class="inv-three-col" style="margin-top:8px;">' +
          fieldRow('inv-datum-vyst', 'Dátum vystavenia', new Date().toISOString().slice(0, 10), 'date') +
          fieldRow('inv-datum-dod', 'Dátum dodania', new Date().toISOString().slice(0, 10), 'date') +
          fieldRow('inv-datum-spl', 'Dátum splatnosti', isoPlusDays(14), 'date') +
        '</div>' +

        '<div class="inv-three-col">' +
          fieldRow('inv-iban', 'IBAN', dod.iban) +
          fieldRow('inv-vs', 'Variabilný symbol (nepovinné)', '') +
          fieldRow('inv-sadzba', 'Sadzba DPH %', '23') +
        '</div>' +

        '<h5 class="inv-sub" style="margin-top:20px;">Položky</h5>' +
        '<div id="inv-items">' + invoiceItemRowHtml() + '</div>' +
        '<button type="button" class="btn btn-ghost" id="inv-add-item">+ Pridať riadok</button>' +

        '<div class="inv-totals">' +
          '<div><span>Základ dane</span><strong id="inv-t-zaklad">0,00 €</strong></div>' +
          '<div id="inv-t-dph-row"><span>DPH</span><strong id="inv-t-dph">0,00 €</strong></div>' +
          '<div class="inv-total-final"><span>Celková suma</span><strong id="inv-t-celkom">0,00 €</strong></div>' +
        '</div>' +

        '<p style="font-size:0.82rem; color:var(--ink-faint); margin:10px 0 0;">Číslo faktúry sa vygeneruje automaticky pri uložení (súvislý rad RRRR/PPP).</p>' +
        '<button type="button" class="btn btn-primary" id="inv-submit" style="margin-top:12px;">Vytvoriť faktúru</button>';

      // wiring
      document.getElementById('inv-add-item').addEventListener('click', function () {
        var wrap = document.getElementById('inv-items');
        wrap.insertAdjacentHTML('beforeend', invoiceItemRowHtml());
        bindInvItemRows();
        recalcInvoice();
      });
      document.getElementById('inv-neplatca').addEventListener('change', recalcInvoice);
      document.getElementById('inv-sadzba').addEventListener('input', recalcInvoice);
      document.getElementById('inv-submit').addEventListener('click', function () { submitInvoice(project); });
      bindInvItemRows();
      recalcInvoice();

      function fieldRow(id, label, val, type) {
        return '<div class="form-row"><label for="' + id + '">' + label + '</label>' +
          '<input type="' + (type || 'text') + '" id="' + id + '" value="' + escapeHtml(val || '') + '"></div>';
      }
    }

    function bindInvItemRows() {
      var rows = document.querySelectorAll('#inv-items .inv-item-row');
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var inputs = r.querySelectorAll('input');
        for (var j = 0; j < inputs.length; j++) {
          inputs[j].oninput = recalcInvoice;
        }
        var rm = r.querySelector('.inv-item-remove');
        rm.onclick = function () {
          var all = document.querySelectorAll('#inv-items .inv-item-row');
          if (all.length <= 1) { this.closest('.inv-item-row').querySelectorAll('input').forEach(function (x) { x.value = ''; }); }
          else { this.closest('.inv-item-row').remove(); }
          recalcInvoice();
        };
      }
    }

    function readInvoiceItems() {
      var out = [];
      var rows = document.querySelectorAll('#inv-items .inv-item-row');
      for (var i = 0; i < rows.length; i++) {
        var popis = rows[i].querySelector('.inv-popis').value.trim();
        var mn = num(rows[i].querySelector('.inv-mnozstvo').value);
        var ce = num(rows[i].querySelector('.inv-cena').value);
        if (!popis && !mn && !ce) continue;
        out.push({ popis: popis, mnozstvo: mn, jednotkova_cena: ce });
      }
      return out;
    }

    function recalcInvoice() {
      var neplatca = document.getElementById('inv-neplatca').checked;
      var sadzba = neplatca ? 0 : num(document.getElementById('inv-sadzba').value);
      var zaklad = 0;
      var rows = document.querySelectorAll('#inv-items .inv-item-row');
      for (var i = 0; i < rows.length; i++) {
        var mn = num(rows[i].querySelector('.inv-mnozstvo').value);
        var ce = num(rows[i].querySelector('.inv-cena').value);
        var spolu = round2(mn * ce);
        rows[i].querySelector('.inv-riadok-spolu').textContent = money(spolu);
        zaklad += spolu;
      }
      zaklad = round2(zaklad);
      var dph = round2(zaklad * sadzba / 100);
      var celkom = round2(zaklad + dph);
      document.getElementById('inv-t-zaklad').textContent = money(zaklad);
      document.getElementById('inv-t-dph').textContent = money(dph);
      document.getElementById('inv-t-celkom').textContent = money(celkom);
      document.getElementById('inv-t-dph-row').style.display = neplatca ? 'none' : '';
      document.getElementById('inv-sadzba').closest('.form-row').style.opacity = neplatca ? '0.45' : '1';
      return { zaklad: zaklad, sadzba: sadzba, dph: dph, celkom: celkom, neplatca: neplatca };
    }

    function submitInvoice(project) {
      var errEl = document.getElementById('inv-error');
      errEl.classList.remove('show');
      var btn = document.getElementById('inv-submit');

      var items = readInvoiceItems();
      if (!items.length) {
        errEl.textContent = 'Pridajte aspoň jednu položku s cenou.';
        errEl.classList.add('show');
        return;
      }
      var t = recalcInvoice();
      var v = function (id) { return document.getElementById(id).value.trim(); };

      var dod = {
        meno: v('inv-dod-meno'), adresa: v('inv-dod-adresa'), ico: v('inv-dod-ico'),
        dic: v('inv-dod-dic'), ic_dph: v('inv-dod-icdph'), iban: v('inv-iban')
      };
      saveDodavatel(dod);

      var payload = {
        project_id: project.id,
        dodavatel_meno: dod.meno || null,
        dodavatel_adresa: dod.adresa || null,
        dodavatel_ico: dod.ico || null,
        dodavatel_dic: dod.dic || null,
        dodavatel_ic_dph: dod.ic_dph || null,
        odberatel_meno: v('inv-odb-meno') || null,
        odberatel_adresa: v('inv-odb-adresa') || null,
        odberatel_ico: v('inv-odb-ico') || null,
        odberatel_dic: v('inv-odb-dic') || null,
        polozky: items,
        je_platca_dph: !t.neplatca,
        zaklad_dane: t.zaklad,
        sadzba_dph: t.neplatca ? 0 : t.sadzba,
        vyska_dph: t.dph,
        celkova_suma: t.celkom,
        datum_vystavenia: v('inv-datum-vyst') || new Date().toISOString().slice(0, 10),
        datum_dodania: v('inv-datum-dod') || null,
        datum_splatnosti: v('inv-datum-spl') || null,
        iban: dod.iban || null,
        variabilny_symbol: v('inv-vs') || null,
        status: 'vystavena'
        // cislo_faktury zámerne NEposielame — doplní ho DB trigger
      };

      btn.disabled = true;
      btn.textContent = 'Vytváram…';

      window.supabaseClient.from('invoices').insert(payload).select().then(function (res) {
        if (res.error || !res.data || !res.data[0]) {
          btn.disabled = false; btn.textContent = 'Vytvoriť faktúru';
          errEl.textContent = 'Faktúru sa nepodarilo vytvoriť: ' + (res.error ? res.error.message : 'databáza nevrátila riadok (RLS?).');
          errEl.classList.add('show');
          return;
        }
        var inv = res.data[0];

        // ak admin nezadal VS, doplníme ho z čísla faktúry (číslice)
        var patch = {};
        if (!inv.variabilny_symbol) {
          patch.variabilny_symbol = String(inv.cislo_faktury).replace(/\D/g, '');
        }
        var afterVs = patch.variabilny_symbol
          ? window.supabaseClient.from('invoices').update(patch).eq('id', inv.id).select().then(function (r) { return (r.data && r.data[0]) || inv; })
          : Promise.resolve(inv);

        afterVs.then(function (invFinal) {
          btn.textContent = 'Generujem PDF…';
          generateAndStorePdf(invFinal, project).then(function () {
            document.getElementById('pd-inv-toggle-btn').textContent = 'Vygenerovať faktúru';
            var fw = document.getElementById('pd-invoice-form');
            fw.style.display = 'none'; fw.innerHTML = '';
            loadProjectInvoices(project.id);
          }).catch(function (e) {
            btn.disabled = false; btn.textContent = 'Vytvoriť faktúru';
            errEl.textContent = 'Faktúra bola uložená (č. ' + invFinal.cislo_faktury + '), ale PDF sa nepodarilo vytvoriť: ' + (e && e.message ? e.message : e) + '. PDF sa dá znovu vytvoriť tlačidlom v zozname.';
            errEl.classList.add('show');
            loadProjectInvoices(project.id);
          });
        });
      });
    }

    function invoiceRowToPdfData(inv, project) {
      var client = (project && project.clients) || {};
      return {
        cislo_faktury: inv.cislo_faktury,
        dodavatel_meno: inv.dodavatel_meno, dodavatel_adresa: inv.dodavatel_adresa,
        dodavatel_ico: inv.dodavatel_ico, dodavatel_dic: inv.dodavatel_dic, dodavatel_ic_dph: inv.dodavatel_ic_dph,
        odberatel_meno: inv.odberatel_meno || client.nazov_firmy || client.meno_priezvisko,
        odberatel_adresa: inv.odberatel_adresa, odberatel_ico: inv.odberatel_ico, odberatel_dic: inv.odberatel_dic,
        polozky: inv.polozky || [],
        je_platca_dph: !!inv.je_platca_dph,
        zaklad_dane: inv.zaklad_dane, sadzba_dph: inv.sadzba_dph, vyska_dph: inv.vyska_dph, celkova_suma: inv.celkova_suma,
        datum_vystavenia: inv.datum_vystavenia, datum_dodania: inv.datum_dodania, datum_splatnosti: inv.datum_splatnosti,
        iban: inv.iban, variabilny_symbol: inv.variabilny_symbol
      };
    }

    function invoicePdfPath(inv) {
      return inv.project_id + '/' + String(inv.cislo_faktury).replace(/\//g, '-') + '.pdf';
    }

    function generateAndStorePdf(inv, project) {
      if (!window.invoicePdf) return Promise.reject(new Error('PDF modul sa nenačítal.'));
      return window.invoicePdf.generate(invoiceRowToPdfData(inv, project)).then(function (blob) {
        var path = invoicePdfPath(inv);
        return window.supabaseClient.storage.from('invoices').upload(path, blob, {
          contentType: 'application/pdf', upsert: true
        }).then(function (up) {
          if (up.error) throw up.error;
          return window.supabaseClient.from('invoices').update({ pdf_path: path }).eq('id', inv.id);
        });
      });
    }

    function downloadInvoicePdf(inv, project, btn) {
      var orig = btn.textContent;
      btn.disabled = true; btn.textContent = '…';
      function done() { btn.disabled = false; btn.textContent = orig; }
      function saveBlob(blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'faktura-' + String(inv.cislo_faktury).replace(/\//g, '-') + '.pdf';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        done();
      }
      var path = inv.pdf_path || invoicePdfPath(inv);
      window.supabaseClient.storage.from('invoices').download(path).then(function (res) {
        if (res.data) { saveBlob(res.data); return; }
        // fallback — súbor v Storage chýba, vygenerujeme nanovo z dát riadku
        generateAndStorePdf(inv, project).then(function () {
          window.invoicePdf.generate(invoiceRowToPdfData(inv, project)).then(saveBlob);
        }).catch(function (e) { done(); window.alert('PDF sa nepodarilo získať: ' + (e && e.message ? e.message : e)); });
      });
    }

    function loadProjectInvoices(projectId) {
      var el = document.getElementById('pd-invoices-list');
      if (!el) return;
      window.supabaseClient
        .from('invoices')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .then(function (res) {
          if (res.error) {
            el.innerHTML = '<p style="color:var(--ink-faint);">Faktúry sa nepodarilo načítať: ' + escapeHtml(res.error.message) + '</p>';
            return;
          }
          var rows = res.data || [];
          var project = currentProjects.filter(function (p) { return p.id === projectId; })[0];
          renderInvoicesList(el, rows, project);
        });
    }

    function renderInvoicesList(el, rows, project) {
      if (!rows.length) {
        el.innerHTML = '<p style="color:var(--ink-faint);">Zatiaľ žiadne faktúry.</p>';
        return;
      }
      var statusKeys = ['vystavena', 'zaplatena', 'po_splatnosti'];
      var html = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
        '<th>Číslo</th><th>Vystavená</th><th>Splatnosť</th><th>Suma</th><th>Status</th><th></th>' +
        '</tr></thead><tbody>';
      for (var i = 0; i < rows.length; i++) {
        var inv = rows[i];
        var st = INVOICE_STATUS[inv.status] || { label: inv.status, cls: '' };
        var sel = '<select class="inv-status-select" data-id="' + inv.id + '" data-current="' + inv.status + '">';
        for (var k = 0; k < statusKeys.length; k++) {
          sel += '<option value="' + statusKeys[k] + '"' + (statusKeys[k] === inv.status ? ' selected' : '') + '>' + INVOICE_STATUS[statusKeys[k]].label + '</option>';
        }
        sel += '</select>';
        html += '<tr>' +
          '<td>' + escapeHtml(inv.cislo_faktury) + '</td>' +
          '<td>' + formatDateShort(inv.datum_vystavenia) + '</td>' +
          '<td>' + (inv.datum_splatnosti ? formatDateShort(inv.datum_splatnosti) : '—') + '</td>' +
          '<td>' + money(inv.celkova_suma) + '</td>' +
          '<td>' + sel + '</td>' +
          '<td><button type="button" class="btn btn-ghost inv-pdf-btn" data-id="' + inv.id + '">Stiahnuť PDF</button></td>' +
        '</tr>';
      }
      html += '</tbody></table></div>';
      el.innerHTML = html;

      var byId = {};
      for (var r = 0; r < rows.length; r++) byId[rows[r].id] = rows[r];

      var selects = el.querySelectorAll('.inv-status-select');
      for (var s2 = 0; s2 < selects.length; s2++) {
        selects[s2].addEventListener('change', function () {
          var sel2 = this, id = sel2.getAttribute('data-id'), prev = sel2.getAttribute('data-current'), next = sel2.value;
          sel2.disabled = true;
          window.supabaseClient.from('invoices').update({ status: next }).eq('id', id).select().then(function (res) {
            sel2.disabled = false;
            if (res.error || !res.data || !res.data.length) {
              window.alert('Status faktúry sa nepodarilo zmeniť' + (res.error ? ': ' + res.error.message : '.'));
              sel2.value = prev; return;
            }
            sel2.setAttribute('data-current', next);
            if (byId[id]) byId[id].status = next;
          });
        });
      }

      var pdfBtns = el.querySelectorAll('.inv-pdf-btn');
      for (var b = 0; b < pdfBtns.length; b++) {
        pdfBtns[b].addEventListener('click', function () {
          downloadInvoicePdf(byId[this.getAttribute('data-id')], project, this);
        });
      }
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
