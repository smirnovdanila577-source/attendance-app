/* ==========================================================================
   LIQUID GLASS — поведение интерфейса (подключается последним).
   Данные приложения не трогает: только внешний вид и навигация.
     1. Окружение: приложение для ПК (Electron) или браузер / телефон
     2. Преломление: стекло «линзует» то, что проплывает под ним (только Chromium)
     3. Сегментные переключатели: подложка выбранного пункта переезжает с пружинкой
     4. Прокрутка, вкладки на телефоне, свайп недель, компактный заголовок
   ========================================================================== */

/* 1. Окружение */
(function () {
  'use strict';
  const root = document.documentElement;
  root.classList.toggle('is-electron', !!window.electronAPI);
  root.classList.toggle('is-web', !window.electronAPI);
  // Цвет строки состояния на телефоне повторяет фон приложения
  const meta = document.querySelector('meta[name="theme-color"]');
  const syncMeta = () => { if (meta) meta.content = document.body.classList.contains('dark-theme') ? '#07080b' : '#eef0f6'; };
  const start = () => { syncMeta(); new MutationObserver(syncMeta).observe(document.body, { attributes: true, attributeFilter: ['class'] }); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();

/* 2. Преломление (Liquid Glass): для каждого элемента с атрибутом data-lens строится карта смещения
   по его размеру и скруглению. У края стекла картинка под ним изгибается, как в толстой линзе.
   Работает в Chromium (Electron, Chrome, Edge). Остальные браузеры показывают обычное матовое стекло. */
window.LGLens = (function () {
  'use strict';
  const ua = navigator.userAgent;
  const ok = /Chrome\/\d+/.test(ua) && !/CriOS|FxiOS|Firefox/.test(ua) && window.CSS && CSS.supports('backdrop-filter', 'blur(1px)');
  if (!ok) return { refresh() {} };
  document.documentElement.classList.add('lg-can-refract');

  const NS = 'http://www.w3.org/2000/svg';
  const maps = new Map();
  const state = new WeakMap();
  let defs = null, seq = 0;

  function ensureDefs() {
    if (defs) return defs;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    defs = document.createElementNS(NS, 'defs');
    svg.appendChild(defs);
    document.body.appendChild(svg);
    return defs;
  }

  // Карта смещения: R — сдвиг по X, G — по Y (128 = без сдвига). Сдвиг растёт к краю плавно (t²)
  function mapFor(w, h, r, bez) {
    const key = w + 'x' + h + 'r' + r + 'b' + bez;
    if (maps.has(key)) return maps.get(key);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h), d = img.data;
    const hw = w / 2, hh = h / 2;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const px = i + 0.5 - hw, py = j + 0.5 - hh;
        const qx = Math.abs(px) - (hw - r), qy = Math.abs(py) - (hh - r);
        let nx = 0, ny = 0, dist;
        if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy) || 1; dist = r - l; nx = qx / l * Math.sign(px); ny = qy / l * Math.sign(py); }
        else if (qx > qy) { dist = r - qx; nx = Math.sign(px); }
        else { dist = r - qy; ny = Math.sign(py); }
        let m = 0;
        if (dist >= 0 && dist < bez) { const t = 1 - dist / bez; m = t * t; }
        const k = (j * w + i) * 4;
        d[k] = 128 + nx * m * 127; d[k + 1] = 128 + ny * m * 127; d[k + 2] = 128; d[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const url = c.toDataURL();
    if (maps.size > 40) maps.delete(maps.keys().next().value);
    maps.set(key, url);
    return url;
  }

  function apply(el) {
    if (!el.isConnected) return;
    const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
    if (w < 8 || h < 8) return;
    const r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2);
    const bez = Math.max(6, Math.min(18, Math.round(Math.min(w, h) * 0.34)));
    const scale = Math.round(bez * (Number(el.dataset.lens) || 1.5));
    const key = [w, h, r, bez, scale].join('|');
    let st = state.get(el);
    if (st && st.key === key) return;
    if (!st) { st = { id: 'lgf' + (++seq) }; state.set(el, st); }
    st.key = key;
    let f = document.getElementById(st.id);
    if (!f) {
      f = document.createElementNS(NS, 'filter');
      f.id = st.id;
      f.setAttribute('filterUnits', 'userSpaceOnUse');
      f.setAttribute('color-interpolation-filters', 'sRGB');
      ensureDefs().appendChild(f);
    }
    f.setAttribute('x', '0'); f.setAttribute('y', '0');
    f.setAttribute('width', w); f.setAttribute('height', h);
    f.innerHTML = `<feImage href="${mapFor(w, h, Math.round(r), bez)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>` +
      `<feDisplacementMap in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/>`;
    el.style.setProperty('--lg-lens', `url(#${st.id})`);
    el.classList.add('lg-refract');
  }

  const pending = new Set();
  let raf = 0;
  const schedule = el => {
    pending.add(el);
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; pending.forEach(apply); pending.clear(); });
  };
  const ro = new ResizeObserver(list => list.forEach(e => schedule(e.target)));
  const watch = el => { if (el.__lgLens) return; el.__lgLens = true; ro.observe(el); schedule(el); };
  const scan = root => {
    if (root.matches && root.matches('[data-lens]')) watch(root);
    if (root.querySelectorAll) root.querySelectorAll('[data-lens]').forEach(watch);
  };

  function start() {
    scan(document.body);
    new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      // Всплывающие уведомления тоже из стекла
      if (n.classList.contains('elegant-toast')) { n.classList.add('lg-glass'); n.setAttribute('data-lens', ''); }
      scan(n);
    }))).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  return { refresh: el => (el ? schedule(el) : scan(document.body)) };
})();

/* 3. Сегментные переключатели: подложка выбранного пункта плавно переезжает (как в iOS) */
(function () {
  'use strict';
  const SEL = '.lg-seg > .select-options, .uni-seg, .pf-seg, .pf-tabs, .lg-tabbar-inner';
  const seen = new WeakSet();
  const ro = new ResizeObserver(list => list.forEach(e => place(e.target)));

  function place(c) {
    const s = c.querySelector(':scope > .selected');
    if (!s || !c.offsetWidth) return;
    const first = !c.classList.contains('lg-thumb');
    // Класс ставим до замера: он делает контейнер точкой отсчёта координат
    if (first) c.classList.add('lg-thumb', 'lg-thumb-still');
    c.style.setProperty('--tx', s.offsetLeft + 'px');
    c.style.setProperty('--ty', s.offsetTop + 'px');
    c.style.setProperty('--tw', s.offsetWidth + 'px');
    c.style.setProperty('--th', s.offsetHeight + 'px');
    // Вкладки шире экрана (профиль на телефоне): выбранная всегда в поле зрения
    if (c.scrollWidth > c.clientWidth + 2) {
      const l = s.offsetLeft - 16, r = s.offsetLeft + s.offsetWidth + 16;
      if (l < c.scrollLeft || r > c.scrollLeft + c.clientWidth) c.scrollTo({ left: l < c.scrollLeft ? l : r - c.clientWidth, behavior: first ? 'auto' : 'smooth' });
    }
    if (first) {
      // Первое появление — без анимации, дальше подложка «едет»
      requestAnimationFrame(() => requestAnimationFrame(() => c.classList.remove('lg-thumb-still')));
    }
  }
  function track(c) { if (!seen.has(c)) { seen.add(c); ro.observe(c); } place(c); }
  const scan = () => document.querySelectorAll(SEL).forEach(track);

  function start() {
    scan();
    let raf = 0;
    const dirty = new Set();
    new MutationObserver(list => {
      list.forEach(m => {
        const t = m.target;
        if (m.type === 'attributes') { const c = t.parentElement; if (c && c.matches(SEL)) dirty.add(c); }
        else if (t.nodeType === 1) { if (t.matches(SEL)) dirty.add(t); else if (t.querySelector && t.querySelector(SEL)) dirty.add(null); }
      });
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        if (dirty.has(null)) scan();
        dirty.forEach(c => c && track(c));
        dirty.clear();
      });
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

/* 4. Прокрутка, вкладки и жесты */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);

  // Под прокрученным контентом верхняя панель «запотевает» (мягкий край, как в iOS)
  function bindScroll(sc, host) {
    if (!sc || !host) return;
    const on = () => host.classList.toggle('is-scrolled', sc.scrollTop > 6);
    sc.addEventListener('scroll', on, { passive: true });
    on();
  }

  function start() {
    const app = $('mainApp'), ms = $('mainScroll');
    bindScroll(ms, app);
    document.querySelectorAll('.modal-overlay .modal-scroll').forEach(sc => bindScroll(sc, sc.closest('.modal-content')));

    // Компактный заголовок: при прокрутке кнопка «Сегодня» показывает номер недели
    const src = $('weekCenterDisplay'), dst = document.querySelector('.lg-today-w');
    if (src && dst) {
      const sync = () => { dst.textContent = src.textContent; };
      new MutationObserver(sync).observe(src, { childList: true, characterData: true, subtree: true });
      sync();
    }

    // Вкладки на телефоне: «Расписание» и «Статистика»
    const tabs = document.querySelectorAll('.lg-tab');
    function setTab(t) {
      if (!app) return;
      if (app.dataset.tab === t) { if (ms) ms.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      app.dataset.tab = t;
      tabs.forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('selected', on); b.setAttribute('aria-selected', on); });
      if (ms) ms.scrollTop = 0;
      if (window.PairMenu) PairMenu.close(true);
    }
    tabs.forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    window.LGTabs = { set: setTab };

    // Свайп влево / вправо по расписанию листает недели (только на сенсорном экране)
    if (ms) {
      let sx = null, sy = 0, st = 0;
      ms.addEventListener('touchstart', e => {
        if (!app || app.dataset.tab !== 'schedule' || e.touches.length !== 1) { sx = null; return; }
        if (e.target.closest('input, textarea, .hw-panel')) { sx = null; return; }
        sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
      }, { passive: true });
      ms.addEventListener('touchend', e => {
        if (sx === null) return;
        const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
        sx = null;
        if (Date.now() - st < 650 && Math.abs(dx) > 70 && Math.abs(dy) < Math.abs(dx) * 0.5 && typeof changeWeek === 'function') changeWeek(dx < 0 ? 1 : -1);
      }, { passive: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

/* Меню действий с парой: стеклянная панель у кнопки «⋯».
   Пункты: важный предмет, домашнее задание, изменить, удалить.
   Открывается с пружинкой от кнопки, закрывается по клику мимо, Esc, прокрутке. Стрелки ↑↓ и Enter работают. */
window.PairMenu = (function () {
  'use strict';
  const I = {
    flag: f => `<svg width="17" height="17" viewBox="0 0 24 24" fill="${f ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>`,
    hw: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>',
    edit: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
    del: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
    check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    chart: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20v-6M6 20V10M18 20V4"/></svg>',
    cal: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    checkAll: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>',
    plus: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14M12 5v14"/></svg>',
    hide: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/></svg>'
  };
  let menu = null, anchor = null, row = null;

  function close(instant) {
    if (!menu) return;
    const m = menu; menu = null;
    if (row) row.classList.remove('menu-open');
    if (anchor) anchor.classList.remove('active');
    m.classList.remove('open');
    if (instant) m.remove(); else setTimeout(() => m.remove(), 180);
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', keys, true);
    const col = document.getElementById('mainScroll');
    if (col) col.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    row = null;
  }
  const onScroll = () => close();
  const outside = e => { if (menu && !menu.contains(e.target) && !(anchor && anchor.contains(e.target))) close(); };
  function keys(e) {
    if (!menu) return;
    const items = [...menu.querySelectorAll('.lg-menu-item')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); const a = anchor; close(); if (a) a.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Tab') close();
  }

  // Общее стеклянное меню: items — [{ icon, label, cls, hint, checked, run } | null (разделитель)]
  function openMenu(btn, items, opts = {}) {
    if (menu && anchor === btn) { close(); return; }   // повторное нажатие закрывает
    close(true);
    menu = document.createElement('div');
    menu.className = 'lg-menu lg-glass' + (opts.cls ? ' ' + opts.cls : '');
    menu.setAttribute('data-lens', '');
    menu.setAttribute('role', 'menu');
    if (opts.title) { const t = document.createElement('div'); t.className = 'lg-menu-title'; t.textContent = opts.title; menu.appendChild(t); }
    items.forEach(it => {
      if (!it) { menu.insertAdjacentHTML('beforeend', '<div class="lg-menu-sep" role="separator"></div>'); return; }
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'lg-menu-item ' + (it.cls || '');
      b.setAttribute('role', it.checked !== undefined ? 'menuitemradio' : 'menuitem');
      if (it.checked !== undefined) b.setAttribute('aria-checked', it.checked ? 'true' : 'false');
      b.innerHTML = (it.icon ? `<span class="lg-menu-ico">${it.icon}</span>` : '') + `<span class="lg-menu-label">${it.label}</span>` +
        (it.hint ? `<span class="lg-menu-hint">${it.hint}</span>` : '') +
        (it.checked ? `<span class="lg-menu-check">${I.check}</span>` : '');
      b.addEventListener('click', () => { close(); it.run(); });
      menu.appendChild(b);
    });
    document.body.appendChild(menu);

    // Под кнопкой (правым краем к ней или по центру); если внизу не хватает места — над ней
    anchor = btn; anchor.classList.add('active');
    row = opts.row || null; if (row) row.classList.add('menu-open');
    const r = btn.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight;
    const below = r.bottom + 6 + mh < window.innerHeight - 8;
    const want = opts.align === 'center' ? r.left + r.width / 2 - mw / 2 : opts.align === 'start' ? r.left : r.right - mw;
    const x = Math.max(8, Math.min(window.innerWidth - mw - 8, want));
    const y = below ? r.bottom + 6 : r.top - 6 - mh;
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    menu.style.transformOrigin = `${Math.min(mw, Math.max(0, r.left + r.width / 2 - x))}px ${below ? 0 : mh}px`;
    requestAnimationFrame(() => { if (menu) { menu.classList.add('open'); const f = menu.querySelector('.lg-menu-item'); if (f) f.focus({ preventScroll: true }); } });

    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', keys, true);
    const col = document.getElementById('mainScroll');
    if (col) col.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
  }

  function open(btn, day, pairId, extra) {
    const p = typeof findWeekPair === 'function' ? findWeekPair(currentWeek, pairId) : null;
    if (!p) return;
    const subj = (p.subject || '').trim();
    const imp = typeof isSubjectImportant === 'function' && isSubjectImportant(subj);
    const left = (p.tasks || []).filter(t => !t.done).length;
    const hwOpen = typeof openHwPanels !== 'undefined' && openHwPanels.has(p.id);
    openMenu(btn, [
      { icon: I.flag(imp), label: imp ? 'Убрать из важных' : 'Важный предмет', cls: imp ? 'is-on' : '', run: () => toggleSubjectPriority(subj) },
      { icon: I.hw, label: hwOpen ? 'Скрыть домашнее задание' : 'Домашнее задание', hint: left || '', run: () => toggleHwPanel(p.id) },
      { icon: I.edit, label: 'Изменить', run: () => openModal(day, { id: p.id, subject: p.subject, time: p.time, type: p.type }) },
      null,
      { icon: I.del, label: 'Удалить', cls: 'danger', run: () => triggerDeletePair(day, pairId) }
    ], Object.assign({ row: btn.closest('.pair-card') }, extra || {}));
  }

  // На сенсорном экране нажатие на саму пару открывает то же меню (кнопки «⋯» там нет)
  function rowTap(el, day, pairId) {
    if (!window.matchMedia || !matchMedia('(hover: none)').matches) return;
    open(el, day, pairId, { align: 'start' });
  }

  // Меню дня: отметить все пары, добавить пару, скрыть день
  function openDay(btn, day) {
    const pairs = ((getWeekData(currentWeek) || {})[day] || []).filter(p => !p.cancelled && pairHasEnded(currentWeek, day, p.time));
    const allOn = pairs.length > 0 && pairs.every(p => p.attended === true);
    openMenu(btn, [
      { icon: I.checkAll, label: allOn ? 'Отметить все пропуском' : 'Отметить все пары', run: () => markEntireDay(day) },
      { icon: I.plus, label: 'Добавить пару', run: () => openModal(day) },
      null,
      { icon: I.hide, label: 'Скрыть день', run: () => hideDay(day) }
    ], { title: day });
  }

  // Сортировка списка «Предметы»
  function openSort(btn) {
    const cur = (typeof database !== 'undefined' && database.subjectSort) || 'importance';
    const set = v => { database.subjectSort = v; saveData(); renderSubjectStats(); };
    openMenu(btn, [
      { icon: I.flag(true), label: 'По важности', cls: 'sort-imp', checked: cur === 'importance', run: () => set('importance') },
      { icon: I.chart, label: 'По посещаемости', cls: 'sort-att', checked: cur === 'attendance', run: () => set('attendance') }
    ], { title: 'Сортировка', cls: 'lg-menu-compact' });
  }

  // «Добавить учебный день»: список свободных дней недели
  function openAddDay(btn) {
    const free = ALL_DAYS.filter(d => !(database.activeDays || []).includes(d));
    if (!free.length) return;
    openMenu(btn, free.map(d => ({
      icon: I.cal, label: d,
      run: () => {
        database.activeDays.push(d);
        database.activeDays.sort((a, b) => ALL_DAYS.indexOf(a) - ALL_DAYS.indexOf(b));
        saveData(); render();
      }
    })), { title: 'Добавить день', align: 'center' });
  }

  window.GlassMenu = { open: openMenu, close };
  return { open, close, openSort, openAddDay, openDay, rowTap };
})();

