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

    $('profile-stats').innerHTML = [
      { label: 'Всего XP', value: xpData.total_xp || 0, icon: '⭐' },
      { label: 'Дней стрика', value: (xpData.current_streak || 0) + ' дн', icon: '🔥' },
      { label: 'Лучший стрик', value: (xpData.best_streak || 0) + ' дн', icon: '🔥' },
      { label: 'Выполнено задач', value: xpData.total_tasks_done || 0, icon: '✅' },
      { label: 'Времени (мин)', value: xpData.total_time_tracked || 0, icon: '⏱️' },
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
      { id:'ach_streak3', name:'Разбег', desc:'3 дня подряд', icon:'🔥', cat:'streak' },
      { id:'ach_streak7', name:'Неделя огня', desc:'7 дней подряд', icon:'🔥🔥', cat:'streak' },
      { id:'ach_streak14', name:'Железная воля', desc:'14 дней подряд', icon:'💪', cat:'streak' },
      { id:'ach_streak30', name:'Несокрушимый', desc:'30 дней подряд', icon:'🦾', cat:'streak' },
      { id:'ach_lev5', name:'Эксперт', desc:'Достичь 5 уровня', icon:'🎓', cat:'level' },
      { id:'ach_lev10', name:'Директор', desc:'Достичь 10 уровня', icon:'🏢', cat:'level' },
      { id:'ach_lev15', name:'Грандмастер', desc:'Достичь 15 уровня', icon:'👑', cat:'level' },
      { id:'ach_hour1', name:'Час работы', desc:'Затрекать 1 час', icon:'⏱️', cat:'time' },
      { id:'ach_hour10', name:'10 часов', desc:'Затрекать 10 часов', icon:'⏰', cat:'time' },
      { id:'ach_hour50', name:'50 часов', desc:'Затрекать 50 часов', icon:'⌚', cat:'time' },
      { id:'ach_sprinter', name:'Спринтер', desc:'10 задач за день', icon:'⚡', cat:'daily' },
      { id:'ach_turbo', name:'Турбо-режим', desc:'20 задач за день', icon:'🚀', cat:'daily' },
      { id:'ach_owl', name:'Сова', desc:'Задача ночью', icon:'🦉', cat:'time' },
      { id:'ach_lark', name:'Жаворонок', desc:'Задача утром', icon:'🌅', cat:'time' },
      { id:'ach_architect', name:'Архитектор', desc:'5+ подзадач', icon:'🏗️', cat:'structure' },
      { id:'ach_collector', name:'Коллекционер', desc:'10+ тегов', icon:'🏷️', cat:'tags' },
      { id:'ach_networker', name:'Сетевик', desc:'10+ связей', icon:'🔗', cat:'links' },
      { id:'ach_first_note', name:'Первая заметка', desc:'Создать заметку', icon:'📄', cat:'notes' },
      { id:'ach_thinker', name:'Мыслитель', desc:'10+ заметок', icon:'🧠', cat:'notes' },
      { id:'ach_creator', name:'Творец', desc:'50+ задач', icon:'🎨', cat:'tasks' },
      { id:'ach_millennium', name:'Тысячелетие', desc:'1000+ задач', icon:'🏛️', cat:'tasks' },
      { id:'ach_speedrun', name:'Спидран', desc:'Задача в день создания', icon:'⚡', cat:'daily' },
      { id:'ach_midnight', name:'Полуночник', desc:'Задача после полуночи', icon:'🌙', cat:'time' },
      { id:'ach_first_link', name:'Первая связь', desc:'Связать задачи', icon:'🔗', cat:'links' },
      { id:'ach_perfect_week', name:'Идеальная неделя', desc:'7 дней по 5+ задач', icon:'✨', cat:'daily' },
      { id:'ach_zeroday', name:'Нулевой день', desc:'Нет просроченных', icon:'🛡️', cat:'daily' },
    ];

    $('profile-ach-count').textContent = `Достижения: ${achData.length} / ${ALL_ACH.length}`;
    $('profile-ach-grid').innerHTML = ALL_ACH.map(a => {
      const earned = earnedMap[a.id];
      const opacity = earned ? '1' : '0.4';
      return `<div style="background:var(--bg-tertiary);border-radius:12px;padding:14px;text-align:center;border:1px solid ${earned ? 'var(--accent)' : 'var(--border-soft)'};transition:all .2s;opacity:${opacity}">
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
