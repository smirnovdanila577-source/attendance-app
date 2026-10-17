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
    clip: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    dash: '<path d="M6 12h12"/>'
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
      const d = { day, a: 0, m: 0, u: 0, total: 0, list: [] };
      (wd[day] || []).forEach(p => {
        if (p.cancelled) { (p.tasks || []).forEach(t => { s.hwTotal++; if (t.done) s.hwDone++; }); return; } // убранная пара: только её ДЗ
        d.total++;
        const key = (p.subject || 'Без названия').trim();
        const sj = s.subjects[key] || (s.subjects[key] = { name: key, a: 0, m: 0, u: 0, total: 0, list: [] });
        sj.total++;
        const st = p.attended === true ? 'a' : p.attended === false ? 'm' : 'u';
        if (st === 'a') { d.a++; sj.a++; } else if (st === 'm') { d.m++; sj.m++; } else { d.u++; sj.u++; }
        d.list.push({ st, name: key });
        sj.list.push({ st, day });
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

  // Плавная кривая без «перелётов» за точки (монотонный кубический сплайн, как в «Здоровье»)
  function smoothPath(pts) {
    const n = pts.length;
    if (n === 1) return `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    const dx = [], m = [], t = [];
    for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      const a = t[i] / m[i], b = t[i + 1] / m[i], q = a * a + b * b;
      if (q > 9) { const k = 3 / Math.sqrt(q); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = dx[i] / 3;
      d += ` C${(x0 + h).toFixed(1)} ${(y0 + t[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)} ${(y1 - t[i + 1] * h).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    return d;
  }

  // Линия «посещаемость по неделям». Минимум подписей: 0 / 50 / 100 %, пунктир цели 80 %, номера недель.
  // Выбранная неделя подсвечена капсулой; её подробный отчёт — ниже графика.
  function trendSvg(weeks, W, sel, anim, fixedH) {
    const H = fixedH || (W < 500 ? 280 : 330), L = 44, R = 18, T = 70, B = 38;   // T — место над 100 % под плашку
    const pw = W - L - R, ph = H - T - B, n = weeks.length;
    const gap = n > 1 ? pw / (n - 1) : pw;
    const x = i => L + (n === 1 ? pw / 2 : i * gap);
    const y = v => T + ph - v / 100 * ph;
    const base = y(0);
    const grid = [0, 50, 100].map(v => `
      <line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="se-grid"/>
      <text x="${L - 12}" y="${y(v) + 4}" class="se-axis" text-anchor="end">${v}%</text>`).join('');
    const target = `<line x1="${L}" x2="${W - R}" y1="${y(80)}" y2="${y(80)}" class="se-target"/>
      <text x="${L - 12}" y="${y(80) + 4}" class="se-axis se-target-lbl" text-anchor="end">80%<title>Цель — 80% посещаемости</title></text>`;
    const si = weeks.findIndex(w => w.week === sel);
    // Направляющая: тонкая линия на всю высоту; двигается за курсором (CSS transform)
    // Направляющая: от капли вниз до оси; её рисует капля каждый кадр, поэтому она не отстаёт
    const gx = x(Math.max(0, si)).toFixed(1), gy = (weeks[si] && weeks[si].pct !== null ? y(weeks[si].pct) : base).toFixed(1);
    const guide = `<line x1="${gx}" x2="${gx}" y1="${gy}" y2="${base}" class="se-guide"/>`;
    const step = n > (W < 500 ? 10 : 18) ? 2 : 1;
    const ly = H - 12;
    const labels = weeks.map((w, i) => (i % step === 0 || i === n - 1 || w.week === sel)
      ? `<text x="${x(i)}" y="${ly}" class="se-axis se-wnum ${w.week === sel ? 'sel' : ''}" text-anchor="middle" data-i="${i}">${w.week}</text>` : '').join('');
    // Линия рвётся на неделях без отметок; под каждым участком — мягкая заливка
    const runs = []; let run = [];
    weeks.forEach((w, i) => {
      if (w.pct === null) { if (run.length) runs.push(run); run = []; return; }
      run.push([x(i), y(w.pct)]);
    });
    if (run.length) runs.push(run);
    const line = runs.filter(r => r.length > 1).map(smoothPath).join(' ');
    const area = runs.filter(r => r.length > 1).map(r =>
      `${smoothPath(r)} L${r[r.length - 1][0].toFixed(1)} ${base} L${r[0][0].toFixed(1)} ${base} Z`).join(' ');
    const dots = weeks.map((w, i) => w.pct === null ? '' :
      `<circle cx="${x(i)}" cy="${y(w.pct)}" r="${w.week === sel ? 6 : 4}" class="se-dot ${w.week === sel ? 'sel' : ''}" data-i="${i}" style="--d:${i * 70}ms"/>`).join('');
    const hit = weeks.map((w, i) =>
      `<rect x="${x(i) - gap / 2}" y="0" width="${gap}" height="${H}" class="se-hit" data-i="${i}"/>`).join('');
    const pts = weeks.map((w, i) => w.pct === null ? null : [+x(i).toFixed(1), +y(w.pct).toFixed(1)]);
    const xs = weeks.map((w, i) => +x(i).toFixed(1));
    return `<svg viewBox="0 0 ${W} ${H}" data-w="${W}" data-h="${H}" data-base="${base}" data-xs='${JSON.stringify(xs)}' data-pts='${JSON.stringify(pts)}' class="se-svg ${anim ? 'se-anim' : ''}" role="img" aria-label="Посещаемость по неделям семестра">
      <defs><linearGradient id="seFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="se-fill-a"/><stop offset="1" class="se-fill-b"/></linearGradient></defs>
      ${grid}${target}${guide}<path d="${area}" class="se-area" fill="url(#seFill)"/><path d="${line}" class="se-line" pathLength="1"/>${dots}${labels}${hit}</svg>`;
  }

  function chartWidth() {
    const box = $('seTrend');
    const w = box ? box.clientWidth - 20 : (($('rpBody') && $('rpBody').clientWidth) || 700) - 96;
    return Math.round(Math.max(300, Math.min(900, w)));
  }

  // Числа «досчитывают» до своего значения: 0 → 82%
  function countUp(root) {
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    (root || document).querySelectorAll('[data-count]').forEach(el => {
      const to = Number(el.dataset.count), suf = el.dataset.suf || '';
      if (reduce || !isFinite(to) || to === 0) { el.textContent = to + suf; return; }
      const t0 = performance.now(), dur = 900;
      const step = now => {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(to * e) + suf;
        if (k < 1 && el.isConnected) requestAnimationFrame(step);
      };
      el.textContent = '0' + suf;
      requestAnimationFrame(step);
    });
  }

  /* ---------- Окно: семестр сверху, под графиком — отчёт за выбранную неделю ---------- */
  let semWeeks = null;

  function render() {
    if (!hasUser()) return;
    const S = semesterStats();
    semWeeks = S.weeks;
    viewWeek = Math.min(Math.max(1, viewWeek), S.cw);
    const range = `${weekRangeShort(1).split(' – ')[0]} – ${weekRangeShort(S.cw).split(' – ')[1]}`;
    $('rpHead').innerHTML = `<div class="lg-pblur rp-pb" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <h2 class="rp-title">Динамика за семестр</h2>
      <div class="rp-sub">${S.cw === 1 ? 'Неделя 1' : `Недели 1–${S.cw}`} · ${esc(range)}</div>`;

    const hint = S.startW > 1
      ? (S.startW === 2 ? 'Неделя 1 не отмечена' : `Недели 1–${S.startW - 1} не отмечены`) + ' и в статистику не входят. Отметь их, чтобы картина была полной.'
      : S.marked < S.past / 2 ? 'Отмечено меньше половины прошедших пар. Отметь остальные, чтобы статистика была точнее.' : '';
    const semester = !S.marked
      ? `<section><div class="rp-empty se-empty">${svg(I.chart, 26, 1.8)}<span>Пока нет отмеченных пар. Отмечай посещения, и здесь появится картина за семестр.</span></div></section>`
      : `<section class="rp-sem">
          <div class="rp-ring" style="--p:${S.pct}; --c:${colorFor(S.pct)}">
            <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="rp-ring-track" cx="60" cy="60" r="52"/><circle class="rp-ring-fill" cx="60" cy="60" r="52"/></svg>
            <b data-count="${S.pct}" data-suf="%">${S.pct}%</b>
          </div>
          <div class="rp-sem-line">посещено ${S.a} из ${S.marked} отмеченных пар</div>
          <div class="rp-chips"><span class="rp-chip r">пропусков: ${S.m}</span><span class="rp-chip">отмечено ${S.marked} из ${S.past}</span></div>
          ${hint ? `<div class="rp-quiet">${svg(I.alert, 14, 2)}<span>${hint}</span></div>` : ''}
        </section>
        <section>
          <h3 class="pf-section-title"><span>Посещаемость по неделям</span></h3>
          ${S.markedWeeks >= 2
            ? `<div class="pf-box se-chart" id="seTrend"><div class="se-knob" id="seKnob" aria-hidden="true"><i></i></div><div class="se-tip" id="seTip"></div></div>`
            : `<div class="pf-box se-wait">${svg(I.chart, 22, 1.8)}<span>График появится, когда будут отметки хотя бы за 2 недели.</span></div>`}
        </section>`;

    $('rpBody').innerHTML = `<div class="rp-body"><div class="rp-glow" aria-hidden="true"><i></i><i></i><i></i></div>${semester}<section class="rp-week" id="rpWeek"></section></div>`;
    // График рисуем, когда карточка уже на месте: ширина берётся настоящая
    if ($('seTrend')) $('seTrend').insertAdjacentHTML('afterbegin', trendSvg(S.weeks, chartWidth(), viewWeek, true));
    countUp($('rpBody').querySelector('.rp-sem'));
    renderWeek();
    Scrub.bind();
  }

  // Отчёт за неделю viewWeek (перерисовывается сам по себе при смене недели)
  function renderWeek(dir) {
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
      box.innerHTML = nav + `<div class="rp-empty rp-week-body">${svg(I.chart, 30, 1.8)}<span>На этой неделе нет пар.</span></div>`;
      fadeIn(box, dir);
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

    // Пары по дням: каждая пара — точка, сверху вниз по порядку пар
    const rows = Math.max(1, ...cur.days.map(d => d.total));
    const ST = { a: 'посещено', m: 'пропущено', u: 'не отмечено' };
    const cols = cur.days.map((d, ci) => {
      const isToday = isDateToday(getDateForDay(viewWeek, d.day));
      const dots = Array.from({ length: rows }, (_, ri) => {
        const p = d.list[ri];
        return p
          ? `<i class="rp-pt ${p.st}" style="--d:${ci * 55 + ri * 45}ms" title="${ri + 1}-я пара · ${esc(p.name)} · ${ST[p.st]}"></i>`
          : `<i class="rp-pt none"></i>`;
      }).join('');
      return `<div class="rp-col ${isToday ? 'today' : ''}"><div class="rp-pts">${dots}</div><div class="rp-day">${SHORT[d.day]}</div><div class="rp-val">${d.total ? pairsWord(d.total) : 'нет пар'}</div></div>`;
    }).join('');

    // Предметы
    const subjects = Object.values(cur.subjects).sort((x, y) => y.total - x.total || x.name.localeCompare(y.name)).map((s, si) => `
      <div class="rp-subj">
        <div class="rp-subj-txt"><span class="rp-subj-name">${esc(s.name)}</span><span class="rp-subj-stat">${s.a} из ${s.total}${s.m ? `, пропусков: ${s.m}` : ''}</span></div>
        <div class="rp-subj-pts">${s.list.map((p, k) => `<i class="rp-pt ${p.st}" style="--d:${si * 40 + k * 50}ms" title="${esc(p.day)} · ${ST[p.st]}"></i>`).join('')}</div>
      </div>`).join('');

    const insights = buildInsights(cur, prev, isCur);

    const html = nav + `
      <div class="rp-week-body">
        <section class="pf-box rp-wcard">
          <div class="rp-hero">
            <div>
              <div class="rp-big" ${cur.pct === null ? '' : `data-count="${cur.pct}" data-suf="%"`}>${cur.pct === null ? '—' : cur.pct + '%'}</div>
              <div class="rp-big-sub">${esc(heroSub)}</div>
            </div>
            ${delta}
          </div>
          ${cur.pct === null ? '' : `<div class="prog-track rp-hero-track"><div class="prog-fill" style="width:${cur.pct}%; background:${colorFor(cur.pct)}"></div></div>`}
          <div class="rp-chart" id="rpChart" style="grid-template-columns:repeat(${cur.days.length}, 1fr)">${cols}</div>
          <div class="rp-legend"><span><i class="rp-pt a"></i>Посещено</span><span><i class="rp-pt m"></i>Пропущено</span><span><i class="rp-pt u"></i>Не отмечено</span></div>
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

    // Смена недели: карточка не пересоздаётся — меняется только то, что отличается
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (dir !== undefined && !reduce && box.querySelector('.rp-wcard')) {
      const tpl = document.createElement('div');
      tpl.innerHTML = html;
      morphWeek(box, tpl);
      return;
    }

    // Первый показ: точки появляются волной, числа досчитывают
    box.innerHTML = html;
    box.classList.remove('rp-ready');
    requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('rp-ready')));
    countUp(box);
    fadeIn(box, dir);
  }

  // Переход к пустой неделе и обратно: просто мягкое проявление, без сдвигов
  function fadeIn(box, dir) {
    const b = box.querySelector('.rp-week-body');
    if (!b || dir === undefined) return;
    b.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
  }

  const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  // Число плавно пересчитывается от старого значения к новому
  function countTo(el, to, suf) {
    const from = parseInt(el.textContent, 10);
    if (el.__cnt) cancelAnimationFrame(el.__cnt);
    if (!isFinite(from) || from === to) { el.textContent = to + suf; return; }
    const t0 = performance.now(), dur = 650;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * e) + suf;
      el.__cnt = k < 1 ? requestAnimationFrame(step) : 0;
    };
    el.__cnt = requestAnimationFrame(step);
  }
  // Высота блока плавно подстраивается под новое содержимое (ничего ниже не прыгает)
  function growFrom(el, h0) {
    if (!el) return;
    const h1 = el.offsetHeight;
    if (Math.abs(h1 - h0) < 1) return;
    el.animate([{ height: h0 + 'px', overflow: 'hidden' }, { height: h1 + 'px', overflow: 'hidden' }], { duration: 480, easing: EASE });
  }
  const fadeNew = (el, delay) => el && el.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: delay || 0, easing: EASE, fill: 'backwards' });

  function morphWeek(box, tpl) {
    const q = (root, sel) => root.querySelector(sel);
    const card = q(box, '.rp-wcard');
    const secs = root => [...root.querySelectorAll('.rp-week-body > section')];
    const subjBox = secs(box)[1] && q(secs(box)[1], '.pf-box');
    let insSec = secs(box)[2] || null;
    // снимаем незаконченные подстройки высоты и запоминаем текущие высоты
    [card, subjBox, insSec].forEach(el => el && el.getAnimations().forEach(a => a.cancel()));
    const h = { card: card.offsetHeight, subj: subjBox ? subjBox.offsetHeight : 0, ins: insSec ? insSec.offsetHeight : 0 };

    // Переключатель: меняется только подпись
    const lbl = q(box, '.rp-weeklabel'), nlbl = q(tpl, '.rp-weeklabel');
    lbl.innerHTML = nlbl.innerHTML;
    lbl.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    box.querySelectorAll('.rp-nav-btn').forEach((b, i) => { b.disabled = tpl.querySelectorAll('.rp-nav-btn')[i].disabled; });

    // Главная цифра: пересчёт от старого значения к новому
    const big = q(card, '.rp-big'), nbig = q(tpl, '.rp-big');
    if (nbig.dataset.count !== undefined) countTo(big, Number(nbig.dataset.count), '%');
    else { if (big.__cnt) cancelAnimationFrame(big.__cnt); big.textContent = nbig.textContent; }
    q(card, '.rp-big-sub').textContent = q(tpl, '.rp-big-sub').textContent;
    // Сравнение с прошлой неделей
    const hero = q(card, '.rp-hero'), od = q(hero, '.rp-delta'), nd = q(tpl, '.rp-delta');
    if (od && nd && od.outerHTML === nd.outerHTML) { /* без изменений */ }
    else {
      if (od) od.remove();
      if (nd) { hero.appendChild(nd); fadeNew(nd, 120); }
    }
    // Полоска доезжает до новой длины
    const ot = q(card, '.rp-hero-track'), nt = q(tpl, '.rp-hero-track');
    if (ot && nt) { const f = q(ot, '.prog-fill'), nf = q(nt, '.prog-fill'); f.style.width = nf.style.width; f.style.background = nf.style.background; }
    else if (ot && !nt) ot.remove();
    else if (!ot && nt) { hero.after(nt); const f = q(nt, '.prog-fill'), w = f.style.width; f.style.width = '0%'; requestAnimationFrame(() => { f.style.width = w; }); }

    // Кружки по дням меняют цвет на месте, волной; лишние гаснут, недостающие появляются
    const cols = [...card.querySelectorAll('.rp-col')], ncols = [...tpl.querySelectorAll('.rp-col')];
    cols.forEach((c, ci) => {
      const nc = ncols[ci]; if (!nc) return;
      c.classList.toggle('today', nc.classList.contains('today'));
      q(c, '.rp-val').textContent = q(nc, '.rp-val').textContent;
      const pts = q(c, '.rp-pts'), o = [...pts.children], n = [...q(nc, '.rp-pts').children];
      const len = Math.max(o.length, n.length);
      for (let k = 0; k < len; k++) {
        const delay = (ci * 35 + k * 30) + 'ms';
        if (o[k] && n[k]) {
          o[k].style.transitionDelay = delay;
          o[k].className = n[k].className;
          const t = n[k].getAttribute('title');
          o[k].removeAttribute('title');
          if (t) o[k].dataset.tip = t; else delete o[k].dataset.tip;
        } else if (n[k]) {
          n[k].style.setProperty('--d', delay);
          pts.appendChild(n[k]);
        } else if (o[k]) {
          const el = o[k];
          el.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.3)' }], { duration: 220, easing: 'ease-in' }).onfinish = () => el.remove();
        }
      }
    });

    // Предметы и выводы: мягко сменяются, высота подстраивается
    if (subjBox) {
      q(subjBox, '.rp-subjects').innerHTML = q(secs(tpl)[1], '.rp-subjects').innerHTML;
      subjBox.querySelectorAll('.rp-subj').forEach((r, i) => fadeNew(r, Math.min(i, 8) * 30));
    }
    const nIns = secs(tpl)[2] || null;
    if (insSec && nIns) {
      q(insSec, '.rp-insights').innerHTML = q(nIns, '.rp-insights').innerHTML;
      insSec.querySelectorAll('.rp-ins').forEach((r, i) => fadeNew(r, 80 + i * 40));
    } else if (insSec && !nIns) { insSec.remove(); insSec = null; }
    else if (!insSec && nIns) { box.querySelector('.rp-week-body').appendChild(nIns); insSec = nIns; fadeNew(nIns, 80); }

    growFrom(card, h.card);
    growFrom(subjBox, h.subj);
    if (insSec && h.ins) growFrom(insSec, h.ins);
  }

  // Выбор недели: с графика (плавно прокручиваем к её отчёту) или стрелками (остаёмся на месте)
  function selectWeek(w, scroll) {
    const prev = viewWeek;
    viewWeek = Math.min(Math.max(1, w), calculateCurrentSemesterWeek());
    if (viewWeek === prev && !scroll) return;
    renderWeek(viewWeek === prev ? 0 : viewWeek > prev ? 1 : -1);
    const s = $('seTrend') && $('seTrend').querySelector('svg');
    if (s && semWeeks) { s.outerHTML = trendSvg(semWeeks, Number(s.dataset.w), viewWeek, false, Number(s.dataset.h)); Scrub.sync(false); }
    if (scroll) scrollToWeek(true);
  }
  function scrollToWeek(smooth) {
    const body = $('rpBody'), sec = $('rpWeek');
    if (!body || !sec) return;
    const headH = $('rpHead') ? $('rpHead').offsetHeight : 0;
    const top = body.scrollTop + sec.getBoundingClientRect().top - body.getBoundingClientRect().top - headH - 12;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    body.scrollTo({ top: Math.max(0, top), behavior: smooth && !reduce ? 'smooth' : 'auto' });
  }

  /* Стеклянная капля на графике: сидит на выбранной неделе, при наведении «перетекает» к точке под
     курсором (пружина, вытягивается по ходу движения), её можно взять и вести по линии — плашка с неделей
     едет над ней. Отпустили — капля садится на ближайшую неделю, и ниже открывается её отчёт. */
  const Scrub = (function () {
    const K = 300, D = 2 * Math.sqrt(300) * 0.7;
    const st = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, raf: 0, last: 0, drag: null, idx: -1, lut: null, svg: null, ready: false };
    const els = () => ({ box: $('seTrend'), tip: $('seTip'), knob: $('seKnob') });

    function geom() {
      const { box } = els(); const svgEl = box && box.querySelector('svg');
      if (!svgEl) return null;
      if (st.svg !== svgEl) {                       // график перерисован — заново снимаем форму линии
        st.svg = svgEl;
        st.xs = JSON.parse(svgEl.dataset.xs || '[]');
        st.pts = JSON.parse(svgEl.dataset.pts || '[]');
        st.base = Number(svgEl.dataset.base);
        const path = svgEl.querySelector('.se-line'), lut = [];
        try {
          const len = path.getTotalLength();
          for (let k = 0; k <= 400; k++) { const p = path.getPointAtLength(len * k / 400); lut.push([p.x, p.y]); }
        } catch (e) { /* пустая линия */ }
        lut.sort((a, b) => a[0] - b[0]);
        st.lut = lut;
      }
      // Только размеры раскладки: getBoundingClientRect врёт, пока окно ещё «вырастает» анимацией
      const cs = getComputedStyle(box);
      return { k: (svgEl.clientWidth || box.clientWidth) / Number(svgEl.dataset.w), ox: parseFloat(cs.paddingLeft) || 0, oy: parseFloat(cs.paddingTop) || 0, bw: box.clientWidth };
    }
    // y линии в точке x (по снятой форме кривой), между участками — ближайшая точка
    function yAt(x) {
      const L = st.lut; if (!L || !L.length) return st.base;
      let lo = 0, hi = L.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m][0] < x) lo = m; else hi = m; }
      return Math.abs(L[lo][0] - x) < Math.abs(L[hi][0] - x) ? L[lo][1] : L[hi][1];
    }
    const nearest = x => { let b = 0; st.xs.forEach((v, i) => { if (Math.abs(v - x) < Math.abs(st.xs[b] - x)) b = i; }); return b; };
    const firstLast = () => { const ok = st.pts.map((p, i) => p ? i : -1).filter(i => i >= 0); return ok.length ? [st.xs[ok[0]], st.xs[ok[ok.length - 1]]] : [st.xs[0], st.xs[st.xs.length - 1]]; };
    const targetFor = i => st.pts[i] ? { x: st.pts[i][0], y: st.pts[i][1], empty: false } : { x: st.xs[i], y: st.base, empty: true };

    function showTip(i) {
      const { tip } = els(); const w = semWeeks && semWeeks[i];
      if (!tip || !w) return;
      if (st.idx !== i) tip.innerHTML = `<b>Неделя ${w.week} · ${w.pct === null ? 'нет отметок' : w.pct + '%'}</b><span>${esc(weekRangeShort(w.week))}</span>`;
      st.idx = i;
      st.svg && st.svg.querySelectorAll('.se-wnum.hov').forEach(t => t.classList.remove('hov'));
      const lbl = st.svg && st.svg.querySelector(`.se-wnum[data-i="${i}"]`); if (lbl) lbl.classList.add('hov');
    }

    function draw() {
      const G = geom(); const { tip, knob } = els();
      if (!G || !knob) return;
      const px = G.ox + st.x * G.k, py = G.oy + st.y * G.k;
      // капля вытягивается по ходу движения и чуть сплющивается
      const sp = Math.min(0.42, Math.hypot(st.vx, st.vy) * G.k / 1400);
      const ang = Math.atan2(st.vy, st.vx) * 180 / Math.PI;
      // растяжение — настоящими размерами (не scale), чтобы кромки стекла оставались чёткими
      const S0 = st.size || (st.size = knob.offsetWidth || 30);
      const w = S0 * (1 + sp), hh = S0 * (1 - sp * 0.45);
      knob.style.width = w.toFixed(2) + 'px'; knob.style.height = hh.toFixed(2) + 'px';
      knob.style.margin = `${(-hh / 2).toFixed(2)}px 0 0 ${(-w / 2).toFixed(2)}px`;
      knob.style.transform = `translate3d(${px.toFixed(2)}px, ${py.toFixed(2)}px, 0) rotate(${sp > 0.01 ? ang.toFixed(1) : 0}deg)`;
      // линия идёт ровно от низа капли до оси и двигается вместе с ней
      const g = st.svg && st.svg.querySelector('.se-guide');
      if (g) {
        const top = Math.min(st.base, st.y + (hh / 2 + 2) / G.k);
        g.setAttribute('x1', st.x.toFixed(2)); g.setAttribute('x2', st.x.toFixed(2));
        g.setAttribute('y1', top.toFixed(2)); g.setAttribute('y2', st.base);
      }
      if (tip) {
        const tw = tip.offsetWidth, th = tip.offsetHeight;
        const left = Math.min(Math.max(px - tw / 2, 6), G.bw - tw - 6);
        let top = py - th - 26;                                  // над каплей, не закрывая её
        if (top < 4) top = py + 26;                              // места сверху нет — под каплей
        tip.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
      }
    }

    function loop(now) {
      st.raf = 0;
      const dt = Math.min(0.034, st.last ? (now - st.last) / 1000 : 0.016); st.last = now;
      // Пока ведём — пружина жёстче: капля идёт за рукой с лёгким отставанием, как жидкость
      const k = st.drag ? 700 : K, dmp = st.drag ? 2 * Math.sqrt(700) * 0.8 : D;
      const h = dt / 2;
      for (let n = 0; n < 2; n++) {
        st.vx += (-k * (st.x - st.tx) - dmp * st.vx) * h; st.x += st.vx * h;
        st.vy += (-k * (st.y - st.ty) - dmp * st.vy) * h; st.y += st.vy * h;
      }
      draw();
      const moving = st.drag || Math.abs(st.x - st.tx) > 0.1 || Math.abs(st.y - st.ty) > 0.1 || Math.hypot(st.vx, st.vy) > 3;
      if (moving) st.raf = requestAnimationFrame(loop);
      else { st.x = st.tx; st.y = st.ty; st.vx = st.vy = 0; draw(); st.last = 0; }
    }
    const kick = () => { if (!st.raf) { st.last = 0; st.raf = requestAnimationFrame(loop); } };

    function goTo(i, jump) {
      if (!geom() || i < 0) return;
      const t = targetFor(i);
      st.tx = t.x; st.ty = t.y;
      const { knob } = els(); if (knob) knob.classList.toggle('empty', t.empty);
      showTip(i);
      if (jump || !st.ready) { st.x = t.x; st.y = t.y; st.vx = st.vy = 0; draw(); return; }
      kick();
    }
    const selIdx = () => semWeeks ? semWeeks.findIndex(w => w.week === viewWeek) : -1;

    function sync(jump) { st.idx = -1; goTo(selIdx(), jump); }

    function bind() {
      const { box, tip, knob } = els();
      st.svg = null; st.idx = -1; st.ready = false;
      if (!box || !knob) return;
      new ResizeObserver(() => { if (st.ready) draw(); }).observe(box);
      // первая постановка — после того как линия нарисуется
      setTimeout(() => { sync(true); tip && tip.classList.add('on'); knob.classList.add('on'); st.ready = true; }, 80);
      // Капля двигается только рукой: нажали в любом месте графика и ведём; простое наведение её не трогает
      const toX = e => {
        const G = geom(); if (!G) return null;
        const br = box.getBoundingClientRect(), sc = br.width / (box.offsetWidth || br.width);   // учёт масштаба окна
        return ((e.clientX - br.left) / sc - G.ox) / G.k;
      };
      const follow = x => {
        const [lo, hi] = firstLast();
        if (x < lo) x = lo - (lo - x) / (1 + (lo - x) / 30);   // за краями — туго, как резина
        if (x > hi) x = hi + (x - hi) / (1 + (x - hi) / 30);
        st.tx = x; st.ty = yAt(Math.min(hi, Math.max(lo, x)));
        const i = nearest(x); if (i !== st.idx) showTip(i);
        kick();
      };
      box.addEventListener('pointerdown', e => {
        if (e.button !== 0 || !geom()) return;
        const x = toX(e); if (x === null) return;
        e.preventDefault();
        box.setPointerCapture(e.pointerId);
        st.drag = { id: e.pointerId, x0: x };
        knob.classList.add('drag'); box.classList.add('is-drag');
        follow(x);
      });
      box.addEventListener('pointermove', e => {
        const d = st.drag; if (!d || d.id !== e.pointerId) return;
        const x = toX(e); if (x !== null) follow(x);
      });
      const up = e => {
        const d = st.drag; if (!d || d.id !== e.pointerId) return;
        st.drag = null; knob.classList.remove('drag'); box.classList.remove('is-drag');
        if (window.LGEatClick) LGEatClick();
        // садимся на ближайшую неделю с отметками
        let i = nearest(st.tx);
        if (!st.pts[i]) { const ok = st.pts.map((p, k) => p ? k : -1).filter(k => k >= 0); if (ok.length) i = ok.reduce((b, k) => Math.abs(st.xs[k] - st.tx) < Math.abs(st.xs[b] - st.tx) ? k : b, ok[0]); }
        const t = targetFor(i); st.tx = t.x; st.ty = t.y; showTip(i); kick();
        if (semWeeks[i] && semWeeks[i].week !== viewWeek) selectWeek(semWeeks[i].week, false);
      };
      box.addEventListener('pointerup', up);
      box.addEventListener('pointercancel', up);
    }
    return { bind, sync };
  })();

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
    $('reportBackdrop').classList.add('open'); // сначала показываем окно: ширина графика берётся из его настоящей ширины
    render();
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
