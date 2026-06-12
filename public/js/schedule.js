/* ═══ Orbit — Schedule ═══ */

function renderSchedule() {
  const dateLabel = $('schedule-date-label');
  const d = new Date(scheduleDate + 'T00:00:00');
  dateLabel.textContent = d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });

  const ws = t2m(settings.workStart || '09:00');
  const we = t2m(settings.workEnd || '18:00');
  const startH = Math.floor(ws / 60);
  const endH = Math.ceil(we / 60);

  let html = '';
  const daySchedule = schedule[scheduleDate] || [];
  const now = new Date();

  for (let h = startH; h <= endH; h++) {
    const isNow = scheduleDate === todayStr() && h === now.getHours();
    html += `<div class="timeline-hour" data-hour="${h}"><span class="hour-label">${String(h).padStart(2, '0')}:00</span>`;
    const events = daySchedule.filter(s => t2m(s.start) >= h * 60 && t2m(s.start) < (h + 1) * 60);
    for (const ev of events) {
      const task = tasks.find(t => t.id === ev.taskId);
      if (!task) continue;
      const top = (t2m(ev.start) % 60) / 60 * 56;
      const height = Math.max(24, (t2m(ev.end) - t2m(ev.start)) / 60 * 56);
      const color = task.priority === 'high' ? 'var(--danger)' : task.priority === 'medium' ? 'var(--warning)' : 'var(--accent)';
      html += `<div class="timeline-event" style="top:${top}px;height:${height}px;background:${color}22;border-left-color:${color}" onclick="openTaskModal(tasks.find(x=>x.id==='${task.id}'))">
        <div class="event-title">${esc(task.title)}</div>
        <div class="event-time">${ev.start} – ${ev.end}</div>
      </div>`;
    }
    if (isNow) html += `<div class="timeline-now" style="top:${now.getMinutes() / 60 * 56}px"></div>`;
    html += '</div>';
  }
  $('timeline').innerHTML = html;

  const scheduledIds = new Set((schedule[scheduleDate] || []).map(s => s.taskId));
  const unscheduled = tasks.filter(t => t.status !== 'done' && !scheduledIds.has(t.id));
  $('unscheduled-list').innerHTML = unscheduled.slice(0, 20).map(t => {
    const sc = STATUS_COLORS[t.status] || '#999';
    return `<div class="unscheduled-item" draggable="true" data-id="${t.id}">
      <div class="item-info"><div class="item-title">${esc(t.title)}</div><div class="item-meta">${t.estimate || 30}мин · ${fmtDate(t.dueDate)}</div></div>
    </div>`;
  }).join('') || '<div style="font-size:12px;color:var(--text-tertiary);padding:12px">Все запланированы</div>';

  setupScheduleDragDrop();
}

let _schDragDropSetup = false;
function setupScheduleDragDrop() {
  if (_schDragDropSetup) return;
  _schDragDropSetup = true;
  const unscheduled = $('unscheduled-list');
  const timeline = $('timeline');
  let schDragId = null;

  unscheduled.addEventListener('dragstart', e => {
    const item = e.target.closest('.unscheduled-item');
    if (!item) return;
    schDragId = item.dataset.id;
    item.classList.add('dragging');
  });
  unscheduled.addEventListener('dragend', e => {
    const item = e.target.closest('.unscheduled-item');
    if (item) item.classList.remove('dragging');
    document.querySelectorAll('.timeline-hour').forEach(h => h.classList.remove('drag-over'));
  });
  timeline.addEventListener('dragover', e => {
    const hour = e.target.closest('.timeline-hour[data-hour]');
    if (!hour) return;
    e.preventDefault();
    hour.classList.add('drag-over');
  });
  timeline.addEventListener('dragleave', e => {
    const hour = e.target.closest('.timeline-hour');
    if (hour) hour.classList.remove('drag-over');
  });
  timeline.addEventListener('drop', async e => {
    const hour = e.target.closest('.timeline-hour[data-hour]');
    if (!hour || !schDragId) return;
    e.preventDefault();
    hour.classList.remove('drag-over');
    const h = parseInt(hour.dataset.hour);
    const task = tasks.find(t => t.id === schDragId);
    if (!task) return;
    const dur = task.estimate || parseInt(settings.slotDuration) || 30;
    const sm = h * 60;
    try {
      await api('POST', '/schedule', { date: scheduleDate, taskId: schDragId, start: m2t(sm), end: m2t(sm + dur) });
      schedule = await api('GET', '/schedule');
      renderSchedule();
      showToast('Задача добавлена', 'success', 1500);
    } catch (err) { showToast('Ошибка: ' + err.message, 'error'); }
    schDragId = null;
  });
}
