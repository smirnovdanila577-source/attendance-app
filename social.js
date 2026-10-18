/* ==========================================================================
   СОЦИАЛЬНАЯ ЧАСТЬ: очки, серия дней, лига недели, друзья, чужие профили, онлайн
   Подключается ПОСЛЕ app.js, avatars.js и profile.js.
   Использует глобальные из app.js: database, API_URL, authHeaders, ALL_DAYS,
   getDateForDay, saveData, showElegantToast, cloudPullDone.

   Очки, серию и достижения считает СЕРВЕР: приложение только сообщает «отметил пару»
   и «выполнил пункт ДЗ» (очередь событий ниже). Правила очков: +10 за отмеченную пару
   (посещение или честный пропуск), +5 за пункт ДЗ, +5 за полностью отмеченный день;
   только за отметки в течение суток после пары, не больше 8 пар и 8 пунктов ДЗ в день.
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

  /* ---------- Прогресс по версии сервера ---------- */
  // Очки, серию и важные достижения считает сервер (см. progress.py). Здесь только последняя его сводка.
  let state = null;
  const STATE_KEY = 'tracker_social_state';
  try { state = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (e) { state = null; }
  function setState(st) {
    if (!st || typeof st !== 'object' || st.xp_total === undefined) return;
    state = st;
    try { localStorage.setItem(STATE_KEY, JSON.stringify(st)); } catch (e) { /* не страшно */ }
    renderHead();
    if (window.Profile) Profile.onServerState(st);
  }
  function stats() {
    const s = state || {};
    return {
      weekXp: s.week_xp || 0, xpTotal: s.xp_total || 0, streak: s.streak || 0, bestStreak: s.best_streak || 0,
      weekKey: s.week_key || weekKey(new Date()), counters: s.counters || {}, loaded: !!state
    };
  }
  const serverAch = () => (state && Array.isArray(state.achievements)) ? state.achievements : null;

  /* ---------- Очередь событий: отметки пар и ДЗ ---------- */
  // Отметку важно отправить сразу: очки даются, только если сервер узнал о ней в течение суток после пары.
  // Очередь хранится в браузере, поэтому без сети отметки дождутся связи.
  const QUEUE_KEY = 'tracker_social_queue';
  let queue = {};
  try { queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '{}') || {}; } catch (e) { queue = {}; }
  const saveQueue = () => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch (e) { /* не страшно */ } };
  let flushTimer = null, flushing = false;

  function queueEvent(key, ev) {
    queue[key] = ev;                  // по одному событию на ключ: важно последнее состояние
    saveQueue();
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 1500);
  }

  // Пара отмечена (status: true / false) или отметка снята (null)
  function queueMark(weekNum, dayName, pair) {
    if (!pair || pair.cancelled || typeof pairEndDate !== 'function') return;
    const date = dayKey(getDateForDay(weekNum, dayName));
    const subj = String(pair.subject || '').trim().toLowerCase().slice(0, 120);
    const key = `${date}|${String(pair.time || '').replace(/\s+/g, '')}|${subj}`;
    const dayList = ((database.weeks[String(weekNum)] || {})[dayName] || []).filter(p => !p.cancelled);
    queueEvent('m:' + key, {
      type: 'mark', key, date,
      end: pairEndDate(weekNum, dayName, pair.time).toISOString(),
      status: pair.attended === true ? true : pair.attended === false ? false : null,
      day_total: Math.min(dayList.length || 1, 8)
    });
  }
  // Пункт ДЗ появился (add) или выполнен (done)
  function queueTask(taskId, kind) {
    if (!taskId) return;
    const k = 't:' + taskId;
    if (kind === 'done') queueEvent(k, { type: 'task_done', key: taskId });
    else if (!queue[k]) queueEvent(k, { type: 'task_add', key: taskId });
  }

  async function flush() {
    clearTimeout(flushTimer); flushTimer = null;
    const keys = Object.keys(queue);
    if (!keys.length || flushing) return;
    if (!canTalk()) { flushTimer = setTimeout(flush, 5000); return; }
    flushing = true;
    const batch = keys.slice(0, 150).map(k => queue[k]);
    try {
      const st = await api('/api/social/events', { method: 'POST', body: { events: batch } });
      keys.slice(0, 150).forEach(k => { if (queue[k] === batch[keys.indexOf(k)]) delete queue[k]; });
      saveQueue();
      setState(st);
      if (st.gained > 0) flashGain(st.gained);
    } catch (e) {
      if (e.status === 401) { queue = {}; saveQueue(); }      // сессия кончилась — копить бессмысленно
      else flushTimer = setTimeout(flush, 15000);            // нет сети — повторим
    } finally {
      flushing = false;
      if (Object.keys(queue).length && !flushTimer) flushTimer = setTimeout(flush, 1500);
    }
  }

  // Короткая вспышка «+15» у огонька в шапке вместо уведомления на каждую отметку
  function flashGain(xp) {
    const chip = document.querySelector('#scHead .sc-streak');
    if (!chip) return;
    const b = document.createElement('span');
    b.className = 'sc-gain'; b.textContent = `+${xp}`;
    chip.appendChild(b);
    setTimeout(() => b.remove(), 1600);
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

  // Внешний вид публичного профиля. Цифры прогресса сервер считает сам и отсюда их не берёт.
  function payload() {
    const e = window.Profile ? Profile.ext() : {};
    const ps = window.Profile ? Profile.computeStats() : null;
    return {
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
    try { const r = await api('/api/social/sync', { method: 'POST', body }); lastSyncSig = sig; if (r.state) setState(r.state); }
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

  async function refreshState() {
    if (!canTalk()) return;
    try { setState(await api('/api/social/state')); } catch (e) { /* позже */ }
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
  // Сервер на Render засыпает без дела и просыпается до минуты: спокойно ждём и повторяем сами
  const waking = () => `<div class="pf-empty sc-waking"><span class="ip-spin"></span><b>Сервер просыпается…</b><span>Он засыпает, когда им долго не пользуются. Обычно это занимает до минуты, мы повторим сами.</span></div>`;

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
      el.dataset.loaded = '1'; el.__tries = 0;
      if (tab === 'friends') refreshState();
    } catch (e) {
      clearTimeout(el.__retry);
      if (e.status === 401) { el.innerHTML = failed('Сессия истекла. Выйди и войди в аккаунт заново'); return; }
      el.__tries = (el.__tries || 0) + 1;
      if (el.__tries <= 14) {
        if (!el.querySelector('.sc-waking')) el.innerHTML = waking();
        el.__retry = setTimeout(() => { if (el.classList.contains('active') && el.isConnected) renderPane(tab); }, 5000);
      } else {
        el.__tries = 0;
        el.innerHTML = failed('Сервер не отвечает. Проверь интернет и попробуй ещё раз');
      }
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
      <p class="pf-tags-note">Очки: +${XP_PAIR} за отмеченную пару, будь то посещение или честный пропуск, +${XP_TASK} за пункт ДЗ, +${XP_FULL_DAY} за полностью отмеченный день. Засчитываются отметки, сделанные в течение суток после пары, до 8 пар и 8 пунктов ДЗ в день. Пункт ДЗ приносит очки, если с его добавления прошло хотя бы 30 минут. Тройка недели получает достижение «Призёр лиги».</p>`;
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
      refreshState();
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
    renderHead();
    if (!started) {
      started = true;
      pingTimer = setInterval(ping, PING_EVERY);
      resyncTimer = setInterval(() => sync(true), RESYNC_EVERY);
    }
    setTimeout(async () => { await flush(); await sync(true); ping(); refreshState(); }, 1500);
  }
  function onDataSaved() {
    renderHead();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, SYNC_DELAY);
  }
  function teardown() {
    clearInterval(pingTimer); clearInterval(resyncTimer); clearTimeout(syncTimer);
    clearTimeout(flushTimer);
    started = false; online = null; lastSyncSig = ''; state = null; queue = {};
    try { localStorage.removeItem(STATE_KEY); localStorage.removeItem(QUEUE_KEY); } catch (e) { /* не страшно */ }
    view.league = view.friends = null;
    ['pfPaneLeague', 'pfPaneFriends'].forEach(id => { const el = $(id); if (el) { el.innerHTML = ''; delete el.dataset.loaded; } });
    renderHead();
  }

  window.Social = { init, teardown, onDataSaved, stats, serverAch, renderPane, weekKey, queueMark, queueTask, flush };
})();
