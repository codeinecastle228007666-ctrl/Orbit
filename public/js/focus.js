/* ═══ Orbit — Focus Mode ═══ */

function openFocusMode(taskId) {
  const t = tasks.find(x => x.id === taskId);
  if (!t) return;
  let ov = $('focus-overlay');
  if (ov) ov.remove();
  ov = document.createElement('div');
  ov.id = 'focus-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:var(--bg-primary);z-index:200;display:flex;flex-direction:column;animation:fadeIn .3s var(--ease-out);overflow-y:auto';
  const statusLabel = STATUS_LABELS[t.status] || t.status;
  const statusColor = STATUS_COLORS[t.status] || '#999';
  const priorityLabel = { high: 'Высокий', medium: 'Средний', low: 'Низкий' }[t.priority] || t.priority;
  const children = tasks.filter(x => x.parentId === t.id);
  const timerTotal = timerTaskId === t.id ? timerElapsed + (timerRunning && timerStartTs ? Math.floor((Date.now() - timerStartTs) / 1000) : 0) : 0;
  const timerStr = timerTaskId === t.id ? formatTimerTime(timerTotal) : '00:00';
  const isActive = timerTaskId === t.id;

  ov.innerHTML = `<div style="display:flex;align-items:center;gap:12px;padding:14px 24px;background:var(--bg-secondary);border-bottom:1px solid var(--border-soft)">
    <button class="btn btn-sm btn-icon" id="focus-close" title="Закрыть (Esc)"><span data-icon="x"></span></button>
    <span style="flex:1;font-size:18px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title)}</span>
    <button class="btn btn-sm" id="focus-edit"><span data-icon="edit"></span>Редактировать</button>
  </div>
  <div style="max-width:900px;margin:0 auto;padding:32px 40px;width:100%">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
      <div style="background:var(--bg-secondary);border-radius:12px;padding:16px;border:1px solid var(--border-soft)"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-tertiary);margin-bottom:4px;font-weight:600">Статус</div><div style="font-size:16px;font-weight:600;color:${statusColor}">${statusLabel}</div></div>
      <div style="background:var(--bg-secondary);border-radius:12px;padding:16px;border:1px solid var(--border-soft)"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-tertiary);margin-bottom:4px;font-weight:600">Приоритет</div><div style="font-size:16px;font-weight:600;color:var(--text-primary)">${priorityLabel}</div></div>
      <div style="background:var(--bg-secondary);border-radius:12px;padding:16px;border:1px solid var(--border-soft)"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-tertiary);margin-bottom:4px;font-weight:600">Срок</div><div style="font-size:16px;font-weight:600;color:var(--text-primary)">${t.dueDate ? fmtDate(t.dueDate) : '—'}</div></div>
      <div style="background:var(--bg-secondary);border-radius:12px;padding:16px;border:1px solid var(--border-soft)"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-tertiary);margin-bottom:4px;font-weight:600">Время</div>      <div style="font-size:16px;font-weight:600;color:var(--text-primary)">${t.actualTime ? formatTimerTime(t.actualTime) : '—'}</div></div>
    </div>
    <div style="display:flex;align-items:center;gap:16px;padding:20px 24px;background:var(--bg-secondary);border-radius:12px;border:1px solid var(--border-soft);margin-bottom:24px">
      <div id="focus-timer-display" style="font-size:48px;font-weight:600;font-family:'JetBrains Mono',monospace;color:var(--accent);letter-spacing:-2px;min-width:160px">${timerStr}</div>
      <button class="btn btn-primary" id="focus-timer-toggle" style="padding:14px 32px;font-size:16px">${isActive && timerRunning ? '⏸ Пауза' : '▶ Старт'}</button>
      ${isActive ? '<button class="btn btn-danger" id="focus-timer-stop" style="padding:14px 32px;font-size:16px">⏹ Стоп</button>' : ''}
    </div>
    ${t.desc ? `<div style="margin-bottom:24px"><h3 style="font-size:12px;text-transform:uppercase;letter-spacing:1.2px;color:var(--text-secondary);margin-bottom:12px;font-weight:600">Описание</h3><div style="font-size:15px;color:var(--text-primary);line-height:1.7;white-space:pre-wrap">${esc(t.desc)}</div></div>` : ''}
    ${(t.tags || []).length > 0 ? `<div style="margin-bottom:24px"><h3 style="font-size:12px;text-transform:uppercase;letter-spacing:1.2px;color:var(--text-secondary);margin-bottom:12px;font-weight:600">Теги</h3><div style="display:flex;gap:6px;flex-wrap:wrap">${(t.tags || []).map(tg => '<span class="tag">#' + esc(tg) + '</span>').join('')}</div></div>` : ''}
    ${children.length > 0 ? `<div style="margin-bottom:24px"><h3 style="font-size:12px;text-transform:uppercase;letter-spacing:1.2px;color:var(--text-secondary);margin-bottom:12px;font-weight:600">Подзадачи (${children.filter(c => c.status === 'done').length}/${children.length})</h3>${children.map(c => `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;margin-bottom:4px;background:var(--bg-secondary);border:1px solid var(--border-soft)"><div class="focus-sub-check" data-cid="${c.id}" style="width:20px;height:20px;border-radius:50%;border:2px solid ${c.status === 'done' ? 'var(--success)' : 'var(--border-strong)'};cursor:pointer;display:flex;align-items:center;justify-content:center;background:${c.status === 'done' ? 'var(--success)' : 'transparent'}" >${c.status === 'done' ? '<span style="color:#fff;font-size:12px">✓</span>' : ''}</div><span style="flex:1;font-size:13px;color:var(--text-primary);${c.status === 'done' ? 'text-decoration:line-through;opacity:0.6' : ''}">${esc(c.title)}</span></div>`).join('')}</div>` : ''}
  </div>`;

  document.body.appendChild(ov);
  hydrateIcons(ov);
  ov.tabIndex = -1;
  ov.focus();

  // Close
  ov.querySelector('#focus-close').onclick = () => { clearFocusInterval(); ov.remove(); };
  ov.addEventListener('keydown', e => { if (e.key === 'Escape') { clearFocusInterval(); ov.remove(); } });
  ov.querySelector('#focus-edit').onclick = () => { clearFocusInterval(); ov.remove(); openTaskModal(t); };

  // Timer toggle — update in place
  ov.querySelector('#focus-timer-toggle').onclick = () => {
    if (timerTaskId === t.id && timerRunning) { pauseTimer(); }
    else if (timerTaskId === t.id && !timerRunning && timerElapsed > 0) { resumeTimer(); }
    else { if (timerRunning) stopTimer(); startTimerForTask(t.id); }
    updateFocusTimerDisplay(ov, t);
  };
  const stopBtn = ov.querySelector('#focus-timer-stop');
  if (stopBtn) stopBtn.onclick = () => { stopTimer(); ov.remove(); clearFocusInterval(); };

  // Subtask toggle — update in place
  ov.querySelectorAll('.focus-sub-check').forEach(chk => {
    chk.onclick = async () => {
      const cid = chk.dataset.cid;
      const ct = tasks.find(x => x.id === cid);
      if (!ct) return;
      const newStatus = ct.status === 'done' ? 'todo' : 'done';
      try {
        await api('PUT', '/tasks/' + cid, { status: newStatus });
        ct.status = newStatus;
        const parentTask = tasks.find(x => x.id === t.id);
        if (!parentTask) { ov.remove(); return; }
        ov.querySelectorAll('.focus-sub-check').forEach(c => {
          if (c.dataset.cid === cid) {
            const isDone = newStatus === 'done';
            c.style.background = isDone ? 'var(--success)' : 'transparent';
            c.style.borderColor = isDone ? 'var(--success)' : 'var(--border-strong)';
            c.innerHTML = isDone ? '<span style="color:#fff;font-size:12px">✓</span>' : '';
            const label = c.parentElement.querySelector('span:last-child');
            if (label) {
              label.style.textDecoration = isDone ? 'line-through' : 'none';
              label.style.opacity = isDone ? '0.6' : '1';
            }
          }
        });
      } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
    };
  });

  // Start focus timer interval for live display
  startFocusTimerInterval(ov);
}

function clearFocusInterval() {
  if (window._focusInterval) { clearInterval(window._focusInterval); window._focusInterval = null; }
}

function startFocusTimerInterval(ov) {
  clearFocusInterval();
  if (timerTaskId !== null && timerRunning) {
    window._focusInterval = setInterval(() => {
      const disp = $('focus-timer-display');
      if (!disp || !document.contains(disp)) { clearFocusInterval(); return; }
      const total = timerElapsed + Math.floor((Date.now() - timerStartTs) / 1000);
      disp.textContent = formatTimerTime(total);
    }, 500);
  }
}

function updateFocusTimerDisplay(ov, t) {
  const disp = ov.querySelector('#focus-timer-display');
  const toggle = ov.querySelector('#focus-timer-toggle');
  const controls = toggle.parentElement;
  if (!disp || !toggle) return;
  const total = timerTaskId === t.id ? timerElapsed + (timerRunning && timerStartTs ? Math.floor((Date.now() - timerStartTs) / 1000) : 0) : 0;
  disp.textContent = formatTimerTime(total);
  const isActive = timerTaskId === t.id;
  toggle.textContent = isActive && timerRunning ? '⏸ Пауза' : '▶ Старт';
  // Show/hide stop button
  const existingStop = controls.querySelector('#focus-timer-stop');
  if (isActive && !existingStop) {
    const stop = document.createElement('button');
    stop.className = 'btn btn-danger';
    stop.id = 'focus-timer-stop';
    stop.style.cssText = 'padding:14px 32px;font-size:16px';
    stop.textContent = '⏹ Стоп';
    stop.onclick = () => { stopTimer(); const o = $('focus-overlay'); if (o) o.remove(); clearFocusInterval(); };
    controls.appendChild(stop);
  } else if (!isActive && existingStop) {
    existingStop.remove();
  }
  startFocusTimerInterval(ov);
}
