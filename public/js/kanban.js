/* ═══ Orbit — Kanban ═══ */

function renderKanban() {
  const searchVal = ($('kanban-search')?.value || '').toLowerCase();
  const today = todayStr();
  let filtered = tasks.filter(t => {
    if (kanbanFilter === 'high' && t.priority !== 'high') return false;
    if (kanbanFilter === 'medium' && t.priority !== 'medium') return false;
    if (kanbanFilter === 'low' && t.priority !== 'low') return false;
    if (kanbanFilter === 'overdue' && (t.status === 'done' || !t.dueDate || !isOverdue(t.dueDate))) return false;
    if (searchVal) {
      const match = t.title.toLowerCase().includes(searchVal) || (t.desc || '').toLowerCase().includes(searchVal) || (t.tags || []).some(tg => tg.toLowerCase().includes(searchVal));
      if (!match) return false;
    }
    return true;
  });

  const statuses = ['backlog', 'todo', 'review', 'done'];
  statuses.forEach(st => {
    const colTasks = filtered.filter(t => t.status === st);
    const parents = colTasks.filter(t => !t.parentId);
    const children = colTasks.filter(t => t.parentId);
    let html = '';
    parents.forEach(p => {
      html += renderKanbanCard(p);
      children.filter(c => c.parentId === p.id).forEach(c => html += renderKanbanCard(c, true));
    });
    const orphaned = children.filter(c => !parents.some(p => p.id === c.parentId));
    orphaned.forEach(c => html += renderKanbanCard(c, true));
    $(`count-${st}`).textContent = colTasks.length;
    $(`cards-${st}`).innerHTML = html;
  });

  setupKanbanDragDrop();
}

function renderKanbanCard(t, isChild) {
  const overdue = t.status !== 'done' && t.dueDate && isOverdue(t.dueDate);
  const dueToday = t.dueDate === todayStr() && t.status !== 'done';
  const classes = ['kanban-card', `priority-${t.priority}`];
  if (overdue) classes.push('overdue');
  if (dueToday) classes.push('due-today');
  if (isChild) classes.push('kanban-child');

  const dueHtml = t.dueDate ? `<span class="due">${overdue ? '⚠️' : ''}${fmtDate(t.dueDate)}</span>` : '';
  const tagsHtml = (t.tags || []).map(tg => `<span class="tag">#${esc(tg)}</span>`).join('');
  const timerState = timerTaskId === t.id && timerRunning;
  const timerTime = timerTaskId === t.id ? formatTimerTime(timerElapsed + (timerRunning && timerStartTs ? Math.floor((Date.now() - timerStartTs) / 1000) : 0)) : '';

  if (isChild) {
    return `<div class="${classes.join(' ')}" data-id="${t.id}" draggable="true">
      <div class="card-child-line"></div>
      <div style="flex:1;min-width:0">
        <div class="card-title" style="font-size:12px;margin-bottom:3px">${esc(t.title)}</div>
        <div class="card-meta">${tagsHtml}${dueHtml}</div>
      </div>
      <div class="card-actions" style="position:static;display:flex;gap:2px;flex-shrink:0">
        <button class="btn-card-timer-toggle" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);font-size:11px;padding:2px">${timerState ? '⏸' : '▶'}</button>
      </div>
    </div>`;
  }

  return `<div class="${classes.join(' ')}" data-id="${t.id}" draggable="true">
    <div class="card-actions">
      <button class="btn-card-edit" title="Редактировать"><span data-icon="edit"></span></button>
      <button class="btn-card-focus" title="Фокус">⛶</button>
      <button class="btn-card-delete" title="Удалить"><span data-icon="trash"></span></button>
    </div>
    <div class="card-title">${esc(t.title)}</div>
    ${t.desc ? `<div class="card-desc">${esc(t.desc)}</div>` : ''}
    <div class="card-meta">${parentBadge(t)}${tagsHtml}${dueHtml}<span style="font-size:10px;color:var(--text-tertiary)">${t.estimate || 30}мин</span></div>
    ${t.recurring ? `<span style="font-size:10px;color:var(--accent);font-weight:600">🔁 ${t.recurring === 'daily' ? 'день' : t.recurring === 'weekly' ? 'нед' : t.recurring === 'monthly' ? 'мес' : 'будни'}</span>` : ''}
    <div class="card-timer">
      <span class="timer-time">${timerState ? timerTime : (t.actualTime ? formatTimerTime(t.actualTime) : '0:00')}</span>
      <button class="btn-card-timer-toggle" title="${timerState ? 'Пауза' : 'Старт'}">${timerState ? '⏸' : '▶'}</button>
      ${timerTaskId === t.id && timerElapsed > 0 ? `<button class="btn-card-timer-stop" title="Стоп">⏹</button>` : ''}
    </div>
  </div>`;
}

let _kanbanDragSetup = false;
function setupKanbanDragDrop() {
  if (_kanbanDragSetup) return;
  _kanbanDragSetup = true;
  const board = $('kanban-board');
  if (!board) return;

  // Event delegation for drag on cards
  board.addEventListener('dragstart', e => {
    const card = e.target.closest('.kanban-card');
    if (!card) return;
    dragSrcId = card.dataset.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  board.addEventListener('dragend', e => {
    const card = e.target.closest('.kanban-card');
    if (card) card.classList.remove('dragging');
    document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('drag-over'));
  });

  // Column drop targets
  document.querySelectorAll('.kanban-column').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('drag-over'); });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', async e => {
      e.preventDefault(); col.classList.remove('drag-over');
      if (!dragSrcId) return;
      const newStatus = col.dataset.status;
      const task = tasks.find(t => t.id === dragSrcId);
      if (!task || task.status === newStatus) return;
      task.status = newStatus;
      try {
        await api('PUT', '/tasks/' + task.id, task);
        tasks = await api('GET', '/tasks');
        activity = await api('GET', '/activity?days=14');
        renderKanban();
        showToast('Статус: ' + STATUS_LABELS[newStatus], 'success', 1500);
      } catch (err) { showToast('Ошибка: ' + err.message, 'error'); }
      dragSrcId = null;
    });
  });
}
