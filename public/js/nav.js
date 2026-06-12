/* ═══ Orbit — Navigation, Theme, LoadAll ═══ */

/* ═══ NAVIGATION ═══ */
function switchView(view) {
  if (view !== 'graph') stopGraphIdleAnim();
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  rerender();
  saveUIPref('lastView', view);
  if (view === 'schedule') setTimeout(() => { const el = document.querySelector('.timeline-now'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 120);
}

function rerender() {
  if (currentView === 'dashboard') renderDashboard();
  else if (currentView === 'kanban') renderKanban();
  else if (currentView === 'schedule') renderSchedule();
  else if (currentView === 'notes') renderNotes();
  else if (currentView === 'graph') renderGraph();
  else if (currentView === 'daily-notes') renderDailyNotes();
  else if (currentView === 'calendar') renderCalendar();
  else if (currentView === 'timer') renderTimerView();
  else if (currentView === 'profile') renderProfile();
  hydrateIcons();
}

/* ═══ THEME ═══ */
function applyTheme() {
  const isDark = settings.theme !== 'light';
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  const toggle = $('theme-toggle');
  if (toggle) toggle.checked = isDark;
}

/* ═══ LOAD ALL ═══ */
async function loadAll() {
  let loadingEl = $('loading-overlay');
  if (!loadingEl) {
    loadingEl = document.createElement('div');
    loadingEl.id = 'loading-overlay';
    loadingEl.style.cssText = 'position:fixed;inset:0;background:var(--bg-primary);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px';
    loadingEl.innerHTML = '<div class="spinner"></div><div style="color:var(--text-secondary);font-size:13px">Загрузка...</div>';
    document.body.appendChild(loadingEl);
  }
  loadingEl.style.display = 'flex';
  for (let retry = 0; retry < 3; retry++) {
    try {
      const [t, s, n, st, l, a] = await Promise.all([
        api('GET', '/tasks'), api('GET', '/schedule'), api('GET', '/notes'),
        api('GET', '/settings'), api('GET', '/links'), api('GET', '/activity?days=14')
      ]);
      tasks = t; schedule = s; notes = n; settings = st; links = l; activity = a;
      applyTheme(); applySettingsUI();
      const lastView = loadUIPref('lastView', null);
      if (lastView) switchView(lastView); else rerender();
      restoreTimerState();
      hydrateIcons();
      loadingEl.style.display = 'none';
      return;
    } catch (e) {
      console.error('Load error (attempt ' + (retry + 1) + '):', e);
      if (retry < 2) await new Promise(r => setTimeout(r, 1500));
      else {
        loadingEl.innerHTML = '<div style="color:var(--danger);font-size:24px">⚠</div><div style="color:var(--text-primary);font-size:14px">Не удалось загрузить данные</div><button class="btn btn-primary" onclick="loadAll()">Повторить</button>';
      }
    }
  }
}

function applySettingsUI() {
  if ($('work-start')) $('work-start').value = settings.workStart || '09:00';
  if ($('work-end')) $('work-end').value = settings.workEnd || '18:00';
  if ($('slot-duration')) $('slot-duration').value = settings.slotDuration || '30';
  if ($('ai-key')) $('ai-key').value = settings.aiKey || '';
}
