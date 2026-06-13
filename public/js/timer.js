/* ═══ Orbit — Timer ═══ */

function formatTimerTimeFull(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* ═══ TIMER QUEUE ═══ */
function toggleTimerQueue(taskId) {
  const idx = timerQueue.indexOf(taskId);
  if (idx >= 0) timerQueue.splice(idx, 1);
  else timerQueue.push(taskId);
  saveUIPref('timerQueue', timerQueue);
  renderTimerView();
}

function isInTimerQueue(taskId) { return timerQueue.indexOf(taskId) >= 0; }

function moveQueueItem(from, to) {
  const [item] = timerQueue.splice(from, 1);
  timerQueue.splice(to, 0, item);
  saveUIPref('timerQueue', timerQueue);
  renderTimerView();
}

function clearTimerQueue() {
  timerQueue = [];
  saveUIPref('timerQueue', timerQueue);
  renderTimerView();
}

function toggleCardTimer(taskId) {
  if (timerTaskId === taskId && timerRunning) {
    pauseTimer();
  } else if (timerTaskId === taskId && !timerRunning && timerElapsed > 0) {
    resumeTimer();
  } else {
    if (timerRunning) stopTimer({ silent: true });
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

function stopTimer(opts) {
  opts = opts || {};
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
      api('PUT', '/time-entries/' + timerEntryId, { endTime: Date.now(), duration: timerElapsed }).then(updated => {
        const idx = timeEntries.findIndex(e => e.id === timerEntryId);
        if (idx >= 0) timeEntries[idx] = updated; else timeEntries.unshift(updated);
      }).catch(() => {});
    }
    timerSessions.unshift({ taskId: timerTaskId, duration: timerElapsed, date: new Date().toISOString() });
    if (timerSessions.length > 50) timerSessions = timerSessions.slice(0, 50);
    saveUIPref('timerSessions', timerSessions);
    if (!opts.silent) showToast(`Затрекано: ${formatTimerTime(timerElapsed)}`, 'success', 2000);
  }
  const stoppedTaskId = timerTaskId;
  timerElapsed = 0;
  timerTaskId = null;
  timerEntryId = null;
  saveTimerState();
  updateTimerDisplay();

  // Auto-advance to next task in queue (only on explicit stop, not silent switch)
  if (!opts.silent && stoppedTaskId && timerQueue.length > 0) {
    const qIdx = timerQueue.indexOf(stoppedTaskId);
    if (qIdx >= 0) timerQueue.splice(qIdx, 1);
    saveUIPref('timerQueue', timerQueue);
    if (timerQueue.length > 0) {
      const nextId = timerQueue[0];
      showToast(`→ Далее: ${(tasks.find(t=>t.id===nextId)||{}).title || nextId}`, 'info', 2500);
      setTimeout(() => startTimerForTask(nextId), 800);
    }
  }

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
    const inQueue = isInTimerQueue(t.id);
    const statusColor = STATUS_COLORS[t.status] || '#999';
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;cursor:pointer;transition:all .15s;border:1px solid ${isActive ? 'var(--accent)' : inQueue ? 'var(--accent-glow)' : 'var(--border-soft)'};background:${isActive ? 'var(--accent-soft)' : 'var(--bg-secondary)'};margin-bottom:4px" onclick="startTimerForTask('${t.id}');renderTimerView()">
      <span style="width:8px;height:8px;border-radius:50%;background:${statusColor};flex-shrink:0"></span>
      <span style="flex:1;font-size:13px;font-weight:500;color:var(--text-primary)">${esc(t.title)}${t.parentId ? ' <span class="parent-badge-inline">⬆</span>' : ''}</span>
      <span style="font-size:11px;color:var(--text-tertiary)">${t.estimate || 30}мин</span>
      <button class="btn btn-xs ${inQueue ? 'btn-primary' : 'btn-ghost'}" onclick="event.stopPropagation();toggleTimerQueue('${t.id}')" style="padding:2px 6px;font-size:10px">${inQueue ? '✓' : '+q'}</button>
    </div>`;
  }).join('') || '<div style="text-align:center;padding:20px;color:var(--text-tertiary)">Нет активных задач</div>';

  // Stats summary
  const totalSec = tasks.reduce((s, t) => s + (t.actualTime || 0), 0);
  const today = new Date().toDateString();
  const todayEntries = timeEntries.filter(e => {
    const d = new Date(e.startTime);
    return d.toDateString() === today;
  });
  const todaySec = todayEntries.reduce((s, e) => s + (e.duration || 0), 0);
  const totalDone = tasks.filter(t => t.status === 'done').length;

  // Queue section
  const queueSection = $('timer-queue-section');
  const queueList = $('timer-queue-list');
  if (queueSection && queueList) {
    if (timerQueue.length > 0) {
      queueSection.style.display = 'block';
      $('timer-queue-count').textContent = timerQueue.length;
      queueList.innerHTML = timerQueue.map((qId, qi) => {
        const qt = tasks.find(t => t.id === qId);
        if (!qt) return '';
        return `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;background:var(--bg-tertiary);border:1px solid var(--border-soft);font-size:12px">
          <span style="flex:1;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${qi === 0 ? '▶ ' : ''}${esc(qt.title)}</span>
          <span style="font-size:10px;color:var(--text-tertiary)">${qt.estimate || 30}мин</span>
          <button class="btn btn-xs" style="padding:1px 5px;font-size:10px" onclick="event.stopPropagation();toggleTimerQueue('${qId}');renderTimerView()">✕</button>
        </div>`;
      }).join('');
      $('btn-clear-queue').onclick = clearTimerQueue;
    } else {
      queueSection.style.display = 'none';
    }
  }

  // Show/hide "next task" button
  let nextBtn = $('btn-timer-next');
  const hasQueue = timerQueue.length > 0;
  if (hasQueue) {
    if (!nextBtn) {
      const controls = document.querySelector('#timer-main .btn-lg')?.parentNode;
      if (controls) {
        nextBtn = document.createElement('button');
        nextBtn.id = 'btn-timer-next';
        nextBtn.className = 'btn btn-lg';
        nextBtn.innerHTML = '⏭ Далее';
        nextBtn.title = 'Следующая задача в очереди';
        nextBtn.onclick = () => { stopTimer(); };
        controls.appendChild(nextBtn);
      }
    }
  } else if (nextBtn) {
    nextBtn.remove();
  }

  const statHtml = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
    <div style="background:var(--bg-secondary);border-radius:10px;padding:14px;text-align:center;border:1px solid var(--border-soft)">
      <div style="font-size:18px;font-weight:600;color:var(--accent);font-family:JetBrains Mono,monospace">${formatTimerTime(totalSec)}</div>
      <div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">Всего затрекано</div>
    </div>
    <div style="background:var(--bg-secondary);border-radius:10px;padding:14px;text-align:center;border:1px solid var(--border-soft)">
      <div style="font-size:18px;font-weight:600;color:var(--accent);font-family:JetBrains Mono,monospace">${formatTimerTime(todaySec)}</div>
      <div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">Сегодня</div>
    </div>
    <div style="background:var(--bg-secondary);border-radius:10px;padding:14px;text-align:center;border:1px solid var(--border-soft)">
      <div style="font-size:18px;font-weight:600;color:var(--accent)">${timeEntries.length}</div>
      <div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">Записей</div>
    </div>
    <div style="background:var(--bg-secondary);border-radius:10px;padding:14px;text-align:center;border:1px solid var(--border-soft)">
      <div style="font-size:18px;font-weight:600;color:var(--accent)">${totalDone}</div>
      <div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">Задач готово</div>
    </div>
  </div>`;
  const timerMain = $('timer-main');
  if (timerMain && !timerMain.querySelector('.timer-stats')) {
    timerMain.insertAdjacentHTML('afterbegin', `<div class="timer-stats">${statHtml}</div>`);
  } else {
    const el = timerMain?.querySelector('.timer-stats');
    if (el) el.innerHTML = statHtml;
  }

  const sorted = [...timeEntries].sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
  $('timer-history-list').innerHTML = sorted.slice(0, 10).map(e => {
    const t = tasks.find(x => x.id === e.taskId);
    const date = new Date(e.startTime);
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;margin-bottom:4px;background:var(--bg-secondary);border:1px solid var(--border-soft);font-size:12px">
      <span style="flex:1;color:var(--text-primary)">${t ? esc(t.title) : 'Удалена'}</span>
      <span style="font-family:JetBrains Mono,monospace;color:var(--accent);font-weight:600">${formatTimerTime(e.duration || 0)}</span>
      <span style="color:var(--text-tertiary)">${date.toLocaleDateString('ru-RU')} ${date.toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'})}</span>
    </div>`;
  }).join('') || '<div style="text-align:center;padding:20px;color:var(--text-tertiary)">Нет записей</div>';
}
