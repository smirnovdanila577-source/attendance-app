/* ==========================================================================
   LIQUID GLASS — живое поведение стекла.
   Блик под курсором: стеклянные карточки «ловят свет» там, где находится мышь.
   Только записывает CSS-переменные --mx/--my, данные приложения не трогает.
   ========================================================================== */
(function () {
  'use strict';
  const SEL = '#mainApp .day-group, #mainApp .sidebar-panel';
  let raf = 0, last = null;
  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    last = e;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const el = last.target.closest && last.target.closest(SEL);
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (last.clientX - r.left) + 'px');
      el.style.setProperty('--my', (last.clientY - r.top) + 'px');
    });
  }, { passive: true });
})();

/* Ползунок колонки дней: свой, тонкий. В покое невидим, при прокрутке плавно проявляется
   и через секунду тишины так же плавно гаснет. Его можно тянуть мышью.
   Заодно ставит классы lg-fade-top / lg-fade-bottom: края растворяются, только если за ними есть пары. */
(function () {
  'use strict';
  let col = null, bar = null, thumb = null, hideT = 0, drag = null;

  function ensure() {
    const c = document.querySelector('#mainApp .schedule-col');
    const grid = c && c.parentElement;
    if (!c || !grid) return false;
    if (c === col && bar && bar.isConnected) return true;
    col = c;
    bar = document.createElement('div'); bar.className = 'lg-scrollbar'; bar.setAttribute('aria-hidden', 'true');
    thumb = document.createElement('i'); bar.appendChild(thumb); grid.appendChild(bar);
    let scrollT = 0;
    col.addEventListener('scroll', () => {
      update(); flash();
      // Во время прокрутки отключаем наведение на строки (кнопки пар не выезжают под курсором)
      col.classList.add('lg-scrolling');
      clearTimeout(scrollT); scrollT = setTimeout(() => col.classList.remove('lg-scrolling'), 180);
    }, { passive: true });
    // Колёсико над ползунком должно крутить дни, а не «застревать» на нём
    bar.addEventListener('wheel', e => {
      e.preventDefault();
      if (window.__lgInertia) col.dispatchEvent(new WheelEvent('wheel', e));
      else col.scrollTop += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    }, { passive: false });
    thumb.addEventListener('pointerdown', e => {
      e.preventDefault(); thumb.setPointerCapture(e.pointerId);
      drag = { y: e.clientY, top: col.scrollTop }; bar.classList.add('drag');
    });
    thumb.addEventListener('pointermove', e => {
      if (!drag) return;
      const track = bar.clientHeight - thumb.offsetHeight;
      const max = col.scrollHeight - col.clientHeight;
      if (track > 0) col.scrollTop = drag.top + (e.clientY - drag.y) * max / track;
    });
    const stop = () => { if (!drag) return; drag = null; bar.classList.remove('drag'); flash(); };
    thumb.addEventListener('pointerup', stop); thumb.addEventListener('pointercancel', stop);
    new ResizeObserver(update).observe(col);
    return true;
  }

  function update() {
    if (!ensure()) return;
    const grid = col.parentElement;
    const gr = grid.getBoundingClientRect(), cr = col.getBoundingClientRect();
    const max = col.scrollHeight - col.clientHeight;
    col.classList.toggle('lg-fade-top', col.scrollTop > 2);
    col.classList.toggle('lg-fade-bottom', max - col.scrollTop > 2);
    if (max <= 2) { bar.style.display = 'none'; return; }
    bar.style.display = '';
    // Видимая область начинается на 10 px ниже края колонки (там тени карточек) — ползунок идёт по ней
    const padTop = 10 + 8, padBottom = 12, h = cr.height - padTop - padBottom;
    bar.style.top = (cr.top - gr.top + padTop) + 'px';
    // Ползунок — посередине промежутка между карточками дней и боковой панелью
    // Считаем от неподвижной боковой панели и ширины промежутка сетки: карточки дней во время
    // прокрутки двигаются, и привязка к ним заставляла ползунок прыгать вбок
    // Правый край карточек = правый край колонки минус её внутренний отступ (колонка неподвижна)
    const side = grid.querySelector('.sidebar-panel');
    const cardsRight = cr.right - (parseFloat(getComputedStyle(col).paddingRight) || 0);
    const sideLeft = side && side.offsetParent ? side.getBoundingClientRect().left : cardsRight + 16;
    const x = Math.round((cardsRight + sideLeft) / 2 - gr.left - 6);
    if (bar.style.left !== x + 'px') bar.style.left = x + 'px';
    bar.style.height = h + 'px';
    const th = Math.max(36, h * col.clientHeight / col.scrollHeight);
    thumb.style.height = th + 'px';
    thumb.style.top = ((h - th) * col.scrollTop / max) + 'px';
  }

  function flash() {
    if (!bar) return;
    bar.classList.add('on');
    clearTimeout(hideT);
    hideT = setTimeout(() => bar.classList.remove('on'), 900);
  }

  // Расписание перерисовывается (смена недели, отметки) — пересчитываем размеры ползунка
  const start = () => {
    if (!ensure()) return;
    update();
    new MutationObserver(() => requestAnimationFrame(update)).observe(col, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.addEventListener('resize', () => requestAnimationFrame(update));
})();

/* Инерция прокрутки дней: колёсико не дёргает список рывками, а разгоняет его, и он мягко доезжает.
   Плитки дней при этом чуть отстают от движения и догоняют — как будто у них есть вес.
   При «уменьшить движение» в системе всё работает как обычная прокрутка. */
(function () {
  'use strict';
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  window.__lgInertia = true;
  let col = null, target = 0, cur = 0, raf = 0, lastT = 0;

  function lagTiles(v) {
    const tiles = col.querySelectorAll('#scheduleAnimationWrapper > .day-group');
    const top = col.getBoundingClientRect().top;
    let prev = null;
    tiles.forEach(t => {
      const r = t.getBoundingClientRect();
      if (!v || r.bottom < top - 50 || r.top > top + col.clientHeight + 50) { t.style.transform = ''; prev = null; return; }   // невидимые не сдвигаем
      // чем ниже плитка на экране, тем сильнее отстаёт
      const k = 0.5 + Math.min(1, Math.max(0, (r.top - top) / col.clientHeight)) * 0.9;
      let lag = Math.max(-26, Math.min(26, v * k));
      // Соседние плитки не должны наезжать друг на друга: между ними 16 px, сближаем максимум на 8
      if (prev !== null) lag = Math.max(prev - 8, Math.min(prev + 12, lag));
      prev = lag;
      t.style.transform = lag ? `translateY(${lag.toFixed(2)}px)` : '';
    });
  }

  function step() {
    // Список прокрутили чем-то другим (кнопка «Сегодня», ползунок) — отдаём управление
    if (Math.abs(col.scrollTop - cur) > 2) { raf = 0; cur = target = col.scrollTop; lagTiles(0); return; }
    const prev = cur;
    // Плавность не зависит от частоты кадров: за 1/60 с проезжаем 8% оставшегося пути
    const now = performance.now(), dt = Math.min(64, lastT ? now - lastT : 16.7); lastT = now;
    let d = (target - cur) * (1 - Math.pow(0.92, dt / 16.7));
    if (Math.abs(d) < 1) d = Math.sign(target - cur) * Math.min(1, Math.abs(target - cur));   // хвост не «залипает» на долях пикселя
    cur += d;
    if (Math.abs(target - cur) < 0.5) cur = target;
    col.scrollTop = cur;
    cur = col.scrollTop;                       // упёрлись в край — дальше не едем
    const max = col.scrollHeight - col.clientHeight;
    if (cur === prev && (cur <= 0 || cur >= max - 1)) target = cur;   // упёрлись в начало или конец
    lagTiles((cur - prev) * 16.7 / dt);
    if (cur !== target) raf = requestAnimationFrame(step);
    else { raf = 0; lastT = 0; lagTiles(0); }
  }

  function bind() {
    const c = document.querySelector('#mainApp .schedule-col');
    if (!c || c === col) return;
    col = c;
    col.addEventListener('wheel', e => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;   // масштаб и горизонтальные жесты — как обычно
      e.preventDefault();
      if (!raf) { cur = col.scrollTop; target = cur; }
      const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * col.clientHeight : e.deltaY;
      target = Math.max(0, Math.min(col.scrollHeight - col.clientHeight, target + dy));
      if (!raf) { lastT = 0; raf = requestAnimationFrame(step); }
    }, { passive: false });
    // Любая другая прокрутка (ползунок, «Сегодня», клавиши) — сбрасываем инерцию
    col.addEventListener('scroll', () => { if (!raf) { cur = target = col.scrollTop; } }, { passive: true });
    // Любое нажатие (по плитке, «Сегодня», стрелкам недель) сразу останавливает инерцию
    document.addEventListener('pointerdown', () => { if (raf) { cancelAnimationFrame(raf); raf = 0; cur = target = col.scrollTop; lagTiles(0); } }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
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
    cal: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>'
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
    const col = document.querySelector('#mainApp .schedule-col');
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
    menu.className = 'lg-menu' + (opts.cls ? ' ' + opts.cls : '');
    menu.setAttribute('role', 'menu');
    if (opts.title) menu.insertAdjacentHTML('beforeend', `<div class="lg-menu-title">${opts.title}</div>`);
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
    const want = opts.align === 'center' ? r.left + r.width / 2 - mw / 2 : r.right - mw;
    const x = Math.max(8, Math.min(window.innerWidth - mw - 8, want));
    const y = below ? r.bottom + 6 : r.top - 6 - mh;
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    menu.style.transformOrigin = `${Math.min(mw, Math.max(0, r.left + r.width / 2 - x))}px ${below ? 0 : mh}px`;
    requestAnimationFrame(() => { if (menu) { menu.classList.add('open'); const f = menu.querySelector('.lg-menu-item'); if (f) f.focus({ preventScroll: true }); } });

    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', keys, true);
    const col = document.querySelector('#mainApp .schedule-col');
    if (col) col.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
  }

  function open(btn, day, pairId) {
    const p = typeof findWeekPair === 'function' ? findWeekPair(currentWeek, pairId) : null;
    if (!p) return;
    const subj = (p.subject || '').trim();
    const imp = typeof isSubjectImportant === 'function' && isSubjectImportant(subj);
    openMenu(btn, [
      { icon: I.flag(imp), label: imp ? 'Убрать из важных' : 'Важный предмет', cls: imp ? 'is-on' : '', run: () => toggleSubjectPriority(subj) },
      { icon: I.edit, label: 'Изменить', run: () => openModal(day, { id: p.id, subject: p.subject, time: p.time, type: p.type }) },
      null,
      { icon: I.del, label: 'Удалить', cls: 'danger', run: () => triggerDeletePair(day, pairId) }
    ], { row: btn.closest('.pair-card') });
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
  return { open, close, openSort, openAddDay };
})();

