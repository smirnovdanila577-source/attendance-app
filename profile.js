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
    chart: '<path d="M12 20v-6M6 20V10M18 20V4"/>'
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
    { id: 'person',   name: 'Свой человек',     tone: 'blue',   ach: 'profile_done' }
  ];
  const tagById = id => TAGS.find(t => t.id === id) || null;

  const prog = (cur, tar) => [Math.min(cur, tar), tar];
  const ACH = [
    { id: 'first_mark', title: 'Первая отметка', desc: 'Отметь посещение первой пары', icon: 'star', tone: 'blue',
      progress: s => prog(s.attended, 1) },
    { id: 'attend_10', title: 'Прилежный студент', desc: 'Посети 10 пар', icon: 'cal', tone: 'green', tag: 'diligent',
      progress: s => prog(s.attended, 10) },
    { id: 'attend_100', title: 'Несгибаемая воля', desc: 'Посети 100 пар', icon: 'award', tone: 'blue', tag: 'ironclad',
      progress: s => prog(s.attended, 100) },
    { id: 'streak_10', title: 'Без пропусков', desc: 'Посети 10 пар подряд, не пропустив ни одной', icon: 'flame', tone: 'yellow', tag: 'flow',
      progress: s => prog(s.streak, 10) },
    { id: 'perfect_week', title: 'Идеальная неделя', desc: 'Отметь все пары недели (от 3 пар) как посещённые', icon: 'clip', tone: 'green', tag: 'perfect',
      progress: s => prog(s.perfectWeeks, 1) },
    { id: 'scholar', title: 'Отличник', desc: 'Держи посещаемость от 80%, когда отмечено хотя бы 30 пар', icon: 'cap', tone: 'violet', tag: 'scholar',
      progress: s => prog(s.total, 30),
      done: s => s.total >= 30 && s.pct >= 80,
      note: s => (s.total >= 30 && s.pct < 80) ? `Сейчас ${s.pct}%, нужно 80%` : '' },
    { id: 'hw_10', title: 'Домашний мастер', desc: 'Выполни 10 домашних заданий', icon: 'clip', tone: 'blue', tag: 'hwmaster',
      progress: s => prog(s.hwDone, 10) },
    { id: 'important', title: 'Стратег', desc: 'Отметь важный предмет закладкой', icon: 'flag', tone: 'red', tag: 'strategist',
      progress: (s, e, db) => prog((db.important_subjects || []).length, 1) },
    { id: 'night_owl', title: 'Ночной режим', desc: 'Загляни в трекер глубокой ночью', icon: 'moon', tone: 'violet', tag: 'owl', secret: true,
      progress: (s, e) => prog(e.flags.night ? 1 : 0, 1) },
    { id: 'early_bird', title: 'Ранний старт', desc: 'Загляни в трекер до восьми утра', icon: 'sun', tone: 'yellow', tag: 'lark', secret: true,
      progress: (s, e) => prog(e.flags.early ? 1 : 0, 1) },
    { id: 'profile_done', title: 'Свой человек', desc: 'Добавь фото и расскажи о себе в профиле', icon: 'user', tone: 'blue', tag: 'person',
      progress: (s, e) => prog((e.avatar ? 1 : 0) + (e.bio && e.bio.trim().length >= 3 ? 1 : 0), 2) }
  ];
  const achById = id => ACH.find(a => a.id === id) || null;
  const isDone = (a, s, e, db) => a.done ? a.done(s, e, db) : (() => { const [c, t] = a.progress(s, e, db); return c >= t; })();

  /* ---------- Состояние модуля ---------- */
  let bound = false, lastActive = Date.now(), tickTimer = null, lastShownStatus = null;
  let evalTimer = null, evaluating = false, activeTab = 'overview', lastHeaderSig = '';

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

      const h = new Date().getHours();
      if (h < 5 && !e.flags.night) { e.flags.night = true; changed = true; }
      else if (h >= 5 && h < 8 && !e.flags.early) { e.flags.early = true; changed = true; }

      if (!e.welcomed) {
        e.welcomed = true; changed = true;
        notify('Добро пожаловать в профиль',
          'Здесь собираются достижения и теги. Статус можно сменить вручную: нажми на кружок у аватара.',
          { icon: 'user', tone: 'blue' });
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

  /* ---------- Аватар ---------- */
  const safeImg = src => (typeof src === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src)) ? src : null;
  function avatarInner(e) {
    const name = (database.userProfile.name || 'С').trim();
    const img = safeImg(e.avatar);
    const face = img ? `<img class="pf-img" src="${img}" alt="">` : esc(name.charAt(0).toUpperCase() || 'С');
    return face + '<span class="pf-dot"></span><span class="pf-zzz" aria-hidden="true"><i>z</i><i>z</i><i>z</i></span>';
  }

  /* ---------- Шапка ---------- */
  function renderHeader() {
    if (!hasUser() || !$('pfHeaderAvatar')) return;
    const e = ext(), st = effectiveStatus();
    const tag = e.tag ? tagById(e.tag) : null;
    const name = database.userProfile.name || 'Студент';
    const av = $('pfHeaderAvatar');

    const sig = [name, e.avatar ? e.avatar.length : 0].join('|');
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
    $('bellBtn').title = unread ? `Уведомления: ${unread} новых` : 'Уведомления';
    lastShownStatus = st;
  }

  function statusIcon(id) {
    if (id === 'auto') return `<span class="pf-st-ico pf-st-auto">${svg(P.zap, 14)}</span>`;
    if (id === 'sleep') return '<span class="pf-st-ico"><span class="pf-st-z">zzz</span></span>';
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
  function renderHero() {
    const e = ext(), st = effectiveStatus();
    const tag = e.tag ? tagById(e.tag) : null;
    const up = database.userProfile;
    const meta = [up.group ? `Группа ${up.group}` : '', up.university || ''].filter(Boolean).join(', ') || 'Профиль студента';

    $('pfHero').innerHTML = `
      <div class="pf-hero">
        <button type="button" class="pf-avatar-edit" data-act="avatar" aria-label="Сменить фото">
          <span class="pf-avatar" data-status="${st}">${avatarInner(e)}</span>
        </button>
        <div class="pf-hero-info">
          <h2 class="pf-hero-name">${esc(up.name || 'Студент')}</h2>
          ${tag ? `<span class="pf-chip" data-tone="${tag.tone}">${esc(tag.name)}</span>` : ''}
          <div class="pf-hero-meta">${esc(meta)}</div>
          <div class="pf-hero-actions">
            <button type="button" class="pf-link-btn" data-act="avatar">${e.avatar ? 'Заменить фото' : 'Загрузить фото'}</button>
            ${e.avatar ? '<button type="button" class="pf-link-btn" data-act="avatar-remove">Убрать</button>' : ''}
          </div>
        </div>
      </div>
      <span class="pf-field-label">Статус</span>
      <div class="pf-seg" role="radiogroup" aria-label="Статус">
        ${STATUS_MODES.map(m => `
          <button type="button" role="radio" aria-checked="${e.status === m.id}" class="${e.status === m.id ? 'selected' : ''}" data-status="${m.id}">
            ${statusIcon(m.id)}<span>${m.short}</span>
          </button>`).join('')}
      </div>`;
  }

  function renderTabs() {
    const e = ext();
    const got = ACH.filter(a => e.achievements[a.id]).length;
    const tabs = [
      { id: 'overview', label: 'Обзор' },
      { id: 'achievements', label: 'Достижения', count: `${got}/${ACH.length}` },
      { id: 'tags', label: 'Теги', count: `${Object.keys(e.tags).filter(id => tagById(id)).length}/${TAGS.length}` }
    ];
    $('pfTabs').innerHTML = tabs.map(t => `
      <button type="button" class="pf-tab ${activeTab === t.id ? 'selected' : ''}" data-tab="${t.id}" role="tab" aria-selected="${activeTab === t.id}">
        ${t.label}${t.count ? `<span class="pf-tab-count">${t.count}</span>` : ''}
      </button>`).join('');
    document.querySelectorAll('.pf-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === activeTab));
  }

  function medalHtml(a, e) {
    return `<div class="pf-medal" data-tone="${a.tone}">
      <span class="pf-ico">${svg(P[a.icon], 22)}</span>
      <span class="pf-medal-title">${esc(a.title)}</span>
    </div>`;
  }

  function renderOverview() {
    if (document.activeElement && document.activeElement.id === 'pfBio') return; // не мешаем вводу
    const e = ext(), s = computeStats();
    const got = ACH.filter(a => e.achievements[a.id]).sort((a, b) => e.achievements[b.id] - e.achievements[a.id]).slice(0, 3);
    const medals = got.map(a => medalHtml(a, e));
    while (medals.length < 3) medals.push('<div class="pf-medal empty">Место для достижения</div>');
    const color = s.pct >= 80 ? 'var(--color-green)' : s.pct >= 60 ? 'var(--color-yellow)' : 'var(--color-red)';

    $('pfPaneOverview').innerHTML = `
      <section>
        <h3 class="pf-section-title"><span>Витрина достижений</span><button type="button" class="pf-link-btn" data-tab="achievements">Все достижения</button></h3>
        <div class="pf-showcase">${medals.join('')}</div>
      </section>
      <section>
        <h3 class="pf-section-title"><span>Успеваемость</span></h3>
        <div class="pf-box">
          <div class="pf-big"><div class="pf-big-num">${s.pct}%</div><div class="pf-big-sub">${s.attended} из ${s.total} пар</div></div>
          <div class="prog-track"><div class="prog-fill" style="width:${s.pct}%; background:${color}"></div></div>
          <div class="pf-mini-grid">
            <div><div class="pf-mini-num">${s.streak}</div><div class="pf-mini-label">пар подряд</div></div>
            <div><div class="pf-mini-num">${s.hwDone} / ${s.hwTotal}</div><div class="pf-mini-label">домашек сделано</div></div>
            <div><div class="pf-mini-num">${s.perfectWeeks}</div><div class="pf-mini-label">идеальных недель</div></div>
          </div>
        </div>
      </section>
      <section>
<h3 class="pf-section-title"><span>О себе</span><span class="pf-since">В приложении с ${fmtDate(e.createdAt)}</span></h3>
        <input type="text" id="pfBio" class="pf-bio" maxlength="80" placeholder="Пара слов о себе" value="${esc(e.bio)}">
        <div class="pf-bio-count" id="pfBioCount">${e.bio.length} / 80</div>
      </section>`;
  }

  function renderAchievements() {
    const e = ext(), s = computeStats();
    const got = ACH.filter(a => e.achievements[a.id]).length;
    const rows = ACH.map(a => {
      const unlockedAt = e.achievements[a.id];
      const tag = a.tag ? tagById(a.tag) : null;
      if (unlockedAt) {
        return `<div class="pf-row" data-tone="${a.tone}">
          <span class="pf-ico">${svg(P[a.icon], 20)}</span>
          <div class="pf-row-body">
            <span class="pf-row-title">${esc(a.title)}</span>
            <span class="pf-row-desc">${esc(a.desc)}</span>
            <span class="pf-row-meta">Получено ${fmtDate(unlockedAt)}</span>
          </div>
          ${tag ? `<span class="pf-chip pf-reward" data-tone="${tag.tone}">Тег «${esc(tag.name)}»</span>` : ''}
        </div>`;
      }
      if (a.secret) {
        return `<div class="pf-row locked" data-tone="gray">
          <span class="pf-ico">${svg(P.lock, 20)}</span>
          <div class="pf-row-body"><span class="pf-row-title">Скрытое достижение</span><span class="pf-row-desc">Условие откроется после получения</span></div>
          ${tag ? '<span class="pf-lock">' + svg(P.tag, 16) + '</span>' : ''}
        </div>`;
      }
      const [cur, tar] = a.progress(s, e, database);
      const note = a.note ? a.note(s) : '';
      return `<div class="pf-row locked" data-tone="${a.tone}">
        <span class="pf-ico">${svg(P[a.icon], 20)}</span>
        <div class="pf-row-body">
          <span class="pf-row-title">${esc(a.title)}</span>
          <span class="pf-row-desc">${esc(a.desc)}</span>
          <div class="prog-track"><div class="prog-fill" style="width:${Math.round(cur / tar * 100)}%"></div></div>
          <span class="pf-row-meta">${cur} / ${tar}${note ? ', ' + esc(note) : ''}</span>
        </div>
        ${tag ? `<span class="pf-lock" title="Награда: тег «${esc(tag.name)}»">${svg(P.tag, 16)}</span>` : ''}
      </div>`;
    }).join('');
    $('pfPaneAchievements').innerHTML = `
      <p class="pf-tags-note">Получено ${got} из ${ACH.length}. Значок тега у достижения означает, что за него откроется тег.</p>
      <div class="pf-list">${rows}</div>`;
  }

  function renderTags() {
    const e = ext();
    const row = (t) => {
      const owned = !!e.tags[t.id];
      const equipped = e.tag === t.id;
      const a = t.ach ? achById(t.ach) : null;
      const sub = owned
        ? (a ? `Получен за «${esc(a.title)}»` : esc(t.hint || ''))
        : (a && a.secret ? 'Награда за скрытое достижение' : `Получи достижение «${esc(a ? a.title : '')}»`);
      return `<button type="button" class="pf-row ${owned ? 'pickable' : 'locked'} ${equipped ? 'equipped' : ''}" data-tag="${t.id}" ${owned ? '' : 'aria-disabled="true"'} role="radio" aria-checked="${equipped}">
        <span class="pf-radio">${svg(P.check, 12, 3)}</span>
        <div class="pf-row-body">
          <span class="pf-chip" data-tone="${owned ? t.tone : 'gray'}">${esc(t.name)}</span>
          <span class="pf-row-desc">${sub}</span>
        </div>
        ${owned ? '' : `<span class="pf-lock">${svg(P.lock, 16)}</span>`}
      </button>`;
    };
    const none = `<button type="button" class="pf-row pickable ${e.tag ? '' : 'equipped'}" data-tag="" role="radio" aria-checked="${!e.tag}">
      <span class="pf-radio">${svg(P.check, 12, 3)}</span>
      <div class="pf-row-body"><span class="pf-row-title">Без тега</span><span class="pf-row-desc">Под ником ничего не показывается</span></div>
    </button>`;
    $('pfPaneTags').innerHTML = `
      <p class="pf-tags-note">Теги не выбрать и не купить: каждый открывается за достижение. Выбранный тег показывается под твоим ником в шапке.</p>
      <div class="pf-list" role="radiogroup">${none}${TAGS.map(row).join('')}</div>`;
  }

  function renderModal() {
    if (!hasUser() || !$('pfHero')) return;
    renderHero(); renderTabs(); renderOverview(); renderAchievements(); renderTags();
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
    if (tab) activeTab = tab;
    renderModal();
    $('profileBackdrop').classList.add('open');
    const sc = $('profileBackdrop').querySelector('.pf-scroll'); if (sc) sc.scrollTop = 0;
  }
  function closeProfile() { $('profileBackdrop').classList.remove('open'); }

  /* ---------- Фото профиля ---------- */
  function handleAvatarFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { showElegantToast('Фото', 'Выбери файл-изображение', 'error'); return; }
    if (file.size > 8 * 1024 * 1024) { showElegantToast('Фото', 'Файл слишком большой (максимум 8 МБ)', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const S = 128, c = document.createElement('canvas');
        c.width = c.height = S;
        const m = Math.min(img.width, img.height);
        c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
        ext().avatar = c.toDataURL('image/jpeg', 0.86);
        lastHeaderSig = '';
        saveData(); renderAll();
      };
      img.onerror = () => showElegantToast('Фото', 'Не удалось прочитать изображение', 'error');
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

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
      const t = e.target.closest('[data-act], [data-tab], [data-status], [data-tag]'); if (!t) return;
      if (t.dataset.act === 'close') closeProfile();
      else if (t.dataset.act === 'avatar') $('pfAvatarInput').click();
      else if (t.dataset.act === 'avatar-remove') { ext().avatar = null; lastHeaderSig = ''; saveData(); renderAll(); }
      else if (t.dataset.tab) { activeTab = t.dataset.tab; renderTabs(); }
      else if (t.dataset.status) setStatus(t.dataset.status);
      else if (t.dataset.tag !== undefined) {
        const id = t.dataset.tag, e2 = ext();
        if (id === '' ) e2.tag = null;
        else if (e2.tags[id]) e2.tag = id;
        else return;
        saveData(); renderAll();
      }
    });
    modal.addEventListener('input', e => {
      if (e.target.id === 'pfBio') $('pfBioCount').textContent = `${e.target.value.length} / 80`;
    });
    modal.addEventListener('change', e => {
      if (e.target.id === 'pfBio') { ext().bio = e.target.value.trim().slice(0, 80); saveData(); renderAll(); }
    });
    modal.addEventListener('keydown', e => {
      if (e.target.id === 'pfBio' && e.key === 'Enter') e.target.blur();
    });
    $('pfAvatarInput').addEventListener('change', e => { handleAvatarFile(e.target.files[0]); e.target.value = ''; });

    document.addEventListener('click', e => {
      // composedPath: после перерисовки панели e.target уже отсоединён от DOM, а путь события сохраняется
      const inside = e.composedPath().some(n => n.matches && n.matches('.pf-popover, #bellBtn, #pfStatusBtn'));
      if (!inside) closePops();
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.pf-popover.open')) closePops();
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
    closePops(); closeProfile(); lastHeaderSig = ''; activeTab = 'overview';
  }

  window.Profile = { init, refresh, teardown, onDataSaved, open: openProfile, notify };
})();