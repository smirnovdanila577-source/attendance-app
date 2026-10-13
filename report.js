/* ==========================================================================
   ЕЖЕНЕДЕЛЬНЫЙ ОТЧЁТ
   Подключается после app.js и profile.js. Только читает database (ничего в
   нём не меняет, кроме метки reportNotified), поэтому безопасен для синхронизации.
   Использует глобальные: database, ALL_DAYS, calculateCurrentSemesterWeek,
   getDateForDay, getWeekDatesString, isDateToday, saveData, cloudPullDone.
   ========================================================================== */
(function () {
  'use strict';

  const svg = (p, s = 18, sw = 2) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const I = {
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    chart: '<path d="M12 20v-6M6 20V10M18 20V4"/>',
    up: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    down: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    ok: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
    cal: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    clip: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>'
  };
  const SHORT = { 'Понедельник': 'Пн', 'Вторник': 'Вт', 'Среда': 'Ср', 'Четверг': 'Чт', 'Пятница': 'Пт', 'Суббота': 'Сб', 'Воскресенье': 'Вс' };

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, f) => { const a = Math.abs(n) % 100, b = a % 10; return (a > 10 && a < 20) ? f[2] : b > 1 && b < 5 ? f[1] : b === 1 ? f[0] : f[2]; };
  const pairsWord = n => `${n} ${plural(n, ['пара', 'пары', 'пар'])}`;
  const colorFor = pct => pct >= 80 ? 'var(--color-green)' : pct >= 60 ? 'var(--color-yellow)' : 'var(--color-red)';
  const hasUser = () => typeof database !== 'undefined' && database && database.userProfile;

  let viewWeek = 1, bound = false;

  /* ---------- Подсчёт недели (данные только читаем, не создаём) ---------- */
  function weekStats(w) {
    const wd = (database.weeks || {})[String(w)] || {};
    const act = database.activeDays || ALL_DAYS;
    const s = { week: w, days: [], subjects: {}, a: 0, m: 0, u: 0, total: 0, hwDone: 0, hwTotal: 0 };
    ALL_DAYS.filter(d => act.includes(d)).forEach(day => {
      const d = { day, a: 0, m: 0, u: 0, total: 0 };
      (wd[day] || []).forEach(p => {
        d.total++;
        const key = (p.subject || 'Без названия').trim();
        const sj = s.subjects[key] || (s.subjects[key] = { name: key, a: 0, m: 0, u: 0, total: 0 });
        sj.total++;
        if (p.attended === true) { d.a++; sj.a++; }
        else if (p.attended === false) { d.m++; sj.m++; }
        else { d.u++; sj.u++; }
        (p.tasks || []).forEach(t => { s.hwTotal++; if (t.done) s.hwDone++; });
      });
      s.a += d.a; s.m += d.m; s.u += d.u; s.total += d.total;
      s.days.push(d);
    });
    s.marked = s.a + s.m;
    s.pct = s.marked > 0 ? Math.round(s.a / s.marked * 100) : null;
    return s;
  }

  function buildInsights(cur, prev, isCurrentWeek) {
    const out = [];
    if (cur.pct !== null && prev && prev.pct !== null) {
      const d = cur.pct - prev.pct;
      if (d > 0) out.push({ icon: 'up', tone: 'green', text: `Посещаемость выросла на ${d} п. п. по сравнению с прошлой неделей.` });
      else if (d < 0) out.push({ icon: 'down', tone: 'red', text: `Посещаемость снизилась на ${-d} п. п. по сравнению с прошлой неделей.` });
      else out.push({ icon: 'chart', tone: 'gray', text: 'Посещаемость на уровне прошлой недели.' });
    }
    if (cur.m > 0) {
      const worst = Object.values(cur.subjects).sort((x, y) => y.m - x.m || x.name.localeCompare(y.name))[0];
      out.push({ icon: 'alert', tone: 'red', text: `Больше всего пропусков по предмету «${esc(worst.name)}»: ${worst.m}.` });
    } else if (cur.a > 0) {
      out.push({ icon: 'ok', tone: 'green', text: 'Ни одного пропуска за неделю. Так держать!' });
    }
    const busiest = cur.days.slice().sort((x, y) => y.total - x.total)[0];
    const allSame = cur.days.filter(d => d.total > 0).every(d => d.total === busiest.total);
    if (busiest && busiest.total > 0 && !allSame) out.push({ icon: 'cal', tone: 'blue', text: `Самый плотный день: ${busiest.day.toLowerCase()}, ${pairsWord(busiest.total)}.` });
    if (cur.u > 0) out.push({ icon: 'alert', tone: 'yellow', text: isCurrentWeek ? `Ещё не отмечено: ${pairsWord(cur.u)}.` : `Не отмечено ${pairsWord(cur.u)}. Отметь их, чтобы отчёт был точнее.` });
    const pending = cur.hwTotal - cur.hwDone;
    if (pending > 0) out.push({ icon: 'clip', tone: 'violet', text: `Невыполненных домашних заданий: ${pending}.` });
    return out;
  }

  /* ---------- Отрисовка ---------- */
  function render() {
    if (!hasUser()) return;
    const cw = calculateCurrentSemesterWeek();
    viewWeek = Math.min(Math.max(1, viewWeek), cw);
    const isCur = viewWeek === cw;
    const cur = weekStats(viewWeek);
    const prev = viewWeek > 1 ? weekStats(viewWeek - 1) : null;

    $('rpHead').innerHTML = `
      <h2 class="rp-title">Отчёт за неделю</h2>
      <div class="rp-weeknav">
        <button type="button" class="rp-nav-btn" data-nav="-1" aria-label="Предыдущая неделя" ${viewWeek <= 1 ? 'disabled' : ''}>${svg(I.left, 18, 2.5)}</button>
        <div class="rp-weeklabel"><b>Неделя ${viewWeek}</b><span>${esc(getWeekDatesString(viewWeek))}${isCur ? ', идёт сейчас' : ''}</span></div>
        <button type="button" class="rp-nav-btn" data-nav="1" aria-label="Следующая неделя" ${isCur ? 'disabled' : ''}>${svg(I.right, 18, 2.5)}</button>
      </div>`;

    if (cur.total === 0) {
      $('rpBody').innerHTML = `<div class="rp-empty">${svg(I.chart, 30, 1.8)}<span>На этой неделе нет пар, отчёт пуст.</span></div>`;
      return;
    }

    // Главная цифра и сравнение
    let delta = '';
    if (cur.pct !== null && prev && prev.pct !== null) {
      const d = cur.pct - prev.pct;
      delta = d === 0
        ? `<span class="rp-delta">Как на прошлой неделе</span>`
        : `<span class="rp-delta ${d > 0 ? 'up' : 'down'}">${svg(d > 0 ? I.up : I.down, 14, 2.5)}${d > 0 ? '+' : '−'}${Math.abs(d)} п. п. к прошлой неделе</span>`;
    }
    const heroSub = cur.pct === null ? 'Отметь посещение, чтобы увидеть процент' : `${cur.a} из ${cur.marked} отмеченных пар`;

    // Столбики
    const maxT = Math.max(1, ...cur.days.map(d => d.total));
    const cols = cur.days.map(d => {
      const isToday = isDateToday(getDateForDay(viewWeek, d.day));
      const h = Math.round(d.total / maxT * 100);
      const bar = d.total
        ? `<div class="rp-stack" style="--h:${h}%" title="${esc(d.day)}: посещено ${d.a}, пропущено ${d.m}, не отмечено ${d.u}">
             ${d.a ? `<div class="rp-seg-a" style="flex:${d.a} 1 0"></div>` : ''}${d.m ? `<div class="rp-seg-m" style="flex:${d.m} 1 0"></div>` : ''}${d.u ? `<div class="rp-seg-u" style="flex:${d.u} 1 0"></div>` : ''}
           </div>`
        : '<div class="rp-nobar"></div>';
      return `<div class="rp-col ${isToday ? 'today' : ''}"><div class="rp-val">${d.total || ''}</div><div class="rp-track">${bar}</div><div class="rp-day">${SHORT[d.day]}</div></div>`;
    }).join('');

    // Предметы
    const subjects = Object.values(cur.subjects).sort((x, y) => y.total - x.total || x.name.localeCompare(y.name)).map(s => `
      <div>
        <div class="rp-subj-top"><span class="rp-subj-name">${esc(s.name)}</span><span class="rp-subj-stat">${s.a} из ${s.total}${s.m ? `, пропусков: ${s.m}` : ''}</span></div>
        <div class="rp-bar">
          ${s.a ? `<i style="flex:${s.a} 1 0; background:var(--color-green)"></i>` : ''}${s.m ? `<i style="flex:${s.m} 1 0; background:var(--color-red)"></i>` : ''}${s.u ? `<i style="flex:${s.u} 1 0; background:var(--border-hover)"></i>` : ''}
        </div>
      </div>`).join('');

    const insights = buildInsights(cur, prev, isCur);

    $('rpBody').innerHTML = `
      <div class="rp-body">
        <section>
          <div class="rp-hero">
            <div>
              <div class="rp-big">${cur.pct === null ? '—' : cur.pct + '%'}</div>
              <div class="rp-big-sub">${esc(heroSub)}</div>
            </div>
            ${delta}
          </div>
          ${cur.pct === null ? '' : `<div class="prog-track rp-hero-track"><div class="prog-fill" style="width:${cur.pct}%; background:${colorFor(cur.pct)}"></div></div>`}
        </section>

        <section>
          <h3 class="pf-section-title"><span>Пары по дням</span></h3>
          <div class="pf-box">
            <div class="rp-chart" id="rpChart" style="grid-template-columns:repeat(${cur.days.length}, 1fr)">${cols}</div>
            <div class="rp-legend"><span><i style="background:var(--color-green)"></i>Посещено</span><span><i style="background:var(--color-red)"></i>Пропущено</span><span><i style="background:var(--border-hover)"></i>Не отмечено</span></div>
          </div>
        </section>

        <section>
          <h3 class="pf-section-title"><span>Сводка</span></h3>
          <div class="pf-box"><div class="rp-tiles">
            <div><div class="rp-tile-num g">${cur.a}</div><div class="rp-tile-label">посещено</div></div>
            <div><div class="rp-tile-num r">${cur.m}</div><div class="rp-tile-label">пропущено</div></div>
            <div><div class="rp-tile-num m">${cur.u}</div><div class="rp-tile-label">не отмечено</div></div>
          </div></div>
        </section>

        <section>
          <h3 class="pf-section-title"><span>По предметам</span></h3>
          <div class="pf-box"><div class="rp-subjects">${subjects}</div></div>
        </section>

        ${insights.length ? `<section>
          <h3 class="pf-section-title"><span>Выводы</span></h3>
          <div class="rp-insights">${insights.map(i => `
            <div class="rp-ins" data-tone="${i.tone}"><span class="rp-ins-ico">${svg(I[i.icon], 16)}</span><span>${i.text}</span></div>`).join('')}
          </div>
        </section>` : ''}
      </div>`;

    // Столбики «вырастают» после появления: ответ на действие пользователя (открытие или смена недели)
    const body = $('rpBody');
    body.classList.remove('rp-ready');
    requestAnimationFrame(() => requestAnimationFrame(() => body.classList.add('rp-ready')));
  }

  /* Высоты стеклянных шапки и подвала: контент прокручивается под ними */
  function syncGlassInsets() {
    const m = $('reportBackdrop');
    const head = $('rpHead');
    const box = head && head.parentElement;
    if (!box) return;
    const foot = m.querySelector('.pf-footer');
    if (head) box.style.setProperty('--rp-head-h', head.offsetHeight + 'px');
    if (foot) box.style.setProperty('--rp-foot-h', foot.offsetHeight + 'px');
  }

  /* ---------- Открытие и закрытие ---------- */
  function open(week) {
    if (!hasUser() || !$('reportBackdrop')) return;
    bind();
    const cw = calculateCurrentSemesterWeek();
    if (week) viewWeek = Number(week);
    else viewWeek = (cw > 1 && weekStats(cw).marked === 0 && weekStats(cw - 1).marked > 0) ? cw - 1 : cw; // в начале недели показываем прошлую
    render();
    $('reportBackdrop').classList.add('open');
    syncGlassInsets();
    const sc = $('rpBody'); if (sc) sc.scrollTop = 0;
  }
  function close() { $('reportBackdrop').classList.remove('open'); }

  function bind() {
    if (bound) return;
    bound = true;
    const m = $('reportBackdrop');
    m.addEventListener('click', e => {
      if (e.target === m) { close(); return; }
      const nav = e.target.closest('[data-nav]');
      if (nav) { viewWeek += Number(nav.dataset.nav); render(); $('rpBody').scrollTop = 0; return; }
      if (e.target.closest('[data-act="close"]')) close();
    });
    document.addEventListener('keydown', e => {
      if (!m.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft' && viewWeek > 1) { viewWeek--; render(); }
      else if (e.key === 'ArrowRight' && viewWeek < calculateCurrentSemesterWeek()) { viewWeek++; render(); }
    });
  }

  /* ---------- Уведомление «отчёт готов» ---------- */
  function check() {
    if (!hasUser()) return;
    // Ждём облачные данные, чтобы не затереть более свежую копию с другого устройства
    if (typeof cloudPullDone !== 'undefined' && !cloudPullDone) { setTimeout(check, 800); return; }
    const prevWeek = calculateCurrentSemesterWeek() - 1;
    if (prevWeek < 1 || (database.reportNotified || 0) >= prevWeek) return;
    const st = weekStats(prevWeek);
    database.reportNotified = prevWeek;
    if (st.marked > 0 && window.Profile) {
      Profile.notify(`Отчёт за неделю ${prevWeek} готов`,
        `Посещаемость: ${st.pct}%, посещено ${st.a} из ${st.marked}. Нажми, чтобы посмотреть.`,
        { icon: 'chart', tone: 'blue', action: 'report', arg: prevWeek });
    }
    saveData();
    if (window.Profile) Profile.refresh();
  }

  function init() { check(); }

  window.Report = { init, open, close };
})();
