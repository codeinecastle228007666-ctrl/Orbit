/* ═══ Orbit — Event Handlers, Help, AI Chat ═══ */

function initEvents() {
  // Navigation
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Theme select
  $('theme-select').addEventListener('change', function () {
    settings.theme = this.value;
    applyTheme();
    api('PUT', '/settings', { theme: settings.theme }).catch(e => console.error('Theme save error:', e));
  });

  // Toggle archive
  const btnArch = $('btn-toggle-archived');
  if (btnArch) btnArch.addEventListener('click', async () => {
    showArchived = !showArchived;
    btnArch.classList.toggle('active', showArchived);
    tasks = await api('GET', '/tasks' + (showArchived ? '?all=true' : ''));
    renderKanban();
    showToast(showArchived ? 'Архив показан' : 'Архив скрыт', 'info', 1500);
  });

  // New task
  $('btn-new-task').addEventListener('click', () => openTaskModal(null));

  // Modal save/cancel/delete
  $('btn-modal-save').addEventListener('click', saveTask);
  $('btn-modal-cancel').addEventListener('click', closeTaskModal);
  $('btn-modal-delete').onclick = () => { if (editingTaskId) deleteTask(editingTaskId); };
  $('task-modal').addEventListener('click', e => { if (e.target === $('task-modal')) closeTaskModal(); });

  // Comment
  let commentSubmitting = false;
  $('btn-add-comment').addEventListener('click', async () => {
    if (commentSubmitting) return;
    const inp = $('comment-input');
    const text = inp.value.trim();
    if (!text || !editingTaskId) return;
    commentSubmitting = true;
    const btn = $('btn-add-comment');
    btn.disabled = true;
    btn.textContent = '...';
    try {
      await api('POST', '/comments', { taskId: editingTaskId, text });
      inp.value = '';
      const comments = await api('GET', '/comments/' + editingTaskId);
      $('comments-list').innerHTML = comments.map(c => {
        const dt = new Date(c.timestamp);
        const time = String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
        return `<div style="display:flex;gap:8px;padding:6px 8px;border-radius:6px;margin-bottom:4px;background:var(--bg-tertiary);font-size:12px">
          <span style="flex:1;color:var(--text-primary)">${esc(c.text)}</span>
          <span style="color:var(--text-tertiary);font-family:JetBrains Mono,monospace;font-size:10px">${time}</span>
        </div>`;
      }).join('') || '<div style="font-size:12px;color:var(--text-tertiary)">Нет комментариев</div>';
      showToast('Комментарий добавлен', 'success');
    } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
    finally { commentSubmitting = false; btn.disabled = false; btn.textContent = 'Отпр.'; }
  });

  // Kanban search
  $('kanban-search').addEventListener('input', () => renderKanban());

  // Kanban filter chips
  document.querySelectorAll('.kanban-toolbar .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.kanban-toolbar .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      kanbanFilter = chip.dataset.filter;
      renderKanban();
    });
  });

  // Notes search
  const notesSearch = $('notes-search');
  if (notesSearch) notesSearch.addEventListener('input', () => { noteSearch = notesSearch.value.toLowerCase(); renderNotes(); });

  // New note
  $('btn-new-note').addEventListener('click', async () => {
    try {
      const note = await api('POST', '/notes', { title: 'Новая заметка', content: '' });
      notes.unshift(note);
      editingNoteId = note.id;
      renderNotes();
      showToast('Заметка создана', 'success');
    } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
  });

  // Daily notes
  $('dn-prev').addEventListener('click', () => shiftDNDate(-1));
  $('dn-next').addEventListener('click', () => shiftDNDate(1));
  $('dn-today').addEventListener('click', () => { dailyNotesDate = todayStr(); renderDailyNotes(); });
  $('daily-notes-content').addEventListener('input', scheduleDailyNotesSave);

  // Schedule navigation
  $('sch-prev').addEventListener('click', () => { scheduleDate = new Date(new Date(scheduleDate + 'T00:00:00').getTime() - 86400000).toISOString().slice(0, 10); renderSchedule(); });
  $('sch-next').addEventListener('click', () => { scheduleDate = new Date(new Date(scheduleDate + 'T00:00:00').getTime() + 86400000).toISOString().slice(0, 10); renderSchedule(); });
  $('sch-today').addEventListener('click', () => { scheduleDate = todayStr(); renderSchedule(); });

  // AI schedule
  $('btn-ai-schedule').addEventListener('click', async () => {
    const btn = $('btn-ai-schedule');
    btn.disabled = true; btn.textContent = '⏳ Распределяю...';
    try {
      const taskIds = tasks.filter(t => t.status !== 'done').slice(0, 10).map(t => t.id);
      const data = await api('POST', '/ai/schedule', { date: scheduleDate, taskIds, workStart: settings.workStart || '09:00', workEnd: settings.workEnd || '18:00', slotDuration: parseInt(settings.slotDuration) || 30, aiKey: settings.aiKey || '' });
      for (const s of (data.schedule || [])) {
        await api('POST', '/schedule', { date: scheduleDate, taskId: s.taskId, start: s.start, end: s.end });
      }
      schedule = await api('GET', '/schedule');
      renderSchedule();
      showToast('Расписание сгенерировано', 'success');
    } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
    btn.disabled = false; btn.innerHTML = '<span data-icon="sparkle"></span>AI-расписание';
    hydrateIcons(btn);
  });

  // Calendar navigation
  $('cal-prev').addEventListener('click', () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); renderCalendar(); });
  $('cal-next').addEventListener('click', () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); renderCalendar(); });
  $('cal-today').addEventListener('click', () => { calendarMonth = new Date(); renderCalendar(); });

  // Graph buttons
  const btnReset = $('btn-graph-reset');
  if (btnReset) btnReset.addEventListener('click', () => {
    gLocalNode = null; gTx = { x: 0, y: 0, s: 1 }; gFilterStatus = { backlog: true, todo: true, review: true, done: true };
    document.querySelectorAll('#graph-filter-bar .filter-chip').forEach(c => c.classList.add('active'));
    renderGraph();
  });
  const graphLocalBtn = $('btn-graph-local');
  if (graphLocalBtn) {
    graphLocalBtn.addEventListener('click', () => {
      if (gLocalNode) { gLocalNode = null; renderGraph(); graphLocalBtn.style.display = 'none'; }
    });
  }
  const btnSpread = $('btn-graph-spread');
  if (btnSpread) btnSpread.addEventListener('click', spreadGraph);
  const btnStraight = $('btn-graph-straight');
  if (btnStraight) btnStraight.addEventListener('click', () => { gStraightEdges = !gStraightEdges; renderGraph(); });
  const btnExport = $('btn-graph-export');
  if (btnExport) btnExport.addEventListener('click', () => {
    const svg = document.querySelector('#graph-svg');
    if (!svg) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'graph.svg'; a.click();
    URL.revokeObjectURL(url);
    showToast('SVG экспортирован', 'success');
  });
  const btnOrganize = $('btn-graph-organize');
  if (btnOrganize) btnOrganize.addEventListener('click', async () => {
    btnOrganize.disabled = true; btnOrganize.textContent = '⏳ Анализирую...';
    try {
      const data = await api('POST', '/ai/organize', { aiKey: settings.aiKey || '' });
      const newLinks = data.links || [];
      if (newLinks.length === 0) {
        showToast('Связи не найдены — задачи уже хорошо организованы', 'info');
      } else {
        let added = 0;
        for (const l of newLinks) {
          try { await api('POST', '/links', l); added++; } catch (_) {}
        }
        showToast(`Добавлено ${added} связей`, 'success');
      }
      links = await api('GET', '/links');
      renderGraph();
    } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
    finally { btnOrganize.disabled = false; btnOrganize.innerHTML = '<span data-icon="sparkle"></span>AI-организация'; hydrateIcons(btnOrganize); }
  });
  // Camera history
  $('btn-camera-back')?.addEventListener('click', cameraBack);
  $('btn-camera-forward')?.addEventListener('click', cameraForward);
  // Zoom buttons
  $('btn-zoom-in')?.addEventListener('click', () => {
    const container = $('graph-container');
    const mx = container.clientWidth / 2, my = container.clientHeight / 2;
    const ns = Math.min(4, gTx.s * 1.25);
    const tx = mx - (mx - gTx.x) * (ns / gTx.s);
    const ty = my - (my - gTx.y) * (ns / gTx.s);
    gZoomAnim = { tx, ty, ts: ns, start: performance.now(), fromX: gTx.x, fromY: gTx.y, fromS: gTx.s };
    saveCameraState(); startGraphRenderLoop();
  });
  $('btn-zoom-out')?.addEventListener('click', () => {
    const container = $('graph-container');
    const mx = container.clientWidth / 2, my = container.clientHeight / 2;
    const ns = Math.max(0.2, gTx.s * 0.8);
    const tx = mx - (mx - gTx.x) * (ns / gTx.s);
    const ty = my - (my - gTx.y) * (ns / gTx.s);
    gZoomAnim = { tx, ty, ts: ns, start: performance.now(), fromX: gTx.x, fromY: gTx.y, fromS: gTx.s };
    saveCameraState(); startGraphRenderLoop();
  });

  // Settings
  $('work-start').addEventListener('change', function () { api('PUT', '/settings', { workStart: this.value }); settings.workStart = this.value; });
  $('work-end').addEventListener('change', function () { api('PUT', '/settings', { workEnd: this.value }); settings.workEnd = this.value; });
  $('slot-duration').addEventListener('change', function () { api('PUT', '/settings', { slotDuration: this.value }); settings.slotDuration = this.value; });
  $('ai-key').addEventListener('change', function () { api('PUT', '/settings', { aiKey: this.value }); settings.aiKey = this.value; });

  // Backup
  const btnBackup = $('btn-backup');
  if (btnBackup) btnBackup.addEventListener('click', async () => {
    try {
      await api('POST', '/api/backups');
      showToast('Бекап создан', 'success');
    } catch (e) { showToast('Ошибка бекапа', 'error'); }
  });

  // Export
  $('btn-export').addEventListener('click', async () => {
    const data = { tasks, schedule, notes, settings, links };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'orbit-export.json';
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('Экспорт сохранён', 'success');
  });

  // Import
  $('btn-import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async function () {
    const file = this.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.tasks) await api('POST', '/import', data);
      tasks = await api('GET', '/tasks');
      schedule = await api('GET', '/schedule');
      notes = await api('GET', '/notes');
      settings = await api('GET', '/settings');
      links = await api('GET', '/links');
      activity = await api('GET', '/activity?days=14');
      applyTheme(); applySettingsUI(); rerender();
      showToast('Данные импортированы', 'success');
    } catch (e) { showToast('Ошибка импорта: ' + e.message, 'error'); }
    this.value = '';
  });

  // Clear all
  $('btn-clear').addEventListener('click', () => {
    confirmAction('Удалить ВСЕ данные? Это действие необратимо.', async () => {
      try {
        await api('DELETE', '/clear');
        tasks = []; schedule = {}; notes = []; links = [];
        activity = await api('GET', '/activity?days=14');
        rerender();
        showToast('Данные очищены', 'success');
      } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
    }, { danger: true, okLabel: 'Удалить всё' });
  });

  // Help
  $('btn-help').addEventListener('click', showHelp);

  // Focus player toggle
  $('btn-player').addEventListener('click', () => {
    if (!playerPanel) buildPlayerPanel();
    playerPanel.style.display = playerPanel.style.display === 'none' ? 'block' : 'none';
  });

  // Timer buttons
  $('timer-start').addEventListener('click', () => {
    if (timerTaskId) { resumeTimer(); renderTimerView(); }
    else showToast('Выберите задачу', 'warning');
  });
  $('timer-pause').addEventListener('click', () => { pauseTimer(); renderTimerView(); });
  $('timer-stop').addEventListener('click', () => { stopTimer(); renderTimerView(); });
  $('timer-task-search').addEventListener('input', () => renderTimerView());

  // Pomodoro in modal
  $('btn-pomodoro-start').addEventListener('click', () => {
    if (editingTaskId) {
      startTimerForTask(editingTaskId);
      openTaskModal(tasks.find(t => t.id === editingTaskId));
    }
  });
  $('btn-pomodoro-pause').addEventListener('click', () => { pauseTimer(); openTaskModal(tasks.find(t => t.id === timerTaskId)); });
  $('btn-pomodoro-stop').addEventListener('click', () => { stopTimer(); if (editingTaskId) openTaskModal(tasks.find(t => t.id === editingTaskId)); });

  // Global hotkeys
  document.addEventListener('keydown', e => {
    const tag = e.target.tagName;
    const modalEl = $('task-modal');
    const modalOpen = modalEl && modalEl.classList.contains('open');
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (e.key === 'Escape' && modalOpen) closeTaskModal();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && modalOpen) { e.preventDefault(); saveTask(); }
      return;
    }
    if (e.key === 'Escape') { closeTaskModal(); return; }
    if (e.key === '1') { e.preventDefault(); switchView('dashboard'); }
    if (e.key === '2') { e.preventDefault(); switchView('kanban'); }
    if (e.key === '3') { e.preventDefault(); switchView('graph'); }
    if (e.key === '4') { e.preventDefault(); switchView('schedule'); }
    if (e.key === '5') { e.preventDefault(); switchView('notes'); }
    if (e.key === '6') { e.preventDefault(); switchView('timer'); }
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); switchView('kanban'); openTaskModal(null); }
    if (e.key === 'g' || e.key === 'G') { e.preventDefault(); switchView('graph'); }
    if (e.key === 't' || e.key === 'T') { e.preventDefault(); switchView('timer'); }
    if (e.key === 'k' || e.key === 'K') { e.preventDefault(); switchView('kanban'); }
    if (e.key === '/') { e.preventDefault(); switchView('kanban'); setTimeout(() => $('kanban-search')?.focus(), 200); }
    if (e.key === '?') { e.preventDefault(); showHelp(); }
    if (e.key === ' ' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); toggleAIChat(); }
  });

  // Kanban card action delegation (capture-phase click bypasses drag suppression)
  const board = $('kanban-board');
  if (board) {
    board.addEventListener('click', e => {
      const card = e.target.closest('.kanban-card');
      if (!card) return;
      const task = tasks.find(x => x.id === card.dataset.id);
      if (!task) return;
      const btn = e.target.closest('button');
      if (btn) {
        e.stopPropagation();
        if (btn.matches('.btn-card-edit')) { openTaskModal(task); return; }
        if (btn.matches('.btn-card-delete')) { deleteTask(task.id); return; }
        if (btn.matches('.btn-card-restore')) { restoreTask(task.id); return; }
        if (btn.matches('.btn-card-timer-toggle')) { toggleCardTimer(task.id); return; }
        if (btn.matches('.btn-card-timer-stop')) { stopCardTimer(); return; }
        if (btn.matches('.btn-card-focus')) { focusGraphTask(task.id); return; }
        if (btn.matches('.btn-card-queue-toggle')) { toggleTimerQueue(task.id); renderKanban(); return; }
      }
      openTaskModal(task);
    }, true);
  }

  // Start focus player hidden
  setTimeout(() => { buildPlayerPanel(); }, 2000);
}

function showHelp() {
  api('POST', '/activity/trigger', { trigger: 'hidden_panic' }).catch(() => {});
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.style.cssText = 'z-index:300';
  overlay.innerHTML = `<div class="modal" style="max-width:600px;max-height:80vh;overflow-y:auto;padding:28px 32px">
    <h2 style="margin-bottom:4px">Справка Orbit</h2>
    <p style="font-size:12px;color:var(--text-secondary);margin-bottom:20px">Канбан, расписание, заметки, граф связей, AI, таймер задач.</p>
    <div class="divider"></div>
    <h3 style="font-size:13px;margin-bottom:12px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px">Горячие клавиши</h3>
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:7px 16px;font-size:12px">
      <code style="color:var(--accent);font-weight:600">1-5</code><span>Переключение вкладок</span>
      <code style="color:var(--accent);font-weight:600">N</code><span>Новая задача</span>
      <code style="color:var(--accent);font-weight:600">T</code><span>Таймер задач</span>
      <code style="color:var(--accent);font-weight:600">G</code><span>Граф</span>
      <code style="color:var(--accent);font-weight:600">K</code><span>Канбан</span>
      <code style="color:var(--accent);font-weight:600">/</code><span>Поиск на канбане</span>
      <code style="color:var(--accent);font-weight:600">?</code><span>Эта справка</span>
      <code style="color:var(--accent);font-weight:600">Ctrl+Enter</code><span>Сохранить задачу</span>
      <code style="color:var(--accent);font-weight:600">Ctrl+Space</code><span>AI чат</span>
      <code style="color:var(--accent);font-weight:600">Esc</code><span>Закрыть</span>
    </div>
    <div class="divider"></div>
    <h3 style="font-size:13px;margin-bottom:10px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px">⏱ Таймер</h3>
    <p style="font-size:12px;color:var(--text-secondary);line-height:1.6">Выделите таймер на карточке задачи или перейдите на вкладку «Таймер». Старт, пауза, стоп — время записывается в базу.</p>
    <div class="divider"></div>
    <h3 style="font-size:13px;margin-bottom:10px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px">🎧 Фокус-плеер</h3>
    <p style="font-size:12px;color:var(--text-secondary);line-height:1.6">Lo-fi, шум дождя, океан, камин и др. Аудио генерируется через Web Audio API.</p>
    <div style="margin-top:20px;display:flex;justify-content:flex-end"><button class="btn btn-primary" onclick="this.closest('.confirm-overlay').remove()">Понятно</button></div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

/* ═══ AI CHAT ═══ */
function toggleAIChat() {
  let panel = document.querySelector('#ai-chat-panel');
  if (!panel) { panel = buildAIChatPanel(); }
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) {
    setTimeout(() => panel.querySelector('input')?.focus(), 300);
  }
}

function buildAIChatPanel() {
  const panel = document.createElement('div');
  panel.id = 'ai-chat-panel';
  panel.className = 'aichat-panel';
  panel.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid var(--border-soft)">
    <h3 style="font-size:14px;font-weight:600;color:var(--text-primary);flex:1">🤖 AI Ассистент</h3>
    <button class="btn btn-sm btn-icon" id="ach-close">✕</button>
  </div>
  <div id="ach-messages" style="flex:1;overflow-y:auto;padding:16px 18px"></div>
  <div style="padding:12px 18px;border-top:1px solid var(--border-soft);display:flex;gap:8px">
    <input type="text" id="ach-input" placeholder="Спросите что-нибудь..." style="flex:1">
    <button class="btn btn-primary btn-sm" id="ach-send">→</button>
  </div>`;
  document.body.appendChild(panel);

  const input = panel.querySelector('#ach-input');
  const sendBtn = panel.querySelector('#ach-send');
  const msgs = panel.querySelector('#ach-messages');

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    msgs.innerHTML += `<div class="ach-msg user"><div class="ach-avatar">👤</div><div class="ach-bubble">${esc(text)}</div></div>`;
    msgs.innerHTML += '<div id="ach-typing" class="ach-msg ai"><div class="ach-avatar">🤖</div><div class="ach-bubble"><em>Печатает...</em></div></div>';
    msgs.scrollTop = msgs.scrollHeight;
    try {
      const data = await api('POST', '/ai/chat', { message: text, aiKey: settings.aiKey || '' });
      document.querySelector('#ach-typing')?.remove();
      msgs.innerHTML += `<div class="ach-msg ai"><div class="ach-avatar">🤖</div><div class="ach-bubble">${esc(data.reply)}</div></div>`;
    } catch (e) {
      document.querySelector('#ach-typing')?.remove();
      msgs.innerHTML += `<div class="ach-msg ai"><div class="ach-avatar">🤖</div><div class="ach-bubble">Ошибка: ${esc(e.message)}</div></div>`;
    }
    msgs.scrollTop = msgs.scrollHeight;
  }

  sendBtn.onclick = send;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
  panel.querySelector('#ach-close').onclick = () => panel.classList.remove('open');

  return panel;
}
