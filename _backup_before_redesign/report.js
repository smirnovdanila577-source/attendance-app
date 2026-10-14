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
        if (p.cancelled) { (p.tasks || []).forEach(t => { s.hwTotal++; if (t.done) s.hwDone++; }); return; } // убранная пара: только её ДЗ
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
      if (d > 0) out.push({ icon: 'up', tone: 'green', text: `Посещаемость выросла на ${d}% по сравнению с прошлой неделей.` });
      else if (d < 0) out.push({ icon: 'down', tone: 'red', text: `Посещаемость снизилась на ${-d}% по сравнению с прошлой неделей.` });
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

  /* ==========================================================================
     ДИНАМИКА ЗА СЕМЕСТР: посещаемость по неделям, по предметам и по дням недели.
     Считаем по всем своим отметкам (это личная статистика, не очки).
     ========================================================================== */
  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const pctOf = (a, n) => n > 0 ? Math.round(a / n * 100) : null;

  function semesterStats() {
    const cw = calculateCurrentSemesterWeek();
    const weeks = [], subjects = {}, days = {};
    const act = database.activeDays || ALL_DAYS;
    ALL_DAYS.filter(d => act.includes(d)).forEach(d => { days[d] = { day: d, a: 0, m: 0 }; });
    let a = 0, m = 0, past = 0, startW = 0;
    const ended = (w, day, p) => typeof pairHasEnded === 'function' ? pairHasEnded(w, day, p.time) : w < cw;
    for (let w = 1; w <= cw; w++) {
      const s = weekStats(w);
      if (!startW && s.marked > 0) startW = w;   // учёт начинается с первой недели, где есть отметки
      if (startW) {
        const wd = (database.weeks || {})[String(w)] || {};
        s.days.forEach(d => (wd[d.day] || []).forEach(p => { if (!p.cancelled && ended(w, d.day, p)) past++; }));
      }
      weeks.push({ week: w, a: s.a, m: s.m, marked: s.marked, pct: s.pct });
      a += s.a; m += s.m;
      Object.values(s.subjects).forEach(sj => {
        const t = subjects[sj.name] || (subjects[sj.name] = { name: sj.name, a: 0, m: 0 });
        t.a += sj.a; t.m += sj.m;
      });
      s.days.forEach(d => { if (days[d.day]) { days[d.day].a += d.a; days[d.day].m += d.m; } });
    }
    const subj = Object.values(subjects).filter(x => x.a + x.m > 0)
      .map(x => ({ ...x, n: x.a + x.m, pct: pctOf(x.a, x.a + x.m) }))
      .sort((x, y) => x.pct - y.pct || y.m - x.m || x.name.localeCompare(y.name));
    const dayList = Object.values(days).map(d => ({ ...d, n: d.a + d.m, pct: pctOf(d.a, d.a + d.m) }));
    return { cw, weeks, subj, days: dayList, a, m, marked: a + m, pct: pctOf(a, a + m),
      startW: startW || 1, past: Math.max(past, a + m), markedWeeks: weeks.filter(w => w.marked > 0).length };
  }

  function weekRangeShort(w) {
    const mon = getDateForDay(w, 'Понедельник'), sun = getDateForDay(w, 'Воскресенье');
    const f = d => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
    return `${f(mon)} – ${f(sun)}`;
  }

  // Линия «посещаемость по неделям». Минимум подписей: 0 / 50 / 100 %, пунктир цели 80 %, номера недель.
  // Выбранная неделя подсвечена столбцом; её подробный отчёт — ниже графика.
  function trendSvg(weeks, W, sel) {
    const H = W < 500 ? 220 : 270, L = 46, R = 14, T = 16, B = 34;
    const pw = W - L - R, ph = H - T - B, n = weeks.length;
    const gap = n > 1 ? pw / (n - 1) : pw;
    const x = i => L + (n === 1 ? pw / 2 : i * gap);
    const y = v => T + ph - v / 100 * ph;
    const grid = [0, 50, 100].map(v => `
      <line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="se-grid"/>
      <text x="${L - 12}" y="${y(v) + 4}" class="se-axis" text-anchor="end">${v}%</text>`).join('');
    const target = `<line x1="${L}" x2="${W - R}" y1="${y(80)}" y2="${y(80)}" class="se-target"/>
      <text x="${L - 12}" y="${y(80) + 4}" class="se-axis se-target-lbl" text-anchor="end">80%<title>Цель — 80% посещаемости</title></text>`;
    const colW = Math.min(n > 1 ? gap * 0.8 : 46, 46);
    const cols = weeks.map((w, i) =>
      `<rect x="${x(i) - colW / 2}" y="${T - 8}" width="${colW}" height="${H - T + 4}" rx="12" class="se-col ${w.week === sel ? 'sel' : ''}" data-i="${i}"/>`).join('');
    const step = n > (W < 500 ? 10 : 18) ? 2 : 1;
    const labels = weeks.map((w, i) => (i % step === 0 || i === n - 1 || w.week === sel)
      ? `<text x="${x(i)}" y="${H - 10}" class="se-axis se-wnum ${w.week === sel ? 'sel' : ''}" text-anchor="middle">${w.week}</text>` : '').join('');
    // Линия рвётся на неделях без отметок
    let path = '', open = false;
    weeks.forEach((w, i) => {
      if (w.pct === null) { open = false; return; }
      path += `${open ? 'L' : 'M'}${x(i).toFixed(1)} ${y(w.pct).toFixed(1)} `;
      open = true;
    });
    const dots = weeks.map((w, i) => w.pct === null ? '' :
      `<circle cx="${x(i)}" cy="${y(w.pct)}" r="${w.week === sel ? 7 : 5}" class="se-dot ${w.week === sel ? 'sel' : ''}"/>`).join('');
    const hit = weeks.map((w, i) =>
      `<rect x="${x(i) - gap / 2}" y="0" width="${gap}" height="${H}" class="se-hit" data-i="${i}" data-week="${w.week}"/>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" data-w="${W}" class="se-svg" role="img" aria-label="Посещаемость по неделям семестра">
      ${cols}${grid}${target}<path d="${path}" class="se-line"/>${dots}${labels}${hit}</svg>`;
  }

  function chartWidth() {
    const w = ($('rpBody') && $('rpBody').clientWidth) || 700;
    return Math.round(Math.max(320, Math.min(720, w - 96)));
  }

  /* ---------- Окно: семестр сверху, под графиком — отчёт за выбранную неделю ---------- */
  let semWeeks = null;

  function render() {
    if (!hasUser()) return;
    const S = semesterStats();
    semWeeks = S.weeks;
    viewWeek = Math.min(Math.max(1, viewWeek), S.cw);
    const range = `${weekRangeShort(1).split(' – ')[0]} – ${weekRangeShort(S.cw).split(' – ')[1]}`;
    $('rpHead').innerHTML = `
      <h2 class="rp-title">Динамика за семестр</h2>
      <div class="rp-sub">${S.cw === 1 ? 'Неделя 1' : `Недели 1–${S.cw}`} · ${esc(range)}</div>`;

    const hint = S.startW > 1
      ? (S.startW === 2 ? 'Неделя 1 не отмечена' : `Недели 1–${S.startW - 1} не отмечены`) + ' и в статистику не входят. Отметь их, чтобы картина была полной.'
      : S.marked < S.past / 2 ? 'Отмечено меньше половины прошедших пар. Отметь остальные, чтобы статистика была точнее.' : '';
    const semester = !S.marked
      ? `<section><div class="rp-empty se-empty">${svg(I.chart, 26, 1.8)}<span>Пока нет отмеченных пар. Отмечай посещения, и здесь появится картина за семестр.</span></div></section>`
      : `<section>
          <div class="rp-hero">
            <div><div class="rp-big">${S.pct}%</div><div class="rp-big-sub">посещено ${S.a} из ${S.marked} отмеченных пар</div></div>
            <span class="rp-delta">пропусков: ${S.m}</span>
          </div>
          <div class="prog-track rp-hero-track"><div class="prog-fill" style="width:${S.pct}%; background:${colorFor(S.pct)}"></div></div>
          <div class="se-cover">Отмечено ${S.marked} из ${S.past} прошедших ${plural(S.past, ['пары', 'пар', 'пар'])}${S.startW > 1 ? ` · учёт с ${S.startW}-й недели` : ''}</div>
          ${hint ? `<div class="rp-ins se-hint" data-tone="yellow"><span class="rp-ins-ico">${svg(I.alert, 16)}</span><span>${hint}</span></div>` : ''}
        </section>
        <section>
          <h3 class="pf-section-title"><span>Посещаемость по неделям</span></h3>
          ${S.markedWeeks >= 2
            ? `<div class="pf-box se-chart" id="seTrend">${trendSvg(S.weeks, chartWidth(), viewWeek)}<div class="se-tip" id="seTip" hidden></div></div>`
            : `<div class="pf-box se-wait">${svg(I.chart, 22, 1.8)}<span>График появится, когда будут отметки хотя бы за 2 недели.</span></div>`}
        </section>`;

    $('rpBody').innerHTML = `<div class="rp-body">${semester}<section class="rp-week" id="rpWeek"></section></div>`;
    renderWeek();
    bindTrend();
  }

  // Отчёт за неделю viewWeek (перерисовывается сам по себе при смене недели)
  function renderWeek() {
    const box = $('rpWeek');
    if (!box) return;
    const cw = calculateCurrentSemesterWeek();
    const isCur = viewWeek === cw;
    const cur = weekStats(viewWeek);
    const prev = viewWeek > 1 ? weekStats(viewWeek - 1) : null;

    const nav = `
      <h3 class="pf-section-title"><span>Отчёт за неделю</span></h3>
      <div class="rp-weeknav">
        <button type="button" class="rp-nav-btn" data-nav="-1" aria-label="Предыдущая неделя" ${viewWeek <= 1 ? 'disabled' : ''}>${svg(I.left, 18, 2.5)}</button>
        <div class="rp-weeklabel"><b>Неделя ${viewWeek}</b><span>${esc(getWeekDatesString(viewWeek))}${isCur ? ', идёт сейчас' : ''}</span></div>
        <button type="button" class="rp-nav-btn" data-nav="1" aria-label="Следующая неделя" ${isCur ? 'disabled' : ''}>${svg(I.right, 18, 2.5)}</button>
      </div>`;

    if (cur.total === 0) {
      box.innerHTML = nav + `<div class="rp-empty">${svg(I.chart, 30, 1.8)}<span>На этой неделе нет пар.</span></div>`;
      return;
    }

    // Главная цифра и сравнение
    let delta = '';
    if (cur.pct !== null && prev && prev.pct !== null) {
      const d = cur.pct - prev.pct;
      delta = d === 0
        ? `<span class="rp-delta">Как на прошлой неделе</span>`
        : `<span class="rp-delta ${d > 0 ? 'up' : 'down'}">${svg(d > 0 ? I.up : I.down, 14, 2.5)}${Math.abs(d)}% по сравнению с прошлой неделей</span>`;
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

    box.innerHTML = nav + `
      <div class="rp-week-body">
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
    box.classList.remove('rp-ready');
    requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('rp-ready')));
  }

  // Выбор недели: с графика (плавно прокручиваем к её отчёту) или стрелками (остаёмся на месте)
  function selectWeek(w, scroll) {
    viewWeek = Math.min(Math.max(1, w), calculateCurrentSemesterWeek());
    renderWeek();
    const s = $('seTrend') && $('seTrend').querySelector('svg');
    if (s && semWeeks) s.outerHTML = trendSvg(semWeeks, Number(s.dataset.w), viewWeek);
    if (scroll) scrollToWeek(true);
  }
  function scrollToWeek(smooth) {
    const body = $('rpBody'), sec = $('rpWeek');
    if (!body || !sec) return;
    const headH = $('rpHead') ? $('rpHead').offsetHeight : 0;
    const top = body.scrollTop + sec.getBoundingClientRect().top - body.getBoundingClientRect().top - headH - 26;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    body.scrollTo({ top: Math.max(0, top), behavior: smooth && !reduce ? 'smooth' : 'auto' });
  }

  // Наведение на неделю графика: подсветка столбца и короткая подсказка
  function bindTrend() {
    const box = $('seTrend'), tip = $('seTip');
    if (!box || !tip) return;
    const clear = () => box.querySelectorAll('.se-col.hov').forEach(c => c.classList.remove('hov'));
    const show = i => {
      const w = semWeeks && semWeeks[i]; if (!w) return;
      const svgEl = box.querySelector('svg'), col = box.querySelector(`.se-col[data-i="${i}"]`);
      clear(); if (col) col.classList.add('hov');
      tip.innerHTML = `<b>Неделя ${w.week} · ${w.pct === null ? 'нет отметок' : w.pct + '%'}</b><span>${esc(weekRangeShort(w.week))}</span>`;
      tip.hidden = false;
      const cx = Number(col.getAttribute('x')) + Number(col.getAttribute('width')) / 2;
      const r = svgEl.getBoundingClientRect(), br = box.getBoundingClientRect();
      const px = r.left - br.left + cx / Number(svgEl.dataset.w || 600) * r.width;
      tip.style.left = Math.min(Math.max(px - tip.offsetWidth / 2, 8), br.width - tip.offsetWidth - 8) + 'px';
    };
    box.addEventListener('pointermove', e => { const h = e.target.closest('.se-hit'); if (h) show(Number(h.dataset.i)); });
    box.addEventListener('pointerleave', () => { tip.hidden = true; clear(); });
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
    if (week) requestAnimationFrame(() => scrollToWeek(false));   // из уведомления «отчёт готов» — сразу к нужной неделе
  }
  function close() { $('reportBackdrop').classList.remove('open'); }

  function bind() {
    if (bound) return;
    bound = true;
    const m = $('reportBackdrop');
    m.addEventListener('click', e => {
      if (e.target === m) { close(); return; }
      const wk = e.target.closest('[data-week]');
      if (wk) { selectWeek(Number(wk.dataset.week), true); return; }
      const nav = e.target.closest('[data-nav]');
      if (nav) { selectWeek(viewWeek + Number(nav.dataset.nav), false); return; }
      if (e.target.closest('[data-act="close"]')) close();
    });
    document.addEventListener('keydown', e => {
      if (!m.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft' && viewWeek > 1) selectWeek(viewWeek - 1, false);
      else if (e.key === 'ArrowRight' && viewWeek < calculateCurrentSemesterWeek()) selectWeek(viewWeek + 1, false);
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
