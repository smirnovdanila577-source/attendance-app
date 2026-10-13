/* ==========================================================================
   ИГЭУ: выбор вуза при регистрации, поле группы с подсказками, загрузка расписания
   Подключается ПОСЛЕ app.js и ispu_groups.js.
   Использует глобальные из app.js: database, ALL_DAYS, API_URL, isRegisterMode,
   saveData, render, syncSettingsUI, showElegantToast, clearAllUndos,
   buildTimeSelectOptions, areTemplatesEqual, getWeekType,
   calculateCurrentSemesterWeek, rebuildWeeksFromToday, rebuildSummaryText.
   ========================================================================== */
(function () {
  'use strict';

  const UNI_NAME = { nngu: 'ННГУ им. Лобачевского', ispu: 'ИГЭУ', other: 'Другой вуз' };
  const UNI_HINT = { nngu: '', ispu: '', other: 'Расписание добавишь вручную прямо в трекере.' };
  const DAY_FULL = { 'ПН': 'Понедельник', 'ВТ': 'Вторник', 'СР': 'Среда', 'ЧТ': 'Четверг', 'ПТ': 'Пятница', 'СБ': 'Суббота', 'ВС': 'Воскресенье' };

  const svg = (p, s = 16, sw = 2.5) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const CHECK = '<path d="M20 6 9 17l-5-5"/>';

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Латиница, похожая на кириллицу, считается кириллицей (1-21m = 1-21м); пробелы и регистр не важны
  const LOOK = { a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у' };
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, '').replace(/[abcehkmoptxy]/g, ch => LOOK[ch]);

  /* ---------- Список групп из ispu_groups.js ---------- */
  let index = null;
  function groups() {
    if (index) return index;
    index = [];
    (window.ISPU_GROUPS || []).forEach(f => {
      Object.keys(f.courses).forEach(course => {
        f.courses[course].forEach(g => index.push({
          faculty: f.id, facultyName: f.name, course, group: g[0], groupName: g[1], key: norm(g[1]),
          label: `${f.name} ${g[1]}`
        }));
      });
    });
    return index;
  }
  const toPick = e => ({ faculty: e.faculty, facultyName: e.facultyName, course: e.course, group: e.group, groupName: e.groupName, label: e.label, subgroup: null });

  /* ---------- Состояние ---------- */
  let uni = 'nngu';       // выбранный вуз на экране регистрации
  let picked = null;      // распознанная группа ИГЭУ
  let matches = [];       // текущие подсказки
  let active = -1;        // подсвеченная подсказка (клавиатура)
  let subs = [];          // подгруппы выбранной группы (если есть)
  let subState = 'idle';  // idle | loading | done
  let subToken = 0;

  /* ======================================================================
     ЭКРАН РЕГИСТРАЦИИ
     ====================================================================== */
  function refreshAuthFields() {
    const reg = typeof isRegisterMode !== 'undefined' && isRegisterMode;
    const show = (id, on) => { const el = $(id); if (el) el.style.display = on ? 'block' : 'none'; };
    show('uniWrapper', reg);
    show('groupFieldWrapper', reg && uni === 'nngu');
    show('ispuPickWrapper', reg && uni === 'ispu');
    document.querySelectorAll('#uniWrapper [data-uni]').forEach(b => {
      const on = b.dataset.uni === uni;
      b.classList.toggle('selected', on);
      b.setAttribute('aria-checked', on);
    });
    const hint = $('uniHint');
    if (hint) { hint.textContent = UNI_HINT[uni]; hint.style.display = UNI_HINT[uni] ? 'block' : 'none'; }
    if (uni !== 'ispu') hideSuggest();
  }

  function setUni(u) {
    if (!UNI_NAME[u]) return;
    uni = u;
    refreshAuthFields();
    if (u === 'ispu') setTimeout(() => { const i = $('ispuGroupInput'); if (i) i.focus(); }, 50);
  }

  /* ---------- Подсказки ---------- */
  function findMatches(q) {
    const k = norm(q);
    if (!k) return [];
    const starts = [], inside = [];
    groups().forEach(g => { if (g.key.startsWith(k)) starts.push(g); else if (g.key.includes(k)) inside.push(g); });
    return starts.concat(inside).slice(0, 5);
  }

  function renderSuggest() {
    const box = $('ispuSuggest');
    if (!box) return;
    if (!matches.length) { hideSuggest(); return; }
    box.innerHTML = matches.map((m, i) => `
      <button type="button" class="ip-s-item ${i === active ? 'active' : ''}" role="option" data-i="${i}">
        <span class="ip-s-name">${esc(m.groupName)}</span>
        <span class="ip-s-meta">${esc(m.facultyName)}, ${esc(m.course)} курс</span>
      </button>`).join('');
    box.classList.add('open');
  }
  function hideSuggest() {
    const box = $('ispuSuggest');
    if (box) box.classList.remove('open');
    matches = []; active = -1;
  }

  function onInput() {
    const input = $('ispuGroupInput');
    input.classList.remove('input-error');
    const q = input.value;
    picked = null; subs = []; subState = 'idle'; subToken++;
    renderPicked();

    matches = findMatches(q);
    active = -1;
    // Точное совпадение выбирается само, нажимать на подсказку не обязательно
    const exact = groups().find(g => g.key === norm(q));
    if (exact) { choose(exact, false); return; }
    renderSuggest();
  }

  function choose(entry, fillInput = true) {
    picked = toPick(entry);
    const input = $('ispuGroupInput');
    if (fillInput && input) input.value = entry.groupName;
    if (input) input.classList.remove('input-error');
    hideSuggest();
    renderPicked();
    loadSubgroups();
  }

  /* ---------- Подтверждение выбора и подгруппы ---------- */
  function renderPicked() {
    const box = $('ispuSub');
    if (!box) return;
    if (!picked) { box.style.display = 'none'; box.innerHTML = ''; return; }
    let html = `<div class="ip-picked"><span class="ip-picked-ico">${svg(CHECK, 12, 3)}</span>${esc(picked.facultyName)}, ${esc(picked.course)} курс${subState === 'loading' ? '<span class="ip-spin" title="Проверяем подгруппы"></span>' : ''}</div>`;
    if (subs.length) {
      html += `<div class="ip-sub-row"><span class="ip-sub-label">Подгруппа</span>` +
        subs.map(s => `<button type="button" class="ip-chip ${picked.subgroup === s ? 'selected' : ''}" data-sub="${esc(s)}">${esc(s)}</button>`).join('') + '</div>';
    }
    box.innerHTML = html;
    box.style.display = 'block';
  }

  // Тихо спрашиваем сервер, есть ли у группы подгруппы. Заодно он прогревает кэш, и после регистрации расписание откроется быстрее
  async function loadSubgroups() {
    const token = ++subToken;
    subs = []; subState = 'loading';
    renderPicked();
    try {
      const res = await fetchSchedule(picked, { maxMs: 150000 });
      if (token !== subToken || !picked) return;
      if (res && res.success && (res.subgroups || []).length) {
        subs = res.subgroups;
        picked.subgroup = res.subgroup && subs.includes(res.subgroup) ? res.subgroup : subs[0];
      }
    } catch (e) { /* не страшно: расписание подтянется после регистрации */ }
    if (token !== subToken) return;
    subState = 'done';
    renderPicked();
  }

  // Подсвечивает поле и возвращает текст ошибки для уведомления
  function flagPick() {
    const input = $('ispuGroupInput');
    if (input) { input.classList.add('input-error'); input.focus(); }
    return input && input.value.trim() ? 'Такой группы нет в списке ИГЭУ. Выбери её из подсказок' : 'Введи номер своей группы ИГЭУ';
  }

  function state() {
    if (uni === 'ispu' && !picked) {   // на случай автозаполнения браузера
      const input = $('ispuGroupInput');
      const exact = input && groups().find(g => g.key === norm(input.value));
      if (exact) picked = toPick(exact);
    }
    return { uni, ispu: picked };
  }

  /* ======================================================================
     ЗАПРОС РАСПИСАНИЯ К СЕРВЕРУ
     ====================================================================== */
  // Сервер грузит расписание в фоне: пока оно не готово, отвечает {pending: true}, и мы спрашиваем снова.
  // Так длинная загрузка не упирается в ограничение времени одного запроса.
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function fetchSchedule(s, opts = {}) {
    const maxMs = opts.maxMs || 240000;
    const t0 = Date.now();
    let fails = 0, slowShown = false, lastErr;
    while (Date.now() - t0 < maxMs) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 45000);
      try {
        const qs = new URLSearchParams({ faculty: s.faculty, course: s.course, group: s.group });
        if (s.subgroup) qs.set('subgroup', s.subgroup);
        const r = await fetch(`${API_URL}/api/schedule_ispu?${qs}`, { signal: ctrl.signal, cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        fails = 0;
        if (data && data.pending) {
          if (!slowShown && opts.onSlow && Date.now() - t0 > 20000) { slowShown = true; opts.onSlow(); }
          await sleep(1500);
          continue;
        }
        return data;
      } catch (e) {
        lastErr = e;
        if (++fails >= 4) break;
        await sleep(2500);
      } finally { clearTimeout(timer); }
    }
    if (lastErr) throw lastErr;
    const timeout = new Error('timeout'); timeout.name = 'AbortError'; throw timeout;
  }

  /* ======================================================================
     ЗАГРУЗКА РАСПИСАНИЯ В ПРИЛОЖЕНИЕ
     ====================================================================== */
  const isIspuUser = () => !!(database && database.userProfile && database.userProfile.university === UNI_NAME.ispu);

  function typeOf(kind) {
    const k = (kind || '').toLowerCase();
    if (k.startsWith('лаб')) return 'Лабораторная';
    if (k.startsWith('сем') || k.startsWith('пр')) return 'Практика';
    return 'Лекция';
  }

  function toTemplate(week) {
    const t = {};
    ALL_DAYS.forEach(d => { t[d] = []; });
    Object.entries(week || {}).forEach(([key, lessons]) => {
      const day = DAY_FULL[key];
      if (!day) return;
      t[day] = (lessons || []).map(l => ({
        id: 'p_' + Math.random().toString(36).slice(2, 11),
        time: l.time || '00:00 - 00:00',
        subject: l.subject || 'Без названия',
        type: typeOf(l.kind),
        attended: null
      })).sort((a, b) => a.time.localeCompare(b.time));
    });
    return t;
  }

  // Если в профиле нет сохранённой группы (например, вход с другого устройства), находим её по подписи «ИВТФ 1-40»
  function restorePick(prof) {
    if (prof.ispu) return prof.ispu;
    const last = String(prof.group || '').trim().split(/\s+/).pop();
    const e = groups().find(g => g.key === norm(last));
    if (e) { prof.ispu = toPick(e); return prof.ispu; }
    return null;
  }

  async function loadSchedule() {
    const prof = database && database.userProfile;
    const pick = prof && restorePick(prof);
    if (!pick) {
      showElegantToast('Группа ИГЭУ', 'Не удалось определить группу. Выйди из аккаунта и зарегистрируйся заново', 'error');
      return;
    }
    try {
      showElegantToast('Синхронизация', `Загружаем расписание ИГЭУ для ${pick.label}. В первый раз это может занять до минуты`, 'success');
      const res = await fetchSchedule(pick, { onSlow: () => showElegantToast('Синхронизация', 'Сайт ИГЭУ отвечает медленно, продолжаем загрузку…', 'success') });
      if (!res || !res.success) throw new Error((res && res.error) || 'Не удалось получить расписание');

      const w = res.weeks || {};
      const week1 = toTemplate(w['1'] || w[1]);
      const week2 = toTemplate(w['2'] || w[2]);

      // Какая из двух недель ИГЭУ идёт сейчас: нечётная учебная неделя = 1-я, чётная = 2-я
      const nowIspu = (Number(res.current_week) || 1) % 2 === 1 ? 1 : 2;

      if (areTemplatesEqual(week1, week2)) {
        database.scheduleMode = 'unified';
        database.templates.unified = week1;
      } else {
        database.scheduleMode = 'alternate';
        // 1-я неделя ИГЭУ всегда «Первая неделя» трекера, 2-я всегда «Вторая».
        // Подгоняем только то, какая из них идёт сегодня, чтобы подписи совпали с сайтом.
        const realWeek = calculateCurrentSemesterWeek();
        database.firstWeekType = ((realWeek % 2 === 1) === (nowIspu === 1)) ? 'left' : 'right';
        database.templates.left = week1;
        database.templates.right = week2;
      }

      // Сетка звонков: времена строк таблицы сайта, иначе уникальные времена пар
      let bells = (res.bells || []).slice();
      if (!bells.length) {
        const set = new Set();
        [week1, week2].forEach(t => Object.values(t).forEach(day => day.forEach(p => p.time && set.add(p.time))));
        bells = Array.from(set);
      }
      bells.sort();
      if (bells.length) {
        database.bellSchedule = bells.map((s, i) => {
          const [start, end] = s.split(' - ');
          return { num: i + 1, start: (start || '').trim(), end: (end || '').trim() };
        });
        buildTimeSelectOptions();
      }

      clearAllUndos();
      const rebuilt = rebuildWeeksFromToday(); // прошедшие дни с отметками не трогаем

      if (res.subgroup) pick.subgroup = res.subgroup;
      const weekNote = database.scheduleMode === 'unified' ? '' : `. Сейчас идёт ${nowIspu === 1 ? 'первая' : 'вторая'} неделя`;
      showElegantToast('Успешно', `Расписание ИГЭУ и время звонков синхронизированы${weekNote}${rebuildSummaryText(rebuilt)}`, 'success');
      saveData();
      syncSettingsUI();
      render();
    } catch (err) {
      console.error('Ошибка загрузки расписания ИГЭУ:', err);
      showElegantToast('Сбой загрузки', err.name === 'AbortError' ? 'Сайт ИГЭУ долго отвечает. Нажми «Синхронизировать с ИГЭУ» в настройках, чтобы повторить' : err.message, 'error');
    }
  }

  /* ---------- Подпись кнопки синхронизации в настройках ---------- */
  function refreshSettingsButtons() {
    const syncBtn = $('sync-schedule-btn');
    if (syncBtn) syncBtn.textContent = isIspuUser() ? 'Синхронизировать с ИГЭУ' : 'Синхронизировать с ННГУ';
  }

  /* ---------- Инициализация ---------- */
  function init() {
    const input = $('ispuGroupInput'), box = $('ispuSuggest'), sub = $('ispuSub');
    if (input) {
      input.addEventListener('input', onInput);
      input.addEventListener('focus', () => { if (!picked && input.value.trim()) { matches = findMatches(input.value); renderSuggest(); } });
      input.addEventListener('blur', () => setTimeout(hideSuggest, 120));
      input.addEventListener('keydown', e => {
        if (!box || !box.classList.contains('open')) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % matches.length; renderSuggest(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + matches.length) % matches.length; renderSuggest(); }
        else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); e.stopPropagation(); choose(matches[active]); }
        else if (e.key === 'Escape') { e.stopPropagation(); hideSuggest(); }
      });
    }
    if (box) {
      // mousedown, а не click: иначе поле теряет фокус и список закрывается раньше нажатия
      box.addEventListener('mousedown', e => {
        const b = e.target.closest('[data-i]');
        if (!b) return;
        e.preventDefault();
        choose(matches[Number(b.dataset.i)]);
      });
    }
    if (sub) {
      sub.addEventListener('click', e => {
        const b = e.target.closest('[data-sub]');
        if (!b || !picked) return;
        picked.subgroup = b.dataset.sub;
        renderPicked();
      });
    }
    refreshAuthFields();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.Ispu = {
    setUni, refreshAuthFields, flagPick, loadSchedule, refreshSettingsButtons, isIspuUser, state,
    universityName: u => UNI_NAME[u] || UNI_NAME.nngu
  };
})();