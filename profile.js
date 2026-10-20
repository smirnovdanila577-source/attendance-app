/* ==========================================================================
   ПРОФИЛЬ, СТАТУС, УВЕДОМЛЕНИЯ, ДОСТИЖЕНИЯ И ТЕГИ
   Подключается ПОСЛЕ app.js. Использует его глобальные: database, ALL_DAYS,
   saveData, showElegantToast.

   Все данные профиля лежат в database.profileExt, поэтому они автоматически
   сохраняются в localStorage и уходят в облако вместе с остальной базой.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- Иконки (в стиле остальных иконок приложения) ---------- */
  const svg = (p, s = 18, sw = 2) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const P = {
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    cal: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    cap: '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    clip: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    chart: '<path d="M12 20v-6M6 20V10M18 20V4"/>',
    pen: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    chev: '<path d="m6 9 6 6 6-6"/>'
  };

  /* ---------- Статусы ---------- */
  const IDLE_MS = 5 * 60 * 1000; // без активности дольше — в авторежиме статус «Спит»
  const STATUS_LABEL = { online: 'В сети', offline: 'Не в сети', sleep: 'Спит' };
  const STATUS_MODES = [
    { id: 'auto',    label: 'Авто',    short: 'Авто',    desc: 'Сон после 5 минут без активности' },
    { id: 'online',  label: 'В сети',  short: 'В сети',  desc: 'Всегда показывать «в сети»' },
    { id: 'offline', label: 'Не в сети', short: 'Офлайн', desc: 'Скрыть свою активность' },
    { id: 'sleep',   label: 'Спит',    short: 'Спит',    desc: 'Показывать как спящего' }
  ];

  /* ---------- Теги и достижения ----------
     Теги нельзя выбрать «просто так»: каждый открывается достижением. */
  const TAGS = [
    { id: 'newbie',   name: 'Новичок',          tone: 'gray',   ach: null,         hint: 'Есть у каждого с самого начала' },
    { id: 'diligent', name: 'Прилежный',        tone: 'green',  ach: 'attend_10' },
    { id: 'ironclad', name: 'Несгибаемый',      tone: 'blue',   ach: 'attend_100' },
    { id: 'flow',     name: 'В потоке',         tone: 'yellow', ach: 'streak_10' },
    { id: 'perfect',  name: 'Идеальная неделя', tone: 'green',  ach: 'perfect_week' },
    { id: 'scholar',  name: 'Отличник',         tone: 'violet', ach: 'scholar' },
    { id: 'hwmaster', name: 'Домашний мастер',  tone: 'blue',   ach: 'hw_10' },
    { id: 'strategist', name: 'Стратег',        tone: 'red',    ach: 'important' },
    { id: 'owl',      name: 'Сова',             tone: 'violet', ach: 'night_owl' },
    { id: 'lark',     name: 'Жаворонок',        tone: 'yellow', ach: 'early_bird' },
    { id: 'person',   name: 'Свой человек',     tone: 'blue',   ach: 'profile_done' },
    { id: 'ogonek',   name: 'Огонёк',           tone: 'yellow', ach: 'streak_7' },
    { id: 'champion', name: 'Призёр',           tone: 'violet', ach: 'league_podium' }
  ];
  const tagById = id => TAGS.find(t => t.id === id) || null;

  const prog = (cur, tar) => [Math.min(cur, tar), tar];
  const ACH = [
    { id: 'first_mark', title: 'Первая отметка', desc: 'Отметь посещение первой пары', icon: 'star', tone: 'blue',
      progress: s => prog(s.attended, 1) },
    { id: 'attend_10', title: 'Прилежный студент', desc: 'Посети 10 пар', icon: 'cal', tone: 'green', tag: 'diligent',
      progress: s => prog(s.srv.attended || 0, 10) },
    { id: 'attend_100', title: 'Несгибаемая воля', desc: 'Посети 100 пар', icon: 'award', tone: 'blue', tag: 'ironclad',
      progress: s => prog(s.srv.attended || 0, 100) },
    { id: 'streak_10', title: 'Без пропусков', desc: 'Посети 10 пар подряд, не пропустив ни одной', icon: 'flame', tone: 'yellow', tag: 'flow',
      progress: s => prog(s.srv.pair_run || 0, 10) },
    { id: 'perfect_week', title: 'Идеальная неделя', desc: 'Отметь все пары недели (от 3 пар) как посещённые', icon: 'clip', tone: 'green', tag: 'perfect',
      progress: s => prog(s.srv.perfect_weeks || 0, 1) },
    { id: 'scholar', title: 'Отличник', desc: 'Держи посещаемость от 80%, когда отмечено хотя бы 30 пар', icon: 'cap', tone: 'violet', tag: 'scholar',
      progress: s => prog(s.srv.marks || 0, 30),
      note: s => ((s.srv.marks || 0) >= 30 && (s.srv.pct || 0) < 80) ? `Сейчас ${s.srv.pct || 0}%, нужно 80%` : '' },
    { id: 'hw_10', title: 'Домашний мастер', desc: 'Выполни 10 домашних заданий', icon: 'clip', tone: 'blue', tag: 'hwmaster',
      progress: s => prog(s.srv.tasks || 0, 10) },
    { id: 'important', title: 'Стратег', desc: 'Отметь важный предмет закладкой', icon: 'flag', tone: 'red', tag: 'strategist',
      progress: (s, e, db) => prog((db.important_subjects || []).length, 1) },
    { id: 'night_owl', title: 'Ночной режим', desc: 'Загляни в трекер глубокой ночью', icon: 'moon', tone: 'violet', tag: 'owl', secret: true,
      progress: s => prog(srvHas('night_owl') ? 1 : 0, 1) },
    { id: 'early_bird', title: 'Ранний старт', desc: 'Загляни в трекер до восьми утра', icon: 'sun', tone: 'yellow', tag: 'lark', secret: true,
      progress: s => prog(srvHas('early_bird') ? 1 : 0, 1) },
    { id: 'profile_done', title: 'Свой человек', desc: 'Выбери аватар и расскажи о себе в профиле', icon: 'user', tone: 'blue', tag: 'person',
      progress: (s, e) => prog((e.avatarId ? 1 : 0) + (e.bio && e.bio.trim().length >= 3 ? 1 : 0), 2) },
    // Серия учебных дней и очки — считает social.js
    { id: 'streak_3', title: 'Разгон', desc: 'Закрывай все пары 3 учебных дня подряд', icon: 'flame', tone: 'yellow',
      progress: s => prog(s.bestDayStreak, 3) },
    { id: 'streak_7', title: 'Неделя в огне', desc: 'Закрывай все пары 7 учебных дней подряд', icon: 'flame', tone: 'yellow', tag: 'ogonek',
      progress: s => prog(s.bestDayStreak, 7) },
    { id: 'streak_30', title: 'Месяц без перерыва', desc: 'Закрывай все пары 30 учебных дней подряд', icon: 'flame', tone: 'red',
      progress: s => prog(s.bestDayStreak, 30) },
    { id: 'xp_1000', title: 'Тысяча очков', desc: 'Набери 1000 очков опыта', icon: 'zap', tone: 'blue',
      progress: s => prog(s.xpTotal, 1000) },
    { id: 'league_podium', title: 'Призёр лиги', desc: 'Займи место в тройке лиги недели (от 3 участников)', icon: 'trophy', tone: 'violet', tag: 'champion',
      progress: s => prog(srvHas('league_podium') ? 1 : 0, 1) },
    { id: 'first_friend', title: 'Первый друг', desc: 'Подпишитесь друг на друга с кем-нибудь', icon: 'user', tone: 'green',
      progress: s => prog(srvHas('first_friend') ? 1 : 0, 1) }
  ];
  const achById = id => ACH.find(a => a.id === id) || null;
  // Достижения, от которых зависят аватары и теги, выдаёт сервер (его правила против накрутки).
  // Приложение само отмечает только безобидные: «Первая отметка», «Стратег», «Свой человек».
  const SERVER_ACH = new Set(['attend_10', 'attend_100', 'streak_10', 'perfect_week', 'scholar', 'hw_10', 'night_owl',
    'early_bird', 'streak_3', 'streak_7', 'streak_30', 'xp_1000', 'league_podium', 'first_friend']);
  const srvList = () => (window.Social && Social.serverAch()) || null;
  const srvHas = id => { const l = srvList(); return !!l && l.includes(id); };
  const isDone = (a, s, e, db) => SERVER_ACH.has(a.id) ? srvHas(a.id)
    : a.done ? a.done(s, e, db) : (() => { const [c, t] = a.progress(s, e, db); return c >= t; })();

  /* ---------- Состояние модуля ---------- */
  let bound = false, lastActive = Date.now(), tickTimer = null, lastShownStatus = null;
  let evalTimer = null, evaluating = false, activeTab = 'overview', lastHeaderSig = '', pickerOpen = false;
  let pop = null, popFresh = false, bioEdit = false, animNext = false;   // всплывающее меню в шапке профиля: 'avatar' | 'tag' | 'status'

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = ts => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  const hasUser = () => typeof database !== 'undefined' && database && database.userProfile;

  function ago(ts) {
    const m = Math.floor(Math.max(0, Date.now() - ts) / 60000);
    if (m < 1) return 'только что';
    if (m < 60) return `${m} мин назад`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} ч назад`;
    const d = Math.floor(h / 24);
    return d < 7 ? `${d} дн назад` : fmtDate(ts);
  }

  /* ---------- Данные профиля ---------- */
  function ext() {
    if (!database.profileExt || typeof database.profileExt !== 'object') database.profileExt = {};
    const e = database.profileExt;
    if (!e.createdAt) e.createdAt = Date.now();
    if (typeof e.status !== 'string') e.status = 'auto';
    if (!e.tags || typeof e.tags !== 'object') e.tags = {};
    if (!e.tags.newbie) e.tags.newbie = e.createdAt;
    if (e.tag === undefined) e.tag = 'newbie';
    if (e.tag && !e.tags[e.tag]) e.tag = 'newbie';
    if (!e.achievements || typeof e.achievements !== 'object') e.achievements = {};
    if (!e.flags || typeof e.flags !== 'object') e.flags = {};
    if (typeof e.bio !== 'string') e.bio = '';
    if (!Array.isArray(e.notifications)) e.notifications = [];
    if (e.avatar) delete e.avatar;              // старое загруженное фото: теперь только готовые аватары
    if (typeof e.avatarId !== 'string') e.avatarId = '';
    if (typeof e.shareAttendance !== 'boolean') e.shareAttendance = false;
    if (!Array.isArray(e.showcase)) e.showcase = [];   // витрина: до 4 достижений, выбранных самим
    return e;
  }

  function computeStats() {
    const s = { attended: 0, missed: 0, total: 0, pct: 0, streak: 0, perfectWeeks: 0, hwDone: 0, hwTotal: 0 };
    const weeks = database.weeks || {};
    const act = database.activeDays || ALL_DAYS;
    let run = 0;
    Object.keys(weeks).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b).forEach(w => {
      const wd = weeks[String(w)] || {};
      let cnt = 0, allOk = true;
      ALL_DAYS.forEach(day => {
        if (!act.includes(day)) return;
        (wd[day] || []).forEach(p => {
          if (p.cancelled) { (p.tasks || []).forEach(t => { s.hwTotal++; if (t.done) s.hwDone++; }); return; } // убранная пара: только её ДЗ
          cnt++;
          if (p.attended === true) { s.attended++; run++; if (run > s.streak) s.streak = run; }
          else { allOk = false; if (p.attended === false) { s.missed++; run = 0; } }
          (p.tasks || []).forEach(t => { s.hwTotal++; if (t.done) s.hwDone++; });
        });
      });
      if (cnt >= 3 && allOk) s.perfectWeeks++;
    });
    s.total = s.attended + s.missed;
    s.pct = s.total > 0 ? Math.round((s.attended / s.total) * 100) : 0;
    const so = window.Social ? Social.stats() : null;
    s.srv = (so && so.counters) || {};
    s.dayStreak = so ? so.streak : 0;
    s.bestDayStreak = so ? so.bestStreak : 0;
    s.xpTotal = so ? so.xpTotal : 0;
    s.weekXp = so ? so.weekXp : 0;
    return s;
  }

  /* ---------- Статус ---------- */
  function effectiveStatus() {
    const e = ext();
    if (e.status !== 'auto') return e.status;
    return (Date.now() - lastActive > IDLE_MS) ? 'sleep' : 'online';
  }
  function setStatus(mode) {
    const e = ext();
    if (!STATUS_MODES.some(m => m.id === mode)) return;
    e.status = mode;
    lastActive = Date.now();
    saveData();
    renderAll();
  }

  /* ---------- Уведомления ---------- */
  function notify(title, text, opts = {}) {
    const e = ext();
    e.notifications.unshift({
      id: 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title, text, ts: Date.now(), read: false,
      icon: opts.icon || 'info', tone: opts.tone || 'gray', tab: opts.tab || null,
      action: opts.action || null, arg: opts.arg == null ? null : opts.arg
    });
    if (e.notifications.length > 40) e.notifications.length = 40;
  }
  const unreadCount = () => ext().notifications.filter(n => !n.read).length;

  /* ---------- Достижения ---------- */
  function evaluate() {
    if (!hasUser() || evaluating) return;
    // Пока не забрали облачные данные, ничего не меняем: иначе локальная копия «перебьёт» более свежую
    if (typeof cloudPullDone !== 'undefined' && !cloudPullDone) {
      clearTimeout(evalTimer); evalTimer = setTimeout(evaluate, 800); return;
    }
    evaluating = true;
    try {
      const e = ext(), s = computeStats();
      let changed = false;
      const fresh = [];


      if (!e.welcomed) {
        e.welcomed = true; changed = true;
        notify('Добро пожаловать в профиль',
          'Здесь собираются достижения и теги. Статус можно сменить вручную: нажми на кружок у аватара.',
          { icon: 'user', tone: 'blue' });
      }

      // Сервер прислал свой список: снимаем серверные достижения, которых он не подтверждает
      // (их могли «нафармить» отметками задним числом до новых правил), вместе с их тегами
      const srv = srvList();
      if (srv) {
        let revoked = 0;
        ACH.forEach(a => {
          if (!SERVER_ACH.has(a.id) || !e.achievements[a.id] || srv.includes(a.id)) return;
          delete e.achievements[a.id]; revoked++; changed = true;
          const tag = a.tag ? tagById(a.tag) : null;
          if (tag && e.tags[tag.id]) { delete e.tags[tag.id]; if (e.tag === tag.id) e.tag = 'newbie'; }
        });
        if (revoked && !e.flags.recounted) {
          e.flags.recounted = true;
          notify('Достижения пересчитаны', 'Теперь засчитываются только отметки, сделанные в течение суток после пары. Часть достижений нужно получить заново.',
            { icon: 'info', tone: 'gray', tab: 'achievements' });
        }
      }

      ACH.forEach(a => {
        if (e.achievements[a.id] || !isDone(a, s, e, database)) return;
        e.achievements[a.id] = Date.now();
        changed = true; fresh.push(a);
        const tag = a.tag ? tagById(a.tag) : null;
        if (tag && !e.tags[tag.id]) e.tags[tag.id] = Date.now();
        notify(`Достижение: ${a.title}`,
          tag ? `Открыт новый тег «${tag.name}». Надеть его можно в профиле.` : 'Оно уже на твоей витрине в профиле.',
          { icon: a.icon, tone: a.tone, tab: tag ? 'tags' : 'achievements' });
      });

      if (changed) {
        saveData();
        if (fresh.length === 1) showElegantToast('Новое достижение', `«${esc(fresh[0].title)}»`);
        else if (fresh.length > 1) showElegantToast('Новые достижения', `Получено: ${fresh.length}. Загляни в профиль`);
        renderAll();
      }
    } finally { evaluating = false; }
  }

  function onDataSaved() {
    if (!bound) return;
    clearTimeout(evalTimer);
    evalTimer = setTimeout(evaluate, 400);
  }
  // Лига загрузилась — обновить карточку «Лига недели» на обзоре
  function onLeague() { if (bound && hasUser() && modalOpen() && activeTab === 'overview') renderOverview(); }
  function onServerState() {
    if (!bound || !hasUser()) return;
    onDataSaved();
    if (modalOpen() && activeTab !== 'league' && activeTab !== 'friends') renderModal();
  }

  /* ---------- Аватар ---------- */
  // Свой аватар показываем, только если он открыт (на случай, если достижение потерялось)
  function myAvatarId(e) {
    const a = window.Avatars && e.avatarId ? Avatars.byId(e.avatarId) : null;
    return a && Avatars.isUnlocked(a, e.achievements) ? a.id : '';
  }
  function avatarInner(e) {
    const name = (database.userProfile.name || 'С').trim();
    const face = window.Avatars ? Avatars.html(myAvatarId(e), name) : esc(name.charAt(0).toUpperCase() || 'С');
    return face + '<span class="pf-dot"></span><span class="pf-zzz" aria-hidden="true"><i>z</i><i>z</i><i>z</i></span>';
  }
  /* Выбор аватара: только кружки, без плиток и подписей. Имя и условие открытия — в строке сверху,
     она меняется при наведении (на телефоне — при нажатии). Сначала открытые, ниже закрытые. */
  function avatarPickerHtml(e) {
    if (!window.Avatars) return '';
    const name = database.userProfile.name || 'С';
    const cur = myAvatarId(e);
    const opt = (id, inner, open, title, sub) => `
      <button type="button" class="pf-avp ${cur === id ? 'selected' : ''} ${open ? '' : 'locked'}" data-avatar="${id}" data-cap="${esc(title)}" data-sub="${esc(sub)}" ${open ? '' : 'aria-disabled="true"'} aria-label="${esc(title)}">
        <span class="pf-avp-img">${inner}</span>${open ? '' : `<span class="pf-avp-lock">${svg(P.lock, 9, 2.6)}</span>`}
      </button>`;
    const all = [{ id: '', html: Avatars.html('', name), open: true, title: 'Буква ника', sub: '' }].concat(Avatars.list.map(a => {
      const open = Avatars.isUnlocked(a, e.achievements);
      const ach = a.unlock ? achById(a.unlock) : null;
      const how = !ach ? '' : ach.secret && !open ? 'откроется за скрытое достижение' : `${open ? 'за' : 'откроется за'} «${ach.title}»`;
      return { id: a.id, html: Avatars.html(a.id), open, title: a.name, sub: how };
    }));
    const opened = all.filter(x => x.open), locked = all.filter(x => !x.open);
    const curItem = all.find(x => x.id === cur) || all[0];
    return `<div class="pf-avp-cap" data-def-cap="${esc(curItem.title)}" data-def-sub="сейчас на аватаре"><b>${esc(curItem.title)}</b><span>сейчас на аватаре</span></div>
      <div class="pf-avp-grid">${opened.map(x => opt(x.id, x.html, true, x.title, x.sub)).join('')}</div>
      ${locked.length ? `<div class="pf-avp-sep">Закрытые · ${locked.length}</div>
      <div class="pf-avp-grid">${locked.map(x => opt(x.id, x.html, false, x.title, x.sub)).join('')}</div>` : ''}`;
  }
  // Строка-подпись над аватарами: показывает то, на что навели (или вернуть текущий)
  function avatarCaption(btn) {
    const cap = document.querySelector('.pf-avp-cap'); if (!cap) return;
    const t = btn ? btn.dataset.cap : cap.dataset.defCap, sub = btn ? btn.dataset.sub : cap.dataset.defSub;
    cap.innerHTML = `<b>${esc(t)}</b><span>${esc(sub || (btn && !btn.classList.contains('locked') ? 'нажми, чтобы выбрать' : ''))}</span>`;
  }
  // Меню тега — «близнец» выбора аватара: облако капсул, подпись сверху, сначала открытые, ниже закрытые
  function tagPopHtml(e) {
    const opt = (t, owned) => {
      const a = t.ach ? achById(t.ach) : null;
      const sub = owned ? (a ? `за «${a.title}»` : (t.hint || '')) : (a && a.secret ? 'откроется за скрытое достижение' : `откроется за «${a ? a.title : ''}»`);
      return `<button type="button" class="pf-tgc-opt ${owned ? '' : 'locked'} ${e.tag === t.id ? 'selected' : ''}" data-tone="${owned ? t.tone : 'gray'}" data-tag="${t.id}" data-cap="${esc(t.name)}" data-sub="${esc(sub)}" ${owned ? '' : 'aria-disabled="true"'}>${esc(t.name)}${owned ? '' : `<span class="pf-tgc-lock">${svg(P.lock, 10, 2.6)}</span>`}</button>`;
    };
    const opened = TAGS.filter(t => e.tags[t.id]), locked = TAGS.filter(t => !e.tags[t.id]);
    const cur = e.tag ? tagById(e.tag) : null;
    const capName = cur ? cur.name : 'Без тега';
    return `<div class="pf-avp-cap" data-def-cap="${esc(capName)}" data-def-sub="сейчас под ником"><b>${esc(capName)}</b><span>сейчас под ником</span></div>
      <div class="pf-tgc">
        <button type="button" class="pf-tgc-opt none ${e.tag ? '' : 'selected'}" data-tag="" data-cap="Без тега" data-sub="под ником ничего">Без тега</button>
        ${opened.map(t => opt(t, true)).join('')}
      </div>
      ${locked.length ? `<div class="pf-avp-sep">Закрытые · ${locked.length}</div><div class="pf-tgc">${locked.map(t => opt(t, false)).join('')}</div>` : ''}`;
  }
  function statusPopHtml(e) {
    return STATUS_MODES.map(m => `
      <button type="button" class="pf-status-opt ${e.status === m.id ? 'selected' : ''}" data-status="${m.id}">
        ${statusIcon(m.id)}
        <span><span>${m.label}</span><small>${m.desc}</small></span>
      </button>`).join('');
  }

  /* ---------- Шапка ---------- */
  function renderHeader() {
    if (!hasUser() || !$('pfHeaderAvatar')) return;
    const e = ext(), st = effectiveStatus();
    const tag = e.tag ? tagById(e.tag) : null;
    const name = database.userProfile.name || 'Студент';
    const av = $('pfHeaderAvatar');

    const sig = [name, myAvatarId(e)].join('|');
    if (sig !== lastHeaderSig) { av.innerHTML = avatarInner(e); lastHeaderSig = sig; }
    av.dataset.status = st;

    $('pfHeaderName').textContent = name;
    const tagEl = $('pfHeaderTag');
    tagEl.textContent = tag ? tag.name : '';
    tagEl.dataset.tone = tag ? tag.tone : 'gray';
    tagEl.style.display = tag ? '' : 'none';

    $('pfStatusBtn').title = `Статус: ${STATUS_LABEL[st]}${e.status === 'auto' ? ' (авто)' : ''}`;
    $('pfOpenBtn').title = 'Открыть профиль';

    const unread = unreadCount();
    $('bellBtn').classList.toggle('has-unread', unread > 0);
    // Больше одного непрочитанного — число вместо точки
    const dot = $('bellBtn').querySelector('.bell-dot');
    if (dot) { dot.textContent = unread > 1 ? (unread > 9 ? '9+' : String(unread)) : ''; dot.classList.toggle('num', unread > 1); }
    $('bellBtn').title = unread ? `Уведомления: ${unread} новых` : 'Уведомления';
    lastShownStatus = st;
  }

  function statusIcon(id) {
    if (id === 'auto') return `<span class="pf-st-ico pf-st-auto">${svg(P.zap, 14)}</span>`;
    if (id === 'sleep') return `<span class="pf-st-ico pf-st-moon">${svg(P.moon, 14, 0).replace('fill="none"', 'fill="currentColor"')}</span>`;   // луна — как точка «Спит» на аватаре
    return `<span class="pf-st-ico"><span class="pf-st-dot ${id === 'online' ? 'online' : ''}"></span></span>`;
  }

  function renderStatusMenu() {
    const e = ext();
    $('pfStatusMenu').innerHTML = STATUS_MODES.map(m => `
      <button type="button" class="pf-status-opt ${e.status === m.id ? 'selected' : ''}" data-status="${m.id}">
        ${statusIcon(m.id)}
        <span><span>${m.label}</span><small>${m.desc}</small></span>
      </button>`).join('');
  }

  function renderNotifications() {
    const list = ext().notifications;
    const unread = unreadCount();
    const items = list.length ? list.map(n => `
      <button type="button" class="pf-notif-item ${n.read ? '' : 'unread'}" data-nid="${esc(n.id)}" data-tone="${esc(n.tone)}">
        <span class="pf-unread-mark"></span>
        <span class="pf-notif-ico">${svg(P[n.icon] || P.info, 18)}</span>
        <span class="pf-notif-body">
          <span class="pf-notif-title">${esc(n.title)}</span>
          <span class="pf-notif-text">${esc(n.text)}</span>
          <span class="pf-notif-time">${ago(n.ts)}</span>
        </span>
      </button>`).join('') : `
      <div class="pf-empty">${svg(P.bell, 26, 1.8)}<span>Пока тишина. Здесь появятся новые достижения и теги.</span></div>`;
    $('notifPopover').innerHTML = `
      <div class="pf-pop-head">
        <span class="pf-pop-title">Уведомления</span>
        <button type="button" class="pf-link-btn" data-act="read-all" ${unread ? '' : 'disabled'}>Прочитать все</button>
      </div>
      <div class="pf-notif-list">${items}</div>`;
  }

  /* ---------- Всплывающие панели ---------- */
  function closePops(except) {
    document.querySelectorAll('.pf-popover.open').forEach(p => { if (p !== except) p.classList.remove('open'); });
    const bell = $('bellBtn');
    if (bell) bell.classList.toggle('open', !!except && except.id === 'notifPopover');
  }
  function togglePop(pop, render) {
    const willOpen = !pop.classList.contains('open');
    closePops(willOpen ? pop : null);
    if (willOpen) { render(); pop.classList.add('open'); }
  }

  /* ---------- Окно профиля ---------- */
  // Цвета обложки берём из фона выбранного аватара; без аватара — акцентный цвет приложения
  function coverStyle(e) {
    const a = window.Avatars && myAvatarId(e) ? Avatars.byId(myAvatarId(e)) : null;
    const stops = a && a.svg ? [...a.svg.matchAll(/stop-color="(#[0-9a-fA-F]{3,8})"/g)].map(m => m[1]) : [];
    const c1 = stops[0] || 'var(--tint)', c2 = stops[stops.length - 1] || 'var(--tint)';
    return `--cv1:${c1};--cv2:${c2}`;
  }

  function renderHero() {
    const e = ext(), st = effectiveStatus();
    const curInp = $('pfBio'), draft = bioEdit && curInp ? curInp.value : null;   // не теряем набранный текст при перерисовке
    const tag = e.tag ? tagById(e.tag) : null;
    const up = database.userProfile;
    // Под именем одна тихая строка: тег · группа · вуз. Тег — кнопка: по нажатию список тегов
    const tagBtn = `<button type="button" class="pf-tag-btn ${tag ? '' : 'empty'}" ${tag ? `data-tone="${tag.tone}"` : ''} data-act="pop" data-pop="tag" aria-label="Тег под ником">${tag ? esc(tag.name) : 'Выбрать тег'}</button>`;
    const sub = [tagBtn, esc(up.group || ''), esc(up.university || '')].filter(Boolean).join('<i class="pf-sub-dot">·</i>');
    const stLabel = STATUS_LABEL[st] + (e.status === 'auto' ? ', авто' : '');
    const popBox = (kind, html) => pop === kind ? `<div class="pf-pop pf-pop-${kind} ${popFresh ? 'in' : ''}" role="dialog">${html}</div>` : '';
    const bio = bioEdit
      ? `<input type="text" id="pfBio" class="pf-bio pf-bio-inline" maxlength="80" value="${esc(draft !== null ? draft : e.bio)}" aria-label="О себе"><span class="pf-bio-count" id="pfBioCount">${(draft !== null ? draft : e.bio).length} / 80</span>`
      : `<button type="button" class="pf-bio-view ${e.bio ? '' : 'empty'}" data-act="bio">${e.bio ? esc(e.bio) : 'Добавить пару слов о себе'}<span class="pf-bio-pen">${svg(P.pen, 13, 2.2)}</span></button>`;

    $('pfHero').innerHTML = `
      <div class="pf-cover" aria-hidden="true" style="${coverStyle(e)}"></div>
      <div class="pf-hero3">
        <div class="pf-pop-anchor pf-av-anchor">
          <button type="button" class="pf-avatar-edit" data-act="pop" data-pop="avatar" aria-label="Выбрать аватар" title="Выбрать аватар">
            <span class="pf-avatar" data-status="${st}">${avatarInner(e)}</span>
            <span class="pf-av-badge">${svg(P.pen, 13, 2.2)}</span>
          </button>
          <button type="button" class="pf-st-btn ${pop === 'status' ? 'on' : ''}" data-st="${st}" data-act="pop" data-pop="status" aria-label="Статус: ${esc(stLabel)}">
            <span class="pf-st-disc">${st === 'sleep' ? svg(P.moon, 12, 0).replace('fill="none"', 'fill="currentColor"') : ''}</span><i class="pf-st-gloss"></i>
          </button>
          ${popBox('avatar', avatarPickerHtml(e))}
          ${popBox('status', `<div class="pf-pop-title">Статус</div>${statusPopHtml(e)}`)}
        </div>
        <h2 class="pf-hero-name">${esc(up.name || 'Студент')}</h2>
        <div class="pf-pop-anchor pf-hero-sub">${sub}${popBox('tag', tagPopHtml(e))}</div>
        <div class="pf-bio-row">${bio}</div>
      </div>`;
    popFresh = false;
    if (bioEdit) { const inp = $('pfBio'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } }
  }

  function renderTabs() {
    const e = ext();
    const got = ACH.filter(a => e.achievements[a.id]).length;
    const tabs = [
      { id: 'overview', label: 'Обзор' },
      { id: 'achievements', label: 'Достижения', count: `${got}/${ACH.length}` },
      ...(window.Social ? [{ id: 'league', label: 'Лига' }, { id: 'friends', label: 'Друзья' }] : [])
    ];
    $('pfTabs').innerHTML = tabs.map(t => `
      <button type="button" class="pf-tab ${activeTab === t.id ? 'selected' : ''}" data-tab="${t.id}" role="tab" aria-selected="${activeTab === t.id}">
        ${t.label}${t.count ? `<span class="pf-tab-count">${t.count}</span>` : ''}
      </button>`).join('');
    document.querySelectorAll('.pf-pane').forEach(p => {
      const on = p.dataset.pane === activeTab, was = p.classList.contains('active');
      p.classList.toggle('active', on);
      if (on && !was) p.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    });
    if (window.Social && (activeTab === 'league' || activeTab === 'friends')) Social.renderPane(activeTab);
  }

  function medalHtml(a, e) {
    return `<div class="pf-medal" data-tone="${a.tone}">
      <span class="pf-ico">${svg(P[a.icon], 22)}</span>
      <span class="pf-medal-title">${esc(a.title)}</span>
    </div>`;
  }

  function renderOverview() {
    const e = ext(), s = computeStats(), soc = !!window.Social;
    const plural = (n, f) => { const a = Math.abs(n) % 100, b = a % 10; return (a > 10 && a < 20) ? f[2] : b > 1 && b < 5 ? f[1] : b === 1 ? f[0] : f[2]; };
    // Серия: учебные дни подряд, закрытые полностью (считает сервер; без сервера — пары подряд)
    const streak = soc ? s.dayStreak : s.streak;
    const SH = { 'Понедельник': 'Пн', 'Вторник': 'Вт', 'Среда': 'Ср', 'Четверг': 'Чт', 'Пятница': 'Пт', 'Суббота': 'Сб', 'Воскресенье': 'Вс' };

    // Полоска текущей недели: какие дни закрыты — отмечены все пары (это и держит серию)
    let weekStrip = '', todayState = '', todayLeft = 0;
    if (typeof calculateCurrentSemesterWeek === 'function' && typeof getDateForDay === 'function') {
      const cw = Math.max(1, calculateCurrentSemesterWeek());
      const wd = (database.weeks || {})[String(cw)] || {};
      const now = new Date(); now.setHours(0, 0, 0, 0);
      const days = ALL_DAYS.filter(d => (database.activeDays || ALL_DAYS).includes(d));
      weekStrip = days.map(day => {
        const date = getDateForDay(cw, day); date.setHours(0, 0, 0, 0);
        const today = date.getTime() === now.getTime();
        const pairs = (wd[day] || []).filter(p => !p.cancelled);
        const left = pairs.filter(p => p.attended !== true && p.attended !== false).length;
        const closed = pairs.length > 0 && left === 0;
        const st = closed ? 'done' : !pairs.length ? 'off' : today ? 'wait' : date < now ? 'miss' : 'future';
        if (today) { todayState = st; todayLeft = left; }
        const tip = { done: 'день закрыт', off: 'пар нет', wait: 'отметь все пары, чтобы закрыть день', miss: 'день не закрыт', future: 'впереди' }[st];
        return `<div class="pf-wd ${st} ${today ? 'today' : ''}" title="${SH[day]} — ${tip}"><i>${st === 'done' ? svg(P.check, 13, 3) : ''}</i><span>${SH[day]}</span></div>`;
      }).join('');
    }
    const streakHint = todayState === 'wait' ? `Осталось отметить ${todayLeft} ${plural(todayLeft, ['пару', 'пары', 'пар'])}, чтобы зажечь огонёк`
      : todayState === 'done' ? 'День закрыт — серия продолжается'
      : streak ? (soc && s.bestDayStreak ? `Лучшая серия: ${s.bestDayStreak}` : '') : 'Отметь все пары учебного дня, чтобы начать серию';
    const streakCard = `
        <div class="pf-box pf-wk pf-streak ${streak ? '' : 'zero'}">
          <div class="pf-wk-top">
            <span class="pf-wk-ico">${svg(P.flame, 20, 2.2)}</span>
            <div><div class="pf-wk-num"><span data-count="${streak}">${streak}</span></div>
            <div class="pf-wk-label">${soc ? `${plural(streak, ['закрытый день', 'закрытых дня', 'закрытых дней'])} подряд` : 'пар подряд'}</div></div>
          </div>
          ${weekStrip ? `<div class="pf-wd-row">${weekStrip}</div>` : ''}
          ${streakHint ? `<div class="pf-wk-hint">${esc(streakHint)}</div>` : ''}
        </div>`;

    // Лига недели: место по проценту от возможного и сколько не хватает до следующего места
    let leagueCard = '';
    if (soc) {
      const L = Social.league ? Social.league() : null;
      const me = L && Array.isArray(L.members) ? L.members.find(m => m.id === database.userProfile.id) : null;
      const pct = me ? me.score != null : false;                 // новый сервер присылает процент
      const val = m => Math.max(0, (pct ? m.score : m.week_xp) || 0);
      const unit = n => pct ? `${n}%` : `${n} ${plural(n, ['очко', 'очка', 'очков'])}`;
      const rank = me && me.rank != null ? me.rank : null;
      let line = me ? (pct ? `Место появится, когда за неделю наберётся ${(L.rules || {}).min_pairs || 6} пар` : '') : 'Место появится, когда загрузится лига', bar = '', rival = null;
      if (rank === 1) {
        rival = L.members.find(m => m.rank === 2) || null;
        line = rival ? `Ты лидер недели, отрыв ${unit(Math.max(0, val(me) - val(rival)))}` : 'Ты лидер недели';
      } else if (rank) {
        rival = L.members.find(m => m.rank != null && m.rank < rank && !L.members.some(x => x.rank != null && x.rank < rank && x.rank > m.rank)) || null;
        if (rival) line = `ещё ${unit(Math.max(1, val(rival) - val(me) + (pct ? 0 : 1)))} до ${rival.rank}-го места`;
      }
      // Полоска «я против соседа»: своя доля закрашена, доля соседа (второго у лидера, следующего места у остальных) — серая
      if (me && rank) {
        const mine = val(me), theirs = rival ? val(rival) : 0;
        bar = rival ? (mine + theirs ? Math.round(mine / (mine + theirs) * 100) : 50) : 100;
      }
      // Без зачёта: та же полоска показывает, сколько пар недели уже есть из нужных для зачёта
      const minPairs = (L && L.rules || {}).min_pairs || 6;
      const off = me && pct && !rank;
      if (off) bar = Math.min(100, Math.round((me.pairs_total || 0) / minPairs * 100));
      const label = pct ? `${me.score}% возможного · ${me.pairs_done} из ${me.pairs_total} ${plural(me.pairs_total, ['пары', 'пар', 'пар'])}`
        : `<span data-count="${s.weekXp}">${s.weekXp}</span> ${plural(s.weekXp, ['очко', 'очка', 'очков'])} за неделю`;
      leagueCard = `
        <button type="button" class="pf-box pf-wk pf-league ${rank && rank <= 3 ? 'top' : ''} ${off ? 'off' : ''}" data-tab="league">
          <div class="pf-wk-top">
            <span class="pf-wk-ico">${svg(P.trophy || P.star, 20, 2.2)}</span>
            <div><div class="pf-wk-num ${off ? 'off' : ''}">${rank ? `${rank}-е<small>место</small>` : off ? 'Без зачёта' : '—'}</div>
            <div class="pf-wk-label">${label}</div></div>
            <span class="pf-wk-chev">${svg(P.chev, 16, 2.4)}</span>
          </div>
          ${bar !== '' ? `<div class="pf-lg-mid">
            <div class="prog-track pf-wk-bar"><div class="prog-fill" data-w="${bar}" style="width:0%"></div></div>
            <div class="pf-lg-vs">${off ? `<span class="me">${me.pairs_total || 0} ${plural(me.pairs_total || 0, ['пара', 'пары', 'пар'])}</span><span>нужно ${minPairs}</span>`
              : `<span class="me">Ты · ${unit(val(me))}</span>${rival ? `<span>${rival.rank}-е · ${unit(val(rival))}</span>` : ''}`}</div>
          </div>` : ''}
          <div class="pf-wk-hint">${esc(line)}</div>
        </button>`;
    }

    // Награды: витрина, выбранная самим; если ничего не выбрано — последние полученные и ближайшие цели
    const pinned = e.showcase.filter(id => e.achievements[id] && achById(id)).map(achById);
    const got = pinned.length ? pinned : ACH.filter(a => e.achievements[a.id]).sort((a, b) => e.achievements[b.id] - e.achievements[a.id]).slice(0, 4);
    const medals = got.map(a => `
      <div class="pf-award" data-tone="${a.tone}" title="${esc(a.title)}, получено ${fmtDate(e.achievements[a.id])}">
        <span class="pf-award-ico">${svg(P[a.icon], 24)}</span>
        <span class="pf-award-title">${esc(a.title)}</span>
      </div>`);
    // Витрина заполнена не до конца — пустые места с «+», нажатие открывает выбор
    if (pinned.length) for (let i = pinned.length; i < 4; i++) medals.push(`
      <button type="button" class="pf-award add" data-act="pop" data-pop="show"><span class="pf-award-ico">${svg(P.plus || '<path d="M12 5v14"/><path d="M5 12h14"/>', 22, 2.2)}</span><span class="pf-award-title">Добавить</span></button>`);
    if (!pinned.length && medals.length < 4) {
      ACH.filter(a => !e.achievements[a.id] && !a.secret)
        .map(a => { const [c, t] = a.progress(s, e, database); return { a, c, t, r: t ? c / t : 0 }; })
        .sort((x, y) => y.r - x.r).slice(0, 4 - medals.length)
        .forEach(({ a, c, t }) => medals.push(`
      <div class="pf-award next" title="${esc(a.desc || a.title)}">
        <span class="pf-award-ico">${svg(P[a.icon], 24)}</span>
        <span class="pf-award-title">${esc(a.title)}</span>
        <span class="pf-award-sub">${c} из ${t}</span>
      </div>`));
    }
    // Меню витрины: все полученные достижения кружками; выбранные — с галочкой
    const owned = ACH.filter(a => e.achievements[a.id]);
    const showPop = pop === 'show' ? `<div class="pf-pop pf-pop-show ${popFresh ? 'in' : ''}" role="dialog">
        <div class="pf-avp-cap" data-def-cap="Витрина" data-def-sub="выбрано ${pinned.length} из 4${pinned.length ? '' : ' · сейчас показываются последние'}"><b>Витрина</b><span>выбрано ${pinned.length} из 4${pinned.length ? '' : ' · сейчас показываются последние'}</span></div>
        ${owned.length ? `<div class="pf-avp-grid">${owned.map(a => `<button type="button" class="pf-avp pf-shw ${e.showcase.includes(a.id) ? 'selected' : ''}" data-tone="${a.tone}" data-show="${a.id}" data-cap="${esc(a.title)}" data-sub="получено ${fmtDate(e.achievements[a.id])}" aria-pressed="${e.showcase.includes(a.id)}"><span class="pf-shw-ico">${svg(P[a.icon], 22)}</span>${e.showcase.includes(a.id) ? `<span class="pf-shw-mark">${svg(P.check, 10, 3.2)}</span>` : ''}</button>`).join('')}</div>`
          : '<p class="pf-pop-note">Пока нет полученных достижений</p>'}
      </div>` : '';
    popFresh = false;

    // Семестр одной строкой; подробности — в отчёте «Динамика за семестр»
    const sd = semesterDays();
    const semItems = [
      `<span><b>${s.total ? s.pct + '%' : '—'}</b> посещаемость</span>`,
      `<span><b>${sd.clean}</b> ${plural(sd.clean, ['день', 'дня', 'дней'])} без пропусков</span>`,
      `<span><b>${s.hwDone}/${s.hwTotal}</b> ДЗ</span>`
    ].join('<i class="pf-sub-dot">·</i>');

    $('pfPaneOverview').innerHTML = `
      <section>
        <h3 class="pf-section-title"><span>Эта неделя</span></h3>
        <div class="pf-wk-grid ${leagueCard ? '' : 'one'}">${streakCard}${leagueCard}</div>
      </section>
      <section>
        <h3 class="pf-section-title"><span>Награды</span><span class="pf-sec-links pf-pop-anchor"><button type="button" class="pf-link-btn" data-act="pop" data-pop="show">Изменить</button><button type="button" class="pf-link-btn" data-tab="achievements">Все ›</button>${showPop}</span></h3>
        <div class="pf-awards">${medals.join('')}</div>
      </section>
      <section>
        <h3 class="pf-section-title"><span>Семестр</span></h3>
        <button type="button" class="pf-box pf-sem" data-act="report" title="Открыть «Динамику за семестр»">
          <span class="pf-sem-line">${semItems}</span><span class="pf-wk-chev">${svg(P.chev, 16, 2.4)}</span>
        </button>
      </section>
      <p class="pf-foot">В приложении с ${fmtDate(e.createdAt)}</p>`;
    if (animNext) animateIn($('pfPaneOverview'));
    else $('pfPaneOverview').querySelectorAll('.prog-fill[data-w]').forEach(f => { f.style.width = f.dataset.w + '%'; });
  }

  /* Дни семестра с отметками: сколько из них прошли без единого пропуска */
  function semesterDays() {
    const r = { clean: 0, marked: 0 };
    if (typeof calculateCurrentSemesterWeek !== 'function') return r;
    const cw = Math.max(1, calculateCurrentSemesterWeek());
    const act = database.activeDays || ALL_DAYS;
    for (let w = 1; w <= cw; w++) {
      const wd = (database.weeks || {})[String(w)] || {};
      ALL_DAYS.filter(d => act.includes(d)).forEach(day => {
        const ps = (wd[day] || []).filter(p => !p.cancelled && (p.attended === true || p.attended === false));
        if (!ps.length) return;
        r.marked++;
        if (ps.every(p => p.attended === true)) r.clean++;
      });
    }
    return r;
  }

  // Цифры досчитывают, полоски прогресса заполняются — при каждом показе
  function animateIn(root) {
    if (!root) return;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.querySelectorAll('[data-count]').forEach(el => {
      const to = Number(el.dataset.count);
      if (reduce || !to) { el.textContent = to; return; }
      const t0 = performance.now(), dur = 800;
      const step = now => { const k = Math.min(1, (now - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1 && el.isConnected) requestAnimationFrame(step); };
      el.textContent = '0'; requestAnimationFrame(step);
    });
    const rings = root.querySelectorAll('.pf-ring-fg[data-off]');
    requestAnimationFrame(() => requestAnimationFrame(() => rings.forEach(r => { if (reduce) r.style.transition = 'none'; r.style.strokeDashoffset = r.dataset.off; })));
    const fills = root.querySelectorAll('.prog-fill[data-w]');
    if (!fills.length) return;
    requestAnimationFrame(() => requestAnimationFrame(() => fills.forEach((f, i) => {
      f.style.transitionDelay = (reduce ? 0 : Math.min(i, 12) * 40) + 'ms';
      f.style.width = f.dataset.w + '%';
    })));
  }

  const avatarFor = achId => (window.Avatars ? Avatars.list.find(a => a.unlock === achId) : null) || null;
  // Награда за достижение одной серой строкой: «тег «…» и аватар «…»»
  function rewardText(a) {
    const tag = a.tag ? tagById(a.tag) : null, av = avatarFor(a.id);
    const parts = [];
    if (tag) parts.push(`тег «${esc(tag.name)}»`);
    if (av) parts.push(`аватар «${esc(av.name)}»`);
    return parts.join(' и ');
  }
  function renderAchievements() {
    const e = ext(), s = computeStats();
    const done = [], todo = [];
    ACH.forEach(a => {
      const unlockedAt = e.achievements[a.id];
      const reward = rewardText(a);
      if (unlockedAt) {
        done.push({ at: new Date(unlockedAt).getTime() || 0, html: `<div class="pf-row" data-tone="${a.tone}">
          <span class="pf-ico">${svg(P[a.icon], 20)}</span>
          <div class="pf-row-body">
            <span class="pf-row-title">${esc(a.title)}</span>
            <span class="pf-row-desc">${esc(a.desc)}</span>
            <span class="pf-row-meta">Получено ${fmtDate(unlockedAt)}${reward ? ` · открыт ${reward}` : ''}</span>
          </div>
        </div>` });
        return;
      }
      if (a.secret) {
        todo.push({ k: -1, html: `<div class="pf-row locked" data-tone="gray">
          <span class="pf-ico">${svg(P.lock, 20)}</span>
          <div class="pf-row-body"><span class="pf-row-title">Скрытое достижение</span><span class="pf-row-desc">Условие откроется после получения</span>
          ${a.tag || avatarFor(a.id) ? '<span class="pf-row-meta">Откроет награду</span>' : ''}</div>
        </div>` });
        return;
      }
      const [cur, tar] = a.progress(s, e, database);
      const note = a.note ? a.note(s) : '';
      const meta = [note ? esc(note) : '', reward ? `Откроет ${reward}` : ''].filter(Boolean).join(' · ');
      todo.push({ k: tar ? cur / tar : 0, html: `<div class="pf-row locked" data-tone="${a.tone}">
        <span class="pf-ico">${svg(P[a.icon], 20)}</span>
        <div class="pf-row-body">
          <span class="pf-row-title">${esc(a.title)}</span>
          <span class="pf-row-desc">${esc(a.desc)}</span>
          <div class="pf-ach-prog"><div class="prog-track"><div class="prog-fill" data-w="${Math.round(cur / tar * 100)}" style="width:0%"></div></div><span class="pf-ach-num">${cur} / ${tar}</span></div>
          ${meta ? `<span class="pf-row-meta">${meta}</span>` : ''}
        </div>
      </div>` });
    });
    // Сначала полученные (новые сверху), ниже — те, что ближе всего к цели
    done.sort((x, y) => y.at - x.at);
    todo.sort((x, y) => y.k - x.k);
    $('pfPaneAchievements').innerHTML = `
      ${done.length ? `<section><h3 class="pf-section-title"><span>Получено <span class="pf-sec-n">${done.length}</span></span></h3><div class="pf-list">${done.map(r => r.html).join('')}</div></section>` : ''}
      ${todo.length ? `<section><h3 class="pf-section-title"><span>В процессе <span class="pf-sec-n">${todo.length}</span></span></h3><div class="pf-list">${todo.map(r => r.html).join('')}</div></section>` : ''}`;
    if (activeTab === 'achievements' && animNext) animateIn($('pfPaneAchievements'));
    else $('pfPaneAchievements').querySelectorAll('.prog-fill[data-w]').forEach(f => { f.style.width = f.dataset.w + '%'; });
  }

  function renderModal() {
    if (!hasUser() || !$('pfHero')) return;
    renderHero(); renderTabs(); renderOverview(); renderAchievements();
    animNext = false;
  }
  const modalOpen = () => $('profileBackdrop').classList.contains('open');
  function renderAll() {
    renderHeader();
    if (modalOpen()) renderModal();
    if ($('notifPopover').classList.contains('open')) renderNotifications();
    if ($('pfStatusMenu').classList.contains('open')) renderStatusMenu();
  }

  function openProfile(tab) {
    if (!hasUser()) return;
    closePops();
    if (tab === 'tags') { activeTab = 'achievements'; pop = 'tag'; popFresh = true; }   // старые уведомления про теги
    else if (tab) activeTab = tab;
    animNext = true;
    renderModal();
    $('profileBackdrop').classList.add('open');
    const sc = $('profileBackdrop').querySelector('.pf-scroll'); if (sc) sc.scrollTop = 0;
  }
  // Открыть/закрыть всплывающее меню; меню витрины живёт в «Обзоре», его тоже перерисовываем
  function setPop(k) {
    const prev = pop; pop = k; popFresh = !!k; bioEdit = false;
    const fresh = popFresh;
    if (prev === 'show' || k === 'show') renderOverview();
    popFresh = fresh; renderHero();
  }
  function closeProfile() { pop = null; bioEdit = false; $('profileBackdrop').classList.remove('open'); }

  /* ---------- События ---------- */
  function bind() {
    $('pfOpenBtn').addEventListener('click', () => openProfile());
    $('pfStatusBtn').addEventListener('click', e => { e.stopPropagation(); togglePop($('pfStatusMenu'), renderStatusMenu); });
    $('bellBtn').addEventListener('click', e => { e.stopPropagation(); togglePop($('notifPopover'), renderNotifications); });

    $('pfStatusMenu').addEventListener('click', e => {
      const b = e.target.closest('[data-status]'); if (!b) return;
      closePops(); setStatus(b.dataset.status);
    });

    $('notifPopover').addEventListener('click', e => {
      if (e.target.closest('[data-act="read-all"]')) {
        ext().notifications.forEach(n => n.read = true);
        saveData(); renderHeader(); renderNotifications(); return;
      }
      const item = e.target.closest('[data-nid]'); if (!item) return;
      const n = ext().notifications.find(x => x.id === item.dataset.nid); if (!n) return;
      n.read = true; saveData(); renderHeader();
      if (n.action === 'report' && window.Report) { closePops(); Report.open(n.arg); }
      else if (n.tab) { closePops(); openProfile(n.tab); } else renderNotifications();
    });

    const modal = $('profileBackdrop');
    modal.addEventListener('click', e => {
      if (e.target === modal) { closeProfile(); return; }
      // щелчок мимо открытого меню закрывает его
      if (pop && !e.target.closest('.pf-pop, [data-act="pop"]')) setPop(null);
      const t = e.target.closest('[data-act], [data-tab], button[data-status], [data-tag], [data-avatar], [data-show]'); if (!t) return;   // у самого аватара тоже есть data-status — это не кнопка
      if (t.dataset.act === 'close') closeProfile();
      else if (t.dataset.act === 'report') { closeProfile(); if (window.Report) Report.open(); }
      else if (t.dataset.act === 'pop') { const k = t.dataset.pop; setPop(pop === k ? null : k); }
      else if (t.dataset.show) {
        // Витрина: нажатие добавляет или убирает достижение; больше 4 нельзя
        const e2 = ext(), id = t.dataset.show, i = e2.showcase.indexOf(id);
        if (i >= 0) e2.showcase.splice(i, 1);
        else if (e2.showcase.length < 4) e2.showcase.push(id);
        else { const cap = document.querySelector('.pf-pop-show .pf-avp-cap'); if (cap) { cap.classList.remove('shake'); void cap.offsetWidth; cap.classList.add('shake'); } return; }
        saveData(); renderOverview();
      }
      else if (t.dataset.act === 'bio') { pop = null; bioEdit = true; renderHero(); }
      else if (t.dataset.avatar !== undefined) {
        const e2 = ext(), id = t.dataset.avatar, a = id && window.Avatars ? Avatars.byId(id) : null;
        if (id && !Avatars.isUnlocked(a, e2.achievements)) { avatarCaption(t); return; }   // на телефоне нажатие показывает, за что откроется
        e2.avatarId = id; lastHeaderSig = ''; saveData(); renderAll();
      }
      else if (t.dataset.tab) {
        activeTab = t.dataset.tab; renderTabs();
        if (activeTab === 'overview') { animNext = true; renderOverview(); animNext = false; }
        if (activeTab === 'achievements') animateIn($('pfPaneAchievements'));
      }
      else if (t.dataset.status) { pop = null; setStatus(t.dataset.status); }
      else if (t.dataset.tag !== undefined) {
        const id = t.dataset.tag, e2 = ext();
        if (id === '' ) e2.tag = null;
        else if (e2.tags[id]) e2.tag = id;
        else { avatarCaption(t); return; }   // закрытый: на телефоне нажатие показывает, за что откроется
        pop = null; saveData(); renderAll();
      }
    });
    modal.addEventListener('pointerover', e => {
      if (!e.target.closest || !e.target.closest('.pf-pop-avatar, .pf-pop-tag, .pf-pop-show')) return;
      avatarCaption(e.target.closest('.pf-avp, .pf-tgc-opt'));
    });
    modal.addEventListener('input', e => {
      if (e.target.id === 'pfBio') $('pfBioCount').textContent = `${e.target.value.length} / 80`;
    });
    // «О себе»: текст под именем превращается в поле; сохраняем, когда поле теряет фокус
    modal.addEventListener('focusout', e => {
      if (e.target.id !== 'pfBio' || !bioEdit) return;
      ext().bio = e.target.value.trim().slice(0, 80); bioEdit = false; saveData(); renderAll();
    });
    modal.addEventListener('keydown', e => {
      if (e.target.id === 'pfBio' && e.key === 'Enter') e.target.blur();
      if (e.target.id === 'pfBio' && e.key === 'Escape') { e.stopPropagation(); bioEdit = false; renderHero(); }
    });

    document.addEventListener('click', e => {
      // composedPath: после перерисовки панели e.target уже отсоединён от DOM, а путь события сохраняется
      const inside = e.composedPath().some(n => n.matches && n.matches('.pf-popover, #bellBtn, #pfStatusBtn'));
      if (!inside) closePops();
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.pf-popover.open')) closePops();
      else if (modalOpen() && pop) setPop(null);
      else if (modalOpen()) closeProfile();
    });

    // Активность пользователя: нужна для авто-статуса «Спит»
    const touch = () => {
      lastActive = Date.now();
      if (hasUser() && lastShownStatus === 'sleep' && ext().status === 'auto') renderHeader();
    };
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => window.addEventListener(ev, touch, { passive: true }));
    window.addEventListener('mousemove', (() => { let t = 0; return () => { const n = Date.now(); if (n - t > 1000) { t = n; touch(); } }; })(), { passive: true });
    window.addEventListener('focus', touch);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) touch(); });
  }

  /* ---------- Публичный интерфейс ---------- */
  function init() {
    if (!hasUser() || !$('pfOpenBtn')) return;
    if (!bound) {
      bound = true; bind();
      tickTimer = setInterval(() => { if (hasUser()) { renderHeader(); if ($('notifPopover').classList.contains('open')) renderNotifications(); } }, 15000);
    }
    lastActive = Date.now(); lastHeaderSig = '';
    ext(); renderHeader();
    evaluate();
  }
  function refresh() {        // после подмены database (облако, импорт)
    if (!bound || !hasUser()) return;
    lastHeaderSig = ''; renderAll(); evaluate();
  }
  function teardown() {       // при выходе из аккаунта
    if (!bound) return;
    closePops(); closeProfile(); lastHeaderSig = ''; activeTab = 'overview'; pickerOpen = false; pop = null; bioEdit = false;
  }

  // Для social.js: данные профиля, вид достижений и тегов, текущий статус
  const achInfo = id => { const a = achById(id); return a ? { title: a.title, icon: svg(P[a.icon] || P.star, 18), tone: a.tone } : null; };
  const tagInfo = id => { const t = tagById(id); return t ? { name: t.name, tone: t.tone } : null; };
  window.Profile = { init, refresh, teardown, onDataSaved, onServerState, onLeague, open: openProfile, notify, ext, computeStats, achInfo, tagInfo,
    myAvatarId: () => myAvatarId(ext()), status: () => ext().status, rerender: () => renderAll(), activeTab: () => activeTab };
})();