/* ═══ Orbit — Notes ═══ */

function renderNotes() {
  $('notes-list').innerHTML = notes.map(n => {
    const preview = (n.content || '').slice(0, 60);
    return `<div class="note-item${editingNoteId === n.id ? ' active' : ''}" data-id="${n.id}" onclick="selectNote('${n.id}')">
      <div class="note-title">${esc(n.title || 'Без названия')}</div>
      <div class="note-preview">${esc(preview)}</div>
    </div>`;
  }).join('') || '<div style="text-align:center;padding:20px;color:var(--text-tertiary)">Нет заметок</div>';

  if (editingNoteId) {
    const note = notes.find(n => n.id === editingNoteId);
    if (note) {
      $('notes-editor').innerHTML = `<input type="text" id="note-title-input" value="${esc(note.title || '')}" placeholder="Заголовок" oninput="scheduleNoteSave()">
        <textarea id="note-content-input" placeholder="Содержание..." oninput="scheduleNoteSave()">${esc(note.content || '')}</textarea>`;
    }
  }
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
function renderDailyNotes() {
  const d = new Date(dailyNotesDate + 'T00:00:00');
  $('dn-date-label').textContent = d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
  $('daily-notes-title').value = d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  api('GET', '/daily-notes/' + dailyNotesDate).then(note => {
    $('daily-notes-content').value = note.content || '';
  }).catch(() => {});
}

function scheduleDailyNotesSave() {
  clearTimeout(dailyNotesSaveTimer);
  dailyNotesSaveTimer = setTimeout(async () => {
    const content = $('daily-notes-content')?.value || '';
    try { await api('POST', '/daily-notes', { date: dailyNotesDate, content }); } catch (e) { console.error('Daily notes save error:', e); }
  }, 800);
}
