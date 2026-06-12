/* ═══ Orbit — Timer ═══ */

function formatTimerTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatTimerTimeFull(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function toggleCardTimer(taskId) {
  if (timerTaskId === taskId && timerRunning) {
    pauseTimer();
  } else if (timerTaskId === taskId && !timerRunning && timerElapsed > 0) {
    resumeTimer();
  } else {
    if (timerRunning) stopTimer();
    startTimerForTask(taskId);
  }
  if (currentView === 'kanban') renderKanban();
  if (currentView === 'timer') renderTimerView();
}

function startTimerForTask(taskId) {
  timerTaskId = taskId;
  timerRunning = true;
  timerElapsed = 0;
  timerStartTs = Date.now();
  timerEntryId = null;
  api('POST', '/time-entries', { taskId, startTime: Date.now(), endTime: null, duration: 0 })
    .then(entry => { timerEntryId = entry.id; })
    .catch(() => {});
  startTimerTick();
  saveTimerState();
  showToast('Таймер запущен', 'success', 1500);
}

function pauseTimer() {
  if (!timerRunning) return;
  timerRunning = false;
  timerElapsed += Math.floor((Date.now() - timerStartTs) / 1000);
  timerStartTs = null;
  clearInterval(timerInterval);
  updateTimerDisplay();
  saveTimerState();
  showToast('Таймер на паузе', 'info', 1500);
}

function resumeTimer() {
  if (timerRunning || !timerTaskId) return;
  timerRunning = true;
  timerStartTs = Date.now();
  startTimerTick();
  saveTimerState();
  showToast('Таймер возобновлён', 'success', 1500);
}

function stopTimer() {
  if (timerRunning) {
    timerElapsed += Math.floor((Date.now() - timerStartTs) / 1000);
    timerRunning = false;
    timerStartTs = null;
    clearInterval(timerInterval);
  }
  if (timerElapsed > 0 && timerTaskId) {
    const task = tasks.find(t => t.id === timerTaskId);
    if (task) {
      task.actualTime = (task.actualTime || 0) + timerElapsed;
      api('PUT', '/tasks/' + task.id, { actualTime: task.actualTime }).catch(() => {});
    }
    if (timerEntryId) {
      api('PUT', '/time-entries/' + timerEntryId, { endTime: Date.now(), duration: timerElapsed }).catch(() => {});
    }
    timerSessions.unshift({ taskId: timerTaskId, duration: timerElapsed, date: new Date().toISOString() });
    if (timerSessions.length > 50) timerSessions = timerSessions.slice(0, 50);
    saveUIPref('timerSessions', timerSessions);
    showToast(`Затрекано: ${formatTimerTime(timerElapsed)}`, 'success', 2000);
  }
  timerElapsed = 0;
  timerTaskId = null;
  timerEntryId = null;
  saveTimerState();
  updateTimerDisplay();
  if (currentView === 'kanban') renderKanban();
  if (currentView === 'timer') renderTimerView();
}

function stopCardTimer() { stopTimer(); }

function startTimerTick() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    updateTimerDisplay();
    if (currentView === 'kanban') {
      const card = document.querySelector(`.kanban-card[data-id="${timerTaskId}"] .timer-time`);
      if (card) card.textContent = formatTimerTime(timerElapsed + Math.floor((Date.now() - timerStartTs) / 1000));
    }
  }, 500);
}

function updateTimerDisplay() {
  const total = timerElapsed + (timerRunning && timerStartTs ? Math.floor((Date.now() - timerStartTs) / 1000) : 0);
  const disp = $('timer-display');
  if (disp) disp.textContent = formatTimerTimeFull(total);
  const taskName = $('timer-task-name');
  if (taskName) {
    const t = tasks.find(x => x.id === timerTaskId);
    taskName.textContent = t ? t.title : 'Выберите задачу';
  }
  const startBtn = $('timer-start');
  const pauseBtn = $('timer-pause');
  const stopBtn = $('timer-stop');
  if (startBtn) startBtn.style.display = timerRunning ? 'none' : 'inline-flex';
  if (pauseBtn) pauseBtn.style.display = timerRunning ? 'inline-flex' : 'none';
  if (stopBtn) stopBtn.style.display = (timerRunning || timerElapsed > 0) ? 'inline-flex' : 'none';
}

function renderTimerView() {
  updateTimerDisplay();
  const searchVal = ($('timer-task-search')?.value || '').toLowerCase();
  const activeTasks = tasks.filter(t => t.status !== 'done');
  const filtered = searchVal ? activeTasks.filter(t => t.title.toLowerCase().includes(searchVal) || (t.tags || []).some(tg => tg.toLowerCase().includes(searchVal))) : activeTasks;
  $('timer-task-list').innerHTML = filtered.slice(0, 30).map(t => {
    const isActive = timerTaskId === t.id;
    const statusColor = STATUS_COLORS[t.status] || '#999';
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;cursor:pointer;transition:all .15s;border:1px solid ${isActive ? 'var(--accent)' : 'var(--border-soft)'};background:${isActive ? 'var(--accent-soft)' : 'var(--bg-secondary)'};margin-bottom:6px" onclick="startTimerForTask('${t.id}');renderTimerView()">
      <span style="width:8px;height:8px;border-radius:50%;background:${statusColor};flex-shrink:0"></span>
      <span style="flex:1;font-size:13px;font-weight:500;color:var(--text-primary)">${esc(t.title)}${t.parentId ? ' <span class="parent-badge-inline">⬆</span>' : ''}</span>
      <span style="font-size:11px;color:var(--text-tertiary)">${t.estimate || 30}мин</span>
    </div>`;
  }).join('') || '<div style="text-align:center;padding:20px;color:var(--text-tertiary)">Нет активных задач</div>';

  $('timer-history-list').innerHTML = timerSessions.slice(0, 10).map(s => {
    const t = tasks.find(x => x.id === s.taskId);
    const date = new Date(s.date);
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;margin-bottom:4px;background:var(--bg-secondary);border:1px solid var(--border-soft);font-size:12px">
      <span style="flex:1;color:var(--text-primary)">${t ? esc(t.title) : 'Удалена'}</span>
      <span style="font-family:JetBrains Mono,monospace;color:var(--accent);font-weight:600">${formatTimerTime(s.duration)}</span>
      <span style="color:var(--text-tertiary)">${date.toLocaleDateString('ru-RU')} ${date.toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'})}</span>
    </div>`;
  }).join('') || '<div style="text-align:center;padding:20px;color:var(--text-tertiary)">Нет записей</div>';
}
