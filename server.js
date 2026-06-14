const express = require('express');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const { initDb, dbAll, dbGet, dbRun, saveDb, startAutoBackup, stopAutoBackup, logActivity } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
let db;
let wss = null;

function broadcast(type, data) {
  if (!wss) return;
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── TASKS ───────────────────────────────────────────────────
app.get('/api/tasks', (req, res) => {
  try {
    const rows = dbAll(db, 'SELECT * FROM tasks ORDER BY createdAt DESC');
    res.json(rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tasks', (req, res) => {
  try {
    const { title, desc, priority, status, dueDate, estimate, tags, parentId } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const now = Date.now();
    const recurring = req.body.recurring || null;
    const favorite = req.body.favorite ? 1 : 0;
    dbRun(db, `INSERT INTO tasks (id, title, desc, priority, status, dueDate, estimate, tags, parentId, recurring, favorite, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title.trim(), (desc || '').trim(), priority || 'medium', status || 'backlog',
      dueDate || '', estimate || 30, JSON.stringify(tags || []), parentId || null, recurring, favorite, now, now]);
    logActivity(db, id, 'created');
    let task = dbGet(db, 'SELECT * FROM tasks WHERE id = ?', [id]);
    syncWikiLinks(db, 'task', id, task.title + ' ' + (task.desc || ''));
    processAutomationRules(db, 'task_created', task);
    task = dbGet(db, 'SELECT * FROM tasks WHERE id = ?', [id]);
    const today = new Date().toISOString().slice(0, 10);
    const ds = dbGet(db, 'SELECT * FROM daily_stats WHERE date = ?', [today]);
    if (ds) dbRun(db, 'UPDATE daily_stats SET tasks_created = tasks_created + 1 WHERE date = ?', [today]);
    else dbRun(db, 'INSERT INTO daily_stats (date, tasks_completed, xp_earned, time_tracked, notes_created, tasks_created) VALUES (?, 0, 5, 0, 0, 1)', [today]);
    const xpResult = awardXp(db, 5);
    const newAch = favorite ? checkAchievements(db, 'favorite') : checkAchievements(db);
    res.json({ ...task, tags: JSON.parse(task.tags || '[]'), xp: xpResult, new_achievements: newAch });
    broadcast('task_created', { id: task.id, title: task.title });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/tasks/:id', (req, res) => {
  try {
    const existing = dbGet(db, 'SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    const { title, desc, priority, status, dueDate, estimate, actualTime, tags, parentId } = req.body;
    const oldStatus = existing.status;
    const recurring = req.body.recurring !== undefined ? req.body.recurring : existing.recurring;
    const favorite = req.body.favorite !== undefined ? (req.body.favorite ? 1 : 0) : existing.favorite;
    const favoriteChanged = req.body.favorite !== undefined && req.body.favorite != existing.favorite;
    dbRun(db, `UPDATE tasks SET title=?, desc=?, priority=?, status=?, dueDate=?, estimate=?, actualTime=?, tags=?, parentId=?, recurring=?, favorite=?, updatedAt=? WHERE id=?`,
      [(title || existing.title).trim(),
      (desc !== undefined ? desc : existing.desc || '').trim(),
      priority || existing.priority, status || existing.status,
      dueDate !== undefined ? dueDate : existing.dueDate,
      estimate !== undefined ? estimate : existing.estimate,
      actualTime !== undefined ? actualTime : existing.actualTime,
      JSON.stringify(tags !== undefined ? tags : JSON.parse(existing.tags || '[]')),
      parentId !== undefined ? parentId : existing.parentId,
      recurring, favorite, Date.now(), req.params.id]);
    let newAchievements = [];
    if (favoriteChanged && req.body.favorite) {
      const favAch = checkAchievements(db, 'favorite');
      if (favAch.length) newAchievements = newAchievements.concat(favAch);
    }
    if (status && status !== oldStatus) {
      logActivity(db, req.params.id, 'status:' + oldStatus + '->' + status);
      if (status === 'done') processRecurring(req.params.id);
    } else logActivity(db, req.params.id, 'updated');
    let task = dbGet(db, 'SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    let xpResult = null;
    if (status && status !== oldStatus) {
      processAutomationRules(db, 'status_change', task, { oldStatus });
      if (status === 'done') {
        logProductivity(db, req.params.id, task);
        const xpBase = 30;
        const xpBonus = task.priority === 'high' ? 20 : task.priority === 'medium' ? 10 : 0;
        xpResult = awardXp(db, xpBase + xpBonus);
        dbRun(db, 'UPDATE user_xp SET total_tasks_done = total_tasks_done + 1 WHERE id = 1');
        const today = new Date().toISOString().slice(0, 10);
        const ds = dbGet(db, 'SELECT * FROM daily_stats WHERE date = ?', [today]);
        if (ds) dbRun(db, 'UPDATE daily_stats SET tasks_completed = tasks_completed + 1 WHERE date = ?', [today]);
        else dbRun(db, 'INSERT INTO daily_stats (date, tasks_completed, xp_earned, time_tracked, notes_created, tasks_created) VALUES (?, 1, ?, 0, 0, 0)', [today, xpBase + xpBonus]);
        const doneAch = checkAchievements(db, 'task_done');
        if (doneAch.length) newAchievements = newAchievements.concat(doneAch);
      }
      task = dbGet(db, 'SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    }
    res.json({ ...task, tags: JSON.parse(task.tags || '[]'), xp: xpResult, new_achievements: newAchievements });
    broadcast('task_updated', { id: req.params.id, status: task.status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/tasks/:id', (req, res) => {
  try {
    const children = dbAll(db, 'SELECT id FROM tasks WHERE parentId = ?', [req.params.id]);
    for (const c of children) {
      dbRun(db, 'DELETE FROM schedule WHERE taskId = ?', [c.id]);
      logActivity(db, c.id, 'deleted');
    }
    dbRun(db, 'DELETE FROM tasks WHERE parentId = ?', [req.params.id]);
    dbRun(db, 'DELETE FROM tasks WHERE id = ?', [req.params.id]);
    dbRun(db, 'DELETE FROM schedule WHERE taskId = ?', [req.params.id]);
    dbRun(db, 'DELETE FROM task_links WHERE sourceId = ? OR targetId = ?', [req.params.id, req.params.id]);
    logActivity(db, req.params.id, 'deleted');
    res.json({ ok: true });
    broadcast('task_deleted', { id: req.params.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tasks/:id/children', (req, res) => {
  try {
    const rows = dbAll(db, 'SELECT * FROM tasks WHERE parentId = ? ORDER BY createdAt ASC', [req.params.id]);
    res.json(rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── LINKS ───────────────────────────────────────────────────
app.get('/api/links', (req, res) => {
  try { res.json(dbAll(db, 'SELECT * FROM task_links')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/links', (req, res) => {
  try {
    const { sourceId, targetId, type } = req.body;
    if (!sourceId || !targetId) return res.status(400).json({ error: 'sourceId and targetId required' });
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    dbRun(db, 'INSERT INTO task_links (id, sourceId, targetId, type) VALUES (?, ?, ?, ?)', [id, sourceId, targetId, type || 'related']);
    const xpResult = awardXp(db, 5);
    const newAch = checkAchievements(db);
    res.json({ ...dbGet(db, 'SELECT * FROM task_links WHERE id = ?', [id]), xp: xpResult, new_achievements: newAch });
    broadcast('link_created', { sourceId, targetId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/links/:id', (req, res) => {
  try { dbRun(db, 'DELETE FROM task_links WHERE id = ?', [req.params.id]); res.json({ ok: true }); broadcast('link_deleted', { id: req.params.id }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ACTIVITY ────────────────────────────────────────────────
app.get('/api/activity', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 14;
    const since = Date.now() - days * 86400000;
    res.json(dbAll(db, 'SELECT * FROM task_activity_log WHERE timestamp > ? ORDER BY timestamp', [since]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/activity/trigger', (req, res) => {
  try {
    const newAch = checkAchievements(db, req.body?.trigger || 'graph_pan');
    if (newAch.length) broadcast('achievements', newAch);
    res.json({ ok: true, new_achievements: newAch });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── SCHEDULE ────────────────────────────────────────────────
app.get('/api/schedule', (req, res) => {
  try {
    const rows = dbAll(db, 'SELECT * FROM schedule ORDER BY date, start');
    const grouped = {};
    for (const r of rows) { if (!grouped[r.date]) grouped[r.date] = []; grouped[r.date].push({ id: r.id, taskId: r.taskId, start: r.start, end: r.end }); }
    res.json(grouped);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/schedule', (req, res) => {
  try {
    const { date, taskId, start, end } = req.body;
    if (!date || !taskId || !start || !end) return res.status(400).json({ error: 'Missing fields' });
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    dbRun(db, 'INSERT INTO schedule (id, date, taskId, start, end) VALUES (?, ?, ?, ?, ?)', [id, date, taskId, start, end]);
    logActivity(db, taskId, 'scheduled');
    const xpResult = awardXp(db, 5);
    const newAch = checkAchievements(db, 'schedule');
    res.json({ id, date, taskId, start, end, xp: xpResult, new_achievements: newAch });
    broadcast('schedule_changed', { date, taskId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/schedule/:date/:taskId', (req, res) => {
  try {
    dbRun(db, 'DELETE FROM schedule WHERE date = ? AND taskId = ?', [req.params.date, req.params.taskId]);
    logActivity(db, req.params.taskId, 'unscheduled');
    res.json({ ok: true });
    broadcast('schedule_changed', { date: req.params.date, taskId: req.params.taskId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── NOTES ───────────────────────────────────────────────────
app.get('/api/notes', (req, res) => {
  try { res.json(dbAll(db, 'SELECT * FROM notes ORDER BY createdAt DESC')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notes', (req, res) => {
  try {
    const { title, content } = req.body;
    const id = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const now = Date.now();
    dbRun(db, 'INSERT INTO notes (id, title, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)', [id, title || 'Новая заметка', content || '', now, now]);
    const xpResult = awardXp(db, 5);
    const today = new Date().toISOString().slice(0, 10);
    const ds = dbGet(db, 'SELECT * FROM daily_stats WHERE date = ?', [today]);
    if (ds) dbRun(db, 'UPDATE daily_stats SET notes_created = notes_created + 1 WHERE date = ?', [today]);
    else dbRun(db, 'INSERT INTO daily_stats (date, tasks_completed, xp_earned, time_tracked, notes_created, tasks_created) VALUES (?, 0, 5, 0, 1, 0)', [today]);
    const note = dbGet(db, 'SELECT * FROM notes WHERE id = ?', [id]);
    syncWikiLinks(db, 'note', id, (title || '') + ' ' + (content || ''));
    const newAch = checkAchievements(db, 'note');
    res.json({ ...note, xp: xpResult, new_achievements: newAch });
    broadcast('note_created', { id: note.id, title: note.title });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notes/:id', (req, res) => {
  try {
    const existing = dbGet(db, 'SELECT * FROM notes WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Note not found' });
    const { title, content } = req.body;
    dbRun(db, 'UPDATE notes SET title=?, content=?, updatedAt=? WHERE id=?', [
      title !== undefined ? title : existing.title,
      content !== undefined ? content : existing.content, Date.now(), req.params.id]);
    const fullText = (title !== undefined ? title : existing.title) + ' ' + (content !== undefined ? content : existing.content);
    syncWikiLinks(db, 'note', req.params.id, fullText);
    res.json(dbGet(db, 'SELECT * FROM notes WHERE id = ?', [req.params.id]));
    broadcast('note_updated', { id: req.params.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/notes/:id', (req, res) => {
  try { dbRun(db, 'DELETE FROM notes WHERE id = ?', [req.params.id]); res.json({ ok: true }); broadcast('note_deleted', { id: req.params.id }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── SETTINGS ────────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  try {
    const rows = dbAll(db, 'SELECT * FROM settings');
    const s = {}; for (const r of rows) s[r.key] = r.value;
    res.json(s);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/settings', (req, res) => {
  try {
    for (const [k, v] of Object.entries(req.body)) {
      dbRun(db, 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [k, String(v)]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── TIME ENTRIES ────────────────────────────────────────────
app.get('/api/time-entries', (req, res) => {
  try { res.json(dbAll(db, 'SELECT * FROM time_entries ORDER BY startTime DESC')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/time-entries/:taskId', (req, res) => {
  try { res.json(dbAll(db, 'SELECT * FROM time_entries WHERE taskId = ? ORDER BY startTime DESC', [req.params.taskId])); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/time-entries', (req, res) => {
  try {
    const { taskId, startTime, endTime, duration } = req.body;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    dbRun(db, 'INSERT INTO time_entries (id, taskId, startTime, endTime, duration) VALUES (?, ?, ?, ?, ?)',
      [id, taskId, startTime || Date.now(), endTime || null, duration || 0]);
    const entries = dbAll(db, 'SELECT duration FROM time_entries WHERE taskId = ?', [taskId]);
    const total = entries.reduce((s, e) => s + (e.duration || 0), 0);
    dbRun(db, 'UPDATE tasks SET actualTime = ? WHERE id = ?', [total, taskId]);
    const durSeconds = duration || 0;
    const xpMinutes = Math.floor(durSeconds / 600);
    let xpResult = null;
    if (xpMinutes > 0) {
      xpResult = awardXp(db, xpMinutes);
      dbRun(db, 'UPDATE user_xp SET total_time_tracked = total_time_tracked + ? WHERE id = 1', [xpMinutes]);
    }
    const newAch = checkAchievements(db, 'time');
    res.json({ ...dbGet(db, 'SELECT * FROM time_entries WHERE id = ?', [id]), xp: xpResult, new_achievements: newAch });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/time-entries/:id', (req, res) => {
  try {
    const existing = dbGet(db, 'SELECT * FROM time_entries WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { endTime, duration } = req.body;
    const newDuration = duration !== undefined ? duration : existing.duration;
    dbRun(db, 'UPDATE time_entries SET endTime = ?, duration = ? WHERE id = ?',
      [endTime !== undefined ? endTime : existing.endTime, newDuration, req.params.id]);
    const entries = dbAll(db, 'SELECT duration FROM time_entries WHERE taskId = ?', [existing.taskId]);
    const total = entries.reduce((s, e) => s + (e.duration || 0), 0);
    dbRun(db, 'UPDATE tasks SET actualTime = ? WHERE id = ?', [total, existing.taskId]);
    const deltaSeconds = Math.max(0, (newDuration || 0) - (existing.duration || 0));
    const xpMinutes = Math.floor(deltaSeconds / 600);
    let xpResult = null;
    if (xpMinutes > 0) {
      xpResult = awardXp(db, xpMinutes);
      dbRun(db, 'UPDATE user_xp SET total_time_tracked = total_time_tracked + ? WHERE id = 1', [xpMinutes]);
    }
    const newAch = checkAchievements(db, 'time');
    res.json({ ...dbGet(db, 'SELECT * FROM time_entries WHERE id = ?', [req.params.id]), xp: xpResult, new_achievements: newAch });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/time-entries/:id', (req, res) => {
  try {
    const existing = dbGet(db, 'SELECT * FROM time_entries WHERE id = ?', [req.params.id]);
    dbRun(db, 'DELETE FROM time_entries WHERE id = ?', [req.params.id]);
    if (existing) {
      const entries = dbAll(db, 'SELECT duration FROM time_entries WHERE taskId = ?', [existing.taskId]);
      const total = entries.reduce((s, e) => s + (e.duration || 0), 0);
      dbRun(db, 'UPDATE tasks SET actualTime = ? WHERE id = ?', [total, existing.taskId]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── DAILY NOTES ─────────────────────────────────────────────
app.get('/api/daily-notes', (req, res) => {
  try { res.json(dbAll(db, 'SELECT * FROM daily_notes ORDER BY date DESC')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/daily-notes/:date', (req, res) => {
  try {
    const row = dbGet(db, 'SELECT * FROM daily_notes WHERE date = ?', [req.params.date]);
    if (!row) {
      const tmplRow = dbGet(db, "SELECT value FROM settings WHERE key = 'dailyNoteTemplate'");
      const template = tmplRow ? tmplRow.value : '';
      const id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const now = Date.now();
      dbRun(db, 'INSERT INTO daily_notes (id, date, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)', [id, req.params.date, template, now, now]);
      return res.json(dbGet(db, 'SELECT * FROM daily_notes WHERE id = ?', [id]));
    }
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/daily-notes', (req, res) => {
  try {
    const { date, content } = req.body;
    if (!date) return res.status(400).json({ error: 'Date required' });
    const existing = dbGet(db, 'SELECT * FROM daily_notes WHERE date = ?', [date]);
    let isNew = false;
    if (existing) {
      dbRun(db, 'UPDATE daily_notes SET content = ?, updatedAt = ? WHERE date = ?', [content !== undefined ? content : existing.content, Date.now(), date]);
    } else {
      isNew = true;
      const id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      dbRun(db, 'INSERT INTO daily_notes (id, date, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)', [id, date, content || '', Date.now(), Date.now()]);
    }
    const dnData = dbGet(db, 'SELECT * FROM daily_notes WHERE date = ?', [date]);
    const newAch = isNew ? checkAchievements(db, 'daily_note') : [];
    if (newAch.length) broadcast('achievements', newAch);
    res.json({ ...dnData, new_achievements: newAch });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/daily-notes/:date', (req, res) => {
  try {
    const { content } = req.body;
    const existing = dbGet(db, 'SELECT * FROM daily_notes WHERE date = ?', [req.params.date]);
    if (existing) {
      dbRun(db, 'UPDATE daily_notes SET content = ?, updatedAt = ? WHERE date = ?', [content !== undefined ? content : existing.content, Date.now(), req.params.date]);
    } else {
      const id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      dbRun(db, 'INSERT INTO daily_notes (id, date, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)', [id, req.params.date, content || '', Date.now(), Date.now()]);
    }
    res.json(dbGet(db, 'SELECT * FROM daily_notes WHERE date = ?', [req.params.date]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── COMMENTS ────────────────────────────────────────────────
app.get('/api/comments/:taskId', (req, res) => {
  try { res.json(dbAll(db, 'SELECT * FROM task_comments WHERE taskId = ? ORDER BY timestamp ASC', [req.params.taskId])); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/comments', (req, res) => {
  try {
    const { taskId, text } = req.body;
    if (!taskId || !text || !text.trim()) return res.status(400).json({ error: 'taskId and text required' });
    const id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    dbRun(db, 'INSERT INTO task_comments (id, taskId, text, timestamp) VALUES (?, ?, ?, ?)', [id, taskId, text.trim(), Date.now()]);
    logActivity(db, taskId, 'commented');
    const commentData = dbGet(db, 'SELECT * FROM task_comments WHERE id = ?', [id]);
    const newAch = checkAchievements(db, 'comment');
    if (newAch.length) broadcast('achievements', newAch);
    res.json({ ...commentData, new_achievements: newAch });
    broadcast('comment_added', { taskId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/comments/:id', (req, res) => {
  try { dbRun(db, 'DELETE FROM task_comments WHERE id = ?', [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── TEMPLATES ───────────────────────────────────────────────
app.get('/api/templates', (req, res) => {
  try { res.json(dbAll(db, 'SELECT * FROM task_templates ORDER BY createdAt DESC').map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') }))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/templates', (req, res) => {
  try {
    const { title, desc, priority, estimate, tags } = req.body;
    const id = 'tpl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    dbRun(db, 'INSERT INTO task_templates (id, title, desc, priority, estimate, tags, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, title || '', desc || '', priority || 'medium', estimate || 30, JSON.stringify(tags || []), Date.now()]);
    res.json(dbGet(db, 'SELECT * FROM task_templates WHERE id = ?', [id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/templates/:id', (req, res) => {
  try { dbRun(db, 'DELETE FROM task_templates WHERE id = ?', [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ATTACHMENTS ────────────────────────────────────────────
app.get('/api/attachments/:taskId', (req, res) => {
  try { res.json(dbAll(db, 'SELECT id, taskId, name, type, size, timestamp FROM task_attachments WHERE taskId = ? ORDER BY timestamp DESC', [req.params.taskId])); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/attachments/:taskId/:id', (req, res) => {
  try {
    const row = dbGet(db, 'SELECT * FROM task_attachments WHERE taskId = ? AND id = ?', [req.params.taskId, req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/attachments', (req, res) => {
  try {
    const { taskId, name, type, data, size } = req.body;
    if (!taskId || !name || !data) return res.status(400).json({ error: 'taskId, name, and data required' });
    if (data.length > 5000000) return res.status(400).json({ error: 'File too large (max 5MB)' });
    const id = 'att' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    dbRun(db, 'INSERT INTO task_attachments (id, taskId, name, type, data, size, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, taskId, name, type || '', data, size || 0, Date.now()]);
    logActivity(db, taskId, 'attachment_added');
    res.json({ id, taskId, name, type: type || '', size: size || 0, timestamp: Date.now() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/attachments/:taskId/:id', (req, res) => {
  try { dbRun(db, 'DELETE FROM task_attachments WHERE taskId = ? AND id = ?', [req.params.taskId, req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── RECURRING TASKS ────────────────────────────────────────
app.post('/api/tasks/:id/recurring', (req, res) => {
  try {
    const { recurring } = req.body;
    const existing = dbGet(db, 'SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    dbRun(db, 'UPDATE tasks SET recurring = ? WHERE id = ?', [recurring || null, req.params.id]);
    logActivity(db, req.params.id, recurring ? 'recurring:' + recurring : 'recurring_off');
    res.json({ ok: true, recurring });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function processRecurring(taskId) {
  try {
    const task = dbGet(db, 'SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!task || !task.recurring) return;
    const rule = task.recurring;
    const today = new Date();
    let nextDate = '';
    if (rule === 'daily') nextDate = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
    else if (rule === 'weekly') nextDate = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
    else if (rule === 'monthly') nextDate = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate()).toISOString().slice(0, 10);
    else if (rule === 'weekdays') {
      let next = new Date(today.getTime() + 86400000);
      while (next.getDay() === 0 || next.getDay() === 6) next = new Date(next.getTime() + 86400000);
      nextDate = next.toISOString().slice(0, 10);
    }
    if (nextDate) {
      const newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const now = Date.now();
      dbRun(db, `INSERT INTO tasks (id, title, desc, priority, status, dueDate, estimate, actualTime, tags, parentId, recurring, favorite, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, 'backlog', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId, task.title, task.desc || '', task.priority, nextDate, task.estimate || 30, task.actualTime || 0, task.tags, task.parentId, task.recurring, task.favorite || 0, now, now]);
      logActivity(db, newId, 'recurring_created');
    }
  } catch (e) { console.error('Recurring process error:', e.message); }
}

// ─── TAG MANAGEMENT ─────────────────────────────────────────
app.post('/api/tags/rename', (req, res) => {
  try {
    const { oldName, newName } = req.body;
    if (!oldName || !newName || !newName.trim()) return res.status(400).json({ error: 'oldName and newName required' });
    const allTasks = dbAll(db, 'SELECT * FROM tasks');
    let count = 0;
    for (const task of allTasks) {
      const tags = JSON.parse(task.tags || '[]');
      if (tags.includes(oldName)) {
        dbRun(db, 'UPDATE tasks SET tags = ? WHERE id = ?', [JSON.stringify(tags.map(t => t === oldName ? newName.trim() : t)), task.id]);
        count++;
      }
    }
    res.json({ ok: true, count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tags/delete', (req, res) => {
  try {
    const { tagName } = req.body;
    if (!tagName) return res.status(400).json({ error: 'tagName required' });
    const allTasks = dbAll(db, 'SELECT * FROM tasks');
    let count = 0;
    for (const task of allTasks) {
      const tags = JSON.parse(task.tags || '[]');
      if (tags.includes(tagName)) {
        dbRun(db, 'UPDATE tasks SET tags = ? WHERE id = ?', [JSON.stringify(tags.filter(t => t !== tagName)), task.id]);
        count++;
      }
    }
    res.json({ ok: true, count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tags', (req, res) => {
  try {
    const allTasks = dbAll(db, 'SELECT tags FROM tasks');
    const tagMap = {};
    for (const task of allTasks) { const tags = JSON.parse(task.tags || '[]'); for (const t of tags) tagMap[t] = (tagMap[t] || 0) + 1; }
    res.json(Object.entries(tagMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ADVANCED SEARCH ────────────────────────────────────────
app.post('/api/search', (req, res) => {
  try {
    const { query, status, priority, tags, dueBefore, dueAfter } = req.body;
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];
    if (query) { sql += ' AND (title LIKE ? OR desc LIKE ?)'; params.push('%' + query + '%', '%' + query + '%'); }
    if (status) { const stList = Array.isArray(status) ? status : [status]; sql += ' AND status IN (' + stList.map(() => '?').join(',') + ')'; params.push(...stList); }
    if (priority) { const prList = Array.isArray(priority) ? priority : [priority]; sql += ' AND priority IN (' + prList.map(() => '?').join(',') + ')'; params.push(...prList); }
    if (tags && tags.length > 0) { for (const t of tags) { sql += ' AND tags LIKE ?'; params.push('%"' + t + '"%'); } }
    if (dueBefore) { sql += ' AND dueDate <= ? AND dueDate != ""'; params.push(dueBefore); }
    if (dueAfter) { sql += ' AND dueDate >= ?'; params.push(dueAfter); }
    sql += ' ORDER BY createdAt DESC LIMIT 200';
    res.json(dbAll(db, sql, params).map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ANALYTICS ───────────────────────────────────────────────
app.get('/api/analytics/time-by-tag', (req, res) => {
  try {
    const entries = dbAll(db, 'SELECT te.*, t.tags FROM time_entries te LEFT JOIN tasks t ON te.taskId = t.id');
    const tagTime = {};
    for (const e of entries) {
      const tags = JSON.parse(e.tags || '[]');
      const dur = (e.duration || 0) / 60;
      if (tags.length === 0) tagTime['Без тега'] = (tagTime['Без тега'] || 0) + dur;
      else { const perTag = dur / tags.length; for (const t of tags) tagTime[t] = (tagTime[t] || 0) + perTag; }
    }
    res.json(tagTime);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/analytics/summary', (req, res) => {
  try {
    const allTasks = dbAll(db, 'SELECT * FROM tasks');
    const totalEstimate = allTasks.reduce((s, t) => s + (t.estimate || 0), 0);
    const totalActual = allTasks.reduce((s, t) => s + (t.actualTime || 0), 0);
    const doneTasks = allTasks.filter(t => t.status === 'done');
    const doneEstimate = doneTasks.reduce((s, t) => s + (t.estimate || 0), 0);
    const doneActual = doneTasks.reduce((s, t) => s + (t.actualTime || 0), 0);
    res.json({ totalEstimate, totalActual, doneEstimate, doneActual, totalTasks: allTasks.length, doneTasks: doneTasks.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/analytics/productivity', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date(); since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);
    const logs = dbAll(db, 'SELECT * FROM productivity_log WHERE date >= ?', [sinceStr]);
    const hourCounts = {};
    for (let h = 0; h < 24; h++) hourCounts[h] = { count: 0, weight: 0 };
    for (const log of logs) {
      const h = log.hour;
      if (hourCounts[h]) { hourCounts[h].count++; hourCounts[h].weight += (log.priority === 'high' ? 3 : log.priority === 'medium' ? 2 : 1); }
    }
    const maxWeight = Math.max(1, ...Object.values(hourCounts).map(h => h.weight));
    const heatmap = [];
    for (let h = 0; h < 24; h++) {
      heatmap.push({ hour: h, label: h + ':00', count: hourCounts[h].count, weight: hourCounts[h].weight, intensity: hourCounts[h].weight / maxWeight });
    }
    const sorted = [...heatmap].sort((a, b) => b.weight - a.weight);
    const goldenHours = sorted.slice(0, 3).filter(h => h.weight > 0).map(h => h.hour);
    const slumpHours = sorted.slice(-3).filter(h => h.count < 2).map(h => h.hour);
    res.json({ heatmap, goldenHours, slumpHours, totalEvents: logs.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── AUTOMATION RULES ──────────────────────────────────────
app.get('/api/rules', (req, res) => {
  try {
    res.json(dbAll(db, 'SELECT * FROM automation_rules ORDER BY createdAt DESC').map(r => ({
      ...r, trigger_config: JSON.parse(r.trigger_config || '{}'), action_config: JSON.parse(r.action_config || '{}'), enabled: !!r.enabled
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/rules', (req, res) => {
  try {
    const { trigger_type, trigger_config, action_type, action_config, name } = req.body;
    if (!trigger_type || !action_type) return res.status(400).json({ error: 'trigger_type and action_type required' });
    const id = 'rule_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    dbRun(db, 'INSERT INTO automation_rules (id, trigger_type, trigger_config, action_type, action_config, name, enabled, createdAt) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
      [id, trigger_type, JSON.stringify(trigger_config || {}), action_type, JSON.stringify(action_config || {}), name || '', Date.now()]);
    res.json(dbGet(db, 'SELECT * FROM automation_rules WHERE id = ?', [id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/rules/:id', (req, res) => {
  try {
    const existing = dbGet(db, 'SELECT * FROM automation_rules WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Rule not found' });
    const { enabled, trigger_config, action_config, name } = req.body;
    dbRun(db, 'UPDATE automation_rules SET enabled = ?, trigger_config = ?, action_config = ?, name = ? WHERE id = ?',
      [enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
      JSON.stringify(trigger_config !== undefined ? trigger_config : JSON.parse(existing.trigger_config || '{}')),
      JSON.stringify(action_config !== undefined ? action_config : JSON.parse(existing.action_config || '{}')),
      name !== undefined ? name : existing.name, req.params.id]);
    res.json(dbGet(db, 'SELECT * FROM automation_rules WHERE id = ?', [req.params.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/rules/:id', (req, res) => {
  try { dbRun(db, 'DELETE FROM automation_rules WHERE id = ?', [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

function processAutomationRules(db, triggerType, task, extra) {
  try {
    const rules = dbAll(db, "SELECT * FROM automation_rules WHERE trigger_type = ? AND enabled = 1", [triggerType]);
    for (const rule of rules) {
      const tConf = JSON.parse(rule.trigger_config || '{}');
      const aConf = JSON.parse(rule.action_config || '{}');
      if (triggerType === 'status_change') {
        if (tConf.from_status && tConf.from_status !== (extra?.oldStatus || '')) continue;
        if (tConf.to_status && tConf.to_status !== task.status) continue;
      }
      if (triggerType === 'task_created') {
        if (tConf.priority && tConf.priority !== task.priority) continue;
        if (tConf.has_tag) { const tags = JSON.parse(task.tags || '[]'); if (!tags.includes(tConf.has_tag)) continue; }
      }
      if (rule.action_type === 'set_priority') { dbRun(db, 'UPDATE tasks SET priority = ?, updatedAt = ? WHERE id = ?', [aConf.priority || 'medium', Date.now(), task.id]); logActivity(db, task.id, 'auto:priority->' + (aConf.priority || 'medium')); }
      else if (rule.action_type === 'set_status') { dbRun(db, 'UPDATE tasks SET status = ?, updatedAt = ? WHERE id = ?', [aConf.status || 'backlog', Date.now(), task.id]); logActivity(db, task.id, 'auto:status->' + (aConf.status || 'backlog')); }
      else if (rule.action_type === 'add_tag') { const tags = JSON.parse(task.tags || '[]'); if (!tags.includes(aConf.tag)) { tags.push(aConf.tag); dbRun(db, 'UPDATE tasks SET tags = ?, updatedAt = ? WHERE id = ?', [JSON.stringify(tags), Date.now(), task.id]); } }
      else if (rule.action_type === 'add_comment') { const cid = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); dbRun(db, 'INSERT INTO task_comments (id, taskId, text, timestamp) VALUES (?, ?, ?, ?)', [cid, task.id, aConf.text || 'Автоматический комментарий', Date.now()]); }
    }
  } catch (e) { console.error('Automation rules error:', e.message); }
}

// ─── AI SCHEDULER ────────────────────────────────────────────
app.post('/api/ai/schedule', async (req, res) => {
  try {
    const { date, taskIds, workStart, workEnd, slotDuration, aiKey } = req.body;
    const startMin = timeToMin(workStart || '09:00');
    const endMin = timeToMin(workEnd || '18:00');
    const slot = slotDuration || 30;
    if (aiKey && taskIds && taskIds.length > 0) {
      try {
        const placeholders = taskIds.map(() => '?').join(',');
        const tasks = dbAll(db, `SELECT * FROM tasks WHERE id IN (${placeholders})`, taskIds);
        const prompt = `Ты — AI-планировщик. Составь расписание на ${date} с ${workStart || '09:00'} до ${workEnd || '18:00'}.\nЗадачи:\n${tasks.map((t, i) => `${i+1}. "${t.title}" (приоритет: ${t.priority}, срок: ${t.dueDate || 'нет'}, время: ${t.estimate || slot}мин)`).join('\n')}\nОтветь только JSON:\n[{"start": "ЧЧ:ММ", "end": "ЧЧ:ММ", "taskId": "..."}]`;
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + aiKey },
          body: JSON.stringify({ model: 'google/gemini-2.0-flash-exp:free', messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 2000 }),
        });
        const body = await resp.text();
        if (resp.ok) { const data = JSON.parse(body); const text = data.choices[0].message.content; const match = text.match(/\[[\s\S]*\]/); if (match) { const newAch = checkAchievements(db, 'ai_schedule'); if (newAch.length) broadcast('achievements', newAch); return res.json({ schedule: JSON.parse(match[0]), source: 'openrouter', new_achievements: newAch }); } }
      } catch (e) { console.error('AI schedule fallback:', e.message); }
    }
    if (!taskIds || taskIds.length === 0) return res.json({ schedule: [], source: 'local' });
    const placeholders = taskIds.map(() => '?').join(',');
    const tasks = dbAll(db, `SELECT * FROM tasks WHERE id IN (${placeholders})`, taskIds);
    const SCORE = { high: 3, medium: 2, low: 1 };
    tasks.sort((a, b) => { let sa = SCORE[a.priority] || 0, sb = SCORE[b.priority] || 0; if (a.dueDate && a.dueDate < new Date().toISOString().slice(0,10)) sa += 3; if (b.dueDate && b.dueDate < new Date().toISOString().slice(0,10)) sb += 3; return sb - sa; });
    const existing = dbAll(db, "SELECT * FROM schedule WHERE date = ?", [date]);
    const taken = existing.map(s => ({ start: timeToMin(s.start), end: timeToMin(s.end) })).sort((a, b) => a.start - b.start);
    const schedule = [];
    let current = startMin;
    for (const task of tasks) {
      const dur = Math.min(task.estimate || slot, 120);
      for (const t of taken) { if (current >= t.start && current < t.end) current = t.end; }
      if (current + dur > endMin) break;
      schedule.push({ start: formatTime(current), end: formatTime(current + dur), taskId: task.id });
      current += dur + 5;
    }
    res.json({ schedule, source: 'local' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── AI ORGANIZE ─────────────────────────────────────────────
app.post('/api/ai/organize', async (req, res) => {
  try {
    const { aiKey } = req.body;
    const allTasks = dbAll(db, 'SELECT * FROM tasks ORDER BY createdAt DESC');
    const existing = dbAll(db, 'SELECT * FROM task_links');
    const suggestions = { links: [], parents: [] };
    for (let i = 0; i < allTasks.length; i++) {
      for (let j = i + 1; j < allTasks.length; j++) {
        const a = allTasks[i], b = allTasks[j];
        const alreadyLinked = existing.some(l => (l.sourceId === a.id && l.targetId === b.id) || (l.sourceId === b.id && l.targetId === a.id));
        if (alreadyLinked || a.id === b.id) continue;
        const wordsA = (a.title + ' ' + (a.desc || '')).toLowerCase().split(/\W+/).filter(Boolean);
        const wordsB = (b.title + ' ' + (b.desc || '')).toLowerCase().split(/\W+/).filter(Boolean);
        const overlap = wordsA.filter(w => wordsB.includes(w)).length;
        const score = overlap / Math.max(wordsA.length, wordsB.length, 1);
        if (score > 0.35) suggestions.links.push({ sourceId: a.id, targetId: b.id, score, reason: 'Похожие названия' });
      }
    }
    const newAch = checkAchievements(db, 'ai_organize');
    if (newAch.length) broadcast('achievements', newAch);
    res.json({ ...suggestions, new_achievements: newAch });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── AI CHAT ────────────────────────────────────────────────
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, aiKey } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message required' });
    if (!aiKey || aiKey.length < 10) return res.json({ reply: 'API-ключ OpenRouter не настроен. Добавьте ключ в Настройки.', source: 'local' });
    const allTasks = dbAll(db, 'SELECT * FROM tasks ORDER BY createdAt DESC');
    const today = new Date().toISOString().slice(0, 10);
    const context = `Ты — AI-ассистент PTM. Отвечай кратко, по-русски.\nДата: ${today}\nВсего задач: ${allTasks.length}\nВыполнено: ${allTasks.filter(t => t.status === 'done').length}\nВ работе: ${allTasks.filter(t => t.status === 'todo').length}\nПросрочено: ${allTasks.filter(t => t.dueDate && t.dueDate < today && t.status !== 'done').length}\n\nЗадачи:\n${allTasks.slice(0, 50).map(t => `[${t.status}] "${t.title}" (приоритет:${t.priority}, срок:${t.dueDate || 'нет'})`).join('\n')}\n\nВопрос: ${message.trim()}`;
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + aiKey },
      body: JSON.stringify({ model: 'google/gemini-2.0-flash-exp:free', messages: [{ role: 'user', content: context }], temperature: 0.5, max_tokens: 1500 }),
    });
    const body = await resp.text();
    if (resp.ok) { const data = JSON.parse(body); const newAch = checkAchievements(db, 'ai_chat'); if (newAch.length) broadcast('achievements', newAch); res.json({ reply: data.choices[0].message.content, source: 'openrouter', new_achievements: newAch }); }
    else res.json({ reply: 'Ошибка AI: ' + body.slice(0, 200), source: 'error' });
  } catch (e) { res.json({ reply: 'Ошибка соединения с AI.', source: 'error' }); }
});

// ─── CHRONOPLAN ──────────────────────────────────────────────
app.post('/api/ai/chronoplan', async (req, res) => {
  try {
    const { date, aiKey } = req.body;
    const allTasks = dbAll(db, "SELECT * FROM tasks WHERE status != 'done' ORDER BY createdAt DESC");
    const since30 = Date.now() - 30 * 86400000;
    const logs = dbAll(db, 'SELECT * FROM productivity_log WHERE timestamp > ?', [since30]);
    const hourCounts = {};
    for (let h = 0; h < 24; h++) hourCounts[h] = 0;
    for (const log of logs) hourCounts[log.hour] = (hourCounts[log.hour] || 0) + 1;
    const goldenHours = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).filter(e => e[1] > 0).map(e => parseInt(e[0]));
    const settings = {};
    const settingsRows = dbAll(db, 'SELECT * FROM settings');
    for (const r of settingsRows) settings[r.key] = r.value;
    const SCORE = { high: 3, medium: 2, low: 1 };
    const sorted = [...allTasks].sort((a, b) => { let sa = SCORE[a.priority] || 0, sb = SCORE[b.priority] || 0; if (a.dueDate && a.dueDate < date) sa += 3; if (b.dueDate && b.dueDate < date) sb += 3; return sb - sa; });
    const startMin = timeToMin(settings.workStart || '09:00');
    const endMin = timeToMin(settings.workEnd || '18:00');
    const schedule = [];
    let current = startMin;
    for (const task of sorted.slice(0, 10)) {
      const dur = Math.min(task.estimate || 30, 120);
      if (current + dur > endMin) break;
      schedule.push({ start: formatTime(current), end: formatTime(current + dur), taskId: task.id, title: task.title, priority: task.priority });
      current += dur + 5;
    }
    res.json({ schedule, goldenHours, aiInsight: goldenHours.length > 0 ? 'Золотые часы: ' + goldenHours.map(h => h + ':00').join(', ') + '. Ставьте важные задачи на это время!' : 'Недостаточно данных для анализа.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── REPORT ─────────────────────────────────────────────────
app.get('/api/analytics/report', (req, res) => {
  try {
    const period = req.query.period || 'week';
    const days = period === 'month' ? 30 : 7;
    const since = new Date(); since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);
    const dailyStats = dbAll(db, 'SELECT * FROM daily_stats WHERE date >= ? ORDER BY date', [sinceStr]);
    const hoursSince = since.getTime();
    const timeEntries = dbAll(db, 'SELECT * FROM time_entries WHERE startTime >= ?', [hoursSince]);
    const tasksInPeriod = dbAll(db, 'SELECT * FROM tasks WHERE createdAt >= ?', [hoursSince]);
    const tasksDoneInPeriod = tasksInPeriod.filter(t => t.status === 'done');
    const totalTimeSec = timeEntries.reduce((s, e) => s + (e.duration || 0), 0);
    const xpEarned = dailyStats.reduce((s, d) => s + (d.xp_earned || 0), 0);
    const tasksCreated = dailyStats.reduce((s, d) => s + (d.tasks_created || 0), 0);
    const tasksCompleted = dailyStats.reduce((s, d) => s + (d.tasks_completed || 0), 0);
    const notesCreated = dailyStats.reduce((s, d) => s + (d.notes_created || 0), 0);
    const dayLabels = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
    const dailyBreakdown = dailyStats.map(d => {
      const day = new Date(d.date + 'T00:00:00');
      return { date: d.date, day: dayLabels[day.getDay()], xp: d.xp_earned || 0, tasks_done: d.tasks_completed || 0 };
    });
    const allTags = new Map();
    const recentTasks = dbAll(db, 'SELECT tags FROM tasks WHERE updatedAt >= ? OR createdAt >= ?', [hoursSince, hoursSince]);
    recentTasks.forEach(t => { JSON.parse(t.tags || '[]').forEach(tg => allTags.set(tg, (allTags.get(tg) || 0) + 1)); });
    const topTags = [...allTags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
    res.json({ period: period === 'month' ? 'месяц' : 'неделя', days, totalTimeSec, xpEarned, tasksCreated, tasksCompleted, notesCreated, dailyBreakdown, topTags });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── KNOWLEDGE GRAPH ─────────────────────────────────────────
app.get('/api/knowledge-graph', (req, res) => {
  try {
    const allTasks = dbAll(db, 'SELECT * FROM tasks');
    const links = dbAll(db, 'SELECT * FROM task_links');
    const notes = dbAll(db, 'SELECT * FROM notes');
    const nodes = [];
    const edges = [];
    const taskMap = {};
    for (const t of allTasks) {
      const id = 'task:' + t.id;
      taskMap[t.id] = id;
      const size = t.status === 'done' ? 5 : t.priority === 'high' ? 8 : 6;
      nodes.push({ id, label: t.title, type: 'task', status: t.status, priority: t.priority, size });
    }
    for (const n of notes) {
      nodes.push({ id: 'note:' + n.id, label: n.title, type: 'note', size: 7 });
      const wikiMatches = (n.content || '').match(/\[\[([^\]]+)\]\]/g);
      if (wikiMatches) {
        for (const w of wikiMatches) {
          const name = w.slice(2, -2).toLowerCase();
          for (const t of allTasks) {
            if (t.title.toLowerCase() === name || t.title.toLowerCase().includes(name)) {
              edges.push({ source: 'note:' + n.id, target: 'task:' + t.id, type: 'wikilink' });
            }
          }
        }
      }
    }
    for (const l of links) {
      const s = taskMap[l.sourceId], t = taskMap[l.targetId];
      if (s && t) edges.push({ source: s, target: t, type: l.type || 'related', label: l.type });
    }
    res.json({ nodes, edges });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── XP & ACHIEVEMENTS ─────────────────────────────────────
const LEVELS = [
  { level: 0, name: 'Стажёр', xp: 0 }, { level: 1, name: 'Юниор', xp: 50 },
  { level: 2, name: 'Исследователь', xp: 120 }, { level: 3, name: 'Специалист', xp: 200 },
  { level: 4, name: 'Продвинутый', xp: 350 }, { level: 5, name: 'Эксперт', xp: 500 },
  { level: 6, name: 'Менеджер', xp: 700 }, { level: 7, name: 'Ст. менеджер', xp: 950 },
  { level: 8, name: 'Руководитель', xp: 1250 }, { level: 9, name: 'Директор', xp: 1600 },
  { level: 10, name: 'Ст. директор', xp: 2000 }, { level: 15, name: 'Грандмастер', xp: 5500 },
  { level: 20, name: 'Мифический', xp: 14500 }, { level: 30, name: 'Повелитель вселенных', xp: 82000 },
  { level: 40, name: 'Небожитель', xp: 350000 }, { level: 49, name: 'Альфа и Омега', xp: 9999999 }
];

function getLevel(totalXp) {
  let lv = LEVELS[0];
  for (const l of LEVELS) { if (totalXp >= l.xp) lv = l; else break; }
  return lv;
}

function getXpForNext(level) {
  const next = LEVELS.find(l => l.level > level);
  return next ? next.xp : LEVELS[LEVELS.length - 1].xp;
}

function awardXp(db, amount) {
  let xp = dbGet(db, 'SELECT * FROM user_xp LIMIT 1');
  if (!xp) { dbRun(db, "INSERT INTO user_xp (id, total_xp, level, current_streak, best_streak, last_active_date, total_tasks_done, total_time_tracked, ptm_days_active, updatedAt) VALUES (1, 0, 0, 0, 0, '', 0, 0, 0, ?)", [Date.now()]); xp = { total_xp: 0, level: 0, current_streak: 0, best_streak: 0, last_active_date: '', total_tasks_done: 0, total_time_tracked: 0, ptm_days_active: 0 }; }
  const newTotal = (xp.total_xp || 0) + amount;
  const lv = getLevel(newTotal);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let streak = xp.current_streak || 0;
  if (xp.last_active_date && xp.last_active_date === today) { /* no change */ }
  else if (xp.last_active_date === yesterday) streak++;
  else streak = 1;
  const bestStreak = Math.max(streak, xp.best_streak || 0);
  const lastActiveIsToday = xp.last_active_date && xp.last_active_date === today;
  const ptmDays = (xp.ptm_days_active || 0) + (lastActiveIsToday ? 0 : 1);
  dbRun(db, 'UPDATE user_xp SET total_xp=?, level=?, current_streak=?, best_streak=?, last_active_date=?, ptm_days_active=?, updatedAt=? WHERE id=1',
    [newTotal, lv.level, streak, bestStreak, today, ptmDays, Date.now()]);
  const ds = dbGet(db, 'SELECT * FROM daily_stats WHERE date = ?', [today]);
  if (ds) dbRun(db, 'UPDATE daily_stats SET xp_earned = xp_earned + ? WHERE date = ?', [amount, today]);
  else dbRun(db, 'INSERT INTO daily_stats (date, tasks_completed, xp_earned, time_tracked, notes_created, tasks_created) VALUES (?, 0, ?, 0, 0, 0)', [today, amount]);
  return { total_xp: newTotal, level: lv, streak, bestStreak, xpGained: amount };
}

function logProductivity(db, taskId, task) {
  const now = new Date();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  dbRun(db, 'INSERT INTO productivity_log (id, taskId, date, hour, action, priority, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, taskId, now.toISOString().slice(0, 10), now.getHours(), 'completed', task.priority || 'medium', Date.now()]);
}

app.get('/api/xp', (req, res) => {
  try {
    let xp = dbGet(db, 'SELECT * FROM user_xp WHERE id = 1');
    if (!xp) return res.json({ total_xp: 0, level: 0, level_name: 'Стажёр', progress: 0, next_level_xp: 50, current_streak: 0, best_streak: 0, total_tasks_done: 0, total_time_tracked: 0, ptm_days_active: 0 });
    const lv = getLevel(xp.total_xp || 0);
    const nextXp = getXpForNext(lv.level);
    const prevXp = lv.xp;
    const progress = nextXp > prevXp ? Math.min(100, Math.round(((xp.total_xp - prevXp) / (nextXp - prevXp)) * 100)) : 100;
    res.json({ ...xp, level: lv.level, level_name: lv.name, progress, next_level_xp: nextXp, current_level_xp: prevXp });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/achievements', (req, res) => {
  try { res.json(dbAll(db, 'SELECT * FROM achievements ORDER BY earned_at ASC')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

function checkAchievements(db, trigger) {
  let xp = dbGet(db, 'SELECT * FROM user_xp LIMIT 1');
  if (!xp) { dbRun(db, "INSERT INTO user_xp (id, total_xp, level, current_streak, best_streak, last_active_date, total_tasks_done, total_time_tracked, ptm_days_active, updatedAt) VALUES (1, 0, 0, 0, 0, '', 0, 0, 0, ?)", [Date.now()]); xp = { total_xp: 0, level: 0, current_streak: 0, best_streak: 0, last_active_date: '', total_tasks_done: 0, total_time_tracked: 0, ptm_days_active: 0 }; }
  const earned = dbAll(db, 'SELECT id FROM achievements');
  const earnedIds = new Set(earned.map(e => e.id));
  const newAchievements = [];
  const give = (id, name, desc, icon, cat) => {
    const aid = 'ach_' + id;
    if (earnedIds.has(aid)) return;
    dbRun(db, 'INSERT INTO achievements (id, name, description, icon, earned_at, category) VALUES (?, ?, ?, ?, ?, ?)', [aid, name, desc, icon, Date.now(), cat]);
    newAchievements.push({ id: aid, name, description: desc, icon, category: cat, earned_at: Date.now() });
  };
  const totalDone = xp.total_tasks_done || 0;
  const allTasks = dbAll(db, 'SELECT * FROM tasks');
  const totalCreated = allTasks.length;

  // ── Tasks ──
  if (totalDone >= 1) give('first_blood', 'Первая кровь', 'Выполнить первую задачу', '🩸', 'tasks');
  if (totalDone >= 5) give('five_tasks', 'Пятиборец', 'Выполнить 5 задач', '✋', 'tasks');
  if (totalDone >= 25) give('quarter', 'Четвертак', 'Выполнить 25 задач', '🔢', 'tasks');
  if (totalDone >= 50) give('half_century', 'Полтинник', 'Выполнить 50 задач', '🎱', 'tasks');
  if (totalDone >= 100) give('century', 'Сотня', 'Выполнить 100 задач', '💯', 'tasks');
  if (totalDone >= 365) give('year', 'Годовой отчёт', 'Выполнить 365 задач', '📆', 'tasks');
  if (totalCreated >= 10) give('creator10', 'Создатель', 'Создать 10 задач', '✨', 'tasks');
  if (totalCreated >= 50) give('creator50', 'Фабрика идей', 'Создать 50 задач', '🏭', 'tasks');
  const childrenCount = allTasks.filter(t => t.parentId).length;
  if (childrenCount >= 5) give('parent', 'Родитель', 'Создать 5 подзадач', '👨‍👦', 'tasks');
  if (childrenCount >= 20) give('clan', 'Клан', 'Создать 20 подзадач', '👥', 'tasks');

  // ── Streak ──
  if (xp.current_streak >= 1) give('first_streak', 'Первый день', '1 день подряд', '🌱', 'streak');
  if (xp.current_streak >= 3) give('streak3', 'Разбег', '3 дня подряд', '🔥', 'streak');
  if (xp.current_streak >= 7) give('streak7', 'Неделя огня', '7 дней подряд', '🔥🔥', 'streak');
  if (xp.current_streak >= 14) give('streak14', 'Железная воля', '14 дней подряд', '💪', 'streak');
  if (xp.current_streak >= 30) give('streak30', 'Несокрушимый', '30 дней подряд', '🦾', 'streak');
  if (xp.current_streak >= 100) give('streak100', 'Легенда', '100 дней подряд', '🏆', 'streak');

  // ── Level ──
  if (xp.level >= 1) give('junior', 'Юниор', 'Достичь 1 уровня', '🌟', 'level');
  if (xp.level >= 5) give('lev5', 'Эксперт', 'Достичь 5 уровня', '🎓', 'level');
  if (xp.level >= 10) give('lev10', 'Директор', 'Достичь 10 уровня', '🏢', 'level');
  if (xp.level >= 15) give('lev15', 'Грандмастер', 'Достичь 15 уровня', '👑', 'level');
  if (xp.level >= 20) give('myth', 'Мифический', 'Достичь 20 уровня', '🌀', 'level');

  // ── Time ──
  const totalTimeMinutes = (xp.total_time_tracked || 0) * 10;
  if (totalTimeMinutes >= 30) give('half_hour', 'Полчаса', 'Затрекать 30 минут', '⏱️', 'time');
  if (totalTimeMinutes >= 60) give('hour1', 'Час работы', 'Затрекать 1 час', '⏰', 'time');
  if (totalTimeMinutes >= 600) give('hour10', '10 часов', 'Затрекать 10 часов', '📊', 'time');
  if (totalTimeMinutes >= 3000) give('hour50', '50 часов', 'Затрекать 50 часов', '💼', 'time');
  if (totalTimeMinutes >= 10000) give('hour167', 'Сто часов', 'Затрекать 100 часов', '🎯', 'time');

  if (trigger === 'task_done') {
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 5) give('owl', 'Сова', 'Завершить задачу ночью', '🦉', 'time');
    if (hour >= 5 && hour < 8) give('lark', 'Жаворонок', 'Завершить задачу утром', '🌅', 'time');
    if (hour >= 12 && hour <= 13) give('lunch', 'Обеденный подвиг', 'Завершить задачу в обед', '🍔', 'time');
  }

  // ── Tags ──
  const allTags = new Set();
  allTasks.forEach(t => { JSON.parse(t.tags || '[]').forEach(tg => allTags.add(tg)); });
  if (allTags.size >= 3) give('tagger', 'Меткий', '3+ тегов', '🏷️', 'tags');
  if (allTags.size >= 10) give('collector', 'Коллекционер', '10+ тегов', '📚', 'tags');
  if (allTags.size >= 25) give('librarian', 'Библиотекарь', '25+ тегов', '🗂️', 'tags');

  // ── Links ──
  const links = dbAll(db, 'SELECT * FROM task_links');
  if (links.length >= 1) give('first_link', 'Первая связь', 'Создать первую связь', '🔗', 'links');
  if (links.length >= 10) give('networker', 'Сетевик', '10+ связей', '🕸️', 'links');
  if (links.length >= 50) give('spider', 'Паук', '50+ связей', '🕷️', 'links');

  // ── Notes ──
  const notes = dbAll(db, 'SELECT * FROM notes');
  if (notes.length >= 1) give('first_note', 'Первая заметка', 'Создать первую заметку', '📄', 'notes');
  if (notes.length >= 10) give('thinker', 'Мыслитель', '10+ заметок', '🧠', 'notes');
  if (notes.length >= 50) give('writer', 'Писатель', '50+ заметок', '✍️', 'notes');

  // ── Comments ──
  const allComments = dbAll(db, 'SELECT * FROM task_comments');
  if (trigger === 'comment' && allComments.length >= 1) give('first_comment', 'Комментатор', 'Добавить первый комментарий', '💬', 'comments');
  if (trigger === 'comment' && allComments.length >= 10) give('chatterbox', 'Болтун', '10+ комментариев', '🗣️', 'comments');

  // ── Daily Notes ──
  const dailyNotes = dbAll(db, 'SELECT * FROM daily_notes');
  if (trigger === 'daily_note') give('daily_note', 'Ежедневка', 'Создать первую ежедневную заметку', '📓', 'notes');

  // ── Favorites ──
  const favTasks = allTasks.filter(t => t.favorite);
  if (trigger === 'favorite' && favTasks.length >= 1) give('favorited', 'Избранное', 'Добавить задачу в избранное', '⭐', 'tasks');
  if (trigger === 'favorite' && favTasks.length >= 5) give('favorited5', 'Коллекция', '5 задач в избранном', '🌟', 'tasks');

  // ── AI Organize ──
  if (trigger === 'ai_organize') give('ai_organize', 'AI-организатор', 'Использовать AI-организацию графа', '🔮', 'ai');

  // ── On Time ──
  if (trigger === 'task_done') {
    const todayS = new Date().toISOString().slice(0, 10);
    const timelyTasks = allTasks.filter(t => t.status === 'done' && t.dueDate && t.updatedAt && t.dueDate >= new Date(t.updatedAt).toISOString().slice(0, 10)).length;
    if (timelyTasks >= 1) give('on_time', 'В срок', 'Выполнить задачу до дедлайна', '⏰', 'tasks');
    if (timelyTasks >= 10) give('on_time10', 'Дисциплина', '10 задач до дедлайна', '📋', 'tasks');
  }

  // ── Timer Queue ──
  if (trigger === 'queue' || trigger === 'task_done') {
    const queueEntries = allTasks.filter(t => t.status === 'done' && t.actualTime > 0).length;
    if (queueEntries >= 3) give('queue_user', 'Очередец', 'Выполнить 3 задачи через очередь таймера', '🚶', 'sessions');
  }

  // ── Schedule ──
  if (trigger === 'schedule') give('planner', 'Планировщик', 'Добавить задачу в расписание', '📅', 'schedule');

  // ── Graph ──
  if (trigger === 'graph_pan') give('explorer', 'Исследователь графа', 'Осмотреть граф', '🗺️', 'graph');

  // ── AI ──
  if (trigger === 'ai_schedule') give('ai_scheduler', 'AI-планировщик', 'Использовать AI-расписание', '🤖', 'ai');
  if (trigger === 'ai_chat') give('ai_chat', 'Диалог с AI', 'Написать AI-ассистенту', '💬', 'ai');

  // ── Recurring ──
  const recurringTasks = allTasks.filter(t => t.recurring);
  if (recurringTasks.length >= 1) give('recurring1', 'Цикличность', 'Создать повторяющуюся задачу', '🔁', 'recurring');
  if (recurringTasks.length >= 5) give('recurring5', 'Ритм', '5+ повторяющихся задач', '🔄', 'recurring');

  // ── Sessions ──
  const sessions = dbAll(db, 'SELECT * FROM time_entries');
  if (sessions.length >= 5) give('sessions5', 'Фокус', '5 сессий таймера', '🎯', 'sessions');
  if (sessions.length >= 25) give('sessions25', 'Машина времени', '25 сессий таймера', '⏳', 'sessions');
  if (sessions.length >= 100) give('sessions100', 'Хранитель времени', '100 сессий таймера', '⌛', 'sessions');

  // ── Streak within day (completed today) ──
  const today = new Date().toISOString().slice(0, 10);
  const doneToday = allTasks.filter(t => t.status === 'done' && t.updatedAt && new Date(t.updatedAt).toISOString().slice(0, 10) === today).length;
  if (doneToday >= 3) give('triska', 'Трёшка', '3 задачи за день', '3️⃣', 'daily');
  if (doneToday >= 7) give('weekly', 'Ударный день', '7 задач за день', '7️⃣', 'daily');
  if (doneToday >= 15) give('marathon', 'Марафонец', '15 задач за день', '🏃', 'daily');

  // ── Hidden ──
  if (trigger === 'hidden_panic') give('panic', 'Паническая кнопка', 'Нажать кнопку помощи', '🆘', 'hidden');
  const currentHour = new Date().getHours();
  if (currentHour >= 0 && currentHour < 5) give('midnight', 'Полуночник', 'Работать после полуночи', '🌙', 'hidden');

  return newAchievements;
}

// ─── WIKI LINKS ──────────────────────────────────────────────
function syncWikiLinks(db, sourceType, sourceId, text) {
  try {
    dbRun(db, 'DELETE FROM note_task_links WHERE source_type = ? AND source_id = ?', [sourceType, sourceId]);
    const matches = text.match(/\[\[([^\]]+)\]\]/g);
    if (!matches) return;
    for (const m of matches) {
      const name = m.slice(2, -2);
      const tasks = dbAll(db, 'SELECT id FROM tasks WHERE title LIKE ?', ['%' + name + '%']);
      for (const t of tasks) {
        const id = 'nl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        dbRun(db, 'INSERT INTO note_task_links (id, source_type, source_id, target_type, target_id, link_text, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, sourceType, sourceId, 'task', t.id, name, Date.now()]);
      }
    }
  } catch (e) { console.error('Wiki links sync error:', e.message); }
}

// ─── PUBLIC BOARD ───────────────────────────────────────────
app.get('/api/public/token', (req, res) => {
  try {
    const row = dbGet(db, "SELECT value FROM settings WHERE key = 'publicToken'");
    res.json({ token: row ? row.value : '', url: row && row.value ? '/share/' + row.value : '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/public/token', (req, res) => {
  try {
    const token = 'pub_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    dbRun(db, "INSERT OR REPLACE INTO settings (key, value) VALUES ('publicToken', ?)", [token]);
    res.json({ token, url: '/share/' + token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/public/token', (req, res) => {
  try { dbRun(db, "DELETE FROM settings WHERE key = 'publicToken'"); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── BACKUPS ─────────────────────────────────────────────────
app.get('/api/backups', (req, res) => {
  try {
    const dir = path.join(__dirname, 'data', 'backups');
    if (!fs.existsSync(dir)) return res.json([]);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.db')).sort().reverse().slice(0, 20);
    res.json(files.map(f => ({ name: f, size: fs.statSync(path.join(dir, f)).size, date: f.replace('backup-', '').replace('.db', '') })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── UTILITIES ───────────────────────────────────────────────
function timeToMin(t) { const [h, m] = (t || '00:00').split(':').map(Number); return h * 60 + m; }
function formatTime(m) { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }

// ─── START ───────────────────────────────────────────────────
async function start() {
  db = await initDb();
  startAutoBackup(db);
  const server = app.listen(PORT, () => {
    console.log(`\n🚀 PTM запущен на http://localhost:${PORT}`);
    console.log(`📊 База данных: ${db ? 'OK' : 'ERROR'}`);
    console.log(`🎯 Нажмите Ctrl+C для остановки\n`);
  });
  wss = new WebSocket.Server({ server });
  wss.on('connection', ws => { ws.send(JSON.stringify({ type: 'connected', ts: Date.now() })); });
}

if (!process.env.TEST_DB_PATH) {
  start().catch(err => { console.error('Failed to start:', err); process.exit(1); });
}

module.exports = { app, start, initDb, db, wss, saveDb }; // for testing
