/* ==========================================================================
   СОЦИАЛЬНАЯ ЧАСТЬ: очки, серия дней, лига недели, друзья, чужие профили, онлайн
   Подключается ПОСЛЕ app.js, avatars.js и profile.js.
   Использует глобальные из app.js: database, API_URL, authHeaders, ALL_DAYS,
   getDateForDay, saveData, showElegantToast, cloudPullDone.

   Очки и серию считаем по своим данным (отметки и ДЗ), на сервер уходит только итог.
   Правила очков: +10 за отмеченную пару (посещение или пропуск — важна честность),
   +5 за выполненный пункт ДЗ, +5 за полностью отмеченный учебный день.
   ========================================================================== */
(function () {
  'use strict';

  const XP_PAIR = 10, XP_TASK = 5, XP_FULL_DAY = 5;
  const SYNC_DELAY = 4000, PING_EVERY = 60000, RESYNC_EVERY = 5 * 60000;

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hasUser = () => typeof database !== 'undefined' && database && database.userProfile && database.userProfile.id;
  const plural = (n, f) => { const a = Math.abs(n) % 100, b = a % 10; return (a > 10 && a < 20) ? f[2] : b > 1 && b < 5 ? f[1] : b === 1 ? f[0] : f[2]; };
  const svg = (p, s = 16, sw = 2.2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const I = {
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>'
  };

  /* ---------- Даты ---------- */
  const pad = n => String(n).padStart(2, '0');
  const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  // Календарная неделя ISO (понедельник — первый день): «2026-W42». Так же считает сервер.
  function weekKey(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const y = d.getUTCFullYear();
    const w = Math.ceil(((d - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
    return `${y}-W${pad(w)}`;
  }

  /* ---------- Очки и серия ---------- */
  let cache = null;
  function stats() {
    if (cache) return cache;
    const res = { weekXp: 0, xpTotal: 0, streak: 0, bestStreak: 0, weekKey: weekKey(new Date()) };
    if (!hasUser() || !database.weeks) return (cache = res);
    const act = database.activeDays || ALL_DAYS;
    const today = dayKey(new Date());
    const days = [];
    Object.keys(database.weeks).map(Number).filter(n => n > 0).forEach(w => {
      const wd = database.weeks[String(w)] || {};
      ALL_DAYS.forEach(day => {
        if (!act.includes(day)) return;
        const list = wd[day] || [];
        if (!list.length) return;
        const date = getDateForDay(w, day);
        const key = dayKey(date);
        if (key > today) return;                                   // будущее не считаем
        let pairs = 0, marked = 0, tasks = 0;
        list.forEach(p => {
          (p.tasks || []).forEach(t => { if (t.done) tasks++; });
          if (p.cancelled) return;
          pairs++;
          if (p.attended === true || p.attended === false) marked++;
        });
        const xp = marked * XP_PAIR + tasks * XP_TASK + (pairs > 0 && marked === pairs ? XP_FULL_DAY : 0);
        days.push({ key, wk: weekKey(date), pairs, marked, xp });
      });
    });
    days.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    let run = 0;
    days.forEach(d => {
      res.xpTotal += d.xp;
      if (d.wk === res.weekKey) res.weekXp += d.xp;
      if (!d.pairs) return;                                         // день без пар серию не трогает
      if (d.marked > 0) { run++; if (run > res.bestStreak) res.bestStreak = run; }
      else if (d.key !== today) run = 0;                            // сегодня ещё можно успеть
    });
    res.streak = run;
    return (cache = res);
  }

  /* ---------- Сервер ---------- */
  async function api(path, opts = {}) {
    const r = await fetch(`${API_URL}${path}`, {
      method: opts.method || 'GET',
      headers: authHeaders(opts.body ? { 'Content-Type': 'application/json' } : {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const err = new Error(data.detail || `Ошибка сервера (${r.status})`); err.status = r.status; throw err; }
    return data;
  }

  let syncTimer = null, pingTimer = null, resyncTimer = null, started = false, online = null, lastSyncSig = '';
  const canTalk = () => hasUser() && localStorage.getItem('tracker_token') && (typeof cloudPullDone === 'undefined' || cloudPullDone);

  function payload() {
    const e = window.Profile ? Profile.ext() : {};
    const s = stats();
    const ps = window.Profile ? Profile.computeStats() : null;
    return {
      week_key: s.weekKey, week_xp: s.weekXp, xp_total: s.xpTotal,
      streak_days: s.streak, streak_best: s.bestStreak,
      achievements: Object.keys(e.achievements || {}),
      tag: e.tag || '', avatar: window.Profile ? Profile.myAvatarId() : '',
      bio: e.bio || '', status_mode: e.status || 'auto',
      share_attendance: !!e.shareAttendance,
      attendance_pct: ps && ps.total > 0 ? ps.pct : null
    };
  }

  async function sync(force = false) {
    clearTimeout(syncTimer); syncTimer = null;
    if (!canTalk()) { syncTimer = setTimeout(sync, 3000); return; }
    const body = payload();
    const sig = JSON.stringify(body);
    if (!force && sig === lastSyncSig) return;
    try { await api('/api/social/sync', { method: 'POST', body }); lastSyncSig = sig; }
    catch (e) { /* нет сети — отправим в следующий раз */ }
  }

  async function ping() {
    if (!canTalk() || document.hidden) return;
    try {
      const st = window.Profile ? Profile.status() : 'auto';
      const r = await api(`/api/social/ping?status_mode=${encodeURIComponent(st)}`, { method: 'POST' });
      online = r.online; renderHead();
    } catch (e) { /* не страшно */ }
  }

  // Достижения, которые зависят от других людей: тройка лиги прошлой недели и первый взаимный друг
  async function checkFlags() {
    if (!canTalk() || !window.Profile) return;
    const e = Profile.ext();
    let changed = false;
    try {
      if (!e.flags.podium) {
        const prev = await api('/api/league?which=previous');
        const me = prev.members.find(m => m.id === database.userProfile.id);
        if (me && me.rank <= 3 && me.week_xp > 0 && prev.size >= 3) { e.flags.podium = true; changed = true; }
      }
      if (!e.flags.friend) {
        const f = await api('/api/friends');
        if (f.mutual_count > 0) { e.flags.friend = true; changed = true; }
      }
    } catch (err) { /* проверим позже */ }
    if (changed) saveData();
  }

  /* ---------- Шапка: серия и онлайн ---------- */
  function renderHead() {
    const box = $('scHead');
    if (!box) return;
    if (!hasUser()) { box.innerHTML = ''; return; }
    const s = stats();
    box.innerHTML = `
      <span class="sc-chip sc-streak ${s.streak ? 'on' : ''}" title="Серия учебных дней с отметками">${svg(I.flame, 15, 2.2)}<b>${s.streak}</b></span>
      ${online != null ? `<span class="sc-chip sc-online" title="Сейчас в приложении"><i></i>${online} в сети</span>` : ''}`;
  }

  /* ---------- Вкладки профиля: лига и друзья ---------- */
  const view = { league: null, friends: null };      // открытый чужой профиль внутри вкладки
  const avatarHtml = (id, name) => window.Avatars ? Avatars.html(id, name) : esc(String(name || '?').charAt(0).toUpperCase());
  const tagChip = id => {
    const t = window.Profile ? Profile.tagInfo(id) : null;
    return t ? `<span class="pf-chip sc-tag" data-tone="${t.tone}">${esc(t.name)}</span>` : '';
  };
  const statusDot = st => `<span class="sc-dot" data-status="${esc(st)}"></span>`;
  const loading = () => '<div class="sc-loading"><span class="ip-spin"></span>Загружаем…</div>';
  const failed = msg => `<div class="pf-empty">${esc(msg)}<button type="button" class="pf-link-btn" data-sc="retry">Повторить</button></div>`;

  function paneEl(tab) { return tab === 'league' ? $('pfPaneLeague') : $('pfPaneFriends'); }

  async function renderPane(tab) {
    const el = paneEl(tab);
    if (!el) return;
    if (view[tab]) return renderPublic(tab, view[tab]);
    if (!el.dataset.loaded) el.innerHTML = loading();
    sync();
    try {
      if (tab === 'league') renderLeague(el, await api('/api/league'));
      else renderFriends(el, await api('/api/friends'));
      el.dataset.loaded = '1';
      if (tab === 'friends') checkFlags();
    } catch (e) {
      el.innerHTML = failed(e.status === 401 ? 'Сессия истекла. Выйди и войди в аккаунт заново' : 'Не удалось связаться с сервером');
    }
  }

  function timeLeft(iso) {
    if (!iso) return '';
    const ms = new Date(iso) - Date.now();
    if (ms <= 0) return 'подводим итоги';
    const d = Math.floor(ms / 86400000), h = Math.floor(ms % 86400000 / 3600000);
    return d > 0 ? `ещё ${d} ${plural(d, ['день', 'дня', 'дней'])} ${h} ч` : `ещё ${h} ${plural(h, ['час', 'часа', 'часов'])}`;
  }

  function personRow(m, extra = '') {
    const me = m.id === database.userProfile.id;
    return `<div class="pf-row sc-person ${me ? 'me' : 'pickable'}" ${me ? '' : `role="button" tabindex="0" data-sc="open" data-name="${esc(m.name)}"`}>
      ${m.rank != null ? `<span class="sc-rank" data-place="${m.rank <= 3 ? m.rank : ''}">${m.rank}</span>` : ''}
      <span class="sc-av">${avatarHtml(m.avatar, m.name)}${statusDot(m.status)}</span>
      <span class="pf-row-body">
        <span class="sc-name">${esc(m.name)}${me ? '<span class="sc-you">это ты</span>' : ''}</span>
        <span class="sc-sub">${tagChip(m.tag)}${m.streak ? `<span class="sc-mini-streak">${svg(I.flame, 12, 2.4)}${m.streak}</span>` : ''}${extra}</span>
      </span>
      <span class="sc-xp"><b>${m.week_xp}</b><small>очков</small></span>
    </div>`;
  }

  function renderLeague(el, L) {
    const s = stats();
    const rows = L.members.map((m, i) => personRow(m) + (i === 2 && L.members.length > 3 ? '<div class="sc-zone">Выше черты — призёры недели</div>' : '')).join('');
    el.innerHTML = `
      <div class="sc-league-head">
        <div><div class="sc-h">${svg(I.trophy, 18)}Лига недели</div><div class="sc-muted">Итоги в понедельник в 00:00 по Москве, ${timeLeft(L.ends_at)}</div></div>
        <div class="sc-me"><b>${s.weekXp}</b><small>твоих очков</small></div>
      </div>
      <div class="pf-list">${rows || '<div class="pf-empty">На этой неделе пока никто не набрал очков</div>'}</div>
      <p class="pf-tags-note">Очки: +${XP_PAIR} за отмеченную пару, будь то посещение или честный пропуск, +${XP_TASK} за пункт ДЗ, +${XP_FULL_DAY} за полностью отмеченный день. Тройка недели получает достижение «Призёр лиги».</p>`;
  }

  function renderFriends(el, F) {
    const e = Profile.ext();
    const nick = database.userProfile.name || '';
    const rows = F.friends.map(f => {
      const rel = f.mutual ? '<span class="sc-rel ok">Друзья</span>' : f.you_follow ? '<span class="sc-rel">Ты подписан</span>' : '<span class="sc-rel">Подписан на тебя</span>';
      const btn = !f.you_follow
        ? `<span class="sc-act" role="button" tabindex="0" data-sc="follow" data-name="${esc(f.name)}">Подписаться</span>`
        : `<span class="sc-act ghost" role="button" tabindex="0" data-sc="unfollow" data-id="${f.id}" title="Отписаться">${svg(I.x, 14, 2.6)}</span>`;
      return personRow(f, rel + btn);
    }).join('');
    el.innerHTML = `
      <section>
        <h3 class="pf-section-title"><span>Добавить друга</span></h3>
        <label class="sc-label" for="scFriendInput">Ник друга в трекере</label>
        <div class="sc-add">
          <input type="text" id="scFriendInput" class="pf-bio" maxlength="40" autocomplete="off" spellcheck="false">
          <button type="button" class="btn btn-primary sc-add-btn" data-sc="add">Подписаться</button>
        </div>
        <div class="sc-mynick">Твой ник для друзей: <b>${esc(nick)}</b>
          <button type="button" class="pf-link-btn" data-sc="copy">${svg(I.copy, 13)} Скопировать</button></div>
      </section>
      <section>
        <h3 class="pf-section-title"><span>Подписки и друзья</span><span class="pf-since">${F.mutual_count} ${plural(F.mutual_count, ['друг', 'друга', 'друзей'])}</span></h3>
        <div class="pf-list">${rows || `<div class="pf-empty">${svg(I.users, 26, 1.8)}<span>Подпишись на друга по нику. Когда он подпишется в ответ, вы станете друзьями.</span></div>`}</div>
      </section>
      <label class="sc-toggle"><input type="checkbox" id="scShareToggle" ${e.shareAttendance ? 'checked' : ''}>
        <span>Показывать мой процент посещаемости в профиле для других</span></label>`;
  }

  async function openPublic(tab, name) {
    const el = paneEl(tab);
    view[tab] = { name, data: null };
    el.innerHTML = loading();
    try {
      const data = await api(`/api/profile/${encodeURIComponent(name)}`);
      if (!view[tab] || view[tab].name !== name) return;
      view[tab].data = data;
      renderPublic(tab, view[tab]);
    } catch (e) {
      view[tab] = null;
      showElegantToast('Профиль', e.message, 'error');
      renderPane(tab);
    }
  }

  function renderPublic(tab, v) {
    const el = paneEl(tab), p = v.data;
    if (!p) { el.innerHTML = loading(); return; }
    const STATUS = { online: 'В сети', offline: 'Не в сети', sleep: 'Спит' };
    const medals = (p.achievements || []).map(id => window.Profile && Profile.achInfo(id)).filter(Boolean)
      .map(a => `<div class="pf-medal" data-tone="${a.tone}"><span class="pf-ico">${a.icon}</span><span class="pf-medal-title">${esc(a.title)}</span></div>`);
    const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const sd = p.since ? new Date(p.since) : null;
    const since = sd && !isNaN(sd) ? `${MONTHS[sd.getMonth()]} ${sd.getFullYear()}` : '';
    const followBtn = p.you_follow
      ? `<button type="button" class="btn btn-secondary" data-sc="unfollow" data-id="${p.id}">Отписаться</button>`
      : `<button type="button" class="btn btn-primary" data-sc="follow" data-name="${esc(p.name)}">${p.follows_you ? 'Подписаться в ответ' : 'Подписаться'}</button>`;
    el.innerHTML = `
      <button type="button" class="pf-link-btn sc-back" data-sc="back">${svg(I.back, 14, 2.6)} ${tab === 'league' ? 'К лиге' : 'К друзьям'}</button>
      <div class="pf-hero sc-pub-hero">
        <span class="pf-avatar sc-pub-av" data-status="${esc(p.status)}">${avatarHtml(p.avatar, p.name)}<span class="pf-dot"></span></span>
        <div class="pf-hero-info">
          <h2 class="pf-hero-name">${esc(p.name)}</h2>
          ${tagChip(p.tag)}
          <div class="pf-hero-meta">${esc(STATUS[p.status] || '')}${p.university ? ' · ' + esc(p.university) : ''}${since ? ' · с ' + esc(since) : ''}</div>
          <div class="pf-hero-actions">${followBtn}${p.mutual || (p.you_follow && p.follows_you) ? '<span class="sc-rel ok">Друзья</span>' : ''}</div>
        </div>
      </div>
      <div class="pf-box"><div class="pf-mini-grid sc-pub-stats">
        <div><div class="pf-mini-num">${p.streak}</div><div class="pf-mini-label">дней в серии</div></div>
        <div><div class="pf-mini-num">${p.week_xp}</div><div class="pf-mini-label">очков за неделю</div></div>
        <div><div class="pf-mini-num">${p.xp_total}</div><div class="pf-mini-label">очков всего</div></div>
        ${p.attendance_pct != null ? `<div><div class="pf-mini-num">${p.attendance_pct}%</div><div class="pf-mini-label">посещаемость</div></div>` : ''}
      </div></div>
      ${p.bio ? `<section><h3 class="pf-section-title"><span>О себе</span></h3><p class="sc-bio">${esc(p.bio)}</p></section>` : ''}
      <section><h3 class="pf-section-title"><span>Достижения</span><span class="pf-since">${medals.length}</span></h3>
        ${medals.length ? `<div class="pf-showcase sc-medals">${medals.join('')}</div>` : '<div class="pf-empty">Пока без достижений</div>'}</section>`;
  }

  async function follow(name, tab) {
    name = (name || '').trim();
    if (!name) { const i = $('scFriendInput'); if (i) { i.classList.add('input-error'); i.focus(); } return; }
    try {
      await api('/api/friends/follow', { method: 'POST', body: { username: name } });
      showElegantToast('Друзья', `Ты подписан на ${name}`);
      if (view[tab]) await openPublic(tab, view[tab].name); else renderPane(tab);
      if (tab !== 'friends') { const f = paneEl('friends'); if (f) delete f.dataset.loaded; }
      checkFlags();
    } catch (e) { showElegantToast('Друзья', e.message, 'error'); }
  }

  async function unfollow(id, tab) {
    try {
      await api(`/api/friends/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (view[tab]) await openPublic(tab, view[tab].name); else renderPane(tab);
    } catch (e) { showElegantToast('Друзья', e.message, 'error'); }
  }

  /* ---------- События ---------- */
  function bind() {
    const modal = $('profileBackdrop');
    if (!modal) return;
    const tabOf = el => (el.closest('.pf-pane') || {}).dataset ? el.closest('.pf-pane').dataset.pane : 'friends';
    const act = t => {
      const tab = tabOf(t), a = t.dataset.sc;
      if (a === 'open') openPublic(tab, t.dataset.name);
      else if (a === 'back') { view[tab] = null; renderPane(tab); }
      else if (a === 'retry') renderPane(tab);
      else if (a === 'add') follow(($('scFriendInput') || {}).value, tab);
      else if (a === 'follow') follow(t.dataset.name, tab);
      else if (a === 'unfollow') unfollow(t.dataset.id, tab);
      else if (a === 'copy') {
        const nick = database.userProfile.name || '';
        const done = () => showElegantToast('Ник скопирован', 'Отправь его другу, чтобы он нашёл тебя в трекере');
        try { navigator.clipboard.writeText(nick).then(done, () => showElegantToast('Твой ник', nick)); } catch (e) { showElegantToast('Твой ник', nick); }
      }
    };
    modal.addEventListener('click', e => {
      const t = e.target.closest('[data-sc]');
      if (!t) return;
      e.stopPropagation();
      act(t);
    }, true);
    modal.addEventListener('keydown', e => {
      if (e.target.id === 'scFriendInput' && e.key === 'Enter') { e.preventDefault(); follow(e.target.value, 'friends'); }
      else if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-sc][role="button"]')) { e.preventDefault(); act(e.target); }
    });
    modal.addEventListener('input', e => { if (e.target.id === 'scFriendInput') e.target.classList.remove('input-error'); });
    modal.addEventListener('change', e => {
      if (e.target.id === 'scShareToggle') { Profile.ext().shareAttendance = e.target.checked; saveData(); }
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) ping(); });
  }

  /* ---------- Публичный интерфейс ---------- */
  let bound = false;
  function init() {
    if (!hasUser()) return;
    if (!bound) { bound = true; bind(); }
    cache = null; renderHead();
    if (!started) {
      started = true;
      pingTimer = setInterval(ping, PING_EVERY);
      resyncTimer = setInterval(() => sync(true), RESYNC_EVERY);
    }
    setTimeout(async () => { await sync(true); ping(); checkFlags(); }, 1500);
  }
  function onDataSaved() {
    cache = null;
    renderHead();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, SYNC_DELAY);
  }
  function teardown() {
    clearInterval(pingTimer); clearInterval(resyncTimer); clearTimeout(syncTimer);
    started = false; online = null; lastSyncSig = ''; cache = null;
    view.league = view.friends = null;
    ['pfPaneLeague', 'pfPaneFriends'].forEach(id => { const el = $(id); if (el) { el.innerHTML = ''; delete el.dataset.loaded; } });
    renderHead();
  }

  window.Social = { init, teardown, onDataSaved, stats, renderPane, weekKey };
})();
