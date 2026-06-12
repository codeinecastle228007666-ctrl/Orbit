/* ═══ Orbit — Calendar ═══ */

function renderCalendar() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  $('cal-month-label').textContent = calendarMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const today = todayStr();

  let html = '';
  ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(d => {
    html += `<div style="text-align:center;font-size:11px;font-weight:600;color:var(--text-secondary);padding:8px">${d}</div>`;
  });
  for (let i = 0; i < startOffset; i++) html += '<div></div>';

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = dateStr === today;
    const dayTasks = tasks.filter(t => t.dueDate === dateStr).slice(0, 4);
    html += `<div class="calendar-day${isToday ? ' today' : ''}">
      <div class="calendar-day-header"><span class="calendar-day-num">${day}</span></div>
      ${dayTasks.map(t => `<div class="calendar-task${t.status === 'done' ? ' status-done' : ''}" onclick="openTaskModal(tasks.find(x=>x.id==='${t.id}'))">${esc(t.title)}</div>`).join('')}
    </div>`;
  }
  $('calendar-grid').innerHTML = html;
}
