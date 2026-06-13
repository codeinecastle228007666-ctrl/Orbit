/* ═══ Orbit — Profile ═══ */
async function renderProfile() {
  try {
    const [xpData, achData] = await Promise.all([api('GET', '/xp'), api('GET', '/achievements')]);
    const lv = xpData.level || 0;
    const icons = ['⚡','🌱','🔍','🛠️','📐','🎓','📋','🗂️','📊','🏢','🏛️','👔','♟️','🏗️','⚙️','♛','🔮','🚀','👑','🌟','🔱','⛰️','🪨','🌐','☀️','🌌','🧿','🕳️','⏳','🧙','🌍','🪽','💠','📜','🗿','⚜️','👁️','🌠','🔥','☁️','🌈','🔘','💎','🔰','🕰️','🌀','🎪','🪐','💫'];
    $('profile-level-icon').textContent = icons[Math.min(lv, 49)] || '💫';
    $('profile-level-name').textContent = 'Ур. ' + lv + ' · ' + (xpData.level_name || 'Стажёр');
    $('profile-level-sub').textContent = (xpData.total_xp || 0).toLocaleString('ru-RU') + ' XP всего';
    $('profile-xp-bar').style.width = Math.min(100, Math.max(0, xpData.progress || 0)) + '%';
    $('profile-xp-text').textContent = (xpData.total_xp || 0) + ' / ' + (xpData.next_level_xp || 50) + ' XP';

    const timeMin = (xpData.total_time_tracked || 0) * 10;
    $('profile-stats').innerHTML = [
      { label: 'Всего XP', value: xpData.total_xp || 0, icon: '⭐' },
      { label: 'Дней стрика', value: (xpData.current_streak || 0) + ' дн', icon: '🔥' },
      { label: 'Лучший стрик', value: (xpData.best_streak || 0) + ' дн', icon: '🔥' },
      { label: 'Выполнено задач', value: xpData.total_tasks_done || 0, icon: '✅' },
      { label: 'Времени (мин)', value: timeMin, icon: '⏱️' },
      { label: 'Дней в CRM', value: xpData.crm_days_active || 0, icon: '📅' },
      { label: 'Достижений', value: achData.length, icon: '🏆' },
    ].map(s => `<div style="background:var(--bg-secondary);border-radius:12px;padding:16px 18px;border:1px solid var(--border-soft);box-shadow:var(--shadow);display:flex;align-items:center;gap:12px">
      <span style="font-size:24px">${s.icon}</span>
      <div><div style="font-size:20px;font-weight:700;color:var(--text-primary)">${s.value}</div><div style="font-size:11px;color:var(--text-secondary)">${s.label}</div></div>
    </div>`).join('');

    const earnedMap = {};
    achData.forEach(a => earnedMap[a.id] = a);
    const ALL_ACH = [
      { id:'ach_first_blood', name:'Первая кровь', desc:'Выполнить первую задачу', icon:'🩸', cat:'tasks' },
      { id:'ach_five_tasks', name:'Пятиборец', desc:'Выполнить 5 задач', icon:'✋', cat:'tasks' },
      { id:'ach_quarter', name:'Четвертак', desc:'Выполнить 25 задач', icon:'🔢', cat:'tasks' },
      { id:'ach_half_century', name:'Полтинник', desc:'Выполнить 50 задач', icon:'🎱', cat:'tasks' },
      { id:'ach_century', name:'Сотня', desc:'Выполнить 100 задач', icon:'💯', cat:'tasks' },
      { id:'ach_year', name:'Годовой отчёт', desc:'Выполнить 365 задач', icon:'📆', cat:'tasks' },
      { id:'ach_creator10', name:'Создатель', desc:'Создать 10 задач', icon:'✨', cat:'tasks' },
      { id:'ach_creator50', name:'Фабрика идей', desc:'Создать 50 задач', icon:'🏭', cat:'tasks' },
      { id:'ach_parent', name:'Родитель', desc:'Создать 5 подзадач', icon:'👨‍👦', cat:'tasks' },
      { id:'ach_clan', name:'Клан', desc:'Создать 20 подзадач', icon:'👥', cat:'tasks' },
      { id:'ach_first_streak', name:'Первый день', desc:'1 день подряд', icon:'🌱', cat:'streak' },
      { id:'ach_streak3', name:'Разбег', desc:'3 дня подряд', icon:'🔥', cat:'streak' },
      { id:'ach_streak7', name:'Неделя огня', desc:'7 дней подряд', icon:'🔥🔥', cat:'streak' },
      { id:'ach_streak14', name:'Железная воля', desc:'14 дней подряд', icon:'💪', cat:'streak' },
      { id:'ach_streak30', name:'Несокрушимый', desc:'30 дней подряд', icon:'🦾', cat:'streak' },
      { id:'ach_streak100', name:'Легенда', desc:'100 дней подряд', icon:'🏆', cat:'streak' },
      { id:'ach_junior', name:'Юниор', desc:'Достичь 1 уровня', icon:'🌟', cat:'level' },
      { id:'ach_lev5', name:'Эксперт', desc:'Достичь 5 уровня', icon:'🎓', cat:'level' },
      { id:'ach_lev10', name:'Директор', desc:'Достичь 10 уровня', icon:'🏢', cat:'level' },
      { id:'ach_lev15', name:'Грандмастер', desc:'Достичь 15 уровня', icon:'👑', cat:'level' },
      { id:'ach_myth', name:'Мифический', desc:'Достичь 20 уровня', icon:'🌀', cat:'level' },
      { id:'ach_half_hour', name:'Полчаса', desc:'Затрекать 30 минут', icon:'⏱️', cat:'time' },
      { id:'ach_hour1', name:'Час работы', desc:'Затрекать 1 час', icon:'⏰', cat:'time' },
      { id:'ach_hour10', name:'10 часов', desc:'Затрекать 10 часов', icon:'📊', cat:'time' },
      { id:'ach_hour50', name:'50 часов', desc:'Затрекать 50 часов', icon:'💼', cat:'time' },
      { id:'ach_hour167', name:'Сто часов', desc:'Затрекать 100 часов', icon:'🎯', cat:'time' },
      { id:'ach_owl', name:'Сова', desc:'Завершить задачу ночью', icon:'🦉', cat:'time' },
      { id:'ach_lark', name:'Жаворонок', desc:'Завершить задачу утром', icon:'🌅', cat:'time' },
      { id:'ach_lunch', name:'Обеденный подвиг', desc:'Завершить задачу в обед', icon:'🍔', cat:'time' },
      { id:'ach_tagger', name:'Меткий', desc:'3+ тегов', icon:'🏷️', cat:'tags' },
      { id:'ach_collector', name:'Коллекционер', desc:'10+ тегов', icon:'📚', cat:'tags' },
      { id:'ach_librarian', name:'Библиотекарь', desc:'25+ тегов', icon:'🗂️', cat:'tags' },
      { id:'ach_first_link', name:'Первая связь', desc:'Создать первую связь', icon:'🔗', cat:'links' },
      { id:'ach_networker', name:'Сетевик', desc:'10+ связей', icon:'🕸️', cat:'links' },
      { id:'ach_spider', name:'Паук', desc:'50+ связей', icon:'🕷️', cat:'links' },
      { id:'ach_first_note', name:'Первая заметка', desc:'Создать первую заметку', icon:'📄', cat:'notes' },
      { id:'ach_thinker', name:'Мыслитель', desc:'10+ заметок', icon:'🧠', cat:'notes' },
      { id:'ach_writer', name:'Писатель', desc:'50+ заметок', icon:'✍️', cat:'notes' },
      { id:'ach_planner', name:'Планировщик', desc:'Добавить задачу в расписание', icon:'📅', cat:'schedule' },
      { id:'ach_explorer', name:'Исследователь графа', desc:'Осмотреть граф', icon:'🗺️', cat:'graph' },
      { id:'ach_sessions5', name:'Фокус', desc:'5 сессий таймера', icon:'🎯', cat:'sessions' },
      { id:'ach_sessions25', name:'Машина времени', desc:'25 сессий таймера', icon:'⏳', cat:'sessions' },
      { id:'ach_sessions100', name:'Хранитель времени', desc:'100 сессий таймера', icon:'⌛', cat:'sessions' },
      { id:'ach_triska', name:'Трёшка', desc:'3 задачи за день', icon:'3️⃣', cat:'daily' },
      { id:'ach_weekly', name:'Ударный день', desc:'7 задач за день', icon:'7️⃣', cat:'daily' },
      { id:'ach_marathon', name:'Марафонец', desc:'15 задач за день', icon:'🏃', cat:'daily' },
      { id:'ach_panic', name:'Паническая кнопка', desc:'Нажать кнопку помощи', icon:'🆘', cat:'hidden' },
      { id:'ach_midnight', name:'Полуночник', desc:'Работать после полуночи', icon:'🌙', cat:'hidden' },
      { id:'ach_ai_scheduler', name:'AI-планировщик', desc:'Использовать AI-расписание', icon:'🤖', cat:'ai' },
      { id:'ach_ai_chat', name:'Диалог с AI', desc:'Написать AI-ассистенту', icon:'💬', cat:'ai' },
      { id:'ach_recurring1', name:'Цикличность', desc:'Создать повторяющуюся задачу', icon:'🔁', cat:'recurring' },
      { id:'ach_recurring5', name:'Ритм', desc:'5+ повторяющихся задач', icon:'🔄', cat:'recurring' },
    ];

    $('profile-ach-count').textContent = `Достижения: ${achData.length} / ${ALL_ACH.length}`;

    const categories = {};
    ALL_ACH.forEach(a => { if (!categories[a.cat]) categories[a.cat] = []; categories[a.cat].push(a); });
    const catLabels = { tasks:'Задачи', streak:'Стрик', level:'Уровень', time:'Время', tags:'Теги', links:'Связи', notes:'Заметки', schedule:'Расписание', graph:'Граф', sessions:'Таймер', daily:'День', hidden:'Скрытые', ai:'AI', recurring:'Циклы' };
    let activeCat = window._profileCat || 'all';

    const tabsHtml = ['<button class="filter-chip active" data-cat="all" style="font-size:10px">Все (' + ALL_ACH.length + ')</button>'];
    Object.entries(categories).forEach(([cat, items]) => {
      const earned = items.filter(a => earnedMap[a.id]).length;
      tabsHtml.push('<button class="filter-chip' + (activeCat === cat ? ' active' : '') + '" data-cat="' + cat + '" style="font-size:10px">' + (catLabels[cat] || cat) + ' (' + earned + '/' + items.length + ')</button>');
    });
    const tabsEl = $('profile-cat-tabs');
    if (tabsEl) {
      tabsEl.innerHTML = tabsHtml.join('');
      tabsEl.querySelectorAll('.filter-chip').forEach(btn => {
        btn.onclick = () => {
          tabsEl.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
          btn.classList.add('active');
          window._profileCat = btn.dataset.cat;
          renderProfile();
        };
      });
    }

    const filtered = activeCat === 'all' ? ALL_ACH : (categories[activeCat] || []);
    $('profile-ach-grid').innerHTML = filtered.map(a => {
      const earned = earnedMap[a.id];
      return `<div style="background:var(--bg-tertiary);border-radius:12px;padding:14px;text-align:center;border:1px solid ${earned ? 'var(--accent)' : 'var(--border-soft)'};transition:all .2s;opacity:${earned ? '1' : '0.4'}">
        <div style="font-size:32px;margin-bottom:8px">${earned ? a.icon : '🔒'}</div>
        <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:3px">${esc(a.name)}</div>
        <div style="font-size:10px;color:var(--text-tertiary)">${esc(a.desc)}</div>
        ${earned ? `<div style="font-size:9px;color:var(--accent);margin-top:6px">${new Date(earned.earned_at).toLocaleDateString('ru-RU')}</div>` : ''}
      </div>`;
    }).join('');
  } catch (e) {
    $('profile-level-name').textContent = 'Ошибка загрузки';
  }
}
