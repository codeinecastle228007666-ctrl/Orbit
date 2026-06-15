/* ═══ Orbit — Notes ═══ */

function renderNotes() {
  const filtered = noteSearch ? notes.filter(n => (n.title || '').toLowerCase().includes(noteSearch) || (n.content || '').toLowerCase().includes(noteSearch)) : notes;
  $('notes-list').innerHTML = filtered.map(n => {
    const preview = (n.content || '').slice(0, 60);
    return `<div class="note-item${editingNoteId === n.id ? ' active' : ''}" data-id="${n.id}" onclick="selectNote('${n.id}')">
      <div class="note-title">${esc(n.title || 'Без названия')}</div>
      <div class="note-preview">${esc(preview)}</div>
    </div>`;
  }).join('') || '<div style="text-align:center;padding:20px;color:var(--text-tertiary)">Нет заметок</div>';

  if (editingNoteId) {
    const note = notes.find(n => n.id === editingNoteId);
    if (note) {
      $('notes-editor').innerHTML = `<div style="display:flex;gap:6px;margin-bottom:10px;align-items:center">
        <input type="text" id="note-title-input" value="${esc(note.title || '')}" placeholder="Заголовок" style="flex:1;font-size:20px" oninput="scheduleNoteSave()">
        <button class="btn btn-sm btn-ghost" id="btn-note-preview" onclick="toggleNotePreview()" title="Предпросмотр">👁</button>
      </div>
      <div id="note-content-wrap">
        <textarea id="note-content-input" placeholder="Содержание... **жирный**, *курсив*, # заголовок, - список" oninput="scheduleNoteSave()">${esc(note.content || '')}</textarea>
      </div>`;
    }
  }
}

function toggleNotePreview() {
  const wrap = $('note-content-wrap');
  const textarea = $('note-content-input');
  if (!wrap || !textarea) return;
  const existing = wrap.querySelector('.note-preview-html');
  if (existing) {
    existing.remove();
    textarea.style.display = '';
    return;
  }
  textarea.style.display = 'none';
  const div = document.createElement('div');
  div.className = 'note-preview-html';
  div.style.cssText = 'flex:1;overflow-y:auto;padding:12px 0;font-size:14px;line-height:1.7;color:var(--text-primary)';
  div.innerHTML = mdToHtml(textarea.value);
  wrap.appendChild(div);
}

function selectNote(id) {
  editingNoteId = id;
  renderNotes();
}

function scheduleNoteSave() {
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(async () => {
    if (!editingNoteId) return;
    const title = $('note-title-input')?.value || '';
    const content = $('note-content-input')?.value || '';
    try {
      await api('PUT', '/notes/' + editingNoteId, { title, content });
      const note = notes.find(n => n.id === editingNoteId);
      if (note) { note.title = title; note.content = content; }
      renderNotes();
    } catch (e) { console.error('Note save error:', e); }
  }, 800);
}

/* ═══ DAILY NOTES ═══ */
function dnDateStr(y, m, d) {
  return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

function shiftDNDate(delta) {
  const p = dailyNotesDate.split('-').map(Number);
  const dt = new Date(p[0], p[1] - 1, p[2] + delta);
  dailyNotesDate = dnDateStr(dt.getFullYear(), dt.getMonth(), dt.getDate());
  renderDailyNotes();
}

function selectDailyNote(date) {
  if (date === dailyNotesDate) return;
  dailyNotesDate = date;
  renderDailyNotes();
}

function renderDailyNotes() {
  const p = dailyNotesDate.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  $('dn-date-label').textContent = d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
  $('daily-notes-title').value = d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  api('GET', '/daily-notes').then(list => {
    if (currentView !== 'daily-notes') return;
    allDailyNotes = list;
    $('daily-notes-list').innerHTML = list.map(item => {
      const dp = item.date.split('-').map(Number);
      const dd = new Date(dp[0], dp[1] - 1, dp[2]);
      const label = dd.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
      const preview = (item.content || '').slice(0, 50);
      const active = item.date === dailyNotesDate ? ' active' : '';
      return `<div class="note-item${active}" data-date="${item.date}" onclick="selectDailyNote('${item.date}')">
        <div class="note-title">${esc(label)}</div>
        <div class="note-preview">${esc(preview) || '&nbsp;'}</div>
      </div>`;
    }).join('') || '<div style="text-align:center;padding:20px;color:var(--text-tertiary)">Нет записей</div>';
  }).catch(e => console.error('Daily notes list error:', e));

  api('GET', '/daily-notes/' + dailyNotesDate).then(note => {
    if (currentView !== 'daily-notes') return;
    $('daily-notes-content').value = note.content || '';
  }).catch(e => console.error('Daily note content error:', e));
}

function scheduleDailyNotesSave() {
  clearTimeout(dailyNotesSaveTimer);
  dailyNotesSaveTimer = setTimeout(async () => {
    const content = $('daily-notes-content')?.value || '';
    try { await api('POST', '/daily-notes', { date: dailyNotesDate, content }); } catch (e) { console.error('Daily notes save error:', e); }
  }, 800);
}
