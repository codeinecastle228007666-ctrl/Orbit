/* ═══ Orbit — Core: Icons, State, Helpers, API, Toasts ═══ */
'use strict';

/* ═══ ICON LIBRARY ═══ */
const ICON = {
  dashboard:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  kanban:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>',
  graph:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><line x1="7.8" y1="7.2" x2="11" y2="16"/><line x1="16.2" y1="7.2" x2="13" y2="16"/><line x1="8.2" y1="5.5" x2="15.8" y2="5.5"/></svg>',
  schedule:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>',
  notes:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></svg>',
  settings:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>',
  list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="0.5" fill="currentColor"/><circle cx="3.5" cy="12" r="0.5" fill="currentColor"/><circle cx="3.5" cy="18" r="0.5" fill="currentColor"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
  alert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  target:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>',
  zap:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  camera:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  upload:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  sparkle:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z"/><path d="M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z"/></svg>',
  edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  chevronLeft:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
  chevronRight:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  play:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none"/></svg>',
  pause:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none"/></svg>',
  fileText:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  high:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="20" x2="4" y2="10"/><line x1="10" y1="20" x2="10" y2="4"/><line x1="16" y1="20" x2="16" y2="14"/><line x1="20" y1="20" x2="20" y2="8"/></svg>',
  med:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="20" x2="4" y2="14"/><line x1="10" y1="20" x2="10" y2="10"/><line x1="16" y1="20" x2="16" y2="6"/><line x1="20" y1="20" x2="20" y2="2"/></svg>',
  low:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="20" x2="4" y2="16"/><line x1="10" y1="20" x2="10" y2="13"/><line x1="16" y1="20" x2="16" y2="10"/><line x1="20" y1="20" x2="20" y2="7"/></svg>',
  hash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>',
  link:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  in:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 17 20 12 15 7"/><polyline points="4 7 4 13 12 13"/><line x1="20" y1="12" x2="9" y2="12"/></svg>',
  user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  layers:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 22 8.5 12 15 2 8.5"/><polyline points="2 15.5 12 22 22 15.5"/><polyline points="2 11.5 12 18 22 11.5"/></svg>',
  maximize:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
};

function icon(name, size) {
  const svg = ICON[name] || ICON.alert;
  return svg.replace('<svg ', `<svg width="${size||16}" height="${size||16}" `);
}

function hydrateIcons(root) {
  (root || document).querySelectorAll('[data-icon]').forEach(el => {
    const name = el.getAttribute('data-icon');
    if (!name) return;
    const isAlone = el.children.length === 0 && el.textContent.trim() === '';
    el.innerHTML = icon(name, isAlone ? 16 : 15);
    if (isAlone) el.style.display = 'inline-flex';
  });
}

/* ═══ STATE ═══ */
let tasks = [], schedule = {}, notes = [], settings = {}, links = [], activity = [], xpData = {}, achievements = [];
let currentView = 'dashboard';
let scheduleDate = todayStr();
let editingTaskId = null;
let editingNoteId = null;
let dragSrcId = null;
let kanbanFilter = 'all';
let noteSaveTimer = null;
let dailyNotesDate = todayStr();
let dailyNotesSaveTimer = null;
let allDailyNotes = [];
let calendarMonth = new Date();
let kanbanCollapsed = loadUIPref('kanbanCollapsed', {});

/* ═══ TIMER STATE ═══ */
let timerTaskId = null;
let timerRunning = false;
let timerElapsed = 0;
let timerStartTs = null;
let timerInterval = null;
let timerEntryId = null;
let timerSessions = loadUIPref('timerSessions', []);
let timeEntries = [];
let timerQueue = loadUIPref('timerQueue', []);

/* ═══ TIMER PERSISTENCE ═══ */
function saveTimerState() {
  saveUIPref('timerState', {
    taskId: timerTaskId,
    running: timerRunning,
    elapsed: timerElapsed,
    startTs: timerStartTs,
    entryId: timerEntryId,
    savedAt: Date.now()
  });
}
function restoreTimerState() {
  const state = loadUIPref('timerState', null);
  if (!state || !state.taskId) return;
  timerTaskId = state.taskId;
  timerEntryId = state.entryId;
  if (state.running && state.startTs) {
    const offlineSec = Math.floor((state.savedAt - state.startTs) / 1000);
    timerElapsed = (state.elapsed || 0) + offlineSec;
    timerRunning = false;
    timerStartTs = null;
    const task = tasks.find(t => t.id === timerTaskId);
    const taskName = task ? task.title : 'Неизвестная задача';
    if (task && timerElapsed > 0) {
      task.actualTime = (task.actualTime || 0) + timerElapsed;
      api('PUT', '/tasks/' + task.id, { actualTime: task.actualTime }).catch(() => {});
    }
    if (timerEntryId) {
      api('PUT', '/time-entries/' + timerEntryId, { endTime: Date.now(), duration: timerElapsed }).catch(() => {});
    }
    showToast('⏱ ' + taskName + ': +' + formatTimerTime(timerElapsed) + ' (восстановлено)', 'success', 5000);
  } else if (state.elapsed > 0) {
    const task = tasks.find(t => t.id === timerTaskId);
    const taskName = task ? task.title : 'Неизвестная задача';
    if (task && state.elapsed > 0) {
      task.actualTime = (task.actualTime || 0) + state.elapsed;
      api('PUT', '/tasks/' + task.id, { actualTime: task.actualTime }).catch(() => {});
    }
    if (timerEntryId) {
      api('PUT', '/time-entries/' + timerEntryId, { endTime: Date.now(), duration: state.elapsed }).catch(() => {});
    }
    showToast('⏱ ' + taskName + ': +' + formatTimerTime(state.elapsed) + ' (сохранено)', 'success', 5000);
  }
  timerElapsed = 0;
  timerTaskId = null;
  timerEntryId = null;
  timerRunning = false;
  timerStartTs = null;
  updateTimerDisplay();
  saveUIPref('timerState', null);
}

/* ═══ HELPERS ═══ */
function $(id) { return document.getElementById(id); }
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function fmtDate(s) {
  if (!s) return '';
  const parts = s.split('-');
  const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  const n = new Date(), t = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const diff = Math.round((d - t) / 86400000);
  if (diff === 0) return 'Сегодня'; if (diff === 1) return 'Завтра'; if (diff === -1) return 'Вчера';
  if (diff > 0 && diff < 7) return ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'][d.getDay()];
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
function formatTimerTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function isOverdue(ds) { return ds && ds < todayStr(); }
function isToday(ds) { return ds === todayStr(); }
function t2m(t) { const [h, m] = (t || '00:00').split(':').map(Number); return h * 60 + m; }
function m2t(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
function saveUIPref(key, val) { try { localStorage.setItem('orbit:' + key, JSON.stringify(val)); } catch (_) {} }
function loadUIPref(key, fallback) { try { const v = localStorage.getItem('orbit:' + key); return v == null ? fallback : JSON.parse(v); } catch (_) { return fallback; } }

const STATUS_COLORS = { backlog: '#94a3b8', todo: '#f59e0b', review: '#8b5cf6', done: '#10b981' };
const STATUS_LABELS = { backlog: 'Нужно сделать', todo: 'В работе', review: 'На проверке', done: 'Готово' };
const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };
function parentBadge(task) {
  if (!task || !task.parentId) return '';
  const parent = tasks.find(t => t.id === task.parentId);
  return parent ? `<span class="parent-badge" title="Родитель: ${esc(parent.title)}">${esc(parent.title)}</span>` : '';
}

/* ═══ API ═══ */
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  if (!res.ok) { const e = await res.text(); try { const j = JSON.parse(e); throw new Error(j.error || j.message || e); } catch (_) { throw new Error(e); } }
  const data = await res.json();
  if (data && data.new_achievements && data.new_achievements.length > 0) {
    data.new_achievements.forEach(ach => showAchievementNotification(ach));
    achievements = [...achievements, ...data.new_achievements];
  }
  return data;
}

function showAchievementNotification(ach) {
  const c = $('toast-container');
  const t = document.createElement('div');
  t.className = 'toast toast-achievement';
  t.innerHTML = `<div style="display:flex;align-items:center;gap:10px">
    <span style="font-size:28px">${ach.icon || '🏆'}</span>
    <div><div style="font-weight:600;font-size:13px;color:var(--text-primary)">${esc(ach.name)}</div>
    <div style="font-size:11px;color:var(--text-secondary)">${esc(ach.description)}</div></div>
  </div>`;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, 5000);
}

/* ═══ TOASTS ═══ */
function showToast(message, type = 'info', duration = 3000) {
  const c = $('toast-container');
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  const ic = type === 'success' ? 'check' : type === 'error' ? 'x' : 'in';
  t.innerHTML = icon(ic, 16) + '<span>' + esc(message) + '</span>';
  c.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, duration);
}

function confirmAction(message, onConfirm, opts = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `<div class="confirm-content"><p>${esc(message)}</p><div class="confirm-actions">
    <button class="btn confirm-cancel">${esc(opts.cancelLabel || 'Отмена')}</button>
    <button class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'} confirm-ok">${esc(opts.okLabel || 'Подтвердить')}</button>
  </div></div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.confirm-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('.confirm-ok').addEventListener('click', () => { close(); onConfirm && onConfirm(); });
}
