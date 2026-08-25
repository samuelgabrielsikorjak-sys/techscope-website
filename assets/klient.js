// TECH-SCOPE — klient.html: prihlásenie (Supabase Auth) a portál pre
// klientov (projekty, priebeh, aktualizácie, dokumenty, otázky).
//
// Prístup k dátam ide výhradne cez RLS politiky pre rolu "authenticated"
// (viď supabase-schema.sql, sekcia "klient.html — portál pre klientov") —
// tento súbor nikdy neposiela žiadny explicitný "WHERE client_id = ..."
// filter na projects, pretože ho netreba: RLS ho vynúti na úrovni
// databázy aj keby ho niekto z konzoly obišiel. Filter na project_id pri
// načítavaní updates/documents/questions je tu len kvôli prehľadnosti
// dotazu (menej riadkov cez sieť) — bezpečnosť zabezpečuje výhradne RLS.

(function () {
  var PRODUKT_LABELS = {
    data_compass: 'Data Compass',
    web_mobile: 'Web & Mobilné aplikácie',
    softver_na_mieru: 'Softvér na mieru',
    ai_riesenia: 'AI riešenia'
  };
  var STATUS_LABELS = { aktivny: 'Aktívny', pozastaveny: 'Pozastavený', dokonceny: 'Dokončený' };

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
    var portalSection = document.getElementById('portal-section');
    var navActions = document.getElementById('klient-nav-actions');

    if (!window.supabaseClient) {
      loginSection.innerHTML = '<div class="container" style="max-width:420px;"><p>Portál sa nepodarilo načítať. Skúste to prosím neskôr.</p></div>';
      return;
    }

    var loginForm = document.getElementById('login-form');
    var loginError = document.getElementById('login-error');
    var loginSubmit = document.getElementById('login-submit');

    function showLoggedOut() {
      loginSection.style.display = '';
      portalSection.style.display = 'none';
      navActions.innerHTML = '';
    }

    function showLoggedIn() {
      loginSection.style.display = 'none';
      portalSection.style.display = '';
      navActions.innerHTML = '<button type="button" class="btn btn-ghost" id="logout-btn">Odhlásiť sa</button>';
      document.getElementById('logout-btn').addEventListener('click', function () {
        window.supabaseClient.auth.signOut();
      });
      loadProjects();
    }

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
          loginError.textContent = 'Nesprávny email alebo heslo. Skúste to prosím znova.';
          loginError.classList.add('show');
        }
        // úspech: onAuthStateChange nižšie prepne na portál sám
      }).catch(function () {
        loginSubmit.disabled = false;
        loginSubmit.textContent = 'Prihlásiť sa';
        loginError.textContent = 'Prihlásenie sa nepodarilo. Skúste to prosím znova.';
        loginError.classList.add('show');
      });
    });

    window.supabaseClient.auth.onAuthStateChange(function (event, session) {
      if (session) showLoggedIn(); else showLoggedOut();
    });
    window.supabaseClient.auth.getSession().then(function (res) {
      if (res.data && res.data.session) showLoggedIn(); else showLoggedOut();
    });

    // ---------- portál ----------

    function loadProjects() {
      portalSection.innerHTML = '<div class="container"><p>Načítavam vaše projekty…</p></div>';

      window.supabaseClient
        .from('projects')
        .select('id,nazov_projektu,sluzba,status,faza,created_at')
        .order('created_at', { ascending: false })
        .then(function (res) {
          if (res.error) {
            portalSection.innerHTML = '<div class="container" style="max-width:600px;"><p>Projekty sa nepodarilo načítať. Skúste to prosím znova alebo nám napíšte na <a href="mailto:contact@techscope.sk">contact@techscope.sk</a>.</p></div>';
            return;
          }
          var projects = res.data || [];
          if (!projects.length) {
            portalSection.innerHTML =
              '<div class="container" style="max-width:600px;">' +
                '<div class="section-head" style="text-align:left; margin-bottom:0;">' +
                  '<div class="eyebrow">Váš portál</div>' +
                  '<h2>Zatiaľ tu nič nie je</h2>' +
                '</div>' +
                '<p style="color:var(--ink-soft);">K vášmu účtu momentálne nie je priradený žiadny projekt. Ak si myslíte, že ide o chybu, napíšte nám na <a href="mailto:contact@techscope.sk">contact@techscope.sk</a>.</p>' +
              '</div>';
            return;
          }
          if (projects.length === 1) {
            renderProject(projects[0]);
          } else {
            renderProjectPicker(projects);
          }
        });
    }

    function renderProjectPicker(projects) {
      var html =
        '<div class="container" style="max-width:720px;">' +
          '<div class="section-head" style="text-align:left;">' +
            '<div class="eyebrow">Váš portál</div>' +
            '<h2>Vaše projekty</h2>' +
          '</div>' +
          '<div style="display:flex; flex-direction:column; gap:10px;">';
      for (var i = 0; i < projects.length; i++) {
        var p = projects[i];
        html +=
          '<button type="button" class="project-pick-btn" data-index="' + i + '">' +
            '<strong>' + escapeHtml(p.nazov_projektu) + '</strong>' +
            '<span>' + escapeHtml(PRODUKT_LABELS[p.sluzba] || p.sluzba) + '</span>' +
          '</button>';
      }
      html += '</div></div>';
      portalSection.innerHTML = html;

      var btns = portalSection.querySelectorAll('.project-pick-btn');
      for (var b = 0; b < btns.length; b++) {
        btns[b].addEventListener('click', function () {
          renderProject(projects[parseInt(this.getAttribute('data-index'), 10)]);
        });
      }
    }

    function renderProject(project) {
      portalSection.innerHTML =
        '<div class="container" style="max-width:720px;">' +
          '<div class="portal-card">' +
            '<div class="portal-header">' +
              '<div>' +
                '<h2>' + escapeHtml(project.nazov_projektu) + '</h2>' +
                '<div class="portal-service">' + escapeHtml(PRODUKT_LABELS[project.sluzba] || project.sluzba) + '</div>' +
              '</div>' +
              '<span class="status-badge ' + project.status + '">' + (STATUS_LABELS[project.status] || project.status) + '</span>' +
            '</div>' +
            renderPhaseTracker(project.faza) +
          '</div>' +

          '<div class="portal-card">' +
            '<div class="section-head" style="text-align:left; margin-bottom:16px;">' +
              '<h3 style="margin:0;">Aktualizácie</h3>' +
            '</div>' +
            '<div id="updates-list"><p style="color:var(--ink-faint);">Načítavam…</p></div>' +
          '</div>' +

          '<div class="portal-card">' +
            '<div class="section-head" style="text-align:left; margin-bottom:16px;">' +
              '<h3 style="margin:0;">Dokumenty</h3>' +
            '</div>' +
            '<div id="documents-list"><p style="color:var(--ink-faint);">Načítavam…</p></div>' +
          '</div>' +

          '<div class="portal-card">' +
            '<div class="section-head" style="text-align:left; margin-bottom:16px;">' +
              '<h3 style="margin:0;">Doplňujúce otázky</h3>' +
            '</div>' +
            '<div id="questions-list"><p style="color:var(--ink-faint);">Načítavam…</p></div>' +
          '</div>' +
        '</div>';

      loadUpdates(project.id);
      loadDocuments(project.id);
      loadQuestions(project.id);
    }

    function renderPhaseTracker(currentFazaKey) {
      var currentIndex = -1;
      for (var i = 0; i < FAZY.length; i++) { if (FAZY[i].key === currentFazaKey) { currentIndex = i; break; } }
      if (currentIndex === -1) currentIndex = 0;

      var fillPct = FAZY.length > 1 ? (currentIndex / (FAZY.length - 1)) * 100 : 0;
      var html = '<div class="phase-tracker">' +
        '<div class="phase-tracker-line"></div>' +
        '<div class="phase-tracker-fill" style="width:' + fillPct + '%"></div>';

      for (var f = 0; f < FAZY.length; f++) {
        var state = f < currentIndex ? 'is-done' : (f === currentIndex ? 'is-current' : '');
        var dot = f < currentIndex
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>'
          : String(f + 1);
        html +=
          '<div class="phase-step ' + state + '">' +
            '<span class="phase-step-dot">' + dot + '</span>' +
            '<span class="phase-step-label">' + escapeHtml(FAZY[f].label) + '</span>' +
          '</div>';
      }
      html += '</div>';
      return html;
    }

    function loadUpdates(projectId) {
      var el = document.getElementById('updates-list');
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
            html +=
              '<div class="update-row">' +
                '<div class="update-row-date">' + formatDateTime(rows[i].created_at) + '</div>' +
                '<p>' + escapeHtml(rows[i].text) + '</p>' +
              '</div>';
          }
          el.innerHTML = html;
        });
    }

    function loadDocuments(projectId) {
      var el = document.getElementById('documents-list');
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
            html +=
              '<div class="doc-row">' +
                '<div>' +
                  '<div class="doc-row-name">' + escapeHtml(rows[i].nazov) + '</div>' +
                  '<div class="doc-row-date">' + formatDateTime(rows[i].created_at) + '</div>' +
                '</div>' +
                '<button type="button" class="btn btn-ghost doc-download-btn" data-path="' + escapeHtml(rows[i].storage_path) + '">Stiahnuť</button>' +
              '</div>';
          }
          el.innerHTML = html;

          var btns = el.querySelectorAll('.doc-download-btn');
          for (var b = 0; b < btns.length; b++) {
            btns[b].addEventListener('click', function () {
              var path = this.getAttribute('data-path');
              var btn = this;
              var originalText = btn.textContent;
              btn.textContent = 'Pripravujem…';
              btn.disabled = true;
              // 60-minútová platnosť — bucket je privátny, takže bez
              // podpísanej URL sa k súboru inak nedá dostať vôbec.
              window.supabaseClient.storage
                .from('project-documents')
                .createSignedUrl(path, 60 * 60)
                .then(function (res) {
                  btn.textContent = originalText;
                  btn.disabled = false;
                  if (res.error || !res.data) {
                    alert('Súbor sa nepodarilo pripraviť na stiahnutie. Skúste to prosím znova.');
                    return;
                  }
                  window.open(res.data.signedUrl, '_blank');
                });
            });
          }
        });
    }

    function loadQuestions(projectId) {
      var el = document.getElementById('questions-list');
      window.supabaseClient
        .from('project_questions')
        .select('id,otazka,odpoved,zodpovedane,created_at,zodpovedane_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })
        .then(function (res) {
          if (res.error) { el.innerHTML = '<p style="color:var(--ink-faint);">Otázky sa nepodarilo načítať.</p>'; return; }
          renderQuestions(el, projectId, res.data || []);
        });
    }

    function renderQuestions(el, projectId, rows) {
      var open = [];
      var answered = [];
      for (var i = 0; i < rows.length; i++) { (rows[i].zodpovedane ? answered : open).push(rows[i]); }

      var html = '';
      if (!open.length) {
        html += '<p style="color:var(--ink-faint);">Momentálne nemáte žiadne otvorené otázky.</p>';
      } else {
        for (var o = 0; o < open.length; o++) {
          html +=
            '<div class="question-card" data-id="' + open[o].id + '">' +
              '<p class="question-text">' + escapeHtml(open[o].otazka) + '</p>' +
              '<textarea placeholder="Vaša odpoveď…"></textarea>' +
              '<div class="form-banner-error" style="margin:10px 0 0;"></div>' +
              '<button type="button" class="btn btn-primary answer-submit-btn">Odoslať odpoveď</button>' +
            '</div>';
        }
      }
      if (answered.length) {
        html += '<div style="margin-top:24px; padding-top:20px; border-top:1px solid var(--line);">' +
          '<h4 style="margin:0 0 14px; font-size:0.85rem; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-faint);">Zodpovedané</h4>';
        for (var a = 0; a < answered.length; a++) {
          html +=
            '<div class="question-card is-answered">' +
              '<p class="question-text">' + escapeHtml(answered[a].otazka) + '</p>' +
              '<p class="answer-text">' + escapeHtml(answered[a].odpoved || '') + '</p>' +
              '<div class="answered-at">Zodpovedané ' + formatDateTime(answered[a].zodpovedane_at || answered[a].created_at) + '</div>' +
            '</div>';
        }
        html += '</div>';
      }
      el.innerHTML = html;

      var submitBtns = el.querySelectorAll('.answer-submit-btn');
      for (var s = 0; s < submitBtns.length; s++) {
        submitBtns[s].addEventListener('click', function () {
          var card = this.closest('.question-card');
          var textarea = card.querySelector('textarea');
          var banner = card.querySelector('.form-banner-error');
          var btn = this;
          var value = textarea.value.trim();

          banner.classList.remove('show');
          if (!value) {
            banner.textContent = 'Napíšte prosím odpoveď pred odoslaním.';
            banner.classList.add('show');
            return;
          }

          btn.disabled = true;
          btn.textContent = 'Odosielam…';

          window.supabaseClient
            .rpc('odpovedat_na_otazku', { p_question_id: card.getAttribute('data-id'), p_odpoved: value })
            .then(function (res) {
              if (res.error) {
                btn.disabled = false;
                btn.textContent = 'Odoslať odpoveď';
                banner.textContent = 'Odpoveď sa nepodarilo odoslať. Skúste to prosím znova.';
                banner.classList.add('show');
                return;
              }
              loadQuestions(projectId);
            });
        });
      }
    }

    function formatDateTime(value) {
      if (!value) return '';
      var d = new Date(value);
      var label = d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });
      return label + ' · ' + d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
    }

    function escapeHtml(str) {
      var div = document.createElement('div');
      div.textContent = str == null ? '' : str;
      return div.innerHTML;
    }
  });
})();
