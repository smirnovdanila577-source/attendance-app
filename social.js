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
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>'
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

  // Расписание дней недели для сервера: сколько пар в дне и сколько уже закончилось. Из этого сервер знает
  // «возможное» для лиги (процент) и какие прошедшие дни не закрыты (они рвут серию). Окончательные дни
  // (не позже позавчера) отправляются один раз, вчера и сегодня — при каждом обновлении.
  const daysSentKey = () => 'tracker_days_sent2_' + ((database.userProfile || {}).id || '');
  function reportStudyDays() {
    if (!hasUser() || typeof getDateForDay !== 'function' || typeof calculateCurrentSemesterWeek !== 'function') return;
    let sent = {};
    try { sent = JSON.parse(localStorage.getItem(daysSentKey()) || '{}') || {}; } catch (e) { sent = {}; }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const final = new Date(today); final.setDate(final.getDate() - 2);
    const active = database.activeDays || ALL_DAYS;
    const cw = Math.max(1, calculateCurrentSemesterWeek());
    let added = 0;
    for (let w = 1; w <= cw; w++) {
      const wk = (database.weeks || {})[String(w)] || (typeof getWeekType === 'function' ? (database.templates || {})[getWeekType(w)] : null) || {};
      ALL_DAYS.forEach(day => {
        if (!active.includes(day)) return;
        const d = getDateForDay(w, day); d.setHours(0, 0, 0, 0);
        if (d > today) return;
        const date = dayKey(d), isFinal = d <= final;
        if (isFinal && sent[date]) return;
        const pairs = (wk[day] || []).filter(p => !p.cancelled);
        if (!pairs.length) return;
        const ended = typeof pairHasEnded === 'function' ? pairs.filter(p => pairHasEnded(w, day, p.time)).length : pairs.length;
        if (isFinal) { sent[date] = 1; added++; }
        queueEvent('d:' + date, { type: 'day', date, total: Math.min(pairs.length, 8), ended: Math.min(ended, 8) });
      });
    }
    if (added) try { localStorage.setItem(daysSentKey(), JSON.stringify(sent)); } catch (e) { /* не страшно */ }
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
      if (st.gained > 0) { flashGain(st.gained); setTimeout(refreshRank, 2000); }
    } catch (e) {
      if (e.status === 401) { queue = {}; saveQueue(); try { localStorage.removeItem(daysSentKey()); } catch (e2) { /* не страшно */ } }      // сессия кончилась — копить бессмысленно; дни отправим заново после входа
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
  let myRank = null, rankTimer = null;     // место в лиге недели — для капсулы в шапке
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

  /* ---------- Шапка: серия и место в лиге недели ----------
     Капсула ведёт в профиль на вкладку «Лига». Серия 0 — огонёк без цифры с подсказкой, как её начать. */
  let lastLeague = null;   // последняя загруженная лига — для карточки «Лига недели» в профиле
  function setRank(L) {
    if (L && Array.isArray(L.members)) { lastLeague = L; if (window.Profile && Profile.onLeague) Profile.onLeague(); }
    const me = L && Array.isArray(L.members) && database.userProfile ? L.members.find(m => m.id === database.userProfile.id) : null;
    const r = me && me.rank != null ? me.rank : null;
    if (r !== myRank) { myRank = r; renderHead(); }
  }
  async function refreshRank() {
    if (!canTalk()) return;
    try { setRank(await api('/api/league')); } catch (e) { /* позже */ }
  }
  function renderHead() {
    const box = $('scHead');
    if (!box) return;
    if (!hasUser()) { box.innerHTML = ''; return; }
    const s = stats();
    const streakTip = s.streak
      ? `Серия: ${s.streak} ${plural(s.streak, ['закрытый учебный день', 'закрытых учебных дня', 'закрытых учебных дней'])} подряд`
      : 'Отметь все сегодняшние пары, чтобы начать серию';
    box.innerHTML = `
      <span class="sc-chip sc-streak ${s.streak ? 'on' : ''}" role="button" tabindex="0" data-open="overview" title="${streakTip}">${s.streak ? `<b>${s.streak}</b>` : ''}${svg(I.flame, 15, 2.2)}</span>
      ${myRank != null ? `<span class="sc-chip sc-place ${myRank <= 3 ? 'top' : ''}" role="button" tabindex="0" data-open="league" title="Место в лиге недели: ${myRank}-е"><b>${myRank}</b>${svg(I.trophy, 15, 2.2)}</span>` : ''}`;
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

  // Результат недели: процент от возможного и «23 из 25 пар» (старый сервер присылал только очки)
  const weekScore = m => m.score != null
    ? `<span class="sc-xp"><b>${m.score}%</b><small>${m.pairs_done || 0} из ${m.pairs_total || 0} ${plural(m.pairs_total || 0, ['пары', 'пар', 'пар'])}</small></span>`
    : `<span class="sc-xp"><b>${m.week_xp}</b><small>очков</small></span>`;
  function personRow(m, extra = '') {
    const me = m.id === database.userProfile.id;
    return `<div class="pf-row sc-person ${me ? 'me' : 'pickable'} ${m.score != null && !m.ranked ? 'unranked' : ''}" ${me ? '' : `role="button" tabindex="0" data-sc="open" data-name="${esc(m.name)}"`}>
      ${m.rank != null ? `<span class="sc-rank" data-place="${m.rank <= 3 ? m.rank : ''}">${m.rank}</span>` : m.score != null && 'ranked' in m && extra === '' ? '<span class="sc-rank">—</span>' : ''}
      <span class="sc-av">${avatarHtml(m.avatar, m.name)}${statusDot(m.status)}</span>
      <span class="pf-row-body">
        <span class="sc-name">${esc(m.name)}${me ? '<span class="sc-you">это ты</span>' : ''}</span>
        <span class="sc-sub">${tagChip(m.tag)}${m.streak ? `<span class="sc-mini-streak">${m.streak}${svg(I.flame, 12, 2.4)}</span>` : ''}${extra}</span>
      </span>
      ${weekScore(m)}
    </div>`;
  }

  // «До итогов 6 дн. 2 ч» — коротко, без даты (время итогов — в правилах)
  function leftShort(iso) {
    if (!iso) return '';
    const ms = new Date(iso) - Date.now();
    if (ms <= 0) return 'Подводим итоги';
    const d = Math.floor(ms / 86400000), h = Math.floor(ms % 86400000 / 3600000), m = Math.floor(ms % 3600000 / 60000);
    return 'До итогов ' + (d > 0 ? `${d} дн. ${h} ч` : h > 0 ? `${h} ч ${m} мин` : `${Math.max(1, m)} мин`);
  }
  function renderLeague(el, L) {
    setRank(L);
    const R = L.rules || {}, minPairs = R.min_pairs || 6, maxPairs = R.week_pairs || 30;
    const newRules = L.members.some(m => m.score != null);
    const ranked = newRules ? L.members.filter(m => m.rank != null) : L.members;
    const rest = newRules ? L.members.filter(m => m.rank == null) : [];
    const me = L.members.find(m => m.id === database.userProfile.id);
    const rows = ranked.map((m, i) => personRow(m) + (i === 2 && ranked.length > 3 ? '<div class="sc-zone"><span>Выше — призёры недели</span></div>' : '')).join('')
      + (rest.length ? `<div class="sc-zone"><span>Без зачёта — меньше ${minPairs} пар за неделю</span></div>` + rest.map(m => personRow(m)).join('') : '');
    const others = L.members.filter(m => m.id !== database.userProfile.id).length;
    el.innerHTML = `
      <section>
        <h3 class="pf-section-title sc-lg-title"><span>Лига недели</span></h3>
        <div class="sc-lg-sub">${esc(leftShort(L.ends_at))}</div>
        <div class="pf-list">${rows || '<div class="pf-empty">На этой неделе пока никто не набрал очков</div>'}</div>
        ${others ? '' : '<button type="button" class="sc-invite" data-tab="friends">Позови друзей — соревноваться веселее ›</button>'}
      </section>
      <details class="pf-list sc-rules">
        <summary>Как считается место<span class="sc-rules-chev">${svg(I.back, 14, 2.6)}</span></summary>
        <div class="sc-rules-body">
          <p class="sc-rules-lead">Место — по проценту от возможного за неделю. У кого пар меньше, у того и максимум меньше, поэтому шансы у всех равные.</p>
          <div class="sc-rule"><b>+${XP_PAIR}</b><span>отмеченная пара — посещение или честный пропуск</span></div>
          <div class="sc-rule"><b>+${XP_FULL_DAY}</b><span>полностью отмеченный день</span></div>
          <p class="sc-rules-note">Возможное — те же очки за все уже закончившиеся пары и дни недели. В зачёт идут недели от ${minPairs} пар, больше ${maxPairs} пар в неделю не засчитывается. При равном проценте выше тот, кто набрал его раньше.</p>
          <p class="sc-rules-note">Отметки засчитываются в течение суток после пары. ДЗ даёт +${XP_TASK} очков опыта для достижений, но в лигу не входит: за неделю засчитывается не больше 2 пунктов на пару, через 30 минут после добавления.</p>
          <p class="sc-rules-note">Итоги — в понедельник в 00:00 по Москве, тройка недели получает достижение «Призёр лиги».</p>
        </div>
      </details>`;
  }

  function renderFriends(el, F) {
    const e = Profile.ext();
    const nick = database.userProfile.name || '';
    // Слова одни на всё окно: «Друг», «Ждёт ответа», «Хочет дружить» (под капотом — те же подписки)
    const rows = F.friends.map(f => {
      const rel = f.mutual ? '<span class="sc-rel ok">Друг</span>' : f.you_follow ? '<span class="sc-rel">Ждёт ответа</span>' : '<span class="sc-rel">Хочет дружить</span>';
      const btn = !f.you_follow
        ? `<span class="sc-act" role="button" tabindex="0" data-sc="follow" data-accept="1" data-name="${esc(f.name)}">Принять</span>`
        : `<span class="sc-act ghost" role="button" tabindex="0" data-sc="unfollow" data-id="${f.id}" title="${f.mutual ? 'Удалить из друзей' : 'Отменить заявку'}">${svg(I.x, 14, 2.6)}</span>`;
      return personRow(f, rel + btn);
    }).join('');
    el.innerHTML = `
      <section>
        <h3 class="pf-section-title"><span>Друзья <span class="pf-sec-n">${F.mutual_count}</span></span></h3>
        <div class="pf-list">${rows || `<div class="pf-empty">${svg(I.users, 26, 1.8)}<span>Добавь друга по нику. Когда он примет заявку, вы станете друзьями.</span></div>`}</div>
      </section>
      <section>
        <h3 class="pf-section-title"><span>Добавить друга</span></h3>
        <div class="sc-add">
          <input type="text" id="scFriendInput" class="sc-add-input" maxlength="40" autocomplete="off" spellcheck="false" aria-label="Ник друга">
          <button type="button" class="sc-send" data-sc="add" title="Добавить" aria-label="Добавить">${svg(I.arrow, 16, 2.6)}</button>
        </div>
        <button type="button" class="sc-nick" data-sc="copy" title="Скопировать ник">Твой ник<b>${esc(nick)}</b>${svg(I.copy, 13)}</button>
      </section>
      <section>
        <h3 class="pf-section-title"><span>Приватность</span></h3>
        <label class="sc-toggle"><input type="checkbox" id="scShareToggle" ${e.shareAttendance ? 'checked' : ''}>
          <span>Показывать посещаемость в профиле</span></label>
        <p class="sc-toggle-note">Её увидят все, кто откроет твой профиль</p>
      </section>`;
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
      ? `<button type="button" class="btn btn-secondary" data-sc="unfollow" data-id="${p.id}">${p.follows_you ? 'Удалить из друзей' : 'Отменить заявку'}</button>`
      : `<button type="button" class="btn btn-primary" data-sc="follow" ${p.follows_you ? 'data-accept="1"' : ''} data-name="${esc(p.name)}">${p.follows_you ? 'Принять' : 'Добавить в друзья'}</button>`;
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
        ${p.score != null ? `<div><div class="pf-mini-num">${p.score}%</div><div class="pf-mini-label">недели в лиге</div></div>`
          : `<div><div class="pf-mini-num">${p.week_xp}</div><div class="pf-mini-label">очков за неделю</div></div>`}
        <div><div class="pf-mini-num">${p.xp_total}</div><div class="pf-mini-label">очков всего</div></div>
        ${p.attendance_pct != null ? `<div><div class="pf-mini-num">${p.attendance_pct}%</div><div class="pf-mini-label">посещаемость</div></div>` : ''}
      </div></div>
      ${p.bio ? `<section><h3 class="pf-section-title"><span>О себе</span></h3><p class="sc-bio">${esc(p.bio)}</p></section>` : ''}
      <section><h3 class="pf-section-title"><span>Достижения</span><span class="pf-since">${medals.length}</span></h3>
        ${medals.length ? `<div class="pf-showcase sc-medals">${medals.join('')}</div>` : '<div class="pf-empty">Пока без достижений</div>'}</section>`;
  }

  async function follow(name, tab, accept) {
    name = (name || '').trim();
    if (!name) { const i = $('scFriendInput'); if (i) { i.classList.add('input-error'); i.focus(); } return; }
    try {
      await api('/api/friends/follow', { method: 'POST', body: { username: name } });
      showElegantToast('Друзья', accept ? `Теперь вы друзья с ${name}` : `Заявка отправлена: ${name}`);
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
    const head = $('scHead');
    // Огонёк — профиль (серия и прогресс), кубок — лига недели
    if (head) head.addEventListener('click', e => {
      const c = e.target.closest('[data-open]');
      if (c && window.Profile) Profile.open(c.dataset.open);
    });
    const modal = $('profileBackdrop');
    if (!modal) return;
    const tabOf = el => (el.closest('.pf-pane') || {}).dataset ? el.closest('.pf-pane').dataset.pane : 'friends';
    const act = t => {
      const tab = tabOf(t), a = t.dataset.sc;
      if (a === 'open') openPublic(tab, t.dataset.name);
      else if (a === 'back') { view[tab] = null; renderPane(tab); }
      else if (a === 'retry') renderPane(tab);
      else if (a === 'add') follow(($('scFriendInput') || {}).value, tab);
      else if (a === 'follow') follow(t.dataset.name, tab, !!t.dataset.accept);
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
    modal.addEventListener('input', e => {
      if (e.target.id !== 'scFriendInput') return;
      e.target.classList.remove('input-error');
      const box = e.target.closest('.sc-add'); if (box) box.classList.toggle('has-text', !!e.target.value.trim());   // кнопка-стрелка видна, только когда есть ник
    });
    modal.addEventListener('change', e => {
      if (e.target.id === 'scShareToggle') { Profile.ext().shareAttendance = e.target.checked; saveData(); }
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { ping(); reportStudyDays(); } });   // окно могло простоять открытым несколько дней
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
      rankTimer = setInterval(() => { reportStudyDays(); refreshRank(); }, 5 * 60000);   // пары заканчиваются — растёт «возможное»
      resyncTimer = setInterval(() => sync(true), RESYNC_EVERY);
    }
    setTimeout(async () => { reportStudyDays(); await flush(); await sync(true); ping(); refreshState(); refreshRank(); }, 1500);
  }
  function onDataSaved() {
    renderHead();
    reportStudyDays();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, SYNC_DELAY);
  }
  function teardown() {
    clearInterval(pingTimer); clearInterval(resyncTimer); clearTimeout(syncTimer); clearInterval(rankTimer); myRank = null;
    clearTimeout(flushTimer);
    started = false; online = null; lastSyncSig = ''; state = null; queue = {};
    try { localStorage.removeItem(STATE_KEY); localStorage.removeItem(QUEUE_KEY); } catch (e) { /* не страшно */ }
    view.league = view.friends = null;
    ['pfPaneLeague', 'pfPaneFriends'].forEach(id => { const el = $(id); if (el) { el.innerHTML = ''; delete el.dataset.loaded; } });
    renderHead();
  }

  window.Social = { init, teardown, onDataSaved, stats, serverAch, renderPane, weekKey, queueMark, queueTask, flush, league: () => lastLeague };
})();
