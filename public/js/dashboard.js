/* ═══ Orbit — Dashboard ═══ */

function renderDashboard() {
  const today = new Date();
  $('dashboard-date').textContent = today.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'done').length;
  const overdue = tasks.filter(t => t.status !== 'done' && t.dueDate && isOverdue(t.dueDate)).length;
  const trackedSec = tasks.reduce((s, t) => s + (t.actualTime || 0), 0);
  animateNumber($('stat-total'), total);
  animateNumber($('stat-done'), done);
  animateNumber($('stat-overdue'), overdue);
  if ($('stat-tracked')) $('stat-tracked').textContent = formatTimerTime(trackedSec);

  // Status chart
  const statuses = ['backlog', 'todo', 'review', 'done'];
  const statusLabels = ['Нужно', 'В работе', 'Проверка', 'Готово'];
  const statusColors = ['#94a3b8', '#f59e0b', '#8b5cf6', '#10b981'];
  const maxCount = Math.max(1, ...statuses.map(s => tasks.filter(t => t.status === s).length));
  $('status-chart').innerHTML = statuses.map((s, i) => {
    const count = tasks.filter(t => t.status === s).length;
    const h = Math.max(4, Math.round(count / maxCount * 120));
    return `<div class="bar" style="height:${h}px;background:${statusColors[i]}"><div class="bar-value">${count}</div><div class="bar-label">${statusLabels[i]}</div></div>`;
  }).join('');

  // Progress ring
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  const r = 45, c = 2 * Math.PI * r;
  $('progress-ring').innerHTML = `<svg width="120" height="120" viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--bg-tertiary)" stroke-width="8"/>
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--accent)" stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}" transform="rotate(-90 60 60)" style="transition:stroke-dashoffset .8s var(--ease)"/>
    <text x="60" y="56" text-anchor="middle" fill="var(--text-primary)" font-size="22" font-weight="600">${pct}%</text>
    <text x="60" y="72" text-anchor="middle" fill="var(--text-secondary)" font-size="10">выполнено</text>
  </svg>
  <div class="pr-info"><div class="pr-value">${done}/${total}</div><div class="pr-label">задач выполнено</div></div>`;

  // Upcoming
  const upcoming = tasks.filter(t => t.status !== 'done' && t.dueDate).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).slice(0, 6);
  $('upcoming-list').innerHTML = upcoming.length ? upcoming.map(t => {
    const cls = isOverdue(t.dueDate) ? 'high' : isToday(t.dueDate) ? 'medium' : 'low';
    return `<div class="upcoming-item" onclick="openTaskModal(tasks.find(x=>x.id==='${t.id}'))">
      <div class="u-dot priority-dot ${cls}"></div>
      <div class="u-info"><div class="u-title">${esc(t.title)}${parentBadge(t) ? '<span class="parent-badge-inline">⬆</span>' : ''}</div><div class="u-date">${fmtDate(t.dueDate)}</div></div>
    </div>`;
  }).join('') : '<div style="font-size:12px;color:var(--text-tertiary);padding:12px">Нет задач с дедлайном</div>';

  renderHeatmap(activity);
  renderAchievements();
}

function renderAchievements() {
  const el = $('ach-dash-content');
  if (!el) return;
  const xp = xpData || {};
  const ach = achievements || [];
  const levelName = xp.level_name || 'Стажёр';
  const level = xp.level || 0;
  const totalXp = xp.total_xp || 0;
  const progress = xp.progress || 0;
  const streak = xp.current_streak || 0;
  const tasksDone = xp.total_tasks_done || 0;
  const timeTracked = xp.total_time_tracked || 0;
  const icons = ['⚡', '🌟', '🔥', '💎', '👑', '🚀', '🌌', '🌀'];
  const icon = icons[Math.min(level, icons.length - 1)];

  let html = `<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
    <div style="font-size:32px;width:56px;height:56px;display:flex;align-items:center;justify-content:center;background:var(--accent-soft);border-radius:14px;flex-shrink:0">${icon}</div>
    <div style="flex:1;min-width:140px">
      <div style="font-size:16px;font-weight:600;color:var(--text-primary)">Ур. ${level} · ${esc(levelName)}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${totalXp} XP · 🔥 ${streak} дн · 🏆 ${ach.length} ачивок · ⏱ ${formatTimerTime(timeTracked * 60)}</div>
      <div style="margin-top:8px;height:6px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${progress}%;background:linear-gradient(90deg,var(--accent),var(--warning));border-radius:3px;transition:width .6s var(--ease)"></div>
      </div>
    </div>
  </div>`;

  const recentAch = ach.slice(-5).reverse();
  if (recentAch.length > 0) {
    html += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid var(--border-soft)">`;
    recentAch.forEach(a => {
      html += `<span style="display:flex;align-items:center;gap:4px;padding:4px 10px;background:var(--bg-tertiary);border-radius:6px;font-size:11px;color:var(--text-secondary);border:1px solid var(--border-soft)" title="${esc(a.description || '')}">${a.icon || '🏆'} ${esc(a.name)}</span>`;
    });
    html += `</div>`;
  }

  if (ach.length === 0) {
    html += `<div style="margin-top:12px;font-size:12px;color:var(--text-tertiary);text-align:center">Выполняйте задачи, чтобы получать достижения</div>`;
  }

  el.innerHTML = html;
}

function renderHeatmap(activity) {
  const days = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  const hours = Array.from({length:24}, (_,i) => i);
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7;
  const actMap = {};
  if (Array.isArray(activity)) {
    activity.forEach(a => {
      const d = new Date(a.date);
      const key = d.getDay() + ':' + d.getHours();
      actMap[key] = (actMap[key] || 0) + (a.count || 0);
    });
  }
  const vals = Object.values(actMap);
  const maxVal = vals.length ? Math.max(...vals) : 1;
  let html = '<div class="heatmap">';
  html += '<div></div>' + days.map(d => `<div style="text-align:center;font-size:10px;color:var(--text-secondary);font-weight:600">${d}</div>`).join('');
  for (let h = 6; h < 22; h++) {
    html += `<div style="display:flex;align-items:center;justify-content:flex-end;color:var(--text-tertiary);padding-right:6px;font-size:9px;font-family:JetBrains Mono,monospace">${h}</div>`;
    for (let d = 0; d < 7; d++) {
      const key = d + ':' + h;
      const count = actMap[key] || 0;
      const intensity = count > 0 ? Math.min(0.9, 0.1 + (count / maxVal) * 0.8) : 0;
      const isNow = d === dayOfWeek && h === now.getHours();
      html += `<div class="heatmap-cell" style="background:rgba(224,176,92,${intensity});${isNow ? 'box-shadow:0 0 0 2px var(--accent)' : ''}"></div>`;
    }
  }
  html += '</div>';
  html += '<div class="heatmap-legend"><span class="hm-swatch" style="background:var(--bg-tertiary)"></span>Мало<span class="hm-swatch" style="background:var(--accent)"></span>Много</div>';
  $('heatmap-container').innerHTML = html;
}

function animateNumber(el, target, duration = 500) {
  if (!el) return;
  const start = parseInt(el.textContent.replace(/\D/g, '')) || 0;
  const diff = target - start;
  if (!diff) return;
  const startT = performance.now();
  function update(now) {
    const p = Math.min(1, (now - startT) / duration);
    el.textContent = Math.floor(start + diff * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(update); else el.textContent = target;
  }
  requestAnimationFrame(update);
}
