const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.TEST_DB_PATH || path.join(__dirname, 'data', 'orbit.db');

async function initDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const SQL = await initSqlJs();
  let db;

  // Try to copy existing database if V2 DB doesn't exist
    if (!fs.existsSync(DB_PATH)) {
    const oldDbPath = path.join(__dirname, '..', 'ptm-daily-app', 'data', 'ptm-daily.db');
    if (fs.existsSync(oldDbPath)) {
      console.log('📋 Копируем базу данных из ptm-daily-app...');
      const oldBuffer = fs.readFileSync(oldDbPath);
      fs.writeFileSync(DB_PATH, oldBuffer);
      console.log('✅ База данных скопирована! Все задачи перенесены.');
    }
  }

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create all tables
  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    desc TEXT DEFAULT '',
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'backlog',
    dueDate TEXT DEFAULT '',
    estimate INTEGER DEFAULT 30,
    actualTime INTEGER DEFAULT 0,
    tags TEXT DEFAULT '[]',
    parentId TEXT DEFAULT NULL,
    recurring TEXT DEFAULT NULL,
    favorite INTEGER DEFAULT 0,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS task_links (
    id TEXT PRIMARY KEY,
    sourceId TEXT NOT NULL,
    targetId TEXT NOT NULL,
    type TEXT DEFAULT 'related'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS schedule (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    taskId TEXT NOT NULL,
    start TEXT NOT NULL,
    end TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT DEFAULT '',
    content TEXT DEFAULT '',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS task_activity_log (
    id TEXT PRIMARY KEY,
    taskId TEXT DEFAULT '',
    action TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS time_entries (
    id TEXT PRIMARY KEY,
    taskId TEXT NOT NULL,
    startTime INTEGER NOT NULL,
    endTime INTEGER,
    duration INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS daily_notes (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,
    content TEXT DEFAULT '',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS task_comments (
    id TEXT PRIMARY KEY,
    taskId TEXT NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    timestamp INTEGER NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS task_templates (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    desc TEXT DEFAULT '',
    priority TEXT DEFAULT 'medium',
    estimate INTEGER DEFAULT 30,
    tags TEXT DEFAULT '[]',
    createdAt INTEGER NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS task_attachments (
    id TEXT PRIMARY KEY,
    taskId TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    type TEXT DEFAULT '',
    data TEXT NOT NULL DEFAULT '',
    size INTEGER DEFAULT 0,
    timestamp INTEGER NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS automation_rules (
    id TEXT PRIMARY KEY,
    trigger_type TEXT NOT NULL DEFAULT '',
    trigger_config TEXT DEFAULT '{}',
    action_type TEXT NOT NULL DEFAULT '',
    action_config TEXT DEFAULT '{}',
    enabled INTEGER DEFAULT 1,
    name TEXT DEFAULT '',
    createdAt INTEGER NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS user_xp (
    id INTEGER PRIMARY KEY DEFAULT 1,
    total_xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    last_active_date TEXT DEFAULT '',
    total_tasks_done INTEGER DEFAULT 0,
    total_time_tracked INTEGER DEFAULT 0,
    ptm_days_active INTEGER DEFAULT 0,
    updatedAt INTEGER NOT NULL DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    description TEXT DEFAULT '',
    icon TEXT DEFAULT '',
    earned_at INTEGER NOT NULL DEFAULT 0,
    category TEXT DEFAULT ''
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS daily_stats (
    date TEXT PRIMARY KEY,
    tasks_completed INTEGER DEFAULT 0,
    xp_earned INTEGER DEFAULT 0,
    time_tracked INTEGER DEFAULT 0,
    notes_created INTEGER DEFAULT 0,
    tasks_created INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS productivity_log (
    id TEXT PRIMARY KEY,
    taskId TEXT DEFAULT '',
    date TEXT NOT NULL DEFAULT '',
    hour INTEGER NOT NULL DEFAULT 0,
    action TEXT DEFAULT 'completed',
    priority TEXT DEFAULT 'medium',
    timestamp INTEGER NOT NULL DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS note_task_links (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL DEFAULT '',
    source_id TEXT NOT NULL DEFAULT '',
    target_type TEXT NOT NULL DEFAULT '',
    target_id TEXT NOT NULL DEFAULT '',
    link_text TEXT DEFAULT '',
    createdAt INTEGER NOT NULL DEFAULT 0
  )`);

  // Migrations
  const taskCols = db.exec("PRAGMA table_info(tasks)");
  if (taskCols.length) {
    const names = taskCols[0].values.map(v => v[1]);
    if (!names.includes('parentId')) db.run("ALTER TABLE tasks ADD COLUMN parentId TEXT DEFAULT NULL");
    if (!names.includes('updatedAt')) db.run("ALTER TABLE tasks ADD COLUMN updatedAt INTEGER DEFAULT NULL");
    if (!names.includes('actualTime')) db.run("ALTER TABLE tasks ADD COLUMN actualTime INTEGER DEFAULT 0");
    if (!names.includes('recurring')) db.run("ALTER TABLE tasks ADD COLUMN recurring TEXT DEFAULT NULL");
    if (!names.includes('favorite')) db.run("ALTER TABLE tasks ADD COLUMN favorite INTEGER DEFAULT 0");
    if (!names.includes('archived')) db.run("ALTER TABLE tasks ADD COLUMN archived INTEGER DEFAULT 0");
  }

  // Migration: rename crm_days_active → ptm_days_active
  const xpCols = db.exec("PRAGMA table_info(user_xp)");
  if (xpCols.length) {
    const xpNames = xpCols[0].values.map(v => v[1]);
    if (xpNames.includes('crm_days_active') && !xpNames.includes('ptm_days_active')) {
      db.run("ALTER TABLE user_xp ADD COLUMN ptm_days_active INTEGER DEFAULT 0");
      db.run("UPDATE user_xp SET ptm_days_active = crm_days_active");
    }
  }

  // Seed user_xp
  const xpCount = db.exec("SELECT COUNT(*) as c FROM user_xp");
  if (!xpCount.length || !xpCount[0].values.length || xpCount[0].values[0][0] === 0) {
    db.run('INSERT INTO user_xp (total_xp, level, current_streak, best_streak, last_active_date, total_tasks_done, total_time_tracked, ptm_days_active, updatedAt) VALUES (0, 0, 0, 0, \'\', 0, 0, 0, ?)', [Date.now()]);
  }

  // Seed default settings
  const count = db.exec("SELECT COUNT(*) as c FROM settings");
  if (!count.length || !count[0].values.length || count[0].values[0][0] === 0) {
    const defaults = { theme: 'dark', workStart: '09:00', workEnd: '18:00', slotDuration: '30', aiKey: '' };
    for (const [k, v] of Object.entries(defaults)) {
      db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [k, v]);
    }
  }

  saveDb(db);
  return db;
}

function saveDb(db, backup) {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
  if (backup) {
    const backupDir = path.join(__dirname, 'data', 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.writeFileSync(path.join(backupDir, `backup-${stamp}.db`), buffer);
    cleanupBackups(10);
  }
}

function cleanupBackups(keep) {
  keep = keep || 10;
  try {
    const backupDir = path.join(__dirname, 'data', 'backups');
    if (!fs.existsSync(backupDir)) return;
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.db'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (files.length <= keep) return;
    for (const f of files.slice(keep)) {
      try { fs.unlinkSync(path.join(backupDir, f.name)); } catch (_) {}
    }
  } catch (e) { console.error('Backup cleanup error:', e.message); }
}

let backupTimer = null;
function startAutoBackup(db) {
  saveDb(db, true);
  backupTimer = setInterval(() => saveDb(db, true), 3600000);
}
function stopAutoBackup() { if (backupTimer) clearInterval(backupTimer); }

function dbAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function dbGet(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  let row = null;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  return row;
}

function dbRun(db, sql, params = []) {
  db.run(sql, params);
  saveDb(db);
}

function logActivity(db, taskId, action) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  dbRun(db, 'INSERT INTO task_activity_log (id, taskId, action, timestamp) VALUES (?, ?, ?, ?)',
    [id, taskId || '', action, Date.now()]);
}

module.exports = { initDb, dbAll, dbGet, dbRun, saveDb, startAutoBackup, stopAutoBackup, logActivity };
