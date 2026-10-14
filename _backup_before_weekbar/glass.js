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
  // Mac и iPhone / iPad: шрифт San Francisco (на iPad в режиме ПК платформа выдаёт себя как Mac с сенсорным экраном)
  root.classList.toggle('is-apple', /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));
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
  if (!ok) return { refresh() {}, filter: () => 'blur(0px)' };
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
  // Фильтр-линза заданного размера (для «капли» сегментов): url(#id), кэшируется
  const ready = new Map();
  function filter(w, h, r, k) {
    const bez = Math.max(6, Math.min(14, Math.round(Math.min(w, h) * 0.34)));
    const key = [w, h, r, bez, k].join('|');
    if (ready.has(key)) return ready.get(key);
    const f = document.createElementNS(NS, 'filter');
    f.id = 'lgk' + (++seq);
    f.setAttribute('filterUnits', 'userSpaceOnUse');
    f.setAttribute('color-interpolation-filters', 'sRGB');
    f.setAttribute('x', '0'); f.setAttribute('y', '0'); f.setAttribute('width', w); f.setAttribute('height', h);
    f.innerHTML = `<feImage href="${mapFor(w, h, r, bez)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>` +
      `<feDisplacementMap in="SourceGraphic" in2="map" scale="${Math.round(bez * k)}" xChannelSelector="R" yChannelSelector="G"/>`;
    ensureDefs().appendChild(f);
    const url = `url(#${f.id})`;
    ready.set(key, url);
    return url;
  }
  return { refresh: el => (el ? schedule(el) : scan(document.body)), filter };
})();

/* 3. Сегментные переключатели: жидкая капля.
   Капля — отдельный элемент под выбранным пунктом. Её ведёт пружина (положение и размер), поэтому при
   щелчке она перетекает, вытягиваясь по ходу движения, и чуть перелетает цель. Выбранный пункт можно
   взять и тянуть: капля становится прозрачной линзой с бликом и едет за курсором или пальцем. */
(function () {
  'use strict';
  const SEL = '.lg-seg > .select-options, .uni-seg, .pf-seg, .pf-tabs, .lg-tabbar-inner';
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const K = 420, D = 31;                        // жёсткость и вязкость пружины: быстро и с лёгким перелётом
  const memo = new Map();                       // где стояла капля (контейнер мог быть перерисован заново)
  let eatUntil = 0;                             // после перетаскивания «съедаем» лишний щелчок браузера
  document.addEventListener('click', e => {
    if (e.isTrusted && performance.now() < eatUntil) { e.stopPropagation(); e.preventDefault(); eatUntil = 0; }
  }, true);
  window.LGEatClick = () => { eatUntil = performance.now() + 600; };   // «съедается» только один следующий щелчок

  const keyOf = c => { const h = c.id ? c : c.closest('[id]'); return (h ? h.id : '') + '|' + c.classList[0]; };
  const itemOf = (c, t) => { while (t && t.parentElement !== c) t = t.parentElement; return t && !t.classList.contains('lg-knob') ? t : null; };
  const items = c => [...c.children].filter(x => !x.classList.contains('lg-knob'));
  const geo = el => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });

  const ro = new ResizeObserver(list => list.forEach(e => {
    const c = e.target, st = c.__k;
    if (!st || (st.cw === c.offsetWidth && st.ch === c.offsetHeight)) return;
    sync(c, true);
  }));

  function ensure(c) {
    let st = c.__k;
    if (!st) {
      st = c.__k = { x: 0, y: 0, w: 0, h: 0, p: 1, vx: 0, vy: 0, vw: 0, vh: 0, vp: 0, tx: 0, ty: 0, tw: 0, th: 0, tp: 1, raf: 0, init: false, knob: null, down: null };
      c.classList.add('lg-thumb');
      ro.observe(c);
      bind(c);
    }
    if (!st.knob || st.knob.parentNode !== c) {
      st.knob = document.createElement('span');
      st.knob.className = 'lg-knob';
      st.knob.setAttribute('aria-hidden', 'true');
      st.knob.innerHTML = '<i></i>';
      c.insertBefore(st.knob, c.firstChild);
      if (st.init) draw(st);
    }
    return st;
  }

  function draw(st) {
    const sxv = Math.abs(st.vx) / 2600, syv = Math.abs(st.vy) / 2600;
    const sx = (1 + Math.min(0.24, sxv) - Math.min(0.1, syv * 0.6)) * st.p;
    const sy = (1 + Math.min(0.24, syv) - Math.min(0.12, sxv * 0.7)) * st.p;
    const k = st.knob.style;
    k.width = Math.max(0, st.w) + 'px';
    k.height = Math.max(0, st.h) + 'px';
    k.transform = `translate3d(${st.x.toFixed(2)}px, ${st.y.toFixed(2)}px, 0) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
  }

  function run(c) {
    const st = c.__k;
    if (st.raf) return;
    let last = performance.now();
    const tick = now => {
      const dt = Math.min(0.032, (now - last) / 1000); last = now;
      let moving = false;
      for (const p of ['x', 'y', 'w', 'h', 'p']) {
        const t = st['t' + p], v = 'v' + p;
        st[v] += (K * (t - st[p]) - D * st[v]) * dt;
        st[p] += st[v] * dt;
        if (Math.abs(t - st[p]) > (p === 'p' ? 0.002 : 0.25) || Math.abs(st[v]) > (p === 'p' ? 0.02 : 6)) moving = true;
      }
      if (!moving) {
        for (const p of ['x', 'y', 'w', 'h', 'p']) { st[p] = st['t' + p]; st['v' + p] = 0; }
        draw(st); st.raf = 0; settle(c); return;
      }
      draw(st);
      st.raf = requestAnimationFrame(tick);
    };
    st.raf = requestAnimationFrame(tick);
  }

  // Капля доехала: если она «всплывала» на время переезда — опускаем и пускаем блик
  function settle(c) {
    const st = c.__k;
    if (st.travel && !st.down) {
      st.travel = false;
      lens(st, false);
      glint(st);
    }
  }
  function glint(st) {
    if (reduce) return;
    st.knob.classList.remove('glint'); void st.knob.offsetWidth; st.knob.classList.add('glint');
    clearTimeout(st.gt); st.gt = setTimeout(() => st.knob && st.knob.classList.remove('glint'), 850);
  }
  function lens(st, on) {
    st.knob.classList.toggle('is-press', on);
    if (on && window.LGLens && LGLens.filter && !document.body.classList.contains('glass-lite')) st.knob.style.setProperty('--knob-lens', LGLens.filter(Math.round(st.tw || st.w), Math.round(st.th || st.h), Math.round((st.th || st.h) / 2), 0.9));
  }

  function sync(c, resize) {
    if (!c.isConnected || !c.offsetWidth) return;
    const st = ensure(c);
    const sel = c.querySelector(':scope > .selected');
    if (!sel) { st.knob.style.opacity = '0'; return; }
    st.knob.style.opacity = '';
    st.cw = c.offsetWidth; st.ch = c.offsetHeight;
    const g = geo(sel);
    if (st.down && st.down.moved) { st.tw = g.w; st.th = g.h; return; }   // тянут — положение задаёт курсор
    const from = !st.init ? memo.get(keyOf(c)) : null;
    if (!st.init) {
      st.init = true;
      Object.assign(st, from && !resize ? { x: from.x, y: from.y, w: from.w, h: from.h } : g);
    }
    const dist = Math.hypot(g.x - st.x, g.y - st.y) + Math.abs(g.w - st.w);
    st.tx = g.x; st.ty = g.y; st.tw = g.w; st.th = g.h;
    memo.set(keyOf(c), g);
    if (resize || reduce || dist < 1) {
      cancelAnimationFrame(st.raf); st.raf = 0;
      Object.assign(st, g, { vx: 0, vy: 0, vw: 0, vh: 0 });
      draw(st);
    } else {
      // Переезд по щелчку: капля на миг становится линзой, перетекает и опускается с бликом
      if (dist > 8 && !st.down) { st.travel = true; lens(st, true); }
      run(c);
    }
    // Вкладки шире экрана (профиль на телефоне): выбранная всегда в поле зрения
    if (c.scrollWidth > c.clientWidth + 2) {
      const l = g.x - 16, r = g.x + g.w + 16;
      if (l < c.scrollLeft || r > c.scrollLeft + c.clientWidth) c.scrollTo({ left: l < c.scrollLeft ? l : r - c.clientWidth, behavior: resize ? 'auto' : 'smooth' });
    }
  }

  function bind(c) {
    c.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const st = c.__k, it = itemOf(c, e.target);
      if (!st || !it || !it.classList.contains('selected')) return;   // тянуть можно выбранный пункт
      const cr = c.getBoundingClientRect();
      st.down = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ox: e.clientX - cr.left - st.x, oy: e.clientY - cr.top - st.y, moved: false,
        rows: new Set(items(c).map(x => x.offsetTop)).size > 1 };
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* не страшно */ }
      lens(st, true);
      st.tp = 1.14; run(c);
    });
    c.addEventListener('pointermove', e => {
      const st = c.__k, d = st && st.down;
      if (!d || d.id !== e.pointerId) return;
      if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
      d.moved = true; c.classList.add('is-drag');
      const cr = c.getBoundingClientRect();
      const maxX = c.clientWidth - st.w, maxY = c.clientHeight - st.h;
      st.tx = Math.max(-4, Math.min(maxX + 4, e.clientX - cr.left - d.ox));
      if (d.rows) st.ty = Math.max(-4, Math.min(maxY + 4, e.clientY - cr.top - d.oy));
      st.knob.style.setProperty('--hx', Math.round(Math.max(0, Math.min(100, (e.clientX - cr.left - st.x) / st.w * 100))) + '%');
      run(c);
    });
    const up = e => {
      const st = c.__k, d = st && st.down;
      if (!d || d.id !== e.pointerId) return;
      st.down = null; c.classList.remove('is-drag');
      st.tp = 1;
      if (d.moved) {
        window.LGEatClick();
        // Ближайший к капле пункт становится выбранным
        const cx = st.tx + st.w / 2, cy = st.ty + st.h / 2;
        let best = null, bd = Infinity;
        items(c).forEach(x => { const g = geo(x), dd = Math.hypot(g.x + g.w / 2 - cx, (g.y + g.h / 2 - cy) * 1.6); if (dd < bd) { bd = dd; best = x; } });
        if (best) {
          const g = geo(best);
          st.tx = g.x; st.ty = g.y; st.tw = g.w; st.th = g.h;
          if (!best.classList.contains('selected')) setTimeout(() => best.click(), 0);
        }
      } else {
        sync(c);
      }
      run(c);
      setTimeout(() => { if (!st.down) { lens(st, false); glint(st); } }, d.moved ? 180 : 120);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
  }

  const scan = () => document.querySelectorAll(SEL).forEach(c => sync(c));
  function start() {
    scan();
    let raf = 0;
    const dirty = new Set();
    new MutationObserver(list => {
      list.forEach(m => {
        const t = m.target;
        if (m.type === 'attributes') { const c = t.parentElement; if (c && c.matches && c.matches(SEL)) dirty.add(c); }
        else if (t.nodeType === 1) {
          if (t.matches(SEL)) dirty.add(t);
          else if (t.querySelector && t.querySelector(SEL)) dirty.add(null);
        }
      });
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        if (dirty.has(null)) scan();
        dirty.forEach(c => c && sync(c));
        dirty.clear();
      });
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

/* 3б. Переключатели iOS: каплю можно тянуть, при нажатии она вытягивается и становится линзой */
(function () {
  'use strict';
  const SEL = '.custom-checkbox-box, .sc-toggle input';
  document.addEventListener('pointerdown', e => {
    const box = e.target.closest && e.target.closest(SEL);
    if (!box || e.button !== 0) return;
    const input = box.matches('input') ? box : box.parentElement.querySelector('input[type="checkbox"]');
    if (!input) return;
    const x0 = e.clientX, base = input.checked ? 15 : 0;
    let moved = false, kx = base;
    box.classList.add('is-press');
    const move = ev => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 3) return;
      moved = true; box.classList.add('is-drag');
      kx = Math.max(0, Math.min(15, base + dx));
      box.style.setProperty('--kx', kx + 'px');
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      box.classList.remove('is-drag');
      box.style.removeProperty('--kx');
      if (moved) {
        window.LGEatClick && LGEatClick();
        const val = kx > 7.5;
        if (val !== input.checked) { input.checked = val; input.dispatchEvent(new Event('change', { bubbles: true })); }
      }
      setTimeout(() => box.classList.remove('is-press'), moved ? 60 : 140);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  });
})();

/* 3в. Свет на стекле: кромка поворачивается к курсору, под курсором скользит мягкий блик,
   стеклянные капсулы панели чуть «набухают» при нажатии */
(function () {
  'use strict';
  const SEL = '.lg-glass, .lg-circle';
  let raf = 0, ev = null, lit = null;
  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || document.body.classList.contains('glass-lite')) return;
    ev = e;
    if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: true });
  function frame() {
    raf = 0;
    const e = ev;
    document.querySelectorAll(SEL).forEach(el => {
      const r = el.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > innerHeight) return;
      // Угол градиента кромки: самая светлая сторона смотрит на курсор
      let a = Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180 / Math.PI + 180;
      const prev = el.__la;
      if (prev !== undefined) { while (a - prev > 180) a -= 360; while (a - prev < -180) a += 360; }
      el.__la = a;
      el.style.setProperty('--la', a.toFixed(1) + 'deg');
    });
    const t = e.target && e.target.closest ? e.target.closest('.lg-glass') : null;
    if (lit && lit !== t) lit.classList.remove('is-lit');
    lit = t;
    if (t) {
      const r = t.getBoundingClientRect();
      t.style.setProperty('--lx', (e.clientX - r.left) + 'px');
      t.style.setProperty('--ly', (e.clientY - r.top) + 'px');
      t.classList.add('is-lit');
    }
  }
  document.addEventListener('pointerleave', () => { if (lit) lit.classList.remove('is-lit'); lit = null; });
  const PRESS = '.lg-topbar .lg-glass, .lg-tabbar-inner';
  let pressed = null;
  document.addEventListener('pointerdown', e => {
    const g = e.target.closest && e.target.closest(PRESS);
    if (!g) return;
    pressed = g; g.classList.add('is-press');
  });
  const release = () => { if (pressed) { const g = pressed; pressed = null; setTimeout(() => g.classList.remove('is-press'), 90); } };
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
})();

/* 4. Листы, вкладки на телефоне и жесты */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const PBLUR = '<i></i>';
  const addBlur = el => {
    if (!el || el.querySelector(':scope > .lg-pblur')) return;
    const b = document.createElement('div');
    b.className = 'lg-pblur'; b.setAttribute('aria-hidden', 'true'); b.innerHTML = PBLUR;
    el.insertBefore(b, el.firstChild);
  };

  // Листы: при прокрутке под шапкой появляется мягкий край; прилипшие вкладки профиля уступают место «закрыть»
  function bindSheet(sc) {
    const host = sc.closest('.modal-content');
    if (!host) return;
    const tb = sc.querySelector('.pf-tabbar');
    const on = () => {
      host.classList.toggle('is-scrolled', sc.scrollTop > 4);
      if (tb) tb.classList.toggle('is-stuck', sc.scrollTop > 4 && tb.getBoundingClientRect().top - sc.getBoundingClientRect().top < 1.5);
    };
    sc.addEventListener('scroll', on, { passive: true });
    on();
  }

  function start() {
    const app = $('mainApp'), ms = $('mainScroll');
    document.querySelectorAll('.lg-sheet-head, .pf-tabbar').forEach(addBlur);
    const rp = $('rpHead');
    if (rp) { addBlur(rp); new MutationObserver(() => addBlur(rp)).observe(rp, { childList: true }); }
    document.querySelectorAll('.modal-overlay .modal-scroll').forEach(bindSheet);

    // Вкладки на телефоне: «Расписание» и «Статистика»
    const tabs = document.querySelectorAll('.lg-tab');
    function setTab(t) {
      if (!app) return;
      const sc = t === 'stats' ? app.querySelector('.sidebar-panel') : ms;
      if (app.dataset.tab === t) { if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      app.dataset.tab = t;
      tabs.forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('selected', on); b.setAttribute('aria-selected', on); });
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

/* 4б. Телефон: большой заголовок недели прокручивается вместе с днями (как в iOS).
   Когда он уехал под верхнюю панель, в капсуле вместо «Сегодня» появляется «Неделя N». */
(function () {
  'use strict';
  function start() {
    const app = document.getElementById('mainApp'), col = document.getElementById('mainScroll');
    const hero = app && app.querySelector('.lg-hero'), grid = app && app.querySelector('.layout-grid');
    const inner = col && col.querySelector('.lg-sched-inner');
    if (!hero || !grid || !inner) return;
    const src = document.getElementById('weekCenterDisplay'), dst = app.querySelector('.lg-today-w');
    if (src && dst) {
      const copy = () => { dst.textContent = src.textContent; };
      new MutationObserver(copy).observe(src, { childList: true, characterData: true, subtree: true });
      copy();
    }
    const mq = window.matchMedia('(max-width: 760px)');
    const compact = () => {
      const h = hero.offsetHeight;   // пока экран скрыт, высота 0 — тогда заголовок считается видимым
      const on = mq.matches && h > 0 && hero.parentNode === inner && col.scrollTop > h - 24;
      app.classList.toggle('is-compact', on);
    };
    const place = () => {
      if (mq.matches && hero.parentNode !== inner) inner.insertBefore(hero, inner.firstChild);
      else if (!mq.matches && hero.parentNode !== app) app.insertBefore(hero, grid);
      compact();
    };
    col.addEventListener('scroll', compact, { passive: true });
    new ResizeObserver(compact).observe(hero);
    if (mq.addEventListener) mq.addEventListener('change', place); else mq.addListener(place);
    place();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

/* 5. Ползунки прокрутки: тонкие, поверх содержимого, не доходят до краёв окна.
   Появляются при прокрутке или когда курсор рядом, плавно гаснут; их можно тянуть.
   У расписания ползунок стоит посередине промежутка между днями и статистикой. */
window.LGBar = (function () {
  'use strict';
  const mobile = () => window.matchMedia && matchMedia('(max-width: 760px)').matches;
  const states = new WeakMap();
  // Высота прозрачной шапки над списком (предметы, уведомления)
  const headH = el => { const h = el.parentElement && el.parentElement.querySelector(':scope > .panel-title-row, :scope > .pf-pop-head'); return h ? h.offsetHeight : 0; };
  // Ползунок на одинаковом расстоянии от края карточки или окна
  const edgeX = (el, hr, er) => er.right - hr.left - 18;
  const RULES = [
    { sel: '#mainScroll', host: el => el.parentElement, inset: () => mobile() ? { top: 6, bottom: 112 } : { top: 8, bottom: 30 }, x: schedX },
    { sel: '.modal-scroll:not(#bellBackdrop .modal-scroll)', host: el => el.closest('.modal-content') || el.parentElement, inset: el => ({ top: el.closest('.lg-alert') ? 14 : 72, bottom: 16 }), x: edgeX },
    { sel: '.pf-notif-list', inset: el => ({ top: headH(el) + 6, bottom: 10 }), x: edgeX },
    { sel: '.subject-list', inset: el => ({ top: headH(el) + 6, bottom: 10 }), x: edgeX, only: () => !mobile() },
    { sel: '#mainApp .sidebar-panel', host: el => el.parentElement, inset: () => ({ top: 6, bottom: 112 }), only: () => mobile() },
    { sel: '.lg-onb', inset: () => ({ top: 50, bottom: 16 }) }
  ];


  function schedX(el, hr, er) {
    if (mobile()) return er.right - hr.left - 14;
    const side = el.parentElement.querySelector('.sidebar-panel');
    const cardsRight = er.right - (parseFloat(getComputedStyle(el).paddingRight) || 0);
    const sideLeft = side ? side.getBoundingClientRect().left : cardsRight + 30;
    return Math.round((cardsRight + sideLeft) / 2 - hr.left - 6);
  }

  function attach(el, rule) {
    if (states.has(el)) return states.get(el);
    const host = rule.host ? rule.host(el) : el.parentElement;
    if (!host) return null;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    el.classList.add('lg-sb-hide');
    const bar = document.createElement('div');
    bar.className = 'lg-bar'; bar.setAttribute('aria-hidden', 'true');
    const th = document.createElement('i');
    bar.appendChild(th);
    host.appendChild(bar);
    const st = { el, host, bar, th, rule, hideT: 0, drag: null, len: 0, track: 0 };
    states.set(el, st);
    el.addEventListener('scroll', () => { update(st); flash(st); }, { passive: true });
    new ResizeObserver(() => update(st)).observe(el);
    new MutationObserver(() => requestAnimationFrame(() => update(st))).observe(el, { childList: true, subtree: true });
    // Колёсико над ползунком крутит сам список
    bar.addEventListener('wheel', e => {
      e.preventDefault();
      if (el.__lgWheel) el.__lgWheel(e); else el.scrollTop += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    }, { passive: false });
    th.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      th.setPointerCapture(e.pointerId);
      st.drag = { y: e.clientY, top: el.scrollTop };
      bar.classList.add('drag');
    });
    th.addEventListener('pointermove', e => {
      if (!st.drag) return;
      const max = el.scrollHeight - el.clientHeight;
      if (st.track > 0) el.scrollTop = st.drag.top + (e.clientY - st.drag.y) * max / st.track;
    });
    const stop = () => { if (!st.drag) return; st.drag = null; bar.classList.remove('drag'); flash(st); };
    th.addEventListener('pointerup', stop);
    th.addEventListener('pointercancel', stop);
    // Курсор у края списка — ползунок проявляется, чтобы за него можно было взяться
    let nearT = 0;
    host.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || bar.style.display === 'none') return;
      const r = bar.getBoundingClientRect();
      const near = e.clientX > r.left - 8 && e.clientX < r.right + 4 && e.clientY > r.top && e.clientY < r.bottom;
      bar.classList.toggle('near', near);
      clearTimeout(nearT);
      if (near) nearT = setTimeout(() => { if (!st.drag && !th.matches(':hover')) bar.classList.remove('near'); }, 1400);
    }, { passive: true });
    host.addEventListener('pointerleave', () => bar.classList.remove('near'));
    update(st);
    return st;
  }

  function update(st) {
    const { el, host, bar, th, rule } = st;
    if (!el.isConnected) return;
    if (bar.parentNode !== host) host.appendChild(bar);
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 2 || !el.offsetParent || (rule.only && !rule.only())) { bar.style.display = 'none'; return; }
    bar.style.display = '';
    const hr = host.getBoundingClientRect(), er = el.getBoundingClientRect();
    const ins = rule.inset(el);
    const h = Math.max(20, er.height - ins.top - ins.bottom);
    bar.style.top = (er.top - hr.top + ins.top) + 'px';
    bar.style.height = h + 'px';
    const x = rule.x ? rule.x(el, hr, er) : er.right - hr.left - 13;
    bar.style.left = x + 'px';
    const len = Math.max(30, h * el.clientHeight / el.scrollHeight);
    st.track = h - len;
    th.style.height = len + 'px';
    th.style.transform = `translateY(${(st.track * Math.min(1, Math.max(0, el.scrollTop / max))).toFixed(1)}px)`;
  }

  function flash(st) {
    st.bar.classList.add('on');
    clearTimeout(st.hideT);
    st.hideT = setTimeout(() => st.bar.classList.remove('on'), 900);
  }

  function scan() {
    RULES.forEach(rule => document.querySelectorAll(rule.sel).forEach(el => {
      const st = attach(el, rule);
      if (st) update(st);
    }));
  }
  function start() {
    scan();
    let raf = 0;
    new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; scan(); }); })
      .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', () => requestAnimationFrame(scan));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  return { refresh: scan };
})();

/* 6. Прокрутка с инерцией и растяжением — одна для всех списков: расписание, предметы, уведомления, листы.
   Колёсико разгоняет список, и он мягко доезжает; у края список растягивается, как резина, и плавно
   возвращается. Строки при движении чуть отстают друг от друга, будто у них есть вес.
   Края растворяются ровно настолько, насколько за ними есть содержимое. */
window.LGScroll = (function () {
  'use strict';
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const RULES = [
    { sel: '#mainScroll', tiles: '#scheduleAnimationWrapper > .day-group, #addDayBtnContainer', host: el => el.parentElement, fade: [16, 0], guard: true, lag: 1 },
    { sel: '.subject-list', tiles: ':scope > .subject-item', host: el => el.parentElement, fade: [0, 26], guard: true, lag: 0.5 },
    { sel: '.pf-notif-list', tiles: ':scope > .pf-notif-item', host: el => el.parentElement, fade: [0, 30], lag: 0.5 },
    // Листы: содержимое едет целиком, без «качания» карточек; у краёв растягивается
    { sel: '.modal-scroll:not(#bellBackdrop .modal-scroll)', tiles: ':scope > :not(.lg-bar):not(.lg-pblur)', host: el => el.closest('.modal-content'), lag: 0 }
  ];
  const STEP = 1.25;            // один щелчок колеса — чуть больше обычного шага
  const GLIDE = 0.14;           // доля оставшегося пути за кадр (60 к/с): быстро отзывается и долго «доплывает»
  const R = 140;                // предел растяжения

  function attach(el, rule) {
    if (el.__lgs) return;
    const st = el.__lgs = { target: 0, cur: 0, raf: 0, lastT: 0, lastWheel: 0, over: 0, overV: 0, tiles: new Map() };
    const host = rule.host ? rule.host(el) : null;
    let scrollT = 0;
    const edges = () => {
      const max = el.scrollHeight - el.clientHeight, top = el.scrollTop;
      if (rule.fade) {
        el.style.setProperty('--ft', Math.max(0, Math.min(rule.fade[0], top)) + 'px');
        el.style.setProperty('--fb', Math.max(0, Math.min(rule.fade[1], max - top)) + 'px');
      }
      el.classList.toggle('lg-more-below', max - top > 2);
      if (host) host.classList.toggle('is-scrolled', top > 2);
    };
    el.addEventListener('scroll', () => {
      edges();
      if (rule.guard) {   // пока список едет, строки не подсвечиваются под курсором
        el.classList.add('lg-scrolling');
        clearTimeout(scrollT); scrollT = setTimeout(() => el.classList.remove('lg-scrolling'), 160);
      }
    }, { passive: true });
    new ResizeObserver(edges).observe(el);
    new MutationObserver(() => requestAnimationFrame(edges)).observe(el, { childList: true, subtree: true });
    edges();
    if (reduce) return;

    const rubber = x => Math.sign(x) * R * (1 - 1 / (Math.abs(x) * 0.55 / R + 1));

    function wheel(e) {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      // Внутренний список со своей прокруткой (барабан, вложенный список) крутится сам
      const own = e.target.closest && e.target.closest('[data-own-scroll]');
      if (own && own !== el && el.contains(own)) return;
      if (document.body.classList.contains('glass-lite') && el.scrollHeight <= el.clientHeight) return;
      e.preventDefault();
      if (!st.raf) { st.cur = el.scrollTop; st.target = st.cur; st.lastT = 0; }
      const dy = (e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * el.clientHeight : e.deltaY) * STEP;
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      let t = st.target + dy;
      // За край тянется, только когда список уже стоит у самого края
      if (t < 0) { if (st.cur <= 2) st.over = Math.max(-600, st.over + t * 0.75); t = 0; }
      else if (t > max) { if (max - st.cur <= 2) st.over = Math.min(600, st.over + (t - max) * 0.75); t = max; }
      st.target = t;
      st.lastWheel = performance.now();
      if (!st.raf) st.raf = requestAnimationFrame(step);
    }
    el.__lgWheel = wheel;
    el.addEventListener('wheel', wheel, { passive: false });

    function step(now) {
      st.raf = 0;
      const dt = Math.min(50, st.lastT ? now - st.lastT : 16.7); st.lastT = now;
      const f = dt / 16.7;
      if (Math.abs(el.scrollTop - st.cur) > 2) st.cur = st.target = el.scrollTop;   // прокрутили иначе — отдаём управление
      const prev = st.cur;
      if (st.cur !== st.target) {
        let d = (st.target - st.cur) * (1 - Math.pow(1 - GLIDE, f));
        if (Math.abs(st.target - st.cur) < 0.6) d = st.target - st.cur;
        el.scrollTop = st.cur + d;
        st.cur = el.scrollTop;
        // Упёрлись в край или в долю пикселя — дальше не едем
        if (Math.abs(st.cur - (prev + d)) > 0.5 || Math.abs(st.target - st.cur) < 1) st.target = st.cur;
      }
      const v = (st.cur - prev) / f;
      if (now - st.lastWheel > 90) {   // колёсико отпустили — край возвращается пружиной без перелёта
        const s = dt / 1000;
        st.overV += (-160 * st.over - 2 * Math.sqrt(160) * st.overV) * s;
        st.over += st.overV * s;
        if (Math.abs(st.over) < 0.3 && Math.abs(st.overV) < 2) { st.over = 0; st.overV = 0; }
      }
      const shift = -rubber(st.over);
      const top = el.getBoundingClientRect().top, H = el.clientHeight || 1;
      let prevO = null, busy = false;
      el.querySelectorAll(rule.tiles).forEach(t => {
        const r = t.getBoundingClientRect();
        const o0 = st.tiles.get(t) || 0;
        if (!r.height || r.bottom < top - 80 || r.top > top + H + 80) { if (o0) { t.style.transform = ''; st.tiles.delete(t); } prevO = null; return; }
        const rel = Math.min(1, Math.max(0, (r.top + r.height / 2 - top) / H));
        const rub = shift * (shift > 0 ? 0.55 + rel * 0.45 : 1 - rel * 0.45);
        const lag = Math.max(-10, Math.min(10, v * (0.14 + rel * 0.26) * (rule.lag === undefined ? 1 : rule.lag)));
        let want = rub + lag;
        if (prevO !== null) want = Math.max(prevO - 8, Math.min(prevO + 40, want));
        let o = o0 + (want - o0) * (1 - Math.pow(0.72, f));
        if (Math.abs(o) < 0.15 && Math.abs(want) < 0.15) o = 0;
        prevO = o;
        if (o) { t.style.transform = `translateY(${o.toFixed(2)}px)`; st.tiles.set(t, o); busy = true; }
        else if (o0) { t.style.transform = ''; st.tiles.delete(t); }
      });
      if (st.cur !== st.target || st.over !== 0 || busy) st.raf = requestAnimationFrame(step);
      else st.lastT = 0;
    }
    // Нажатие останавливает полёт (край всё равно мягко вернётся)
    el.addEventListener('pointerdown', () => { if (st.raf) st.target = st.cur = el.scrollTop; }, true);
  }

  function scan() { RULES.forEach(rule => document.querySelectorAll(rule.sel).forEach(el => attach(el, rule))); }
  function start() {
    scan();
    let raf = 0;
    new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; scan(); }); })
      .observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  return { refresh: scan };
})();

/* 7. Подсказки при наведении: вместо системных — стеклянные, в стиле приложения.
   Атрибут title переносится в data-tip, поэтому системная подсказка не появляется. */
(function () {
  'use strict';
  if (window.matchMedia && matchMedia('(hover: none)').matches) return;
  let tip = null, cur = null, showT = 0, warmUntil = 0;
  function adopt(el) {
    const t = el.getAttribute('title');
    if (t === null || el.closest('svg')) return;
    el.removeAttribute('title');
    if (t) {
      el.dataset.tip = t;
      if (!el.hasAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', t);
      if (cur === el && tip) tip.textContent = t;
    } else delete el.dataset.tip;
  }
  const scan = root => { if (root.nodeType !== 1) return; if (root.hasAttribute('title')) adopt(root); root.querySelectorAll('[title]').forEach(adopt); };
  function place(el) {
    const r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    let y = r.bottom + 8, dy = -4;
    if (y + th > innerHeight - 8) { y = r.top - th - 8; dy = 4; }
    const x = Math.max(8, Math.min(innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
    tip.style.left = Math.round(x) + 'px'; tip.style.top = Math.round(y) + 'px';
    tip.style.setProperty('--tip-dy', dy + 'px');
  }
  function show(el) {
    if (!tip) { tip = document.createElement('div'); tip.className = 'lg-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    tip.textContent = el.dataset.tip;
    tip.classList.remove('show');
    place(el);
    requestAnimationFrame(() => tip && tip.classList.add('show'));
  }
  function hide() {
    clearTimeout(showT);
    if (tip && tip.classList.contains('show')) { tip.classList.remove('show'); warmUntil = performance.now() + 400; }
    cur = null;
  }
  function start() {
    scan(document.body);
    new MutationObserver(list => list.forEach(m => {
      if (m.type === 'attributes') { if (m.target.hasAttribute('title')) adopt(m.target); }
      else m.addedNodes.forEach(scan);
    })).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
    document.addEventListener('pointerover', e => {
      if (e.pointerType !== 'mouse') return;
      let el = e.target.closest && e.target.closest('[data-tip]');
      if (el && el.closest('.lg-wh, .subject-list')) el = null;   // у барабана и списка предметов подсказок нет
      if (el === cur) return;
      hide();
      if (!el) return;
      cur = el;
      showT = setTimeout(() => { if (cur === el && el.isConnected) show(el); }, performance.now() < warmUntil ? 60 : 550);
    });
    ['pointerdown', 'wheel', 'keydown'].forEach(t => document.addEventListener(t, hide, { passive: true, capture: true }));
    window.addEventListener('blur', hide);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

/* 8. Окно подтверждения в стиле приложения (вместо системного confirm).
   LGDialog.confirm({ title, text, ok, cancel, danger, icon }) → Promise<true | false> */
window.LGDialog = (function () {
  'use strict';
  const ICONS = {
    exit: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>',
    info: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v5M12 7.5h.01"/></svg>'
  };
  function confirm(o = {}) {
    return new Promise(resolve => {
      const ov = document.createElement('div');
      ov.className = 'modal-overlay lg-alert-overlay lg-dialog';
      ov.innerHTML = `<div class="modal-content lg-alert" role="alertdialog" aria-modal="true">
        <div class="lg-alert-ico ${o.danger ? 'danger' : ''}">${ICONS[o.icon] || ICONS.info}</div>
        <h2 class="modal-title"></h2>
        ${o.text ? '<p class="lg-alert-text"></p>' : ''}
        <div class="lg-alert-actions">
          <button type="button" class="btn btn-secondary" data-r="0"></button>
          <button type="button" class="btn btn-primary ${o.danger ? 'btn-danger' : ''}" data-r="1"></button>
        </div></div>`;
      ov.querySelector('.modal-title').textContent = o.title || 'Вы уверены?';
      if (o.text) ov.querySelector('.lg-alert-text').textContent = o.text;
      ov.querySelector('[data-r="0"]').textContent = o.cancel || 'Отмена';
      ov.querySelector('[data-r="1"]').textContent = o.ok || 'OK';
      const prevFocus = document.activeElement;
      const done = r => {
        document.removeEventListener('keydown', keys, true);
        ov.style.transition = 'opacity 0.18s ease'; ov.style.opacity = '0';
        setTimeout(() => ov.remove(), 190);
        if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
        resolve(r);
      };
      const keys = e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
      };
      ov.addEventListener('click', e => {
        if (e.target === ov) return done(false);
        const b = e.target.closest('[data-r]');
        if (b) done(b.dataset.r === '1');
      });
      document.addEventListener('keydown', keys, true);
      document.body.appendChild(ov);
      requestAnimationFrame(() => { ov.classList.add('open'); ov.querySelector('[data-r="1"]').focus({ preventScroll: true, focusVisible: false }); });
    });
  }
  return { confirm };
})();

/* 9. Окно по размеру: при входе окно подрастает, чтобы список предметов был виден целиком
   (только в приложении для ПК; только увеличиваем и не больше экрана) */
(function () {
  'use strict';
  if (!window.electronAPI || !window.electronAPI.fitHeight) return;
  let until = 0, t = 0;
  function check() {
    const app = document.getElementById('mainApp'), list = document.getElementById('subjectsList');
    if (!app || !list || !app.classList.contains('active')) return;
    if (window.matchMedia && matchMedia('(max-width: 760px)').matches) return;
    const need = list.scrollHeight - list.clientHeight;
    if (need > 4) window.electronAPI.fitHeight(Math.ceil(need + 8));
  }
  const later = () => { clearTimeout(t); t = setTimeout(check, 400); };
  function start() {
    const app = document.getElementById('mainApp'), list = document.getElementById('subjectsList');
    if (!app || !list) return;
    let was = app.classList.contains('active');
    new MutationObserver(() => {
      const on = app.classList.contains('active');
      if (on && !was) { until = performance.now() + 20000; later(); }
      was = on;
    }).observe(app, { attributes: true, attributeFilter: ['class'] });
    // Расписание могло прийти с сервера чуть позже — проверяем ещё раз в первые секунды
    new MutationObserver(() => { if (performance.now() < until) later(); }).observe(list, { childList: true });
    if (was) { until = performance.now() + 20000; later(); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

/* Меню действий с парой: стеклянная панель у кнопки «⋯».
   Пункты: важный предмет, изменить, удалить (домашнее задание — своя кнопка в строке).
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
    openMenu(btn, [
      { icon: I.flag(imp), label: imp ? 'Убрать из важных' : 'Важный предмет', cls: imp ? 'is-on' : '', run: () => toggleSubjectPriority(subj) },
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


/* 10. Барабан, как в iOS. Своя физика, без прокрутки браузера: поэтому он не дёргается.
   • Строки лежат на цилиндре: дальние повёрнуты и бледнее.
   • Посередине — стеклянная полоса-линза: строка под ней крупнее и жирнее (увеличение),
     а на её краях строки «ломаются», как в толстом стекле. При быстром вращении линза чуть
     вытягивается и по ней пробегает блик.
   • Колёсико: щелчок — строка. Мышью и пальцем — тянуть и бросать (докатывается по инерции).
     Щелчок по строке — она приезжает в линзу. Стрелки ↑↓ на клавиатуре.
   • loop: true — бесконечный барабан (после 59 снова 00).
   LGWheel.create({ count, label(i), value, loop, band, onSettle(i) }) → { el, set(i, animate), get(), refresh() } */
window.LGWheel = (function () {
  'use strict';
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ROW = 40, VIS = 5;
  const K = 190;                                   // жёсткость пружины доводки: быстро, мягко, без перелёта
  const mod = (a, n) => ((a % n) + n) % n;

  function create(o) {
    const st = { n: o.count || 0, pos: o.value || 0, vel: 0, target: o.value || 0, mode: 'idle', raf: 0, last: 0, drag: null, acc: 0, settled: o.value || 0 };
    const el = document.createElement('div');
    el.className = 'lg-wh' + (o.className ? ' ' + o.className : '');
    el.tabIndex = 0;
    el.setAttribute('role', 'listbox');
    if (o.ariaLabel) el.setAttribute('aria-label', o.ariaLabel);
    el.setAttribute('data-own-scroll', '');
    el.innerHTML = (o.band === false ? '' : '<div class="lg-wh-band" aria-hidden="true"><i></i></div>') +
      '<div class="lg-wh-base"></div><div class="lg-wh-mag" aria-hidden="true"><div class="lg-wh-magtrack"></div></div>';
    const base = el.querySelector('.lg-wh-base'), mag = el.querySelector('.lg-wh-magtrack');
    const band = () => el.querySelector('.lg-wh-band') || (el.parentElement && el.parentElement.querySelector(':scope > .lg-wh-band'));
    const R = ROW * VIS / Math.PI * 1.02;            // радиус цилиндра
    const pool = (box, k) => { const a = []; for (let i = 0; i < k; i++) { const r = document.createElement('div'); r.className = 'lg-wh-row'; box.appendChild(r); a.push(r); } return a; };
    const rowsB = pool(base, VIS + 4), rowsM = pool(mag, 3);
    const label = i => (o.label ? o.label(i) : String(i));
    const norm = i => (o.loop ? mod(i, st.n) : i);
    const valid = i => o.loop ? st.n > 0 : (i >= 0 && i < st.n);

    function fill(r, i) {
      if (r.__i === i && r.__n === st.n) return;
      r.__i = i; r.__n = st.n;
      if (!valid(i)) { r.innerHTML = ''; r.style.visibility = 'hidden'; return; }
      r.style.visibility = '';
      r.innerHTML = label(norm(i));
      r.dataset.i = i;
    }
    // Положение «на экране» с резиновым краем у небесконечного барабана
    const shown = () => {
      if (o.loop || !st.n) return st.pos;
      const lo = 0, hi = st.n - 1;
      const rub = x => x / (1 + x * 1.6) * 0.8;     // тянется всё туже, не дальше полстроки
      if (st.pos < lo) return lo - rub(lo - st.pos);
      if (st.pos > hi) return hi + rub(st.pos - hi);
      return st.pos;
    };
    function paint() {
      const p = shown(), c = Math.round(p);
      rowsB.forEach((r, k) => {
        const i = c + k - Math.floor(rowsB.length / 2);
        fill(r, i);
        const th = (i - p) * ROW / R;
        if (Math.abs(th) > 1.45) { r.style.opacity = '0'; r.style.visibility = 'hidden'; return; }
        if (valid(i)) r.style.visibility = '';
        r.style.opacity = Math.pow(Math.cos(th), 1.6).toFixed(3);
        r.style.transform = `translate3d(0, ${(R * Math.sin(th)).toFixed(2)}px, 0) rotateX(${(-th * 57.3).toFixed(2)}deg)`;
      });
      rowsM.forEach((r, k) => {
        const i = c + k - 1;
        fill(r, i);
        r.style.transform = `translate3d(0, ${((i - p) * ROW).toFixed(2)}px, 0)`;
      });
      // Линза: вытягивается по скорости, блик бежит по ходу вращения
      const b = band();
      if (b) {
        const v = Math.max(-18, Math.min(18, st.vel));
        b.style.setProperty('--wv', v.toFixed(3));
        b.style.setProperty('--wa', Math.min(1, Math.abs(v) / 8).toFixed(3));
      }
    }

    function loop(now) {
      st.raf = 0;
      const dt = Math.min(0.034, st.last ? (now - st.last) / 1000 : 0.016); st.last = now;
      if (st.mode === 'spring') {
        // Критически затухающая пружина: подъезжает к строке плавно, не перелетая
        const steps = 2, h = dt / steps;
        for (let s = 0; s < steps; s++) {
          const a = -K * (st.pos - st.target) - 2 * Math.sqrt(K) * st.vel;
          st.vel += a * h; st.pos += st.vel * h;
        }
        if (Math.abs(st.pos - st.target) < 0.0015 && Math.abs(st.vel) < 0.02) {
          st.pos = st.target; st.vel = 0; st.mode = 'idle';
          paint(); settle(); st.last = 0; return;
        }
      }
      paint();
      if (st.mode !== 'idle' || Math.abs(st.vel) > 0.01) st.raf = requestAnimationFrame(loop);
      else st.last = 0;
    }
    const kick = () => { if (!st.raf) { st.last = 0; st.raf = requestAnimationFrame(loop); } };
    function to(t, fromVel) {
      if (!o.loop) t = Math.max(0, Math.min(st.n - 1, t));
      st.target = t;
      if (fromVel !== undefined) st.vel = fromVel;
      if (reduce) { st.pos = t; st.vel = 0; st.mode = 'idle'; paint(); settle(); return; }
      st.mode = 'spring'; kick();
    }
    function settle() {
      const i = norm(Math.round(st.pos));
      if (o.loop) { st.pos = st.target = i; }        // держим число небольшим
      const b = band(); if (b) { b.style.setProperty('--wv', '0'); b.style.setProperty('--wa', '0'); }
      el.setAttribute('aria-valuenow', i);
      if (i !== st.settled) { st.settled = i; if (o.onSettle) o.onSettle(i); }
    }

    // Колёсико мыши и тачпад
    el.addEventListener('wheel', e => {
      if (e.ctrlKey) return;
      e.preventDefault(); e.stopPropagation();
      const d = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
      let k = 0;
      if (Math.abs(d) >= 40) { k = Math.sign(d); st.acc = 0; }                 // щелчок колеса — ровно одна строка
      else { st.acc += d; if (Math.abs(st.acc) >= 36) { k = Math.sign(st.acc); st.acc = 0; } }   // тачпад: мелкие шаги копятся
      if (!k) return;
      to((st.mode === 'spring' ? st.target : Math.round(st.pos)) + k);
    }, { passive: false });

    // Перетаскивание и бросок
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      st.drag = { y0: e.clientY, p0: st.pos, id: e.pointerId, moved: false, samples: [[performance.now(), e.clientY]] };
      st.mode = 'drag'; st.vel = 0;
      el.classList.add('is-drag');
    });
    el.addEventListener('pointermove', e => {
      const d = st.drag;
      if (!d || d.id !== e.pointerId) return;
      const dy = e.clientY - d.y0;
      if (!d.moved && Math.abs(dy) < 3) return;
      d.moved = true;
      st.pos = d.p0 - dy / ROW;
      const now = performance.now();
      d.samples.push([now, e.clientY]);
      while (d.samples.length > 2 && now - d.samples[0][0] > 90) d.samples.shift();
      const [t0, y0] = d.samples[0];
      st.vel = now > t0 ? -((e.clientY - y0) / ROW) / ((now - t0) / 1000) : 0;
      kick();
    });
    const up = e => {
      const d = st.drag;
      if (!d || d.id !== e.pointerId) return;
      st.drag = null;
      el.classList.remove('is-drag');
      if (d.moved) {
        // Бросок: докатываемся по инерции, как в iOS (замедление ~0,3 с). Если палец замер перед отпусканием — без броска
        const lastT = d.samples[d.samples.length - 1][0];
        const v = (performance.now() - lastT > 60 || Math.abs(st.vel) < 0.6) ? 0 : st.vel;
        to(Math.round(st.pos + v * 0.28), v);
      } else {
        // Щелчок по строке: она приезжает в линзу
        const r = document.elementFromPoint(e.clientX, e.clientY);
        const row = r && r.closest && r.closest('.lg-wh-row');
        if (row && row.dataset.i !== undefined && el.contains(row)) to(Number(row.dataset.i));
        else to(Math.round(st.pos));
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('keydown', e => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      to((st.mode === 'spring' ? st.target : Math.round(st.pos)) + (e.key === 'ArrowDown' ? 1 : -1));
    });

    const api = {
      el,
      get: () => norm(Math.round(st.target)),
      set(i, animate) {
        if (!st.n) return;
        i = Math.max(0, Math.min(st.n - 1, i));
        st.settled = i;
        if (animate && el.offsetParent && !reduce) {
          let t = i;
          if (o.loop) { const c = Math.round(st.pos); t = c + ((mod(i - c, st.n) + st.n / 2) % st.n) - st.n / 2; }  // кратчайший путь по кругу
          st.target = t; st.mode = 'spring'; kick();
        } else { cancelAnimationFrame(st.raf); st.raf = 0; st.pos = st.target = i; st.vel = 0; st.mode = 'idle'; paint(); }
      },
      refresh(count) { if (count !== undefined) st.n = count; rowsB.concat(rowsM).forEach(r => { r.__i = null; }); paint(); }
    };
    paint();
    return api;
  }

  // Выпадающий список приложения (номер пары) → барабан. Сам список остаётся скрытым источником данных:
  // выбор в барабане «нажимает» нужный пункт, поэтому логика app.js не меняется.
  function fromSelect(box) {
    if (box.__wheel) return box.__wheel;
    const list = box.querySelector('.select-options');
    if (!list) return null;
    const opts = () => [...list.querySelectorAll('.select-option')];
    const selIdx = () => opts().findIndex(x => x.classList.contains('selected'));
    let own = false;
    const w = create({
      count: opts().length, value: Math.max(0, selIdx()), ariaLabel: 'Номер пары', className: 'lg-wh-wide',
      label: i => { const x = opts()[i]; return x ? x.innerHTML : ''; },
      onSettle: i => { const x = opts()[i]; if (x && !x.classList.contains('selected')) { own = true; x.click(); own = false; } }
    });
    box.appendChild(w.el);
    box.__wheel = w;
    new MutationObserver(m => {
      if (own) return;
      const rebuilt = m.some(r => r.type === 'childList');
      if (rebuilt) w.refresh(opts().length);
      const i = selIdx();
      if (i >= 0 && i !== w.get()) w.set(i, !rebuilt && !!w.el.offsetParent);
    }).observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    return w;
  }

  function start() { document.querySelectorAll('.custom-select.lg-wheel').forEach(fromSelect); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  return { create, fromSelect };
})();

/* 11. «Время пар»: время выбирается барабанами «часы : минуты», как в будильнике iPhone.
   Барабаны бесконечные. Значение в поле меняется сразу, «Готово» закрывает барабан,
   а галочка вверху окна сохраняет всё время пар. */
(function () {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  let pop = null, field = null;

  function close() {
    if (!pop) return;
    const p = pop; pop = null;
    if (field) field.classList.remove('is-editing');
    field = null;
    p.classList.remove('open');
    setTimeout(() => p.remove(), 200);
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', keys, true);
  }
  const outside = e => { if (pop && !pop.contains(e.target) && e.target !== field) close(); };
  const keys = e => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(); } };

  function open(input) {
    if (field === input) { close(); return; }
    close();
    field = input;
    input.classList.add('is-editing');
    const m = String(input.value || '').match(/(\d{1,2})\D+(\d{1,2})/);
    let h = m ? Math.min(23, +m[1]) : 8, mi = m ? Math.min(59, +m[2]) : 0;
    const set = () => { input.value = `${pad(h)}:${pad(mi)}`; };
    pop = document.createElement('div');
    pop.className = 'lg-timepick lg-glass';
    pop.innerHTML = '<div class="lg-tp-wheels"><div class="lg-wh-band" aria-hidden="true"><i></i></div><span class="lg-tp-sep">:</span></div>' +
      '<button type="button" class="lg-tp-done">Готово</button>';
    const wheels = pop.firstChild, sep = wheels.querySelector('.lg-tp-sep');
    const H = LGWheel.create({ count: 24, value: h, loop: true, band: false, ariaLabel: 'Часы', label: pad, onSettle: v => { h = v; set(); } });
    const M = LGWheel.create({ count: 60, value: mi, loop: true, band: false, ariaLabel: 'Минуты', label: pad, onSettle: v => { mi = v; set(); } });
    wheels.insertBefore(H.el, sep);
    wheels.appendChild(M.el);
    pop.querySelector('.lg-tp-done').addEventListener('click', close);
    document.body.appendChild(pop);
    H.refresh(); M.refresh();
    // Под полем (или над ним, если внизу нет места)
    const r = input.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    const below = r.bottom + 8 + ph < innerHeight - 8;
    pop.style.left = Math.max(8, Math.min(innerWidth - pw - 8, r.left + r.width / 2 - pw / 2)) + 'px';
    pop.style.top = (below ? r.bottom + 8 : Math.max(8, r.top - 8 - ph)) + 'px';
    pop.style.transformOrigin = `50% ${below ? 0 : ph}px`;
    requestAnimationFrame(() => { if (pop) { pop.classList.add('open'); H.el.focus({ preventScroll: true }); } });
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', keys, true);
  }

  function prep(root) {
    root.querySelectorAll('.bell-grid-row .input-field').forEach(inp => {
      if (inp.__tp) return;
      inp.__tp = true;
      inp.readOnly = true;
      inp.setAttribute('inputmode', 'none');
      inp.classList.add('lg-time-btn');
      inp.setAttribute('role', 'button');
      inp.addEventListener('click', () => open(inp));
      inp.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(inp); } });
    });
  }
  function start() {
    const box = document.getElementById('bellListContainer');
    if (!box) return;
    new MutationObserver(() => prep(box)).observe(box, { childList: true });
    const bd = document.getElementById('bellBackdrop');
    if (bd) new MutationObserver(() => { if (!bd.classList.contains('open')) close(); }).observe(bd, { attributes: true, attributeFilter: ['class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

/* 12. Мелочи: точка типа в окне пары, подсветка шпаргалки цветов, перелистывание календаря */
(function () {
  'use strict';
  const kindOf = v => /^лаб/i.test(v) ? 'lab' : /^(практ|сем)/i.test(v) ? 'practice' : /^лек/i.test(v) ? 'lecture' : 'other';
  function start() {
    // Окно пары: цветная точка рядом с названием сразу показывает выбранный тип
    const typeBox = document.getElementById('customTypeSelect'), dot = document.getElementById('pairKindDot');
    if (typeBox && dot) {
      const upd = () => { const s = typeBox.querySelector('.select-option.selected'); if (s) { dot.dataset.kind = kindOf(s.dataset.value); dot.dataset.tip = s.dataset.value; } };
      new MutationObserver(upd).observe(typeBox, { subtree: true, attributes: true, attributeFilter: ['class'] });
      upd();
    }
    // Включили «Точку» в настройках — после закрытия окна шпаргалка цветов коротко подсвечивается
    const setup = document.getElementById('setupBackdrop'), legend = document.querySelector('.lg-legend');
    if (setup && legend) {
      let was = document.body.classList.contains('type-dot'), pending = false;
      new MutationObserver(() => {
        const on = document.body.classList.contains('type-dot');
        if (on && !was && setup.classList.contains('open')) pending = true;
        if (!on) pending = false;
        was = on;
      }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
      new MutationObserver(() => {
        if (setup.classList.contains('open') || !pending) return;
        pending = false;
        if (!document.body.classList.contains('type-dot')) return;
        legend.classList.remove('lg-hi'); void legend.offsetWidth; legend.classList.add('lg-hi');
        setTimeout(() => legend.classList.remove('lg-hi'), 2800);
      }).observe(setup, { attributes: true, attributeFilter: ['class'] });
    }
    // Календарь целиком в поле зрения: окно настроек само подкручивается, если он открылся у нижнего края
    const dp = document.getElementById('customDatePicker'), cal = document.getElementById('calendarPopup');
    if (dp && cal) new MutationObserver(() => {
      if (!dp.classList.contains('open')) return;
      requestAnimationFrame(() => {
        const sc = cal.closest('.modal-scroll');
        if (!sc) return;
        const d = cal.getBoundingClientRect().bottom + 14 - sc.getBoundingClientRect().bottom;
        if (d > 0) sc.scrollTo({ top: sc.scrollTop + d, behavior: 'smooth' });
      });
    }).observe(dp, { attributes: true, attributeFilter: ['class'] });
    // Календарь: месяц въезжает с той стороны, куда листают
    if (typeof window.changeCalMonth === 'function' && !window.changeCalMonth.__lg) {
      const orig = window.changeCalMonth;
      const wrapped = function (diff, e) {
        orig(diff, e);
        if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        ['calGridDays', 'calMonthLabel'].forEach((id, k) => {
          const el = document.getElementById(id);
          if (el && el.animate) el.animate(
            [{ opacity: 0, transform: `translate3d(${diff * (k ? 14 : 28)}px, 0, 0)` }, { opacity: 1, transform: 'none' }],
            { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
        });
      };
      wrapped.__lg = true;
      window.changeCalMonth = wrapped;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
