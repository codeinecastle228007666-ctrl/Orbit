/* ═══ Orbit — Task Modal ═══ */

function openTaskModal(task) {
  editingTaskId = task ? task.id : null;
  $('task-modal-title').textContent = task ? 'Редактировать задачу' : 'Новая задача';
  $('task-title').value = task ? task.title : '';
  $('task-desc').value = task ? (task.desc || '') : '';
  $('task-priority').value = task ? task.priority : 'medium';
  $('task-due').value = task ? (task.dueDate || '') : '';
  $('task-estimate').value = task ? (task.estimate || 30) : 30;
  $('task-tags').value = task ? (task.tags || []).join(', ') : '';
  $('task-status').value = task ? task.status : 'backlog';
  $('task-recurring').value = task ? (task.recurring || '') : '';
  const delBtn = $('task-modal-delete') || $('btn-modal-delete');
  if (delBtn) delBtn.style.display = task ? 'inline-flex' : 'none';
  const timerGroup = $('task-timer-group');
  if (timerGroup) timerGroup.style.display = task ? 'block' : 'none';
  updateModalTimer(task);
  setupManualTimeButtons(task);
  if (window._modalTimerInterval) clearInterval(window._modalTimerInterval);
  window._modalTimerInterval = setInterval(() => { if (task) updateModalTimer(task); }, 1000);

  // Populate parent dropdown
  const parentSel = $('task-parent');
  parentSel.innerHTML = '<option value="">— Нет —</option>';
  tasks.filter(t => !t.parentId && t.id !== editingTaskId).forEach(t => {
    parentSel.innerHTML += `<option value="${t.id}"${task && task.parentId === t.id ? ' selected' : ''}>${esc(t.title)}</option>`;
  });

  // Comments
  if (task) {
    api('GET', '/comments/' + task.id).then(comments => {
      $('comments-list').innerHTML = comments.map(c => {
        const dt = new Date(c.timestamp);
        const time = String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
        return `<div style="display:flex;gap:8px;padding:6px 8px;border-radius:6px;margin-bottom:4px;background:var(--bg-tertiary);font-size:12px">
          <span style="flex:1;color:var(--text-primary)">${esc(c.text)}</span>
          <span style="color:var(--text-tertiary);font-family:JetBrains Mono,monospace;font-size:10px">${time}</span>
        </div>`;
      }).join('') || '<div style="font-size:12px;color:var(--text-tertiary)">Нет комментариев</div>';
    });
  } else {
    $('comments-list').innerHTML = '';
  }

  $('task-modal').classList.add('open');
  setTimeout(() => $('task-title').focus(), 100);
  window._modalInitialValues = {
    title: $('task-title').value,
    desc: $('task-desc').value,
    priority: $('task-priority').value,
    due: $('task-due').value,
    estimate: $('task-estimate').value,
    tags: $('task-tags').value,
    status: $('task-status').value,
    recurring: $('task-recurring').value,
    parentId: $('task-parent') ? $('task-parent').value : '',
  };
}

function updateModalTimer(task) {
  if (task && timerTaskId === task.id) {
    const total = timerElapsed + (timerRunning && timerStartTs ? Math.floor((Date.now() - timerStartTs) / 1000) : 0);
    $('pomodoro-display').textContent = formatTimerTime(total);
    $('task-actual-time').textContent = formatTimerTime(task.actualTime || 0);
  } else if (task) {
    $('pomodoro-display').textContent = '00:00';
    $('task-actual-time').textContent = formatTimerTime(task.actualTime || 0);
  }
}

function setupManualTimeButtons(task) {
  document.querySelectorAll('.btn-time-add').forEach(btn => {
    btn.onclick = async () => {
      if (!editingTaskId) return;
      const mins = parseInt(btn.dataset.min) || 5;
      const t = tasks.find(x => x.id === editingTaskId);
      if (!t) return;
      t.actualTime = (t.actualTime || 0) + mins * 60;
      try {
        const entry = await api('POST', '/time-entries', { taskId: t.id, startTime: Date.now() - mins * 60000, endTime: Date.now(), duration: mins * 60 });
        await api('PUT', '/tasks/' + t.id, { actualTime: t.actualTime });
        $('task-actual-time').textContent = formatTimerTime(t.actualTime);
        if (entry?.id) timeEntries.unshift(entry);
        showToast(`+${mins} мин к задаче`, 'success', 1500);
      } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
    };
  });
  const setBtn = document.querySelector('.btn-time-set');
  if (setBtn) {
    setBtn.onclick = async () => {
      if (!editingTaskId) return;
      const input = $('task-manual-time');
      const mins = parseInt(input?.value) || 0;
      if (mins <= 0) return;
      const t = tasks.find(x => x.id === editingTaskId);
      if (!t) return;
      t.actualTime = (t.actualTime || 0) + mins * 60;
      try {
        const entry = await api('POST', '/time-entries', { taskId: t.id, startTime: Date.now() - mins * 60000, endTime: Date.now(), duration: mins * 60 });
        await api('PUT', '/tasks/' + t.id, { actualTime: t.actualTime });
        $('task-actual-time').textContent = formatTimerTime(t.actualTime);
        if (entry?.id) timeEntries.unshift(entry);
        showToast(`+${mins} мин к задаче`, 'success', 1500);
      } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
    };
  }
}

function closeTaskModal(force) {
  if (!force && window._modalInitialValues) {
    const v = window._modalInitialValues;
    const changed = v.title !== $('task-title').value ||
      v.desc !== $('task-desc').value ||
      v.priority !== $('task-priority').value ||
      v.due !== $('task-due').value ||
      v.estimate !== $('task-estimate').value ||
      v.tags !== $('task-tags').value ||
      v.status !== $('task-status').value ||
      v.recurring !== $('task-recurring').value ||
      ($('task-parent') && v.parentId !== $('task-parent').value);
    if (changed) {
      confirmAction('Изменения не сохранены. Закрыть?', () => closeTaskModal(true), { okLabel: 'Закрыть' });
      return;
    }
  }
  if (window._modalTimerInterval) { clearInterval(window._modalTimerInterval); window._modalTimerInterval = null; }
  $('task-modal').classList.remove('open');
  editingTaskId = null;
  window._modalInitialValues = null;
}

async function saveTask() {
  const title = $('task-title').value.trim();
  if (!title) { showToast('Введите название', 'warning'); return; }
  const currentTask = editingTaskId ? tasks.find(t => t.id === editingTaskId) : null;
  const body = {
    title,
    desc: $('task-desc').value.trim(),
    priority: $('task-priority').value,
    status: $('task-status').value,
    dueDate: $('task-due').value || '',
    estimate: parseInt($('task-estimate').value) || 30,
    tags: $('task-tags').value.split(',').map(t => t.trim()).filter(Boolean),
    parentId: $('task-parent').value || null,
    recurring: $('task-recurring').value || null,
    actualTime: currentTask ? currentTask.actualTime : 0,
  };
  try {
    if (editingTaskId) {
      await api('PUT', '/tasks/' + editingTaskId, body);
      showToast('Задача обновлена', 'success', 1500);
    } else {
      await api('POST', '/tasks', body);
      showToast('Задача создана', 'success', 1500);
    }
    tasks = await api('GET', '/tasks');
    activity = await api('GET', '/activity?days=14');
    closeTaskModal();
    rerender();
  } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
}

async function deleteTask(id) {
  confirmAction('Удалить задачу?', async () => {
    try {
      await api('DELETE', '/tasks/' + id);
      tasks = await api('GET', '/tasks');
      activity = await api('GET', '/activity?days=14');
      showToast('Задача удалена', 'success', 1500);
      rerender();
    } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
  }, { danger: true, okLabel: 'Удалить' });
}
