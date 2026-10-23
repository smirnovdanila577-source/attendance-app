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
  function mapCanvas(w, h, r, bez) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });   // холст в памяти, без обмена с видеокартой — кодируется быстро
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
    return c;
  }
  const remember = (key, url) => { if (maps.size > 40) maps.delete(maps.keys().next().value); maps.set(key, url); };
  // Сразу (нужно для капли переключателей, которая появляется под пальцем)
  function mapFor(w, h, r, bez) {
    const key = w + 'x' + h + 'r' + r + 'b' + bez;
    if (maps.has(key)) return maps.get(key);
    const url = mapCanvas(w, h, r, bez).toDataURL();
    remember(key, url);
    return url;
  }
  // Для окон и меню — уменьшенная карта (до 160 точек по длинной стороне): она плавная, браузер сам растягивает её
  // до размера элемента, а кодируется за доли миллисекунды. Именно картинка-строка (data:), а не blob: —
  // ссылку blob: размытие фона не подхватывает, и преломление молча пропадало
  function mapLater(w, h, r, bez) {
    const key = 's' + w + 'x' + h + 'r' + r + 'b' + bez;
    if (maps.has(key)) return maps.get(key);
    const k = Math.max(1, Math.max(w, h) / 160);
    const url = mapCanvas(Math.max(2, Math.round(w / k)), Math.max(2, Math.round(h / k)), r / k, Math.max(2, bez / k)).toDataURL();
    remember(key, url);
    return url;
  }
  window.LGLensMap = mapLater;

  function apply(el) {
    if (!el.isConnected) return;
    // окно или меню сейчас вытекает из кнопки — преломление не видно, строим его, когда капля встала
    const host = el.closest('.lg-morph');
    if (host) {
      // как только встала — сразу, в тот же кадр (жидкая капля к этому моменту уже несёт то же преломление)
      if (!el.__lgLensWait) { el.__lgLensWait = true; host.addEventListener('lg-morph-end', () => { el.__lgLensWait = false; const s0 = state.get(el); if (s0) s0.key = ''; apply(el); }, { once: true }); }
      return;
    }
    const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
    if (w < 8 || h < 8) return;
    const r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2);
    const bez = Number(el.dataset.lensBez) || Math.max(6, Math.min(18, Math.round(Math.min(w, h) * 0.34)));
    const scale = Math.round(bez * (Number(el.dataset.lens) || 1.5));
    const key = [w, h, r, bez, scale].join('|');
    let st = state.get(el);
    if (st && st.key === key) return;
    const map = mapLater(w, h, Math.round(r), bez);
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
    f.innerHTML = `<feImage href="${map}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>` +
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
  const itemOf = (c, t) => { while (t && t.parentElement !== c) t = t.parentElement; return t && !t.classList.contains('lg-knob') && !t.classList.contains('lg-lens-gl') ? t : null; };
  const items = c => [...c.children].filter(x => !x.classList.contains('lg-knob') && !x.classList.contains('lg-lens-gl'));
  const isBar = c => c.classList.contains('lg-tabbar-inner');   // нижний бар на телефоне: капля под пальцем — линза, как в Телеграме
  /* ---- Нижний бар: линза с настоящим преломлением (WebGL). Вкладки рисуются в текстуру синим; шейдер в форме
     линзы чуть увеличивает их, а у края берёт картинку из-за края (изгиб толстого стекла) — с разным сдвигом для
     красного, зелёного и синего, отсюда цветная кайма. Настоящие вкладки под линзой вырезаются, чтобы не двоились.
     Работает и в Safari на iPhone. Нет WebGL — остаётся прозрачная линза с синей копией вкладок ---- */
  const BarGL = (function () {
    const P = 26;                                   // холст шире бара: раздутая линза выходит за его край
    const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
    // Как стекло в Телеграме: середина линзы — ровное прозрачное стекло без увеличения; у края картинка
    // берётся ближе к середине — растягивается и смазывается к кромке, с разным сдвигом для R, G и B (радужная кайма).
    // Где взгляд через край уходит за пределы бара — видна страница (тёмные «брови» сверху и снизу),
    // где линза вылезла за бар, а взгляд попадает в бар — виден бар
    const FS = [
      'precision mediump float;',
      'uniform sampler2D t;uniform vec2 res;uniform vec2 c;uniform vec2 hs;uniform float r;uniform vec2 bez;uniform vec2 str;uniform float dpr;',
      'uniform vec2 bc;uniform vec2 bhs;uniform vec3 pc;uniform vec3 bcl;uniform float ch;',
      'float sd(vec2 p){vec2 q=abs(p)-hs+vec2(r);return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}',
      'float sdb(vec2 p){vec2 q=abs(p-bc)-bhs+vec2(bhs.y);return length(max(q,0.))+min(max(q.x,q.y),0.)-bhs.y;}',
      'void main(){',
      '  vec2 sz=res/dpr; vec2 p=vec2(gl_FragCoord.x,res.y-gl_FragCoord.y)/dpr; vec2 lp=p-c; float d=sd(lp);',
      '  if(d>1.){gl_FragColor=vec4(0.);return;}',
      '  vec2 g=vec2(sd(lp+vec2(.5,0.))-sd(lp-vec2(.5,0.)),sd(lp+vec2(0.,.5))-sd(lp-vec2(0.,.5)));',
      '  g=g/max(length(g),1e-4);',
      // по бокам край широкий и сильный (там смазывается картинка), сверху и снизу — узкий и слабый
      '  float ax=g.x*g.x; float bz=mix(bez.y,bez.x,ax); float sr=mix(str.y,str.x,ax);',
      '  float k=clamp(1.+d/bz,0.,1.); k=k*k;',
      '  vec2 o=-g*k*sr;',
      '  vec2 s1=p+o, s2=p+o*(1.+.2*ch), s3=p+o*(1.+.42*ch);',
      '  vec4 cr=texture2D(t,s1/sz); vec4 cg=texture2D(t,s2/sz); vec4 cb=texture2D(t,s3/sz);',
      '  vec3 ta=vec3(cr.a,cg.a,cb.a), tc=vec3(cr.r,cg.g,cb.b);',
      // что видно сквозь стекло: бар или страница (по каждому цвету отдельно — отсюда радужные края «бровей»)
      '  float inO=clamp(.5-sdb(p),0.,1.);',
      '  vec3 inS=vec3(clamp(.5-sdb(s1),0.,1.),clamp(.5-sdb(s2),0.,1.),clamp(.5-sdb(s3),0.,1.));',
      '  vec3 under=mix(pc,bcl,inO);',
      '  vec3 wP=(1.-inS)*inO, wB=inS*(1.-inO);',
      '  vec3 bgf=pc*wP+bcl*wB+under*(1.-wP-wB);',
      // у края стекло перерисовывает фон целиком (иначе «пустые» цвета давали чёрные пятна), в середине — прозрачно
      '  float af=max(clamp(k*4.,0.,1.),max(max(wP.r+wB.r,wP.g+wB.g),wP.b+wB.b));',
      '  vec3 fc=tc+(1.-ta)*af*bgf; float fa=max(max(ta.r,ta.g),ta.b); fa=fa+(1.-fa)*af;',
      '  gl_FragColor=vec4(fc,fa)*clamp(.5-d,0.,1.);',
      '}'].join('\n');
    function sh(gl, type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
    function attach(c, st) {
      try {
        const cv = document.createElement('canvas');
        cv.className = 'lg-lens-gl'; cv.setAttribute('aria-hidden', 'true');
        const gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: false });
        if (!gl) return false;
        const vs = sh(gl, gl.VERTEX_SHADER, VS), fs = sh(gl, gl.FRAGMENT_SHADER, FS);
        if (!vs || !fs) return false;
        const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
        gl.useProgram(prog);
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
        const a = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
        const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
        [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(w => gl.texParameteri(gl.TEXTURE_2D, w, gl.CLAMP_TO_EDGE));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        const U = {}; ['t', 'res', 'c', 'hs', 'r', 'bez', 'str', 'dpr', 'bc', 'bhs', 'pc', 'bcl', 'ch'].forEach(n => { U[n] = gl.getUniformLocation(prog, n); });
        st.gl = { cv, gl, prog, tex, U, src: document.createElement('canvas'), ready: false, seq: 0 };
        c.appendChild(cv);
        return true;
      } catch (e) { return false; }
    }
    // текстура: вкладки синим, в тех же местах, что настоящие (в координатах холста)
    function paint(c, st) {
      const G = st.gl; if (!G) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1), W = c.clientWidth + 2 * P, H = c.clientHeight + 2 * P;
      // ничего не поменялось (размер, цвета, вкладки) — картинка вкладок уже в видеокарте, перерисовывать незачем:
      // так линза появляется под пальцем сразу, без задержки на первом кадре
      const cs0 = getComputedStyle(c), dark = document.body.classList.contains('dark-theme');
      const key = [W, H, dpr, cs0.getPropertyValue('--tint').trim(), cs0.backgroundColor, getComputedStyle(document.body).backgroundColor, dark,
        ...items(c).map(it => it.offsetLeft + ':' + it.offsetTop + ':' + it.offsetWidth + ':' + it.textContent.trim())].join('|');
      if (G.ready && G.key === key) return;
      G.key = key;
      G.dpr = dpr;
      [G.cv, G.src].forEach(x => { x.width = Math.round(W * dpr); x.height = Math.round(H * dpr); });
      G.cv.style.width = W + 'px'; G.cv.style.height = H + 'px'; G.cv.style.left = -P + 'px'; G.cv.style.top = -P + 'px';
      const ctx = G.src.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const tint = getComputedStyle(c).getPropertyValue('--tint').trim() || '#007aff';
      const cr = c.getBoundingClientRect(), sc = (cr.width / c.offsetWidth) || 1;   // бар мог быть «набухшим» от нажатия
      const pos = r => ({ x: (r.left - cr.left) / sc + P, y: (r.top - cr.top) / sc + P, w: r.width / sc, h: r.height / sc });
      const my = ++G.seq; let wait = 0;
      G.bar = { x: c.clientWidth / 2 + P, y: c.clientHeight / 2 + P, hw: c.clientWidth / 2, hh: c.clientHeight / 2 };
      // цвет страницы за баром и как выглядит сам бар (его стекло поверх страницы)
      const num = x => (String(x).match(/[\d.]+/g) || []).map(Number);
      const pg = num(getComputedStyle(document.body).backgroundColor), bb = num(getComputedStyle(c).backgroundColor);
      const P3 = pg.length >= 3 && (pg[3] === undefined || pg[3] > 0) ? pg.slice(0, 3).map(v => v / 255) : (document.body.classList.contains('dark-theme') ? [0.04, 0.04, 0.05] : [0.96, 0.96, 0.97]);
      const ba = bb.length > 3 ? bb[3] : 1;
      G.bcl = bb.length >= 3 ? bb.slice(0, 3).map((v, n) => v / 255 * ba + P3[n] * (1 - ba)) : P3;
      // тёмная тема: «брови» у края линзы — почти цвет самого бара, а не чёрный фон страницы (иначе по краям чёрные ореолы)
      G.pc = document.body.classList.contains('dark-theme') ? P3.map((v, n) => v + (G.bcl[n] - v) * 0.85) : P3;
      const upload = () => {
        if (G.seq !== my) return;
        const gl = G.gl; gl.bindTexture(gl.TEXTURE_2D, G.tex);
        try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, G.src); }
        catch (e) { fail(c, st); return; }   // браузер не дал взять картинку — прозрачная линза с синей копией
        G.ready = true;
        if (st.lensOn) frame(c, st);
      };
      items(c).forEach(it => {
        const lab = it.querySelector('span'), svg = it.querySelector('svg');
        if (lab) {
          const q = getComputedStyle(lab), b = pos(lab.getBoundingClientRect());
          ctx.font = `${q.fontWeight} ${q.fontSize} ${q.fontFamily}`; ctx.fillStyle = tint; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(lab.textContent, b.x + b.w / 2, b.y + b.h / 2 + 0.5);
        }
        if (svg) {
          const b = pos(svg.getBoundingClientRect()), k = svg.cloneNode(true);
          k.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); k.setAttribute('width', b.w); k.setAttribute('height', b.h);
          k.setAttribute('color', tint); k.style.color = tint;
          const img = new Image(); wait++;
          img.onload = () => { if (G.seq === my) ctx.drawImage(img, b.x, b.y, b.w, b.h); if (--wait === 0) upload(); };
          img.onerror = () => { if (--wait === 0) upload(); };
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(k));
        }
      });
      if (!wait) upload();
    }
    const f2 = v => v.toFixed(2);
    const rr = (x, y, w, h, r) => `M${f2(x + r)} ${f2(y)}H${f2(x + w - r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x + w)} ${f2(y + r)}V${f2(y + h - r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x + w - r)} ${f2(y + h)}H${f2(x + r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x)} ${f2(y + h - r)}V${f2(y + r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x + r)} ${f2(y)}Z`;
    function frame(c, st) {
      const G = st.gl; if (!G || !G.ready || !st.lensOn) return;
      const sx = st.lsx || 1, sy = st.lsy || 1;
      const hw = st.w / 2 * sx, hh = st.h / 2 * sy, rad = Math.min(hw, hh), cx = st.x + st.w / 2, cy = st.y + st.h / 2;
      const gl = G.gl, U = G.U;
      gl.viewport(0, 0, G.cv.width, G.cv.height); gl.useProgram(G.prog);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.tex); gl.uniform1i(U.t, 0);
      gl.uniform2f(U.res, G.cv.width, G.cv.height); gl.uniform2f(U.c, cx + P, cy + P); gl.uniform2f(U.hs, hw, hh);
      gl.uniform1f(U.r, rad); gl.uniform2f(U.bez, rad * 0.85, rad * 0.3); gl.uniform2f(U.str, rad * 0.5, rad * 0.12); gl.uniform1f(U.dpr, G.dpr || 1);
      const B = G.bar; gl.uniform2f(U.bc, B.x, B.y); gl.uniform2f(U.bhs, B.hw, B.hh);
      gl.uniform3f(U.pc, G.pc[0], G.pc[1], G.pc[2]); gl.uniform3f(U.bcl, G.bcl[0], G.bcl[1], G.bcl[2]);
      gl.uniform1f(U.ch, document.body.classList.contains('dark-theme') ? 1 : 0.45);   // на светлом радуга тише, иначе розовеет
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 6);
      // настоящие вкладки под линзой вырезаем: их видно только через линзу
      items(c).forEach(it => {
        const ox = it.offsetLeft, oy = it.offsetTop;
        it.style.clipPath = it.style.webkitClipPath = `path(evenodd, "M0 0H${it.offsetWidth}V${it.offsetHeight}H0Z${rr(cx - hw - ox, cy - hh - oy, hw * 2, hh * 2, rad)}")`;
      });
    }
    function fail(c, st) {
      const G = st.gl; if (!G) return;
      G.cv.remove(); off(c, st); st.gl = null;
      st.knob.insertAdjacentHTML('beforeend', '<b class="lg-lens-core"><b class="lg-lens-mag"></b></b>');
      st.mags = [...st.knob.querySelectorAll('.lg-lens-mag')];
      magFill(c, st); draw(st);
    }
    function off(c, st) {
      const G = st.gl; if (!G) return;
      try { G.gl.clearColor(0, 0, 0, 0); G.gl.clear(G.gl.COLOR_BUFFER_BIT); } catch (e) { /* */ }
      items(c).forEach(it => { it.style.removeProperty('clip-path'); it.style.removeProperty('-webkit-clip-path'); });
    }
    return { attach, paint, frame, off };
  })();

  const geo = el => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });

  const ro = new ResizeObserver(list => list.forEach(e => {
    const c = e.target, st = c.__k;
    if (!st) { sync(c); return; }   // был скрыт при запуске (например, бар до входа) — капля появляется, как только он показался
    if (st.cw === c.offsetWidth && st.ch === c.offsetHeight) return;
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
      // нижний бар: внутри линзы — копия вкладок синим, ровно поверх настоящих. Синеет ровно то, что под линзой,
      // и цвет едет вместе с ней (половина подписи под линзой — синяя, вторая — обычная), как в Телеграме
      if (isBar(c) && !st.gl && !BarGL.attach(c, st)) {   // WebGL есть — линза с настоящим преломлением, нет — синяя копия
        st.knob.insertAdjacentHTML('beforeend', '<b class="lg-lens-core"><b class="lg-lens-mag"></b></b>');
        st.mags = [...st.knob.querySelectorAll('.lg-lens-mag')];
      }
      c.insertBefore(st.knob, c.firstChild);
      st.bar = isBar(c);
      if (st.init) draw(st);
    }
    return st;
  }

  function draw(st) {
    const sxv = Math.abs(st.vx) / 2600, syv = Math.abs(st.vy) / 2600;
    const sx = (1 + Math.min(0.24, sxv) - Math.min(0.1, syv * 0.6)) * st.p;
    let sy = (1 + Math.min(0.24, syv) - Math.min(0.12, sxv * 0.7)) * st.p;
    if (st.gl && st.p > 1) sy *= 1 + (st.p - 1) * 0.9;   // бар: линза выпирает над и под баром
    const k = st.knob.style;
    k.width = Math.max(0, st.w) + 'px';
    k.height = Math.max(0, st.h) + 'px';
    k.transform = `translate3d(${st.x.toFixed(2)}px, ${st.y.toFixed(2)}px, 0) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
    if (st.gl) { st.lsx = sx; st.lsy = sy; if (st.lensOn && st.knob.parentNode) BarGL.frame(st.knob.parentNode, st); }
    if (st.bar && window.LGTabSlide) {   // бар на телефоне: где линза между вкладками — там и страницы
      const its = items(st.knob.parentNode || document.body); 
      if (its.length > 1) { const a = its[0].offsetLeft, b = its[its.length - 1].offsetLeft; if (b > a) LGTabSlide.pos((st.x - a) / (b - a)); }
    }
    if (st.mags) {
      // копия стоит там же, где настоящие вкладки; растяжение самой капли снимаем, увеличение — своё у каждого слоя
      const ox = st.x + st.w / 2, oy = st.y + st.h / 2;
      st.mags.forEach(m => {
        m.style.transformOrigin = `${ox.toFixed(2)}px ${oy.toFixed(2)}px`;
        m.style.transform = `translate(${(-st.x).toFixed(2)}px, ${(-st.y).toFixed(2)}px) scale(${(1 / sx).toFixed(4)}, ${(1 / sy).toFixed(4)})`;
      });
    }
  }
  function magFill(c, st) {
    if (st.gl) { BarGL.paint(c, st); return; }
    if (!st.mags) return;
    st.mags.forEach(m => {
      m.style.width = c.clientWidth + 'px'; m.style.height = c.clientHeight + 'px';
      m.textContent = '';
      items(c).forEach((it, n) => {
        const k = it.cloneNode(true);
        k.removeAttribute('id'); k.removeAttribute('role'); k.removeAttribute('aria-selected'); k.setAttribute('tabindex', '-1');
        Object.assign(k.style, { left: it.offsetLeft + 'px', top: it.offsetTop + 'px', width: it.offsetWidth + 'px', height: it.offsetHeight + 'px' });
        m.appendChild(k);
      });
    });
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
      // бар: на переезде капля раздута, у цели — сдувается
      if (st.travel && isBar(c) && !st.down && Math.abs(st.tx - st.x) < 6 && st.tp !== 1) { st.tp = 1; moving = true; }
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
    if (st.bar && window.LGTabSlide && !st.down) LGTabSlide.settle();
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
    if (st.gl && st.knob.parentNode) {
      const c = st.knob.parentNode;
      if (on && !st.lensOn) { st.lensOn = true; BarGL.paint(c, st); BarGL.frame(c, st); }
      else if (!on && st.lensOn) { st.lensOn = false; BarGL.off(c, st); }
    }
    if (st.knob.parentNode) st.knob.parentNode.classList.toggle('knob-up', on);   // капля поднята — пункты видны под ней
    if (on && window.LGLens && LGLens.filter && !document.body.classList.contains('glass-lite')) st.knob.style.setProperty('--knob-lens', LGLens.filter(Math.round(st.tw || st.w), Math.round(st.th || st.h), Math.round((st.th || st.h) / 2), 0.9));
  }

  function sync(c, resize) {
    if (!c.isConnected) return;
    if (!c.offsetWidth) { if (!c.__k) ro.observe(c); return; }
    const st = ensure(c);
    const sel = c.querySelector(':scope > .selected');
    if (!sel) { st.knob.style.opacity = '0'; return; }
    st.knob.style.opacity = '';
    st.cw = c.offsetWidth; st.ch = c.offsetHeight;
    magFill(c, st);
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
    // капля уже едет и цель не поменялась (перепроверка после перестройки страницы) — не обрываем её на ходу:
    // иначе она замирала поднятой линзой, вкладки под ней оставались вырезанными и бар переставал слушаться
    if (!resize && !reduce && dist < 1 && st.raf) return;
    if (resize || reduce || dist < 1) {
      cancelAnimationFrame(st.raf); st.raf = 0;
      if (st.travel && !st.down) settle(c);   // переезд оборвали — доводим его до конца (линза опускается)
      Object.assign(st, g, { vx: 0, vy: 0, vw: 0, vh: 0 });
      draw(st);
    } else {
      // Переезд по щелчку: капля на миг становится линзой, перетекает и опускается с бликом
      if (dist > 8 && !st.down) { st.travel = true; lens(st, true); if (isBar(c)) st.tp = 1.15; }
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
        rows: new Set(items(c).map(x => x.offsetTop)).size > 1, t0: performance.now(), cx0: st.x + st.w / 2, far: 0 };
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* не страшно */ }
      lens(st, true);
      st.tp = isBar(c) ? 1.2 : 1.14; run(c);   // в баре капля раздувается больше самого бара
    });
    c.addEventListener('pointermove', e => {
      const st = c.__k, d = st && st.down;
      if (!d || d.id !== e.pointerId) return;
      d.far = Math.max(d.far, Math.hypot(e.clientX - d.x0, e.clientY - d.y0));
      if (!d.moved && d.far < 5) return;
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
        // Ближайший к капле пункт становится выбранным (капля встаёт туда, где её отпустили, без рывка вперёд)
        const cx = st.tx + st.w / 2, cy = st.ty + st.h / 2;
        let best = null, bd = Infinity;
        items(c).forEach(x => { const g = geo(x), dd = Math.hypot(g.x + g.w / 2 - cx, (g.y + g.h / 2 - cy) * 1.6); if (dd < bd) { bd = dd; best = x; } });
        if (best) {
          const g = geo(best);
          st.tx = g.x; st.ty = g.y; st.tw = g.w; st.th = g.h;
          if (!best.classList.contains('selected')) setTimeout(() => best.click(), 0);
        }
      } else {
        // Каплю взяли (подержали или чуть сдвинули), но не повели: это не нажатие — выбор не снимаем
        if (d.far >= 2 || performance.now() - d.t0 > 300) window.LGEatClick();
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
  const PRESS = '.lg-topbar .lg-glass:not(.pf-popover), .lg-tabbar-inner';   // открытые из панели окна (уведомления) не «вдавливаются»
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
  const PBLUR = '<i></i><i></i><i></i><i></i>';   // мягкая шапка: 4 слоя размытия (glass.css, .lg-pblur)
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
      host.style.setProperty('--pb-a', Math.min(1, Math.max(0, sc.scrollTop / 32)).toFixed(3));   // мягкая шапка набирает силу вместе с прокруткой
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
    /* Переход между вкладками, как в «Настройках» iOS: «Статистика» — целый экран со скруглёнными углами (без верхней
       панели с профилем: она есть только у расписания) — въезжает справа поверх экрана расписания; экран расписания
       стоит на месте и только темнеет. Оба экрана всегда свёрстаны (скрытый — прозрачный или за краем), поэтому
       переход начинается сразу, без пересчёта страницы. Положение ведёт линза бара (модуль 3): тянешь линзу — экран
       едет за пальцем с той же скоростью; отпустил или нажал на вкладку — доезжает пружиной вместе с линзой */
    const grid = app && app.querySelector('.layout-grid'), side = app && app.querySelector('.sidebar-panel');
    const slide = { t: 0, on: false, dim: null, goal: null };
    const canSlide = () => window.matchMedia && matchMedia('(max-width: 760px)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    function slideApply(t) {
      const w = innerWidth, k = Math.max(0, Math.min(1, t));
      if (side) side.style.transform = `translate3d(${(w * (1 - k)).toFixed(1)}px, 0, 0)`;
      if (slide.dim) slide.dim.style.opacity = k.toFixed(3);
    }
    function slideOn() {
      if (slide.on || !app || !canSlide()) return;
      slide.on = true;
      if (window.PairMenu) PairMenu.close(true);
      slide.dim = document.createElement('div'); slide.dim.className = 'lg-tab-dim'; slide.dim.setAttribute('aria-hidden', 'true');
      app.appendChild(slide.dim);
      app.classList.add('tab-slide');   // на время перехода верхняя панель видна: она едет вместе с экраном расписания
    }
    function slideOff() {
      if (!slide.on) return;
      slide.on = false; slide.goal = null; app.classList.remove('tab-slide');
      if (side) side.style.removeProperty('transform');
      if (slide.dim) slide.dim.remove();
      slide.dim = null;
    }
    window.LGTabSlide = {
      pos(t) {
        slide.t = t;
        // страховка: линза остановилась на вкладке, а сигнал «доехала» не пришёл — завершаем сами
        clearTimeout(slide.timer);
        slide.timer = setTimeout(() => { const bar = app && app.querySelector('.lg-tabbar-inner'); if (!bar || !bar.classList.contains('is-drag')) window.LGTabSlide.settle(); }, 400);
        const rest = app && app.dataset.tab === 'stats' ? 1 : 0;
        if (!slide.on) { if (Math.abs(t - rest) < 0.002) return; slideOn(); if (!slide.on) return; }
        slideApply(t);
      },
      settle() {
        if (!slide.on || (slide.t > 0.002 && slide.t < 0.998)) return;
        // нажали вкладку, а линза ещё не тронулась (первый кадр задержался): не откатываем выбор назад, ждём линзу
        if (slide.goal != null && Math.abs(slide.t - slide.goal) > 0.5) return;
        const want = slide.t > 0.5 ? 'stats' : 'schedule';
        if (app.dataset.tab !== want) { app.dataset.tab = want; tabs.forEach(b => { const on = b.dataset.tab === want; b.classList.toggle('selected', on); b.setAttribute('aria-selected', on); }); }
        slideOff();
      }
    };
    function setTab(t) {
      if (!app) return;
      const sc = t === 'stats' ? app.querySelector('.sidebar-panel') : ms;
      if (app.dataset.tab === t) { if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      if (!slide.on && canSlide()) { slideOn(); slideApply(app.dataset.tab === 'stats' ? 1 : 0); }   // страницы поедут вслед за линзой с первого кадра
      if (slide.on) {
        slide.goal = t === 'stats' ? 1 : 0;
        // страховка: линза так и не поехала (бар спрятан и т. п.) — доводим переход сами
        clearTimeout(slide.guard);
        slide.guard = setTimeout(() => { if (slide.on && slide.goal != null && !(app.querySelector('.lg-tabbar-inner.is-drag'))) { slide.t = slide.goal; slideApply(slide.t); window.LGTabSlide.settle(); } }, 1600);
      }
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
    { sel: '#mainScroll', host: el => el.parentElement, inset: () => mobile() ? { top: 72, bottom: 112 } : { top: 76, bottom: 30 }, x: schedX },
    { sel: '.modal-scroll:not(#bellBackdrop .modal-scroll)', host: el => el.closest('.modal-content') || el.parentElement, inset: el => ({ top: el.closest('.lg-alert') ? 14 : 72, bottom: 16 }), x: edgeX },
    { sel: '.pf-notif-list', inset: el => ({ top: headH(el) + 6, bottom: 10 }), x: edgeX },
    { sel: '.lg-wp-list', inset: () => ({ top: 36, bottom: 36 }), x: (el, hr) => hr.width - 16 },   // выбор недели: ползунок в зазоре у края колонки, не поверх строк
    { sel: '.subject-list', inset: el => ({ top: headH(el) + 6, bottom: 10 }), x: subjX, only: () => !mobile() },
    { sel: '#mainApp .sidebar-panel', host: el => el.parentElement, inset: () => ({ top: 6, bottom: 112 }), only: () => mobile() },
    { sel: '.lg-onb', inset: () => ({ top: 50, bottom: 16 }) }
  ];


  // Предметы: ползунок ровно посередине между концом строк (процент, полоска) и краем карточки
  function subjX(el, hr, er) {
    const t = el.querySelector('.subject-item .prog-track, .subject-item .subj-stat');
    if (!t) return edgeX(el, hr, er);
    const contentRight = t.getBoundingClientRect().right;
    return Math.round(((contentRight + er.right) / 2 - 6) - hr.left);   // 6 — середина ползунка внутри полосы
  }

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
    { sel: '#mainScroll', tiles: '#scheduleAnimationWrapper > .day-group, #addDayBtnContainer, .lg-legend', host: el => el.parentElement, guard: true, lag: 1 },
    { sel: '.subject-list', tiles: ':scope > .subject-item', host: el => el.parentElement, fade: [0, 26], guard: true, lag: 0.5 },
    { sel: '.pf-notif-list', tiles: ':scope > .pf-notif-item', host: el => el.parentElement, fade: [0, 30], lag: 0.5 },
    { sel: '.lg-wp-list', tiles: ':scope > .lg-wp-row', host: el => el.parentElement, lag: 0.5 },
    // «Динамика за семестр»: содержимое едет одним целым (отдельные блоки с отставанием дрожали),
    // инерция чуть длиннее, чтобы между щелчками колеса страница плыла, а не толкалась
    { sel: '#rpBody', tiles: ':scope > .rp-body', host: el => el.closest('.modal-content'), lag: 0, glide: 0.1 },
    // Листы: содержимое едет целиком, без «качания» карточек; у краёв растягивается
    { sel: '.modal-scroll:not(#bellBackdrop .modal-scroll)', tiles: ':scope > :not(.lg-bar):not(.lg-pblur)', host: el => el.closest('.modal-content'), lag: 0 }
  ];
  const STEP = 1.25;            // один щелчок колеса — чуть больше обычного шага
  const GLIDE = 0.14;           // доля оставшегося пути за кадр (60 к/с): быстро отзывается и долго «доплывает»
  const R = 140;                // предел растяжения

  function attach(el, rule) {
    if (el.__lgs) return;
    const st = el.__lgs = { target: 0, cur: 0, wrote: 0, raf: 0, lastT: 0, lastWheel: 0, over: 0, overV: 0, tiles: new Map() };
    const host = rule.host ? rule.host(el) : null;
    let scrollT = 0;
    const edges = () => {
      const max = el.scrollHeight - el.clientHeight, top = el.scrollTop;
      if (rule.fade) {
        el.style.setProperty('--ft', Math.max(0, Math.min(rule.fade[0], top)) + 'px');
        el.style.setProperty('--fb', Math.max(0, Math.min(rule.fade[1], max - top)) + 'px');
      }
      el.classList.toggle('lg-more-below', max - top > 2);
      if (host) {
        host.classList.toggle('is-scrolled', top > 2);
        host.style.setProperty('--pb-a', Math.min(1, Math.max(0, top / 32)).toFixed(3));   // мягкая шапка (.lg-pblur) проявляется плавно, вместе с прокруткой
      }
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
      // Своё точное положение (с долями пикселя): при масштабе экрана 125–150 % браузер округляет
      // scrollTop, и раньше из-за этого прокрутка то обрывалась, то «зависала», не доехав
      if (!st.raf) { st.cur = st.target = st.wrote = el.scrollTop; st.lastT = 0; }
      const dy = (e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * el.clientHeight : e.deltaY) * STEP;
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      let t = Math.min(max, Math.max(0, st.target)) + dy;
      // За край тянется, только когда список уже стоит у самого края
      if (t < 0) { if (st.cur <= 1.5) st.over = Math.max(-600, st.over + t * 0.75); t = 0; }
      else if (t > max) { if (max - st.cur <= 1.5) st.over = Math.min(600, st.over + (t - max) * 0.75); t = max; }
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
      // Прокрутили чем-то другим (ползунок, «Сегодня», клавиши) — отдаём управление
      if (Math.abs(el.scrollTop - st.wrote) > 3) st.cur = st.target = st.wrote = el.scrollTop;
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      if (st.target > max) st.target = max;
      const prev = st.cur;
      if (st.cur !== st.target) {
        let d = (st.target - st.cur) * (1 - Math.pow(1 - (rule.glide || GLIDE), f));
        if (Math.abs(st.target - st.cur) < 0.5) d = st.target - st.cur;   // доехали — встаём точно
        st.cur = Math.min(max, Math.max(0, st.cur + d));
        el.scrollTop = st.cur;
        st.wrote = el.scrollTop;
      }
      const v = (st.cur - prev) / f;
      if (now - st.lastWheel > 90) {   // колёсико отпустили — край возвращается пружиной без перелёта
        const s = dt / 1000;
        st.overV += (-160 * st.over - 2 * Math.sqrt(160) * st.overV) * s;
        st.over += st.overV * s;
        if (Math.abs(st.over) < 0.3 && Math.abs(st.overV) < 2) { st.over = 0; st.overV = 0; }
      }
      const shift = -rubber(st.over);
      // Шапка над списком (предметы, уведомления) становится стеклом и тогда, когда строки уезжают под неё растяжением
      if (host) {
        host.classList.toggle('is-scrolled', st.cur > 2 || shift < -2);
        // и размытие под ней набирает силу так же: короткий список (например, с фильтром) не прокручивается,
        // но строки всё равно заезжают под шапку растяжением — без этого они проходили под ней чёткими
        host.style.setProperty('--pb-a', Math.min(1, Math.max(0, (st.cur + Math.max(0, -shift)) / 32)).toFixed(3));
      }
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
      // кнопка, из которой открыто меню или окно (она «стала» им и прозрачна), подсказку не показывает
      const busy = () => el.style.opacity === '0' || document.querySelector('.lg-menu.open, .pf-popover.open, .lg-weekpick.open, .lg-timepick.open');
      showT = setTimeout(() => { if (cur === el && el.isConnected && !busy()) show(el); }, performance.now() < warmUntil ? 60 : 550);
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
  let menu = null, anchor = null, row = null, byKey = false;

  function close(instant) {
    if (!menu) return;
    const m = menu; menu = null;
    // пара остаётся «открытой» (кнопка «⋯» видна), пока капля не вернулась в кнопку — иначе капля втекала бы
    // в уже погасшую кнопку. Если за это время меню этой же пары открыли снова — ничего не трогаем
    const r0 = row, a0 = anchor;
    const tidy = () => {
      if (r0 && !(menu && row === r0)) r0.classList.remove('menu-open');
      if (a0 && !(menu && anchor === a0)) a0.classList.remove('active');
    };
    m.classList.remove('open');
    // убираем меню, только когда капля вернулась в кнопку (модуль 21)
    if (instant) { m.remove(); tidy(); }
    else {
      // ждём, пока капля вернётся в кнопку, но не дольше 1,2 с: иначе на телефоне кнопка могла остаться в стекле
      const t0 = performance.now();
      const rm = () => ((window.LGMorph && LGMorph.busy(m)) || (window.LGLiquid && LGLiquid.busy(m))) && performance.now() - t0 < 1200 ? setTimeout(rm, 40) : (m.remove(), tidy());
      setTimeout(rm, 180);
    }
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
    // фокус возвращаем на кнопку, только если меню открыли с клавиатуры: открыли мышью — «⋯» после закрытия гаснет
    if (e.key === 'Escape') { e.preventDefault(); const a = anchor, k = byKey; close(); if (a && k) a.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Tab') close();
  }

  // Общее стеклянное меню: items — [{ icon, label, cls, hint, checked, run } | null (разделитель)]
  function openMenu(btn, items, opts = {}) {
    if (menu && anchor === btn) { close(); return; }   // повторное нажатие закрывает
    close(true);
    const ev = window.event;
    byKey = !!ev && (ev.type === 'keydown' || (ev.type === 'click' && ev.detail === 0));   // щелчок с клавиатуры — detail 0
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
    ], Object.assign({ row: btn.closest('.pair-card'), cls: 'lg-menu-pearl' }, extra || {}));
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
      // значок «Отметить все» — цветом того, что сделает: зелёный — посетил, красный — пропуск; плюс «Добавить пару» — синий
      { icon: I.checkAll, label: allOn ? 'Отметить все пропуском' : 'Отметить все пары', cls: allOn ? 'is-red' : 'is-green', run: () => markEntireDay(day) },
      { icon: I.plus, label: 'Добавить пару', cls: 'is-blue', run: () => openModal(day) },
      null,
      { icon: I.hide, label: 'Скрыть день', run: () => hideDay(day) }
    ], { title: day, cls: 'lg-menu-pearl' });
  }

  // Сортировка списка «Предметы»
  function openSort(btn) {
    const cur = (typeof database !== 'undefined' && database.subjectSort) || 'importance';
    const set = v => { database.subjectSort = v; saveData(); renderSubjectStats(); };
    openMenu(btn, [
      { icon: I.flag(true), label: 'По важности', cls: 'sort-imp', checked: cur === 'importance', run: () => set('importance') },
      { icon: I.chart, label: 'По посещаемости', cls: 'sort-att', checked: cur === 'attendance', run: () => set('attendance') }
    ], { title: 'Сортировка', cls: 'lg-menu-compact lg-menu-pearl' });
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
    })), { title: 'Добавить день', align: 'center', cls: 'lg-menu-pearl' });
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
    { const rm = () => (window.LGMorph && LGMorph.busy(p)) ? setTimeout(rm, 40) : p.remove(); setTimeout(rm, 200); }
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

/* 13. Карточки дней заходят под капсулу недель целиком и видны сквозь стекло. Пока верх карточки
   проходит от нижнего края капсулы до её середины, верхние углы карточки плавно скругляются
   до радиуса капсулы — карточка ложится точно в её контур и не выступает за скругление. */
(function () {
  'use strict';
  function start() {
    const col = document.getElementById('mainScroll'), bar = document.querySelector('#mainApp .lg-weekbar');
    if (!col || !bar) return;
    let raf = 0, until = 0;
    const shaped = new Set();
    function frame() {
      raf = 0;
      const b = bar.getBoundingClientRect();
      const base = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--r-card')) || 16;
      const big = b.height / 2;
      const now = new Set();
      col.querySelectorAll('.day-card').forEach(c => {
        const r = c.getBoundingClientRect();
        if (r.bottom < b.top || r.top > b.bottom) return;
        // 0 — верх карточки у нижнего края капсулы, 1 — на её середине и выше
        const t = Math.max(0, Math.min(1, (b.bottom - r.top) / (b.height / 2)));
        if (t <= 0) return;
        const e = t * t * (3 - 2 * t);                       // плавное начало и конец
        const R = Math.min(base + (big - base) * e, r.height / 2);
        c.style.borderTopLeftRadius = c.style.borderTopRightRadius = R.toFixed(2) + 'px';
        now.add(c);
      });
      shaped.forEach(c => { if (!now.has(c)) { c.style.borderTopLeftRadius = c.style.borderTopRightRadius = ''; } });
      shaped.clear(); now.forEach(c => shaped.add(c));
      if (performance.now() < until) raf = requestAnimationFrame(frame);
    }
    // Карточки двигаются и после прокрутки (инерция, «резиновый» край) — следим ещё немного
    const kick = () => { until = performance.now() + 900; if (!raf) raf = requestAnimationFrame(frame); };
    col.addEventListener('scroll', kick, { passive: true });
    col.addEventListener('wheel', kick, { passive: true });
    window.addEventListener('resize', kick);
    new MutationObserver(kick).observe(col, { childList: true });
    kick();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

/* 14. Акцентный цвет: ряд цветных кружков, над выбранным — большая жидкая стеклянная капля.
   • Щелчок по цвету — капля перетекает к нему: вытягивается по ходу движения, сплющивается,
     а у цели слегка «перекатывается» и успокаивается (пружина с небольшим перелётом).
   • Каплю можно взять и тянуть: она набухает, кружки под ней увеличиваются, как под линзой,
     цвет приложения меняется на лету. Отпустили — капля сама садится на ближайший цвет.
   • Стрелки ←/→ на клавиатуре тоже работают.
   Выбранный цвет — предпросмотр; сохраняется галочкой окна настроек (app.js: saveSettings). */
window.LGAccent = (function () {
  'use strict';
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const K = 300, D = 2 * Math.sqrt(300) * 0.62;         // слабое затухание — «жидкий» перелёт
  let box, knob, dots = [], cur = 'blue';
  const st = { x: 0, v: 0, t: 0, p: 1, pv: 0, pt: 1, raf: 0, last: 0, drag: null, ready: false };

  const centers = () => dots.map(d => d.offsetLeft + d.offsetWidth / 2);
  const idxOf = name => Math.max(0, dots.findIndex(d => d.dataset.accent === name));
  const nearest = x => { const c = centers(); let b = 0; c.forEach((v, i) => { if (Math.abs(v - x) < Math.abs(c[b] - x)) b = i; }); return b; };

  function preview(i) {
    const name = dots[i] && dots[i].dataset.accent;
    if (!name || name === cur) return;
    cur = name;
    dots.forEach((d, k) => { const on = k === i; d.classList.toggle('selected', on); d.setAttribute('aria-checked', on); });
    if (typeof applyAccent === 'function') applyAccent(name);
  }

  function draw() {
    if (!st.size) { const cs = getComputedStyle(box); st.size = parseFloat(cs.getPropertyValue('--knob')) || 42; st.dot = parseFloat(cs.getPropertyValue('--dot')) || 26; }
    const size = st.size;
    const sv = Math.min(0.38, Math.abs(st.v) / 1500);
    const sx = (1 + sv) * st.p, sy = (1 - sv * 0.45) * st.p;
    // Растяжение — настоящими размерами, а не scale(): так кромки и блики не размазываются
    knob.style.width = (size * sx).toFixed(2) + 'px';
    knob.style.height = (size * sy).toFixed(2) + 'px';
    knob.style.marginLeft = (-size * sx / 2).toFixed(2) + 'px';
    knob.style.transform = `translate3d(${st.x.toFixed(2)}px, -50%, 0)`;
    // Кружки под каплей увеличиваются — эффект линзы (тоже настоящим размером, без растрового scale)
    const c = centers();
    dots.forEach((d, i) => {
      const k = Math.max(0, 1 - Math.abs(c[i] - st.x) / 30);
      d.style.setProperty('--ds', (st.dot * (1 + k * 0.28 * st.p)).toFixed(2) + 'px');
    });
    knob.style.setProperty('--hx', Math.round(50 + Math.max(-30, Math.min(30, st.v / 40))) + '%');
  }

  function loop(now) {
    st.raf = 0;
    const dt = Math.min(0.034, st.last ? (now - st.last) / 1000 : 0.016); st.last = now;
    const h = dt / 2;
    for (let i = 0; i < 2; i++) {
      if (!st.drag) { st.v += (-K * (st.x - st.t) - D * st.v) * h; st.x += st.v * h; }
      st.pv += (-380 * (st.p - st.pt) - 2 * Math.sqrt(380) * 0.55 * st.pv) * h; st.p += st.pv * h;
    }
    draw();
    const moving = st.drag || Math.abs(st.x - st.t) > 0.1 || Math.abs(st.v) > 2 || Math.abs(st.p - st.pt) > 0.002 || Math.abs(st.pv) > 0.02;
    if (moving) st.raf = requestAnimationFrame(loop);
    else { st.x = st.t; st.v = 0; st.p = st.pt; st.pv = 0; draw(); st.last = 0; knob.classList.remove('is-moving'); }
  }
  const kick = () => { knob.classList.add('is-moving'); if (!st.raf) { st.last = 0; st.raf = requestAnimationFrame(loop); } };

  function goTo(i, animate) {
    const c = centers();
    if (!c.length) return;
    i = Math.max(0, Math.min(c.length - 1, i));
    st.t = c[i];
    preview(i);
    if (!animate || reduce || !st.ready) { st.x = st.t; st.v = 0; draw(); return; }
    // Толчок: капля набухает в начале пути и опускается у цели
    st.pv += 3.2;
    kick();
  }

  function lens() {
    // Преломление SVG-линзой на маленькой капле даёт цветные ореолы по краю цветного кружка,
    // поэтому увеличение делаем масштабом самого кружка (см. draw), без displacement-фильтра
    knob.style.removeProperty('--acc-lens');
  }

  function bind() {
    box.addEventListener('click', e => {
      const d = e.target.closest('.lg-acc-dot');
      if (!d) return;
      goTo(dots.indexOf(d), true);
    });
    box.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const r = box.getBoundingClientRect();
      const x = e.clientX - r.left;
      if (Math.abs(x - st.x) > 26) return;                   // тянуть можно саму каплю
      e.preventDefault();
      box.setPointerCapture(e.pointerId);
      st.drag = { id: e.pointerId, dx: x - st.x, moved: false, lx: x, lt: performance.now() };
      st.pt = 1.16; lens(); kick();
      box.classList.add('is-drag');
    });
    box.addEventListener('pointermove', e => {
      const d = st.drag;
      if (!d || d.id !== e.pointerId) return;
      const r = box.getBoundingClientRect();
      const c = centers();
      let x = e.clientX - r.left - d.dx;
      // За крайними цветами капля тянется туго, как резина
      const lo = c[0], hi = c[c.length - 1];
      if (x < lo) x = lo - (lo - x) / (1 + (lo - x) / 24);
      if (x > hi) x = hi + (x - hi) / (1 + (x - hi) / 24);
      const now = performance.now();
      st.v = (x - d.lx) / Math.max(0.008, (now - d.lt) / 1000) * 0.5 + st.v * 0.5;
      d.lx = x; d.lt = now;
      if (Math.abs(x - st.x) > 2) d.moved = true;
      st.x = x;
      preview(nearest(x));                                   // цвет приложения меняется на лету
      kick();
    });
    const up = e => {
      const d = st.drag;
      if (!d || d.id !== e.pointerId) return;
      st.drag = null;
      box.classList.remove('is-drag');
      st.pt = 1;
      if (d.moved && window.LGEatClick) LGEatClick();
      // Бросок: учитываем скорость, затем садимся на ближайший цвет
      const i = nearest(st.x + Math.max(-60, Math.min(60, st.v * 0.08)));
      st.t = centers()[i]; preview(i);
      kick();
    };
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
    box.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      goTo(idxOf(cur) + (e.key === 'ArrowRight' ? 1 : -1), true);
      dots[idxOf(cur)].focus({ preventScroll: true });
    });
    new ResizeObserver(() => { if (!box.offsetWidth) return; const was = st.ready; st.ready = true; goTo(idxOf(cur), false); if (!was) lens(); }).observe(box);
  }

  function start() {
    box = document.getElementById('accentPicker');
    if (!box) return;
    dots = [...box.querySelectorAll('.lg-acc-dot')];
    knob = document.createElement('span');
    knob.className = 'lg-acc-knob';
    knob.setAttribute('aria-hidden', 'true');
    knob.innerHTML = '<i></i>';
    box.appendChild(knob);
    bind();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  return {
    get: () => cur,
    set(name, animate) {
      if (!box) return;
      cur = null;                                            // чтобы preview точно обновил отметки
      goTo(idxOf(name || 'blue'), !!animate);
      if (!cur) cur = name || 'blue';
    }
  };
})();

/* 15. Знакомство с приложением (первый запуск).
   • Показывается один раз на устройстве, пока пользователь не нажал «Начать» или «Войти».
   • Витрина наверху — живая сцена: пары отмечаются, кольцо заполняется, неделя загорается; повторяется.
   • Ctrl+Shift+L открывает знакомство в любой момент (для проверки), кнопка сверху возвращает назад. */
window.Onboarding = (function () {
  'use strict';
  const KEY = 'tracker.onbSeen';
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = id => document.getElementById(id);
  let prevScreen = null, loopT = 0, cntRaf = 0;

  const seen = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  const markSeen = () => { try { localStorage.setItem(KEY, '1'); } catch (e) { /* без хранилища — покажем ещё раз */ } };
  const active = () => { const s = $('landingScreen'); return !!s && s.classList.contains('active'); };
  const setAuthMode = reg => { if (typeof isRegisterMode !== 'undefined' && isRegisterMode !== reg && typeof toggleAuthMode === 'function') toggleAuthMode(); };

  // Сцена витрины: один проход ≈ 6,5 с, затем мягкий сброс и повтор, пока экран открыт
  function play() {
    clearTimeout(loopT); cancelAnimationFrame(cntRaf);
    const show = $('onbShow'), pct = $('onbPct');
    if (!show || !active()) return;
    if (reduce) { show.classList.add('play'); if (pct) pct.textContent = '82%'; return; }
    show.classList.remove('play', 'reset');
    void show.offsetWidth;
    show.classList.add('play');
    // проценты в кольце досчитывают вместе с заполнением
    const t0 = performance.now() + 1500, dur = 1300;
    const step = now => {
      const k = Math.max(0, Math.min(1, (now - t0) / dur)), e = 1 - Math.pow(1 - k, 3);
      if (pct) pct.textContent = Math.round(82 * e) + '%';
      if (k < 1 && active()) cntRaf = requestAnimationFrame(step);
    };
    cntRaf = requestAnimationFrame(step);
    loopT = setTimeout(() => {
      if (!active()) return;
      show.classList.add('reset');                    // всё мягко гаснет…
      loopT = setTimeout(play, 700);                  // …и сцена начинается заново
    }, 5800);
  }

  // Следим, когда экран знакомства становится видимым
  function watch() {
    const s = $('landingScreen'); if (!s) return;
    let was = false;
    new MutationObserver(() => {
      const on = active();
      if (on && !was) { s.classList.remove('lg-intro-in'); void s.offsetWidth; s.classList.add('lg-intro-in'); setTimeout(play, 650); }
      if (!on) { clearTimeout(loopT); cancelAnimationFrame(cntRaf); }
      was = on;
    }).observe(s, { attributes: true, attributeFilter: ['class'] });
    if (active()) { was = true; s.classList.add('lg-intro-in'); setTimeout(play, 650); }
  }

  function start() { markSeen(); setAuthMode(true); document.body.classList.add('onb-from'); switchScreen('authScreen'); }
  function login() { markSeen(); setAuthMode(false); document.body.classList.add('onb-from'); switchScreen('authScreen'); }
  function back() { document.body.classList.remove('onb-from'); switchScreen('landingScreen'); }

  // Предпросмотр: открыть знакомство откуда угодно и вернуться обратно
  function preview() {
    const cur = document.querySelector('.screen.active');
    if (cur && cur.id !== 'landingScreen' && cur.id !== 'authScreen') prevScreen = cur.id;
    if (!prevScreen) prevScreen = cur ? cur.id : 'authScreen';
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    document.body.classList.add('onb-preview');
    switchScreen('landingScreen');
  }
  function exitPreview() {
    document.body.classList.remove('onb-preview', 'onb-from');
    setAuthMode(false);
    switchScreen(prevScreen || 'authScreen');
    prevScreen = null;
  }
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && (e.code === 'KeyL')) { e.preventDefault(); preview(); }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
  return { firstRun: () => !seen(), start, login, back, preview, exitPreview };
})();

/* 16. Светофор: стеклянная капля перескакивает между кнопками окна.
   Навёл на кружок — над ним «набухает» прозрачная капля, кружок под ней чуть увеличивается, как под линзой.
   Ведёшь к соседнему — капля перетекает, вытягиваясь по ходу. Увёл курсор — капля тает.
   Капля не ловит нажатия: клик всегда достаётся кнопке под ней. */
(function () {
  'use strict';
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function start() {
    const box = document.querySelector('.titlebar-controls');
    if (!box || reduce) return;
    const btns = [...box.querySelectorAll('.mac-btn')];
    if (!btns.length) return;
    const drop = document.createElement('span');
    drop.className = 'tl-drop'; drop.setAttribute('aria-hidden', 'true'); drop.innerHTML = '<i></i>';
    box.appendChild(drop);
    const S = 24;                                              // размер капли
    const K = 560, D = 2 * Math.sqrt(560) * 0.72, KS = 700, DS = 2 * Math.sqrt(700) * 0.8;
    const st = { x: 0, v: 0, t: 0, s: 0, sv: 0, ts: 0, raf: 0, last: 0 };
    const center = b => b.offsetLeft + b.offsetWidth / 2;
    let leaveT = 0;                                            // капля не исчезает сразу, а немного ждёт

    function draw() {
      const sp = Math.min(0.45, Math.abs(st.v) / 900);
      const k = Math.max(0, st.s);
      const w = S * (1 + sp) * k, h = S * (1 - sp * 0.4) * k;
      drop.style.width = w.toFixed(2) + 'px'; drop.style.height = h.toFixed(2) + 'px';
      drop.style.margin = `${(-h / 2).toFixed(2)}px 0 0 ${(-w / 2).toFixed(2)}px`;
      drop.style.transform = `translate3d(${st.x.toFixed(2)}px, 0, 0)`;
      drop.style.opacity = Math.min(1, k * 1.4).toFixed(3);
    }
    function loop(now) {
      st.raf = 0;
      const dt = Math.min(0.034, st.last ? (now - st.last) / 1000 : 0.016); st.last = now;
      const h = dt / 2;
      for (let n = 0; n < 2; n++) {
        st.v += (-K * (st.x - st.t) - D * st.v) * h; st.x += st.v * h;
        // появляется быстро, тает медленно и мягко
        const ks = st.ts > st.s ? KS : 90, ds = st.ts > st.s ? DS : 2 * Math.sqrt(90) * 1.05;
        st.sv += (-ks * (st.s - st.ts) - ds * st.sv) * h; st.s += st.sv * h;
      }
      draw();
      const moving = Math.abs(st.x - st.t) > 0.05 || Math.abs(st.v) > 1 || Math.abs(st.s - st.ts) > 0.002 || Math.abs(st.sv) > 0.02;
      if (moving) st.raf = requestAnimationFrame(loop);
      else { st.x = st.t; st.v = 0; st.s = st.ts; st.sv = 0; draw(); st.last = 0; }
    }
    const kick = () => { if (!st.raf) { st.last = 0; st.raf = requestAnimationFrame(loop); } };

    btns.forEach(b => b.addEventListener('pointerenter', () => {
      clearTimeout(leaveT);
      btns.forEach(x => x.classList.toggle('tl-on', x === b));
      st.t = center(b);
      if (st.s < 0.08) { st.x = st.t; st.v = 0; }              // появилась — сразу над кружком
      st.ts = 1; kick();
    }));
    box.addEventListener('pointerleave', () => {
      clearTimeout(leaveT);
      leaveT = setTimeout(() => { btns.forEach(x => x.classList.remove('tl-on')); st.ts = 0; kick(); }, 900);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

/* 17. Предметы: таблетки фильтра плавно прячутся, когда список прокручивают вниз
   (если фильтр не выбран), и возвращаются у самого верха. Выбранный фильтр не прячется — видно, что он включён. */
(function () {
  'use strict';
  function start() {
    const list = document.getElementById('subjectsList'), seg = document.getElementById('subjKindSeg');
    const box = list && list.closest('.lg-subjects');
    if (!list || !seg || !box) return;
    const upd = () => {
      const active = !!seg.querySelector('button.selected');
      box.classList.toggle('kinds-away', !seg.hidden && !active && list.scrollTop > 6);
    };
    list.addEventListener('scroll', upd, { passive: true });
    new MutationObserver(upd).observe(seg, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    upd();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

/* 18. Выбор недели: нажатие на середину капсулы недель выдвигает из-под неё стеклянную колонку
   со всеми неделями семестра. Текущая неделя — мягкий серый фон, открытая сейчас — галочка.
   Колонка «вытекает» из капсулы на пружине, список прокручивается с инерцией и сам встаёт на открытую неделю.
   У верхнего и нижнего края — преломление: список заходит за видимый край, и стекло у края
   подтягивает строки оттуда, сжимая их, как толстая линза. Строки уходят под край, а не гаснут раньше.
   В облегчённом режиме стекла — без эффекта. */
(function () {
  'use strict';
  const CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const OVER = 26;    // на столько список заходит за видимый край сверху и снизу (как margin/padding в glass.css)
  const BAND = 44;    // полоса у края, где идёт преломление
  let bar = null, center = null, pop = null, list = null, mode = '', kTop = 0, kBot = 0, lastY = null;
  const isOpen = () => !!pop && pop.classList.contains('open');
  const range = w => {
    const a = getDateForDay(w, 'Понедельник'), b = getDateForDay(w, 'Воскресенье');
    return a.getMonth() === b.getMonth() ? `${a.getDate()} – ${formatDate(b)}` : `${formatDate(a)} – ${formatDate(b)}`;
  };
  // Сколько недель показать: обычный семестр (18), неделя с последними отметками или ДЗ, открытая неделя
  // и ещё две после текущей. Просто просмотренные стрелками пустые недели список не удлиняют
  // (приложение заводит запись для каждой открытой недели), и сверху не больше 60 строк.
  function weeksCount(real) {
    const weeks = (typeof database !== 'undefined' && database && database.weeks) || {};
    let last = 0;
    for (const k in weeks) {
      const n = Number(k);
      if (n > last && Object.values(weeks[k] || {}).some(d => Array.isArray(d) && d.some(p => p && (p.attended === true || p.attended === false || (Array.isArray(p.tasks) && p.tasks.length))))) last = n;
    }
    return Math.min(60, Math.max(18, real + 2, last, currentWeek));
  }
  function fill() {
    const real = calculateCurrentSemesterWeek(), n = weeksCount(real);
    let html = '';
    for (let w = 1; w <= Math.max(n, currentWeek); w++) {
      html += `<button type="button" class="lg-wp-row${w === real ? ' is-now' : ''}${w === currentWeek ? ' is-sel' : ''}" data-w="${w}" role="option" aria-selected="${w === currentWeek}">
        <span class="lg-wp-txt"><b>Неделя ${w}</b><span>${range(w)}</span></span><span class="lg-wp-check">${CHECK}</span></button>`;
    }
    list.innerHTML = html;
  }
  function place() {
    const r = bar.getBoundingClientRect(), c = center.getBoundingClientRect();
    const phone = window.matchMedia('(max-width: 760px)').matches;
    const w = phone ? Math.min(r.width - 24, 420) : Math.min(r.width - 24, Math.max(280, c.width + 80));
    const top = Math.round(r.bottom + 8);
    pop.style.width = w + 'px';
    pop.style.left = Math.round(c.left + c.width / 2 - w / 2) + 'px';
    pop.style.top = top + 'px';
    // видимая высота: 7 строк и по 8 px сверху и снизу; сам список выше на 2 × OVER (заходит за края)
    const vis = Math.max(160, Math.min(7 * 54, window.innerHeight - top - 28)) + 16;
    list.style.maxHeight = (vis + 2 * OVER) + 'px';
  }

  /* ---- Преломление у краёв ----
     Та же геометрия, что у толстой линзы: точка D на экране показывает строку из места s(D) = D + dy(D).
     У видимого края стекло берёт картинку из-за края, поэтому строки там сжимаются и уходят под кромку.
     Считаем это для каждой строки и двигаем её через translate/scale: текст остаётся чётким
     (SVG-фильтр смещения рисует его по пикселям), и в Safari работает так же. */
  const fall = t => (1 - t) * (1 - t);
  // верх строки внутри списка, от его верхней кромки (не зависит от того, кто у строк offsetParent)
  const rowTop = row => row.offsetTop - list.firstElementChild.offsetTop + (parseFloat(getComputedStyle(list).paddingTop) || 0);
  // откуда берётся картинка для точки y списка (сила kTop/kBot падает до нуля, когда за краем строк больше нет)
  function dyAt(y) {
    if (mode !== 'lens') return 0;
    const H = list.clientHeight, top = OVER, bot = H - OVER;
    if (y < top + BAND) return -OVER * fall(Math.max(0, (y - top) / BAND)) * kTop;
    if (y > bot - BAND) return OVER * fall(Math.max(0, (bot - y) / BAND)) * kBot;
    return 0;
  }
  const clear = row => { if (row.__wp) { row.style.scale = row.style.translate = row.style.transformOrigin = ''; row.__wp = 0; } };
  function lensRows() {
    const H = list.clientHeight, top = list.scrollTop;
    if (mode !== 'lens' || (!kTop && !kBot)) { for (const row of list.children) clear(row); return; }
    const s = new Float32Array(H + 1);
    for (let d = 0; d <= H; d++) s[d] = d + dyAt(d);
    const inv = y => {            // где на экране окажется точка списка y (s монотонна)
      if (y <= s[0]) return y - s[0];
      if (y >= s[H]) return H + (y - s[H]);
      let lo = 0, hi = H;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= y) lo = m; else hi = m; }
      return lo + (y - s[lo]) / ((s[hi] - s[lo]) || 1);
    };
    for (const row of list.children) {
      const y0 = rowTop(row) - top, y1 = y0 + row.offsetHeight;
      if (y1 < -OVER || y0 > H + OVER) { clear(row); continue; }
      const d0 = inv(y0), d1 = inv(y1), sy = (d1 - d0) / (y1 - y0);
      if (Math.abs(sy - 1) < 0.002 && Math.abs(d0 - y0) < 0.05) { clear(row); continue; }
      row.style.transformOrigin = '50% 0';
      row.style.translate = `0 ${(d0 - y0).toFixed(2)}px`;
      row.style.scale = `1 ${sy.toFixed(4)}`;   // только по высоте: в ширину не растягиваем, иначе текст у края уезжает влево
      row.__wp = 1;
    }
  }
  function edges() {
    const top = list.scrollTop, max = list.scrollHeight - list.clientHeight;
    kTop = Math.max(0, Math.min(1, top / BAND));
    kBot = Math.max(0, Math.min(1, (max - top) / BAND));
    lensRows();
    if (lastY !== null) hover();
  }

  /* ---- Строка под курсором: строки сдвинуты трансформацией, поэтому браузер сам находит видимую ---- */
  let lastX = 0;
  function hover() {
    const el = lastY === null ? null : document.elementFromPoint(lastX, lastY);
    const row = el && list.contains(el) ? el.closest('.lg-wp-row') : null;
    for (const r of list.querySelectorAll('.lg-wp-row.is-hov')) if (r !== row) r.classList.remove('is-hov');
    if (row) row.classList.add('is-hov');
  }

  function open() {
    fill(); place();
    mode = document.body.classList.contains('glass-lite') ? '' : 'lens';
    const sel = list.querySelector('.is-sel');
    if (sel) {
      list.scrollTop = Math.max(0, rowTop(sel) - (list.clientHeight - sel.offsetHeight) / 2);
      if (list.__lgs) list.__lgs.cur = list.__lgs.target = list.__lgs.wrote = list.scrollTop;
    }
    lastY = null;
    edges();
    void pop.offsetWidth;
    pop.classList.add('open');
    center.setAttribute('aria-expanded', 'true');
  }
  function close() {
    if (!isOpen()) return;
    pop.classList.remove('open', 'is-settled');
    center.setAttribute('aria-expanded', 'false');
  }
  function start() {
    bar = document.querySelector('#mainApp .lg-weekbar');
    center = bar && bar.querySelector('.lg-wb-center');
    if (!center) return;
    center.setAttribute('role', 'button');
    center.setAttribute('tabindex', '0');
    center.setAttribute('aria-haspopup', 'listbox');
    center.setAttribute('aria-expanded', 'false');
    center.setAttribute('aria-label', 'Выбрать неделю');
    pop = document.createElement('div');
    pop.className = 'lg-weekpick lg-glass';
    pop.setAttribute('data-lens', '1.6'); pop.setAttribute('data-lens-bez', '22');   // преломление у края, как у уведомлений
    pop.innerHTML = '<div class="lg-wp-list" role="listbox" aria-label="Недели семестра"></div>';
    list = pop.firstChild;
    list.addEventListener('scroll', edges, { passive: true });
    document.body.appendChild(pop);
    // Ползунок прокрутки показываем, только когда колонка встала на место (пока она растёт, он бы стоял криво)
    pop.addEventListener('transitionend', e => {
      if (e.target !== pop || e.propertyName !== 'transform' || !isOpen()) return;
      pop.classList.add('is-settled');
      if (window.LGBar) LGBar.refresh();
    });
    pop.addEventListener('lg-morph-end', e => {   // колонку ведёт «жидкая» анимация (модуль 21)
      if (e.detail !== 'opened' || !isOpen()) return;
      pop.classList.add('is-settled');
      if (window.LGBar) LGBar.refresh();
    });
    center.addEventListener('click', () => (isOpen() ? close() : open()));
    center.addEventListener('mousedown', e => e.preventDefault());   // щелчок мышью не ставит фокус: подложка фокуса — только для клавиатуры
    center.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); isOpen() ? close() : open(); } });
    list.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; lastX = e.clientX; lastY = e.clientY; hover(); });
    list.addEventListener('pointerleave', () => { lastY = null; hover(); });
    list.addEventListener('click', e => {
      const row = e.target.closest('.lg-wp-row');
      if (!row) return;
      const w = +row.dataset.w;
      close();
      if (w !== currentWeek && typeof changeWeek === 'function') changeWeek(w - currentWeek);
    });
    document.addEventListener('pointerdown', e => { if (isOpen() && !pop.contains(e.target) && !center.contains(e.target)) close(); }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) close(); });
    window.addEventListener('resize', () => { if (!isOpen()) return; place(); edges(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

/* 19. Открытие и закрытие окон, как в iOS 26: окно вытекает из того, что нажали (шестерёнка, капсула профиля,
   кнопка «Динамика», строка «Время пар», пара…), и стекает обратно — форма и содержимое ведёт LGMorph (модуль 20).
   Фон затемняется и размывается вместе с окном и так же плавно светлеет. Окна подтверждения появляются чуть крупнее
   и садятся на место, как системные предупреждения. Модуль сам следит за классом open у .modal-overlay,
   поэтому функции открытия/закрытия окон менять не нужно. При «уменьшении движения» — без анимации. */
(function () {
  'use strict';
  if (!window.Element || !Element.prototype.animate) return;
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = () => window.matchMedia && matchMedia('(max-width: 760px)').matches;
  const hasLinear = window.CSS && CSS.supports && CSS.supports('animation-timing-function', 'linear(0, 1)');
  const ALERT_EASE = hasLinear ? 'linear(0, 0.1544, 0.4062, 0.6153, 0.7648, 0.8642, 0.9266, 0.9637, 0.9846, 0.9952, 1)' : 'cubic-bezier(0.2, 0.9, 0.3, 1)';
  document.documentElement.classList.add('lg-winfx');

  // Откуда открыли окно: последний нажатый элемент (кнопка, строка, карточка пары…)
  const SRC = 'button, [role="button"], a, label, .pair-card, .lg-row, .lg-cell, .subject-item, .pf-box, .pf-open, .sc-chip, .profile-pill';
  let last = null;
  const remember = e => {
    const el = e.target && e.target.closest && e.target.closest(SRC);
    if (!el) return;
    // пункт меню пары или дня: окно потом растёт из самой пары (или кнопки «⋯») — запоминаем их, пока меню открыто
    const alt = el.closest('.lg-menu') ? document.querySelector('.pair-card.menu-open') || document.querySelector('.lg-more.active') : null;
    last = { el, alt, t: performance.now() };
  };
  document.addEventListener('pointerdown', remember, true);
  document.addEventListener('click', remember, true);
  document.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') remember(e); }, true);
  window.LGLastPress = () => last;

  // Кнопку могут перерисовать, пока окно открыто (например, карточку пары после сохранения): ищем её заново
  function refind(el) {
    if (!el) return () => null;
    const id = el.id, pid = el.dataset && el.dataset.pairId;
    return () => el.isConnected ? el : id ? document.getElementById(id)
      : pid ? document.querySelector(`[data-pair-id="${window.CSS && CSS.escape ? CSS.escape(pid) : pid}"]`) : null;
  }
  const state = new WeakMap();   // overlay → { anims, phase, find, timer }
  const content = ov => ov.querySelector(':scope > .modal-content') || ov.firstElementChild;
  const isAlert = ov => ov.classList.contains('lg-alert-overlay');
  const ZOOM = new Set(['setupBackdrop']);   // окна, в которые превращается сама кнопка (пока подопытное — настройки)
  // капсула из нескольких кнопок (колокольчик | шестерёнка) — её кнопка сначала отделяется кругом
  const capOf = src => { const c = src && src.closest && src.closest('.lg-group'); return c && window.LGLiquid && LGLiquid.split && c.querySelectorAll('button').length > 1 ? c : null; };
  /* Телефон: настройки и профиль — лист снизу, как в iOS: выезжает не до самого верха, экран под ним стоит на месте
     и только темнеет. Лист можно взять за шапку и сдвинуть вниз пальцем (см. bindDrag ниже) */
  const extras = ov => [dimOf(ov)];
  const zoomOpts = (ov, sp) => ({ zoom: true, fromRect: sp.gearRect(), iconSrc: sp.gearIcon, fromColor: sp.color, noFade: true, extra: [dimOf(ov)], ov });
  const stop = st => { clearTimeout(st.timer); (st.anims || []).forEach(a => { try { a.cancel(); } catch (e) { /* уже закончилась */ } }); st.anims = []; };
  const now = el => { const cs = getComputedStyle(el); return { transform: cs.transform === 'none' ? 'none' : cs.transform, opacity: cs.opacity }; };
  function settle(ov) {
    // Пока окно росло, размеры элементов внутри читались «в масштабе» — пересчитываем ползунки и линзы
    if (window.LGBar) LGBar.refresh();
    if (window.LGLens && LGLens.refresh) LGLens.refresh(ov);
  }
  function hideOv(ov, st) {
    st.phase = 'closed';
    ov.classList.remove('lg-closing', 'lg-closing-quick');
    ov.style.removeProperty('--lg-close-ms');
    stop(st);
  }

  // Затемнение и размытие фона (слой ::before) идут вместе с окном — тем же расчётом
  const dimClamp = x => Math.max(0, Math.min(1, x));
  const dimOf = ov => ({ el: ov, pseudo: '::before', frame: t => ({ opacity: dimClamp(t * 1.5).toFixed(3) }) });
  const fadeDim = (ov, to, ms) => { try { return ov.animate([{ opacity: to ? 0 : 1 }, { opacity: to }], { pseudoElement: '::before', duration: ms, easing: 'ease-out', fill: 'forwards' }); } catch (e) { return null; } };

  // То, что внутри окна анимируется само (счётчики, кольца, полоски), запускается, когда окно встало на место
  const pending = new WeakMap();
  window.LGAfterOpen = (el, fn) => {
    const ov = el && el.closest && el.closest('.modal-overlay');
    if (!ov || reduce() || !ov.classList.contains('open')) return false;
    const st = state.get(ov);
    if (st && st.phase === 'open') return false;
    if (!pending.has(ov)) pending.set(ov, []);
    pending.get(ov).push(fn);
    return true;
  };
  function opened(ov, st) {
    st.phase = 'open';
    ov.classList.remove('lg-opening');
    settle(ov);
    const q = pending.get(ov) || []; pending.delete(ov);
    q.forEach(fn => { try { fn(); } catch (e) { /* не мешаем остальным */ } });
  }

  function open(ov) {
    const box = content(ov); if (!box) return;
    let st = state.get(ov);
    if (!st) { st = { anims: [] }; state.set(ov, st); }
    const wasClosing = st.phase === 'closing';
    const from = wasClosing ? now(box) : null;
    stop(st);
    ov.classList.remove('lg-closing', 'lg-closing-quick');
    st.phase = 'opening';
    if (!wasClosing) {
      let src = last && performance.now() - last.t < 1200 && !ov.contains(last.el) ? last.el : null;
      if (src && last.alt && last.alt.isConnected) src = last.alt;
      st.find = refind(src);
    }
    if (reduce()) { opened(ov, st); return; }
    ov.classList.add('lg-opening');
    if (isAlert(ov)) {
      const a1 = box.animate([{ transform: from ? from.transform : 'scale(1.12)' }, { transform: 'none' }], { duration: 420, easing: ALERT_EASE });
      const a2 = box.animate([{ opacity: from ? from.opacity : 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
      st.anims = [a1, a2, fadeDim(ov, 1, 200)].filter(Boolean);
      const done = () => { if (st.phase === 'opening') { stop(st); opened(ov, st); } };
      a1.onfinish = done; st.timer = setTimeout(done, 820);
      return;
    }
    // окно настроек — «кнопка становится окном», как в iOS 26 (LGMorph, вид zoom); остальные пока на капле LGMorph
    if (!wasClosing) st.eng = window.LGMorph;
    const eng = st.eng || window.LGMorph;
    if (!eng) { opened(ov, st); return; }
    // кнопка в общей капсуле (колокольчик | шестерёнка): капсула сначала разделяется на два круга (жидкое стекло),
    // и окно растёт уже из отделившегося круга
    const zsrc = st.find ? st.find() : null, zcap = ZOOM.has(ov.id) && !phone() && !wasClosing && !st.split ? capOf(zsrc) : null;
    if (zcap) {
      const sp = LGLiquid.split(zcap, zsrc);
      st.split = sp;
      ov.classList.add('lg-presplit');
      sp.to(1).then(() => {
        if (st.split !== sp || st.phase !== 'opening') return;
        ov.classList.remove('lg-presplit');
        sp.gear(false);
        eng.open(box, null, zoomOpts(ov, sp)).then(how => { if (st.phase === 'opening' && how === 'opened') opened(ov, st); });
      });
      return;
    }
    if (st.split) {
      const sp = st.split;
      const go = () => { if (st.split !== sp || st.phase !== 'opening') return; ov.classList.remove('lg-presplit'); sp.gear(false);
        eng.open(box, null, zoomOpts(ov, sp)).then(how => { if (st.phase === 'opening' && how === 'opened') opened(ov, st); }); };
      if (eng.busy(box)) go();                                   // открыли снова, пока окно садилось в круг — разворачиваем
      else { ov.classList.add('lg-presplit'); sp.gear(true); sp.to(1).then(go); }   // пока круг сливался с капсулой — снова отделяем
      return;
    }
    eng.open(box, st.find ? st.find() : null, { slide: phone(), zoom: ZOOM.has(ov.id), extra: extras(ov), ov }).then(how => {
      if (st.phase === 'opening' && how === 'opened') opened(ov, st);
    });
  }

  function close(ov, quick) {
    const box = content(ov); if (!box) return;
    const st = state.get(ov) || { anims: [] };
    state.set(ov, st);
    pending.delete(ov);
    ov.classList.remove('lg-opening');
    if (reduce()) { stop(st); st.phase = 'closed'; return; }
    if (st.phase === 'closing' && !quick) return;
    stop(st);
    st.phase = 'closing';
    ov.classList.add('lg-closing');
    if (quick || isAlert(ov)) {
      // Одно окно сменилось другим (профиль → «Динамика») или ушло подтверждение — старое просто гаснет
      if (quick) ov.classList.add('lg-closing-quick');
      const eng = st.eng || window.LGMorph;
      if (eng) eng.cancel(box);
      const from = now(box), dur = quick ? 160 : 200;
      const a1 = box.animate([{ opacity: from.opacity, transform: from.transform }, { opacity: 0, transform: quick ? from.transform : 'scale(0.96)' }], { duration: dur, easing: quick ? 'ease-out' : 'ease-in', fill: 'forwards' });
      st.anims = [a1, fadeDim(ov, 0, dur)].filter(Boolean);
      const done = () => { if (st.phase !== 'closing') return; hideOv(ov, st); };
      a1.onfinish = done; st.timer = setTimeout(done, dur + 400);
      return;
    }
    const eng = st.eng || window.LGMorph;
    if (!eng) { hideOv(ov, st); return; }
    const sp = st.split;
    if (sp) {
      const merge = () => sp.to(0).then(() => { if (st.split === sp && st.phase !== 'opening') { sp.remove(); st.split = null; } });
      if (ov.classList.contains('lg-presplit')) {   // закрыли, пока капсула ещё разделялась: круг просто возвращается
        ov.classList.remove('lg-presplit');
        hideOv(ov, st); merge();
        return;
      }
      // окно садится в круг, круг сливается с капсулой
      eng.close(box, null, zoomOpts(ov, sp)).then(how => {
        if (st.phase !== 'closing') return;
        hideOv(ov, st);
        if (how === 'closed') { sp.gear(true); merge(); }
      });
      return;
    }
    // лист смахнули пальцем: уезжает с того места и с той скоростью, где его отпустили
    const drag = ov.__drag; ov.__drag = null;
    eng.close(box, st.find ? st.find() : null, { slide: phone(), zoom: ZOOM.has(ov.id), extra: extras(ov), ov, from: drag }).then(() => {
      if (st.phase === 'closing') hideOv(ov, st);
    });
  }

  /* Телефон: лист настроек и профиля можно взять за шапку и вести пальцем вверх-вниз: он едет за пальцем, фон под
     ним светлеет. Отпустил ниже трети высоты (или смахнул вниз) — лист уезжает с того же места и с той же скоростью,
     иначе мягко возвращается на место. Вверх лист почти не тянется — как резина */
  const DRAG = {
    setupBackdrop: () => { if (typeof window.closeSettings === 'function') window.closeSettings(); },
    profileBackdrop: () => { const b = document.querySelector('#profileBackdrop [data-act="close"]'); if (b) b.click(); else document.getElementById('profileBackdrop').classList.remove('open'); }
  };
  function bindDrag(ov) {
    const box = content(ov), shut = DRAG[ov.id];
    if (!box || !shut) return;
    const headH = () => { const h = box.querySelector(':scope > .lg-sheet-head'); return h && h.offsetHeight ? h.offsetHeight : 64; };
    const pos = y => (y >= 0 ? y : -14 * (1 - Math.exp(y / 50)));
    let g = null;
    const apply = () => {
      const y = pos(g.dy);
      box.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
      if (g.dim) g.dim.currentTime = 1000 * dimClamp((1 - Math.max(0, y) / g.D) * 1.5);
    };
    const clean = () => { ['transform', 'will-change', 'transition'].forEach(p => box.style.removeProperty(p)); };
    ov.addEventListener('touchstart', e => {
      g = null;
      if (!phone() || e.touches.length !== 1 || box.__snap || !ov.classList.contains('open') || ov.classList.contains('lg-opening') || ov.classList.contains('lg-closing')) return;
      const st = state.get(ov); if (st && st.phase && st.phase !== 'open') return;
      const t = e.touches[0], r = box.getBoundingClientRect();
      if (t.clientY < r.top || t.clientY > r.top + headH()) return;
      if (e.target.closest && e.target.closest('input, textarea, select, .pf-tabs, .pf-pop')) return;
      g = { x0: t.clientX, y0: t.clientY, dy: 0, on: false, raf: 0, D: innerHeight + 12 - r.top, h: r.height, hist: [[e.timeStamp, t.clientY]] };
    }, { passive: true });
    ov.addEventListener('touchmove', e => {
      if (!g) return;
      const t = e.touches[0], dx = t.clientX - g.x0, dy = t.clientY - g.y0;
      if (!g.on) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dx) > Math.abs(dy)) { g = null; return; }
        g.on = true; g.y0 = t.clientY;   // от места, где палец тронулся, — без скачка на порог
        box.style.transition = 'none'; box.style.willChange = 'transform';
        try { g.dim = ov.animate([{ opacity: 0 }, { opacity: 1 }], { pseudoElement: '::before', duration: 1000, fill: 'both' }); g.dim.pause(); g.dim.currentTime = 1000; } catch (err) { g.dim = null; }
      }
      e.preventDefault();
      g.dy = t.clientY - g.y0;
      g.hist.push([e.timeStamp, t.clientY]); if (g.hist.length > 6) g.hist.shift();
      if (!g.raf) g.raf = requestAnimationFrame(() => { if (g && g.on) { g.raf = 0; apply(); } });
    }, { passive: false });
    const end = () => {
      if (!g) return;
      const d = g; g = null;
      cancelAnimationFrame(d.raf);
      if (!d.on) return;
      if (window.LGEatClick) window.LGEatClick();   // это было перетаскивание, а не нажатие на кнопку в шапке
      const h = d.hist, a = h[0], b = h[h.length - 1];
      const v = a && b && b[0] > a[0] ? (b[1] - a[1]) / (b[0] - a[0]) * 1000 : 0;   // скорость пальца, px/с (вниз — плюс)
      const y = Math.max(0, pos(d.dy));
      if ((y > d.h * 0.3 && v > -300) || v > 900) {
        ov.__drag = { x: 1 - y / d.D, v: -v / d.D };
        shut();
        clean();
        if (d.dim) d.dim.cancel();   // дальше лист и фон ведёт анимация закрытия
        if (ov.classList.contains('open')) ov.__drag = null;   // окно не закрылось — просто вернётся на место
        return;
      }
      // назад на место
      const cur = getComputedStyle(box).transform, k0 = d.dim ? d.dim.currentTime / 1000 : 1;
      clean();
      if (d.dim) d.dim.cancel();
      const o = { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
      try {
        const an = box.animate([{ transform: cur }, { transform: 'none' }], o);
        box.__snap = true; an.finished.then(() => { box.__snap = false; }, () => { box.__snap = false; });
        ov.animate([{ opacity: k0 }, { opacity: 1 }], Object.assign({ pseudoElement: '::before' }, o));
      } catch (err) { box.__snap = false; }
    };
    ov.addEventListener('touchend', end);
    ov.addEventListener('touchcancel', end);
  }

  function start() {
    Object.keys(DRAG).forEach(id => { const ov = document.getElementById(id); if (ov) bindDrag(ov); });
    const seen = new WeakMap();
    const watch = ov => { if (!seen.has(ov)) { seen.set(ov, ov.classList.contains('open')); mo.observe(ov, { attributes: true, attributeFilter: ['class'] }); } };
    const mo = new MutationObserver(recs => {
      const opened = [], closed = [];
      recs.forEach(r => {
        const ov = r.target, was = seen.get(ov), is = ov.classList.contains('open');
        if (was === is) return;
        seen.set(ov, is);
        (is ? opened : closed).push(ov);
      });
      closed.forEach(ov => close(ov, opened.length > 0));
      opened.forEach(open);
    });
    document.querySelectorAll('.modal-overlay').forEach(watch);
    // Окна, которые создаются на лету (подтверждения)
    new MutationObserver(recs => recs.forEach(r => r.addedNodes.forEach(n => {
      if (n.nodeType === 1 && n.classList.contains('modal-overlay')) watch(n);
    }))).observe(document.body, { childList: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

/* 20. «Жидкое» появление, как в iOS 26 (LGMorph). Кнопка остаётся на месте; из её края, со стороны окна,
   выдавливается маленькая круглая капля, пару кадров тянется к кнопке перемычкой, отрывается, отплывает и по пути
   раздувается в окно. Закрытие — точное зеркало: окно сжимается в каплю, она подплывает к кнопке, сливается с её
   краем через перемычку и втягивается в неё.
   Весь полёт заранее рассчитывается пружиной и отдаётся браузеру готовыми кадрами (Web Animations): перемещение,
   масштаб и прозрачность двигает видеокарта, поэтому анимация идёт ровно, даже когда приложение занято.
   Стекло капли — отдельный слой с тем же фоном, размытием и тенью, что у окна; содержимое окна внутри
   проявляется по мере роста. В конце капля совпадает с окном точь-в-точь и незаметно уступает ему место.
   Прерванная анимация разворачивается с того же места и с той же скоростью. */
window.LGMorph = (function () {
  'use strict';
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lite = () => document.body.classList.contains('glass-lite');
  const S = new WeakMap();
  // где была кнопка, когда окно открылось: возвращаемся туда, даже если она уже спряталась
  // (например, «⋯» у пары видна только при наведении)
  const SRC = new WeakMap();
  const SRCEL = new WeakMap();   // окно → кнопка, которая в него превратилась (вид zoom): пока окно открыто, её не видно
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = x => 1 - (1 - x) * (1 - x);
  const FRAME = 1000 / 60;
  const touch = () => window.matchMedia && matchMedia('(hover: none)').matches;

  function rectOf(el) {
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return null;
    for (let p = el; p && p.nodeType === 1; p = p.parentElement) {
      if (p.classList.contains('modal-overlay') && !p.classList.contains('open') && !p.classList.contains('lg-closing')) return null;
      const cs = getComputedStyle(p);
      if (cs.display === 'none' || (cs.visibility === 'hidden' && p !== el)) return null;
    }
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }
  function colorOf(s) {
    const n = (String(s).match(/-?[\d.]+/g) || []).map(Number);
    return /^rgba?\(/.test(s) && n.length >= 3 ? [n[0], n[1], n[2], n.length > 3 ? n[3] : 1] : null;
  }
  function radiusOf(cs, w, h) {
    const v = cs.borderTopLeftRadius;
    let r = parseFloat(v) || 0;
    if (v.indexOf('%') >= 0) r = Math.min(w, h) * r / 100;
    return Math.min(r, Math.min(w, h) / 2);
  }

  // Пружина для t (0 — капля у кнопки, 1 — окно на месте): кадры по 1/60 с, внутри — мелкие шаги
  function trajectory(x0, v0, target, resp, zeta) {
    const w = 2 * Math.PI / resp, k = w * w, c = 2 * zeta * w, h = 1 / 240;
    let x = x0, v = v0;
    const out = [{ x, v }];
    for (let f = 1; f < 150; f++) {
      for (let i = 0; i < 4; i++) { v += (-k * (x - target) - c * v) * h; x += v * h; }
      if (target === 0 && x < 0) { x = 0; v = 0; }
      out.push({ x, v });
      if (target === 1 ? (Math.abs(x - 1) < 0.0015 && Math.abs(v) < 0.03) : x < 0.008) break;
    }
    out[out.length - 1] = { x: target, v: 0 };
    return out;
  }

  // Форма в момент t: центр, размер, скругление; s — насколько выросла
  function shape(st, t, vel) {
    const F = st.F, A = st.A;
    if (st.kind === 'zoom') {
      // кнопка сама становится окном: одна форма по прямой летит на место и растёт; маленькая — капсула
      // со скруглением в полвысоты, к концу — углы окна. Перелёт пружины — окно чуть больше и садится
      const w = Math.max(4, lerp(A.w, F.w, t)), h = Math.max(4, lerp(A.h, F.h, t));
      const r = Math.min(Math.min(w, h) / 2, st.Fr * lerp(1.6, 1, smooth(0, 0.7, t)));   // маленькая — капсула, дальше почти сразу углы окна (чуть круглее в полёте)
      return { cx: lerp(A.x, F.x, t), cy: lerp(A.y, F.y, t), w, h, r, s: t };
    }
    if (st.kind === 'slide') return { cx: F.x, cy: lerp(A.y, F.y, t), w: F.w, h: F.h, r: st.Fr, s: 1 };
    if (st.kind === 'fade') return { cx: F.x, cy: lerp(A.y, F.y, t), w: lerp(A.w, F.w, t), h: lerp(A.h, F.h, t), r: st.Fr, s: t };
    const pos = t < 0.8 ? Math.max(0, t / 0.8) : 1 + Math.max(0, t - 1);          // место опережает размер
    const pe = pos >= 1 ? pos : easeOut(pos) * 0.35 + pos * 0.65;
    const s = clamp((t - 0.05) / 0.95, 0, 1.04);                                     // размер чуть позже; перелёт пружины — лёгкий «отскок»
    const cx = lerp(A.x, F.x, pe), cy = lerp(A.y, F.y, pe);
    let w = lerp(A.w, F.w, s), h = lerp(A.h, F.h, s);
    if (vel > 0.5) {                                                                 // в полёте капля чуть вытягивается вдоль пути
      const dx = F.x - A.x, dy = F.y - A.y, d = Math.hypot(dx, dy) || 1, e = 1 + Math.min(0.06, vel * d / 40000), ie = 1 / Math.sqrt(e);
      w *= lerp(ie, e, Math.abs(dx) / d); h *= lerp(ie, e, Math.abs(dy) / d);
    }
    w = Math.max(4, w); h = Math.max(4, h);
    // маленькая — круглая, большая — мягкий прямоугольник с большим скруглением, в конце — углы окна
    const half = Math.min(w, h) / 2, blob = Math.min(half * lerp(1, 0.6, smooth(0.15, 0.6, s)), Math.max(28, Math.min(w, h) * 0.32));
    const k = clamp((1 - s) / 0.6, 0, 1);
    const r = lerp(Math.min(st.Fr, half), Math.max(blob, Math.min(st.Ar, half)), k * k * (3 - 2 * k));
    return { cx, cy, w, h, r, s };
  }

  // Кадры для всех слоёв по траектории
  function keyframes(st, traj) {
    const F = st.F, bx = st.box.x, by = st.box.y, n = traj.length;
    const K = { blob: [], blobR: [], rim: [], win: [], neck: [], neckR: [], ico: [], extra: (st.extra || []).map(() => []) };
    const mixC = (a, b, k) => `rgba(${a.map((v, i) => (i < 3 ? Math.round(lerp(v, b[i], k)) : lerp(v, b[i], k).toFixed(3))).join(', ')})`;
    traj.forEach((p, i) => {
      const offset = n > 1 ? i / (n - 1) : 1;
      const g = shape(st, p.x, Math.abs(p.v));
      const sx = g.w / F.w, sy = g.h / F.h;
      // капля: стеклянный слой размером с окно, сжатый до нужной формы; скругление поправлено на сжатие
      // zoom: на открытии форма сразу на месте кнопки (кнопка «вспыхнула» стеклом), на закрытии — гаснет, садясь в кнопку
      // закрытие: форма садится в кнопку стеклянным кружком, и уже на месте он гаснет (кадры fade после посадки)
      const bOp = st.kind === 'drop' ? smooth(0, 0.07, p.x) : st.kind === 'fade' ? smooth(0, 0.45, p.x) : st.kind === 'zoom' ? (p.fade != null ? 1 - smooth(0, 1, p.fade) : 1) : 1;
      const bf = { offset, transform: `translate(${(g.cx - g.w / 2 - bx).toFixed(2)}px, ${(g.cy - g.h / 2 - by).toFixed(2)}px) scale(${sx.toFixed(5)}, ${sy.toFixed(5)})`, opacity: bOp.toFixed(3) };
      // zoom: в первые мгновения — стекло кнопки, почти сразу — цвет окна (как в iOS: кнопка вспыхнула и стала окном)
      if (st.kind === 'zoom' && st.c0 && st.c1) bf.backgroundColor = mixC(st.c0, st.c1, smooth(0.03, 0.22, p.x));
      K.blob.push(bf);
      K.blobR.push({ offset, borderRadius: `${(g.r / sx).toFixed(2)}px / ${(g.r / sy).toFixed(2)}px` });
      K.rim.push({ offset, opacity: st.kind === 'drop' ? (1 - smooth(0.45, 0.9, g.s)).toFixed(3) : '0' });
      // содержимое окна: внутри капли, проявляется по мере роста (zoom — почти сразу: видно уменьшенное окно)
      const kc = st.kind === 'slide' ? 1 : Math.min(sx, sy);
      const wOp = st.kind === 'drop' ? smooth(0.4, 0.85, g.s) : st.kind === 'fade' ? smooth(0, 0.6, p.x) : st.kind === 'zoom' ? smooth(0.04, 0.32, p.x) : 1;
      // значок кнопки — в середине формы: на открытии быстро гаснет, на закрытии проявляется на подлёте
      if (st.ico) K.ico.push({ offset, transform: `translate(${(g.cx - st.icoW / 2 - bx).toFixed(2)}px, ${(g.cy - st.icoH / 2 - by).toFixed(2)}px)`, opacity: (1 - smooth(0.04, 0.16, p.x)).toFixed(3) });   // значок — только у самой кнопки: не видно, как он летит
      const wf = { offset, transform: `translate(${(g.cx - F.x).toFixed(2)}px, ${(g.cy - F.y).toFixed(2)}px) scale(${kc.toFixed(5)})`, opacity: wOp.toFixed(3) };
      if (st.kind === 'zoom') {
        // содержимое обрезано по форме (как в iOS): иначе углы уменьшенного окна торчат из капсулы
        const ix = Math.max(0, (F.w - g.w / kc) / 2), iy = Math.max(0, (F.h - g.h / kc) / 2);
        wf.clipPath = `inset(${iy.toFixed(2)}px ${ix.toFixed(2)}px round ${(g.r / kc).toFixed(2)}px)`;
      }
      K.win.push(wf);
      // перемычка: капсула от края кнопки до центра капли, истончается и исчезает, пока капля отрывается
      if (st.neck) {
        const Q = st.Q, len = Math.max(0.5, Math.hypot(g.cx - Q.x, g.cy - Q.y)), d = Math.min(g.w, g.h);
        // перемычка рвётся, как только капля отошла от кнопки примерно на свой размер
        const th = Math.max(1, d * lerp(0.56, 0.18, smooth(0.02, 0.2, p.x)));
        const op = st.fromSrc ? smooth(0, 0.04, p.x) * (1 - smooth(0.1, 0.24, p.x)) * (1 - smooth(Math.max(8, d * 0.7), Math.max(16, d * 1.5), len)) : 0;
        K.neck.push({ offset, transform: `translate(${(Q.x - bx).toFixed(2)}px, ${(Q.y - by).toFixed(2)}px) rotate(${st.ang.toFixed(4)}rad) translate(0px, ${(-th / 2).toFixed(2)}px) scale(${(len / 100).toFixed(5)}, ${(th / 100).toFixed(5)})`, opacity: op.toFixed(3) });
        K.neckR.push({ offset, borderRadius: `${((th / 2) / (len / 100)).toFixed(2)}px / 50px` });
      }
      (st.extra || []).forEach((x, j) => K.extra[j].push(Object.assign({ offset }, x.frame(p.x, g))));
    });
    return K;
  }

  function layer(cls, look) {
    const d = document.createElement('div');
    d.className = cls; d.setAttribute('aria-hidden', 'true');
    if (/^\d+$/.test(look.zIndex)) d.style.zIndex = look.zIndex;
    return d;
  }
  function build(st) {
    if (st.bare) { st.blob = st.rim = null; st.box = { x: 0, y: 0 }; return; }
    const el = st.el, L = st.look, parent = el.parentNode, fixed = parent === document.body;
    const blob = layer('lg-morph-blob', L);
    blob.style.position = fixed ? 'fixed' : 'absolute';
    blob.style.width = st.F.w + 'px'; blob.style.height = st.F.h + 'px';
    blob.style.backgroundColor = L.bg; if (L.bgImage && L.bgImage !== 'none') blob.style.backgroundImage = L.bgImage;
    blob.style.boxShadow = L.shadow;
    if (L.backdrop && !lite()) blob.style.backdropFilter = blob.style.webkitBackdropFilter = L.backdrop;
    const rim = document.createElement('i'); rim.className = 'lg-morph-rim'; blob.appendChild(rim);
    parent.insertBefore(blob, el);
    st.blob = blob; st.rim = rim;
    if (st.kind === 'zoom' && st.srcEl) {
      const svg = st.srcEl.querySelector('svg');
      if (svg) {
        const ico = layer('lg-morph-ico', L), r = svg.getBoundingClientRect();
        ico.style.position = blob.style.position;
        ico.style.width = r.width + 'px'; ico.style.height = r.height + 'px';
        ico.style.color = getComputedStyle(st.srcEl).color;
        ico.appendChild(svg.cloneNode(true));
        parent.insertBefore(ico, el.nextSibling);   // поверх окна и капли
        st.ico = ico; st.icoW = r.width; st.icoH = r.height;
      }
    }
    if (st.kind === 'drop' && st.fromSrc) {
      const neck = layer('lg-morph-neck', L);
      neck.style.position = blob.style.position;
      neck.style.backgroundColor = L.neck;
      parent.insertBefore(neck, blob);   // под каплей: стекло капли размывает место стыка, и они сливаются
      st.neck = neck;
    }
    if (fixed) st.box = { x: 0, y: 0 };
    else {
      const op = blob.offsetParent;
      const pr = op ? op.getBoundingClientRect() : { left: 0, top: 0 };
      st.box = { x: pr.left + (op ? op.clientLeft : 0), y: pr.top + (op ? op.clientTop : 0) };
    }
  }
  function teardown(st) {
    (st.anims || []).forEach(a => { try { a.cancel(); } catch (e) { /* уже */ } });
    st.anims = [];
    [st.blob, st.neck, st.ico].forEach(x => x && x.remove());
    st.blob = st.neck = st.rim = st.ico = null;
    const el = st.el;
    el.style.transition = 'none';
    el.classList.remove('lg-morph', 'lg-morphing', 'lg-morph-closing');
    el.style.transformOrigin = st.savedOrigin;
    void el.offsetWidth;
    el.style.transition = st.savedTransition;
  }
  function finish(st, how) {
    if (S.get(st.el) !== st) return;
    clearTimeout(st.guard);
    teardown(st);
    if (how !== 'opened' && st.srcEl) { st.srcEl.style.removeProperty('visibility'); SRCEL.delete(st.el); }
    S.delete(st.el);
    if (how === 'opened' && window.LGBar) LGBar.refresh();
    st.el.dispatchEvent(new CustomEvent('lg-morph-end', { detail: how }));
    st.done.forEach(f => f(how)); st.done = [];
  }

  // Где сейчас анимация: t и скорость по прошедшему времени
  function now(st) {
    const a = st.anims && st.anims[0];
    if (!a || !st.traj) return { x: st.mode === 'open' ? 1 : 0, v: 0 };
    const ms = Number(a.currentTime) || 0, f = ms / FRAME, i = Math.floor(f), tr = st.traj;
    if (i >= tr.length - 1) return tr[tr.length - 1];
    const p = tr[Math.max(0, i)], q = tr[i + 1], u = f - i;
    return { x: lerp(p.x, q.x, u), v: lerp(p.v, q.v, u) };
  }

  function begin(el, src, mode, opts) {
    opts = opts || {};
    let st = S.get(el);
    // opts.from — лист отпустили пальцем на полпути: начинаем оттуда и с той же скоростью
    const from = st ? now(st) : (opts.from && isFinite(opts.from.x) ? { x: clamp(opts.from.x, 0, 1.05), v: opts.from.v || 0 } : { x: mode === 'open' ? 0 : 1, v: 0 });
    if (st && st.mode === mode) return st;            // уже идёт в эту сторону
    if (!st) {
      const cs = getComputedStyle(el);
      st = { el, done: [], anims: [], savedOrigin: el.style.transformOrigin, savedTransition: el.style.transition };
      // как выглядит окно в открытом виде: этот же вид несёт капля
      const bf = cs.backdropFilter && cs.backdropFilter !== 'none' ? cs.backdropFilter : (cs.webkitBackdropFilter !== 'none' ? cs.webkitBackdropFilter : '');
      const bg = cs.backgroundColor;
      st.look = { bg, bgImage: cs.backgroundImage, shadow: cs.boxShadow !== 'none' ? cs.boxShadow : '0 18px 40px -16px rgba(0,0,0,.28)',
        backdrop: bf ? bf.replace(/url\([^)]*\)\s*/g, '').trim() || '' : '', zIndex: cs.zIndex, neck: bg };
      // размер и место окна в открытом виде — без смещений из стилей закрытого состояния
      el.classList.add('lg-morph', 'lg-morphing');
      const prevT = el.style.transform; el.style.transform = 'none';
      const fr = el.getBoundingClientRect();
      el.style.transform = prevT;
      st.F = { x: fr.left + fr.width / 2, y: fr.top + fr.height / 2, w: fr.width, h: fr.height };
      st.Fr = radiusOf(cs, fr.width, fr.height);
      let b = opts.fromRect || rectOf(src);   // fromRect — круг, отделившийся от капсулы (модуль 22, split)
      if (mode === 'open') { if (b) SRC.set(el, b); else SRC.delete(el); }
      else if (!b) b = SRC.get(el) || null;
      st.fromSrc = !!b;
      if (opts.slide) { st.kind = 'slide'; st.A = { x: st.F.x, y: innerHeight + st.F.h / 2 + 12, w: st.F.w, h: st.F.h }; }
      else if (b && opts.zoom) {
        // кнопка сама становится окном: форма начинается ровно с кнопки; кнопку прячем — она теперь окно
        st.kind = 'zoom';
        st.A = { x: b.x, y: b.y, w: b.w, h: b.h }; st.Ar = Math.min(b.w, b.h) / 2;
        const se = opts.iconSrc || (mode === 'open' ? src : (SRCEL.get(el) || src));
        if (se && se.isConnected) {
          st.srcEl = se; SRCEL.set(el, se);
          const cap = se.closest('.lg-glass'), c0 = colorOf(opts.fromColor || getComputedStyle(cap || se).backgroundColor), c1 = colorOf(bg);
          if (c0 && c1) { st.c0 = c0; st.c1 = c1; }
        }
      }
      else if (b) {
        st.kind = 'drop';
        // точка на краю кнопки со стороны окна: отсюда выдавливается капля
        const dx = st.F.x - b.x, dy = st.F.y - b.y, d = Math.hypot(dx, dy);
        let Q = { x: b.x, y: b.y };
        if (d > 1) {
          const ux = dx / d, uy = dy / d, tq = Math.min(Math.abs(ux) > 1e-6 ? (b.w / 2) / Math.abs(ux) : 1e9, Math.abs(uy) > 1e-6 ? (b.h / 2) / Math.abs(uy) : 1e9);
          const inside = Math.abs(dx) < b.w / 2 && Math.abs(dy) < b.h / 2;
          if (!inside) Q = { x: b.x + ux * tq * 0.92, y: b.y + uy * tq * 0.92 };
        }
        const d0 = clamp(Math.min(b.w, b.h) * 0.62, 10, 28);
        st.Q = Q; st.ang = Math.atan2(st.F.y - Q.y, st.F.x - Q.x);
        st.A = { x: Q.x, y: Q.y, w: d0, h: d0 }; st.Ar = d0 / 2;
      } else { st.kind = 'fade'; st.A = { x: st.F.x, y: st.F.y + 16, w: st.F.w * 0.9, h: st.F.h * 0.9 }; }
      st.Ar = st.Ar || st.Fr;
      // длительность — по размеру: меню быстрее, большие окна дольше
      const f = clamp((Math.sqrt(st.F.w * st.F.h) - 170) / 480, 0, 1);
      st.spring = { open: st.kind === 'slide' ? [0.62, 1] : st.kind === 'zoom' ? [0.46, 0.78] : [lerp(0.3, 0.5, f), 0.8], close: st.kind === 'slide' ? [0.38, 1] : st.kind === 'zoom' ? [0.36, 0.8] : [lerp(0.24, 0.38, f), 1] };
      st.extra = opts.extra || [];
      // лист снизу (телефон): окно едет само, со своим фоном, размытием и тенью — без отдельного слоя-капли.
      // Его форма не меняется, а лишний слой с большой тенью телефон перерисовывал бы в первый кадр
      st.bare = st.kind === 'slide';
      if (st.bare) el.classList.remove('lg-morphing');
      if (reduce()) { el.classList.remove('lg-morph', 'lg-morphing'); return null; }
      build(st);
      S.set(el, st);
    } else {
      st.anims.forEach(a => { try { a.cancel(); } catch (e) { /* уже */ } });
      st.anims = [];
      if (opts.extra) st.extra = opts.extra;
    }
    clearTimeout(st.guard);
    st.mode = mode;
    el.classList.toggle('lg-morph-closing', mode === 'close');
    el.style.transformOrigin = '50% 50%';
    const sp = mode === 'open' ? st.spring.open : st.spring.close;
    const traj = trajectory(from.x, from.v, mode === 'open' ? 1 : 0, sp[0], sp[1]);
    // zoom, закрытие: пружина приходит в кнопку с ходу (без медленного «доползания»), дальше ~0,13 с кружок гаснет на месте
    // (если круг потом сливается с капсулой — noFade — он не гаснет, его подхватывает капсула)
    if (st.kind === 'zoom' && mode === 'close' && !opts.noFade) for (let k = 1; k <= 8; k++) traj.push({ x: 0, v: 0, fade: k / 8 });
    st.traj = traj;
    const K = keyframes(st, traj), dur = Math.max(FRAME, (traj.length - 1) * FRAME);
    const o = { duration: dur, easing: 'linear', fill: 'both' };
    const A = st.bare ? [el.animate(K.win, o)] : [el.animate(K.win, o), st.blob.animate(K.blob, o), st.blob.animate(K.blobR, o), st.rim.animate(K.rim, o)];
    if (st.ico) A.push(st.ico.animate(K.ico, o));
    if (st.srcEl) st.srcEl.style.visibility = 'hidden';   // кнопка — это теперь окно (её значок несёт слой поверх)
    if (st.neck) A.push(st.neck.animate(K.neck, o), st.neck.animate(K.neckR, o));
    st.extra.forEach((x, j) => { try { A.push(x.el.animate(K.extra[j], Object.assign({ pseudoElement: x.pseudo || undefined }, o))); } catch (e) { /* псевдоэлементы не поддерживаются — без этого слоя */ } });
    st.anims = A;
    const my = A[0];
    my.finished.then(() => { if (st.anims[0] === my) finish(st, mode === 'open' ? 'opened' : 'closed'); }, () => { /* отменена — пошла в другую сторону */ });
    const arm = () => { clearTimeout(st.guard); st.guard = setTimeout(() => { if (st.anims[0] === my) finish(st, mode === 'open' ? 'opened' : 'closed'); }, dur + 600); };   // страховка: окно приложения свернули и т. п.
    if (touch()) {
      // телефон: первый кадр (новые слои, отрисовка окна) бывает долгим. Часы анимации стоят, пока он не готов, —
      // иначе к его показу анимация уже прошла бы треть пути и окно «прыгало». Стоим в начальном положении
      const tok = st.tok = (st.tok || 0) + 1;
      A.forEach(a => { try { a.pause(); } catch (e) { /* уже */ } });
      let go = false;
      const play = () => { if (go || st.tok !== tok || st.anims !== A) return; go = true; A.forEach(a => { try { a.play(); } catch (e) { /* уже */ } }); arm(); };
      requestAnimationFrame(() => requestAnimationFrame(play));
      setTimeout(play, 400);   // кадры не приходят (окно свернули) — всё равно доводим
    } else arm();
    return st;
  }

  // Остановить без анимации (окно сменилось другим)
  function cancel(el) { const st = S.get(el); if (!st) return; clearTimeout(st.guard); teardown(st); S.delete(el); if (st.srcEl) { st.srcEl.style.removeProperty('visibility'); SRCEL.delete(el); } el.dispatchEvent(new CustomEvent('lg-morph-end', { detail: 'cancel' })); st.done.forEach(f => f('cancel')); st.done = []; }

  const run = mode => (el, src, opts) => new Promise(res => {
    if (!el) return res();
    const st = begin(el, src, mode, opts);
    if (st) st.done.push(res); else res(mode === 'open' ? 'opened' : 'closed');
  });
  return { open: run('open'), close: run('close'), cancel, release() {}, busy: el => S.has(el) };
})();

/* 21. Меню и всплывающие панели тоже вытекают из своих кнопок (LGMorph): меню пары, дня и сортировки,
   уведомления, статус, календарь, барабан времени, выбор недели и всплывающие окна профиля (тег, аватар,
   статус, витрина). Модуль следит за классом open (или за появлением панели) и сам запускает анимацию;
   закрытие ждёт, пока капля вернётся в кнопку. */
(function () {
  'use strict';
  if (!window.LGMorph || !window.MutationObserver) return;
  const $ = id => document.getElementById(id);
  const recent = () => { const l = window.LGLastPress && LGLastPress(); return l && performance.now() - l.t < 1200 ? l.el : null; };
  const KINDS = [
    { sel: '.lg-menu', src: () => recent(), liquid: src => !!(src && src.closest && src.closest('[data-liquid]')) },   // меню из жемчужной кнопки — «жидкое»
    { sel: '#notifPopover', src: () => $('bellBtn'), liquid: true },   // прототип «жидкой» капли (LGLiquid, модуль 22)
    { sel: '#pfStatusMenu', src: () => $('pfStatusBtn') },
    { sel: '.custom-date-picker', box: el => el.querySelector('.calendar-popup'), src: el => el.querySelector('.date-trigger'), noHide: true },
    { sel: '.lg-timepick', src: () => document.querySelector('.lg-time-btn.is-editing') || recent(), noHide: true },
    { sel: '.lg-weekpick', src: () => document.querySelector('#mainApp .lg-wb-center'), noHide: true, liquid: true }   // колонка недель вытекает из капсулы каплей
  ];
  const kindOf = el => KINDS.find(k => el.matches(k.sel));
  const was = new WeakMap(), from = new WeakMap(), eng = new WeakMap();

  function changed(el) {
    const k = kindOf(el); if (!k) return;
    const is = el.classList.contains('open');
    if (was.get(el) === is) return;
    was.set(el, is);
    const box = k.box ? k.box(el) : el; if (!box) return;
    if (is) {
      const src = k.src(el);
      from.set(el, src);
      const prev = eng.get(box), busy = prev && prev.busy(box);
      const liq = typeof k.liquid === 'function' ? k.liquid(src) : k.liquid;
      const E = busy ? prev : (liq && window.LGLiquid && LGLiquid.can(null, src) ? LGLiquid : LGMorph);
      eng.set(box, E);
      E.open(box, src, E === window.LGLiquid ? { keep: true } : { hideSource: !k.noHide });
    } else {
      const src = from.get(el), E = eng.get(box) || LGMorph;
      E.close(box, src && src.isConnected ? src : k.src(el), E === window.LGLiquid ? { keep: true } : undefined);
    }
  }
  const watchAttr = new MutationObserver(recs => recs.forEach(r => changed(r.target)));
  const watch = el => { if (was.has(el)) return; was.set(el, el.classList.contains('open')); watchAttr.observe(el, { attributes: true, attributeFilter: ['class'] }); if (el.classList.contains('open')) { was.set(el, false); changed(el); } };
  const scan = root => KINDS.forEach(k => { if (root.matches && root.matches(k.sel)) watch(root); if (root.querySelectorAll) root.querySelectorAll(k.sel).forEach(watch); });

  /* Всплывающие окна профиля: при каждом изменении профиль перерисовывает шапку целиком, поэтому
     «закрытие» — это исчезновение панели из разметки. Ушедшую панель на мгновение возвращаем на её место
     и даём ей стечь в свою кнопку. Если панель тут же нарисована заново (просто перерисовка) — ничего не делаем */
  const popKind = n => { const m = /pf-pop-(\w+)/.exec(n.className || ''); return m ? m[1] : ''; };
  const popAnchor = kind => {
    const pressed = recent();
    if (pressed && pressed.matches && pressed.matches(`[data-pop="${kind}"]`) && pressed.isConnected) return pressed;
    return document.querySelector(`#profileBackdrop [data-act="pop"][data-pop="${kind}"]`);
  };
  function profilePops(recs) {
    const added = [], removed = [];
    recs.forEach(r => {
      r.addedNodes.forEach(n => { if (n.nodeType === 1) (n.matches('.pf-pop') ? [n] : [...n.querySelectorAll('.pf-pop')]).forEach(x => added.push(x)); });
      r.removedNodes.forEach(n => { if (n.nodeType === 1 && !n.__lgGhost) (n.matches('.pf-pop') ? [n] : [...n.querySelectorAll('.pf-pop')]).forEach(x => removed.push(x)); });
    });
    const addedKinds = new Set(added.map(popKind));
    added.forEach(n => {
      if (!n.classList.contains('in')) return;            // перерисовка уже открытой панели
      n.classList.remove('in');
      LGMorph.open(n, popAnchor(popKind(n)), { hideSource: false });
    });
    removed.forEach(n => {
      const kind = popKind(n);
      if (!kind || addedKinds.has(kind)) return;
      const anchor = popAnchor(kind), host = anchor && anchor.closest('.pf-pop-anchor');
      if (!host) return;
      n.__lgGhost = true;
      n.setAttribute('aria-hidden', 'true');
      host.appendChild(n);
      LGMorph.close(n, anchor).then(() => n.remove());
    });
  }

  function start() {
    scan(document.body);
    // меню, барабан и выбор недели добавляются прямо в body
    new MutationObserver(recs => recs.forEach(r => r.addedNodes.forEach(n => { if (n.nodeType === 1) scan(n); })))
      .observe(document.body, { childList: true });
    const pf = $('profileBackdrop');
    if (pf) new MutationObserver(profilePops).observe(pf, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

/* 22. Жидкая капля, как в iOS 26 (LGLiquid). Пока — только окно настроек (прототип).
   Стекло капсулы, на которой нажали шестерёнку, стягивается к ней, а из её края вытекает капля. Капсула и капля —
   одна жидкость: их форма считается как слияние двух фигур (как у капель ртути), поэтому между ними тянется
   плавная перемычка, истончается и рвётся сама. Капля отплывает и раздувается в окно; содержимое окна внутри неё
   сначала сжато и размыто, потом проясняется. Закрытие — зеркально: окно стекает в каплю, капля подплывает,
   капсула вырастает обратно, капля сливается с ней и втягивается. Всё ведёт одна пружина, кадр за кадром. */
window.LGLiquid = (function () {
  'use strict';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const FOR = new Set();                           // большим окнам капля не нужна: у них своя анимация (модуль 20, zoom)
  // Две пружины (время отклика, с; затухание): вытекание капли из капсулы и полёт капли, раздувающейся в окно.
  // Полёт начинается, когда капля уже наполовину вытекла; при закрытии — наоборот
  const EMERGE = { open: [0.7, 0.9], close: [0.42, 1] }, FLY = { open: [0.85, 0.98], close: [0.75, 1] };
  // маленькие панели — побыстрее (время отклика пружин меньше)
  const EMERGE_S = { open: [0.6, 0.9], close: [0.36, 1] }, FLY_S = { open: [0.62, 0.96], close: [0.55, 1] };
  const mixSp = (a, b, f) => ({ open: [lerp(a.open[0], b.open[0], f), lerp(a.open[1], b.open[1], f)], close: [lerp(a.close[0], b.close[0], f), lerp(a.close[1], b.close[1], f)] });
  const GATE_OPEN = 0.85, GATE_CLOSE = 0.4, KICK = 1.5;   // GATE_CLOSE: при закрытии капля начинает втекать в кнопку ещё в полёте — одним движением; KICK — толчок от нажатия: капля начинает вытекать сразу
  const S = new WeakMap();                          // окно → анимация
  let seq = 0;
  const SRC = new WeakMap();                        // окно → капсула, из которой его открыли (туда и вернёмся)

  const capOf = el => (el && el.closest ? el.closest('.lg-glass') : null);
  function rectOk(el) {
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return null;
    return r;
  }
  // ov — окно (.modal-overlay) из списка FOR; без него — маленькая панель (меню, уведомления), ей капля подходит всегда
  function can(ov, src) { const c = capOf(src); return !!((!ov || FOR.has(ov.id)) && c && (c.closest('.lg-topbar') || c.hasAttribute('data-liquid')) && rectOk(c)); }

  // ---- вид стекла: цвет, размытие, тень ----
  function color(s) {
    const n = (String(s).match(/-?[\d.]+/g) || []).map(Number);
    return /^rgba?\(/.test(s) && n.length >= 3 ? [n[0], n[1], n[2], n.length > 3 ? n[3] : 1] : null;
  }
  function blurOf(s) {
    if (!s || s === 'none') return null;
    const b = /blur\(([\d.]+)px\)/.exec(s), t = /saturate\(([\d.]+)\)/.exec(s);
    return { b: b ? +b[1] : 0, s: t ? +t[1] : 1 };
  }
  // внутренние тени стекла (inset): цвет, сдвиг, размытие — их повторяет жидкость, чтобы её стекло не отличалось от кнопки
  function insetShadows(s) {
    if (!s || s === 'none') return [];
    const out = []; let d = 0, cur = '';
    for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur); cur = ''; } else cur += ch; }
    out.push(cur);
    return out.map(x => x.trim()).filter(x => /inset/.test(x)).map(x => {
      const col = (x.match(/(rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]+)/i) || [])[0] || 'rgba(255, 255, 255, 0.4)';
      const n = x.replace(col, '').replace('inset', '').trim().split(/\s+/).map(parseFloat).filter(v => !isNaN(v));
      const i = { col, ox: n[0] || 0, oy: n[1] || 0, blur: n[2] || 0, spread: n[3] || 0 };
      if (i.spread > 0 && !i.blur && !i.ox && !i.oy) i.ring = i.spread;   // ровная линия по краю внутрь («inset 0 0 0 2px»)
      return i;
    }).filter(i => i.ring || (!i.spread && (i.blur > 0 || i.ox || i.oy)));
  }
  // как выглядит стекло элемента сверх фона: внутренние тени, кромка (::after, повёрнута к свету), блик (::before)
  function details(el, cs, rect) {
    const L = { insets: insetShadows(cs.boxShadow), rim: null, spec: null };
    const a = getComputedStyle(el, '::after');
    if (a.content !== 'none' && a.display !== 'none') {
      if (/gradient/.test(a.backgroundImage)) {
        const hi = cs.getPropertyValue('--rim-hi').trim() || 'rgba(255, 255, 255, 1)';
        const ang = parseFloat(cs.getPropertyValue('--la')) || 155;
        L.rim = { hi, ang, rect };
      } else if (a.backgroundColor && !/rgba\(0, 0, 0, 0\)/.test(a.backgroundColor)) L.rim = { flat: a.backgroundColor, rect };
    }
    const b = getComputedStyle(el, '::before');
    if (b.content !== 'none' && b.display !== 'none' && parseFloat(b.opacity) > 0.01 && /radial/.test(b.backgroundImage)) {
      const lx = parseFloat(cs.getPropertyValue('--lx')), ly = parseFloat(cs.getPropertyValue('--ly'));
      L.spec = { col: cs.getPropertyValue('--spec').trim() || 'rgba(255, 255, 255, 0.6)', x: rect.left + (isNaN(lx) ? rect.width / 2 : lx), y: rect.top + (isNaN(ly) ? 0 : ly), op: parseFloat(b.opacity) };
    }
    return L;
  }
  // как далеко тень выходит за свой край (сдвиг + размытие + разлив)
  function shadowReach(s) {
    if (!s || s === 'none') return 0;
    const out = []; let d = 0, cur = '';
    for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur); cur = ''; } else cur += ch; }
    out.push(cur);
    return out.reduce((m, x) => {
      const n = x.replace(/(rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]+)/i, '').split(/\s+/).map(parseFloat).filter(v => !isNaN(v));
      return Math.max(m, Math.max(Math.abs(n[0] || 0), Math.abs(n[1] || 0)) + (n[2] || 0) + Math.max(0, n[3] || 0));
    }, 0);
  }
  function outerShadow(s) {
    if (!s || s === 'none') return 'none';
    const out = []; let d = 0, cur = '';
    for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur); cur = ''; } else cur += ch; }
    out.push(cur);
    return out.map(x => x.trim()).filter(x => x && !/inset/.test(x)).join(', ') || 'none';
  }
  function radiusOf(cs, w, h) {
    const v = String(cs.borderTopLeftRadius);
    let r = parseFloat(v) || 0;
    if (v.indexOf('%') >= 0) r = Math.min(w, h) * r / 100;
    return Math.min(r, w / 2, h / 2);
  }

  // ---- геометрия ----
  const f2 = v => (Math.round(v * 100) / 100).toString();
  function rrPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    return `M${f2(x + r)} ${f2(y)}H${f2(x + w - r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x + w)} ${f2(y + r)}V${f2(y + h - r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x + w - r)} ${f2(y + h)}`
      + `H${f2(x + r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x)} ${f2(y + h - r)}V${f2(y + r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x + r)} ${f2(y)}Z`;
  }
  // Контур области f < 0 на сетке (марширующие квадраты) → замкнутые ломаные для clip-path.
  // Точка пересечения лежит на ребре сетки; у каждой точки ровно два соседа по контуру.
  // side — направление к капле: слияние набухает только с её стороны (у широкой капсулы дальний край не вздувается)
  function contour(A, B2, k, x0, y0, nx, ny, step, side) {
    const W = nx + 1, H = ny + 1, V = new Float64Array(W * H);
    const sl = side ? 1 / (Math.abs(side.x) * A.hw + Math.abs(side.y) * A.hh || 1) : 0;
    // поле: мягкое слияние двух скруглённых прямоугольников (считаем прямо здесь — функция крутится всего несколько кадров)
    const ar = A.r, ahw = A.hw - ar, ahh = A.hh - ar, br = B2.r, bhw = B2.hw - br, bhh = B2.hh - br, ik = 1 / k;
    for (let j = 0; j < H; j++) {
      const y = y0 + j * step, qay = Math.abs(y - A.y) - ahh, qby = Math.abs(y - B2.y) - bhh;
      const may = qay > 0 ? qay : 0, mby = qby > 0 ? qby : 0;
      for (let i = 0; i < W; i++) {
        const x = x0 + i * step, qax = Math.abs(x - A.x) - ahw, qbx = Math.abs(x - B2.x) - bhw;
        const max = qax > 0 ? qax : 0, mbx = qbx > 0 ? qbx : 0;
        const da = Math.sqrt(max * max + may * may) + Math.min(qax > qay ? qax : qay, 0) - ar;
        const db = Math.sqrt(mbx * mbx + mby * mby) + Math.min(qbx > qby ? qbx : qby, 0) - br;
        const df = da - db, h = k - (df < 0 ? -df : df);
        let wg = 1;
        if (side) { const t = ((x - A.x) * side.x + (y - A.y) * side.y) * sl + 0.5; wg = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }
        V[j * W + i] = (da < db ? da : db) - (h > 0 ? h * h * ik * 0.25 * wg : 0);
      }
    }
    const N = W * H * 2, PX = new Float64Array(N), PY = new Float64Array(N), NB = new Int32Array(N * 2).fill(-1), has = new Uint8Array(N);
    // точка на ребре: e — номер ребра (у узла (i, j) горизонтальное 2·n, вертикальное 2·n+1), va/vb — значения на концах
    function pt(e, ax, ay, va, bx, by, vb) {
      if (!has[e]) { const u = va / (va - vb); PX[e] = ax + (bx - ax) * u - x0; PY[e] = ay + (by - ay) * u - y0; has[e] = 1; }
      return e;
    }
    function link(a, b) { NB[a * 2 + (NB[a * 2] < 0 ? 0 : 1)] = b; NB[b * 2 + (NB[b * 2] < 0 ? 0 : 1)] = a; }
    const starts = [];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const n = j * W + i, a = V[n], b = V[n + 1], c = V[n + W + 1], d = V[n + W];
        const code = (a < 0 ? 8 : 0) | (b < 0 ? 4 : 0) | (c < 0 ? 2 : 0) | (d < 0 ? 1 : 0);
        if (code === 0 || code === 15) continue;
        const X = x0 + i * step, Y = y0 + j * step, X1 = X + step, Y1 = Y + step;
        let T = -1, B = -1, L = -1, R = -1;
        if (code !== 3 && code !== 12 && code !== 1 && code !== 14 && code !== 2 && code !== 13) T = pt(n * 2, X, Y, a, X1, Y, b);
        if (code !== 3 && code !== 12 && code !== 4 && code !== 11 && code !== 7 && code !== 8) B = pt((n + W) * 2, X, Y1, d, X1, Y1, c);
        if (code !== 2 && code !== 13 && code !== 4 && code !== 11 && code !== 6 && code !== 9) L = pt(n * 2 + 1, X, Y, a, X, Y1, d);
        if (code !== 1 && code !== 14 && code !== 6 && code !== 9 && code !== 7 && code !== 8) R = pt((n + 1) * 2 + 1, X1, Y, b, X1, Y1, c);
        const mid = (a + b + c + d) / 4 < 0;
        switch (code) {
          case 1: case 14: link(L, B); break;
          case 2: case 13: link(B, R); break;
          case 3: case 12: link(L, R); break;
          case 4: case 11: link(T, R); break;
          case 6: case 9: link(T, B); break;
          case 7: case 8: link(T, L); break;
          case 5: if (mid) { link(T, L); link(R, B); } else { link(T, R); link(L, B); } break;
          case 10: if (mid) { link(T, R); link(L, B); } else { link(T, L); link(R, B); } break;
        }
        starts.push(T >= 0 ? T : L >= 0 ? L : B);
      }
    }
    let out = '';
    const seen = new Uint8Array(N);
    for (let n = 0; n < starts.length; n++) {
      const start = starts[n];
      if (!has[start] || seen[start] || NB[start * 2] < 0) continue;
      let prev = -1, cur = start, s = '';
      for (let guard = 0; guard < N; guard++) {
        seen[cur] = 1;
        s += (s ? 'L' : 'M') + f2(PX[cur]) + ' ' + f2(PY[cur]);
        const n0 = NB[cur * 2], n1 = NB[cur * 2 + 1];
        const next = n0 >= 0 && n0 !== prev && !seen[n0] ? n0 : (n1 >= 0 && !seen[n1] ? n1 : -1);
        if (next < 0) break;
        prev = cur; cur = next;
      }
      out += s + 'Z';
    }
    return out;
  }

  // ---- форма: e — насколько капля вытекла из капсулы, p — насколько долетела и раздулась в окно (чуть больше 1 — отскок) ----
  function shape(st) {
    const C = st.C, G = st.G, F = st.F, D = st.dir, De = st.dirE;
    const e = clamp(st.e, 0, 1), p = Math.max(0, st.p), over = Math.max(0, st.p - 1);
    // вытекание: капля выдавливается из края капсулы в сторону окна и подрастает
    // (прямо вниз из-под нажатой кнопки, не вылезая за край капсулы — иначе кажется, что стекло течёт вбок)
    const px1 = lerp(G.x, st.Xe, e) + De.x * st.E * e, py1 = lerp(G.y, st.Ye, e) + De.y * st.E * e, d1 = lerp(st.h0, st.h1, e);
    // полёт: от края капсулы к месту окна, по пути раздувается в окно
    // летит с разгоном (как сама пружина), а раздувается уже в полёте — глаз успевает проследить отрыв
    // и место, и размер идут ровно за пружиной: окно раздувается плавно, без рывка посередине
    // путь — дуга: оторвавшись, капля сначала падает вниз и только потом уходит к месту окна
    const t = clamp(p / 0.92, 0, 1), f = clamp((p - 0.02) / 0.95, 0, 1) + over;
    const vert = Math.abs(De.y) > 0.5;
    const cx = vert ? px1 : px1 + (F.x - px1) * 0.55, cy = vert ? py1 + (F.y - py1) * 0.55 : py1;
    const x = (1 - t) * (1 - t) * px1 + 2 * (1 - t) * t * cx + t * t * F.x;
    const y = (1 - t) * (1 - t) * py1 + 2 * (1 - t) * t * cy + t * t * F.y;
    // круглая — только пока размером с кнопку; оторвавшись, сразу берёт пропорции окна и растёт уменьшенным окном
    const sz = lerp(d1 / Math.min(F.w, F.h), 1, f), a = smooth(0, 0.12, f);
    let w = lerp(d1, F.w * sz, a), h = lerp(d1, F.h * sz, a);
    // упругость: в полёте капля чуть вытягивается вдоль пути и поджимается поперёк, на месте — лёгкий отскок
    const k = clamp(Math.max(0, st.vp) * 0.022, 0, 0.1) * (1 - smooth(0.7, 1, f));
    const dxa = Math.abs(D.x), dya = Math.abs(D.y);
    w *= 1 + k * dxa - k * 0.6 * dya; h *= 1 + k * dya - k * 0.6 * dxa;
    // углы: у маленькой капли — полный круг, у растущего окна — скругление окна, чуть больше, пока оно маленькое
    const r = Math.min(Math.min(w, h) / 2, F.r * (1 + 1.2 * (1 - clamp(f, 0, 1))));
    // капсула стекает в каплю: сжимается и тянется за ней хвостиком, пока не втянется целиком
    // (хвостик притягивается к заднему краю капли — капсула не остаётся отдельной крошкой, а втягивается)
    // как только капля полетела, остаток капсулы быстро втягивается в её задний край — без отдельных «крошек»
    // пока капля вытекает, капсула целая; стекает и втягивается за каплей, когда та полетела
    let s, u;
    if (st.keep) {
      // маленькая панель: кнопка отдаёт каплю, сама чуть вытягивается за ней и после отрыва упруго возвращается
      // у кнопки пошире — слабее, а широкая капсула (недели) стоит на месте: сжиматься и съезжать целиком ей незачем,
      // тянется только край у капли (иначе подписи на ней сдвигались бы на доли пикселя и дрожали)
      const big = Math.max(C.w, C.h), pull = smooth(0.25, 1, e) * (1 - smooth(0, 0.35, p)), amp = big > 240 ? 0 : Math.min(1, (104 / big) ** 2);
      s = 1 - 0.08 * pull * amp; u = 0.18 * pull * amp;
    } else { s = 1 - smooth(0, 0.16, p); u = Math.max(Math.pow(1 - s, 0.9), smooth(0, 0.1, p)); }
    const dl = Math.hypot(x - G.x, y - G.y) || 1, back = Math.min(w, h) * 0.3;
    const bx = x - (x - G.x) / dl * Math.min(back, dl), by = y - (y - G.y) / dl * Math.min(back, dl);
    const ax = G.x + (bx - G.x) * u, ay = G.y + (by - G.y) * u;
    const base = s > 0.002 ? (st.keep
      ? { x: G.x + (C.x - G.x) * s + (ax - G.x), y: G.y + (C.y - G.y) * s + (ay - G.y), hw: C.w / 2 * s, hh: C.h / 2 * s, r: C.r * s, dx: ax - G.x, dy: ay - G.y }
      : { x: lerp(ax, C.x, s), y: lerp(ay, C.y, s), hw: C.w / 2 * s, hh: C.h / 2 * s, r: C.r * s, dx: (ax - G.x) * (1 - s), dy: (ay - G.y) * (1 - s) }) : null;
    return { s, base, f, e, p, x, y, w, h, r };
  }

  function place(el, x, y, w, h) {
    el.style.transform = `translate(${f2(x)}px, ${f2(y)}px)`;
    el.style.width = f2(w) + 'px'; el.style.height = f2(h) + 'px';
  }
  // тени не перерисовываются каждый кадр: слой постоянного размера, его только растягивает видеокарта
  function stretch(el, x, y, sx, sy) { el.style.transform = `translate(${f2(x)}px, ${f2(y)}px) scale(${sx.toFixed(5)}, ${sy.toFixed(5)})`; }
  function sized(el, w, h, r) { el.style.width = f2(w) + 'px'; el.style.height = f2(h) + 'px'; el.style.borderRadius = f2(r) + 'px'; }

  // Кнопку могли перерисовать, пока капля в пути (расписание обновляется раз в минуту и после синхронизации):
  // находим новую такую же и продолжаем с ней — иначе новая кнопка появлялась бы целой рядом с каплей
  function recap(st) {
    if (st.cap.isConnected) return;
    const old = st.cap, oc = old.getAttribute('onclick');
    let n = old.id ? document.getElementById(old.id) : null;
    if (!n && oc) n = [...document.querySelectorAll('[onclick]')].find(e => e.getAttribute('onclick') === oc && e.className.split(' ')[0] === old.className.split(' ')[0]) || null;
    if (!n) return;
    st.cap = n; st.ref = n.parentElement;
    const from = SRC.get(st.box); if (from) from.cap = n;
    if (st.capOrigin) n.style.transformOrigin = st.capOrigin;
  }
  // Кнопка уехала, пока капля в пути (меню закрылось от прокрутки — список ещё едет): всё, что привязано к кнопке,
  // едет за ней, и капля втекает туда, где кнопка сейчас, а не остаётся висеть на старом месте посреди экрана.
  // Меряем родителя: на его место наши scale/translate у кнопки не влияют
  function follow(st) {
    const ref = st.ref;
    if (!ref || !ref.isConnected) return;
    const r = ref.getBoundingClientRect(), dx = r.left - st.refAt.x, dy = r.top - st.refAt.y;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
    st.refAt = { x: r.left, y: r.top };
    st.C.x += dx; st.C.y += dy; st.G.x += dx; st.G.y += dy; st.Xe += dx; st.Ye += dy;
    st.cr = { left: st.cr.left + dx, top: st.cr.top + dy };
    st.mv.x += dx; st.mv.y += dy;
    // кнопка уходит под шапку списка (верхний отступ прокрутки — там лежит стеклянная шапка) или за край —
    // капля не летит поверх шапки, а тает вместе с уходящей кнопкой
    if (st.view) {
      const C = st.C, v = st.view, hh = C.h / 2;
      const vis = clamp(Math.min((C.y + hh - v.top) / C.h, (v.bottom - (C.y - hh)) / C.h), 0, 1);
      st.fadeT = st.vis0 > 0 ? clamp(vis / st.vis0, 0, 1) : 1;
    }
  }
  // таяние — не быстрее чем за 0,18 с, даже если кнопка проскочила под шапку за пару кадров
  function fadeStep(st) {
    if (st.fadeT == null || st.fade === st.fadeT) return;
    const d = (st.dt || 1 / 60) / 0.18;
    st.fade = st.fadeT < st.fade ? Math.max(st.fadeT, st.fade - d) : Math.min(st.fadeT, st.fade + d);
  }
  function render(st) {
    recap(st);
    follow(st); fadeStep(st);
    const g = shape(st), F = st.F, L = st.look, k = st.k;
    const head = { x: g.x, y: g.y, hw: g.w / 2, hh: g.h / 2, r: g.r }, b = g.base;
    // пока кнопка и капля слиты, их стекло рисует жидкость одним контуром (капля вытекает из самого стекла кнопки),
    // а значки кнопки — копия поверх; разошлись — кнопка снова сама собой
    const gx = b ? Math.max(0, Math.abs(head.x - b.x) - head.hw - b.hw) : 0, gy = b ? Math.max(0, Math.abs(head.y - b.y) - head.hh - b.hh) : 0;
    // перемычка рвётся в полёте, даже если окно открывается вплотную к кнопке (иначе к концу они так и остались бы слитыми)
    // и набирает силу постепенно: в первый кадр (и последний при закрытии) форма — ровно кнопка, без вспухания
    const kk = Math.max(0.5, k * smooth(0, 0.35, g.e) * (1 - smooth(0.04, 0.24, g.p)));
    const merged = !!b && Math.hypot(gx, gy) < kk, go = 1;
    // как выглядят настоящие кнопки — читаем до того, как что-то поменяли в этом кадре (иначе браузер пересчитывает стили дважды)
    const liveNow = merged && st.live ? st.live.map(([el]) => { const q = getComputedStyle(el); return [q.backgroundColor, q.transform]; }) : null;
    st.cap.style.scale = b ? g.s.toFixed(4) : '0';
    st.cap.style.translate = b ? `${f2(b.dx)}px ${f2(b.dy)}px` : '0px 0px';
    st.cap.style.opacity = merged ? '0' : '';
    const ic = st.icons;
    ic.style.transform = b ? `translate(${f2(st.cr.left + b.dx)}px, ${f2(st.cr.top + b.dy)}px) scale(${g.s.toFixed(4)})` : 'scale(0)';
    ic.style.opacity = merged ? st.fade.toFixed(3) : '0';
    if (liveNow) st.live.forEach(([, c], n) => { c.style.backgroundColor = liveNow[n][0]; c.style.transform = liveNow[n][1]; });
    // стекло жидкости: то же, что у капсулы, по мере роста плавно становится стеклом окна
    const m = smooth(0.18, 0.7, g.f), goo = st.goo;   // пока капля держится за кнопку — стекло кнопки
    const c = L.c0.map((v, i) => lerp(v, L.c1[i], m));
    const gbg = `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${c[3].toFixed(3)})`;
    if (st.gbg !== gbg) { goo.style.backgroundColor = gbg; st.gbg = gbg; }   // одинаковое значение не пишем: каждая смена — перерисовка
    let lensOn = false;
    if (L.b0 || L.b1) {
      const b0 = L.b0 || { b: 0, s: 1 }, b1 = L.b1 || { b: 0, s: 1 };
      // преломление окна у края нарастает, пока капля становится окном; в конце — ровно как у самого окна
      const ls = st.lens ? smooth(0.6, 1, g.f) * (1 - (merged ? 1 : 0)) : 0;
      lensOn = ls > 0.01;
      if (lensOn) st.lens.disp.setAttribute('scale', (st.lens.full * ls).toFixed(2));
      const capLens = !lensOn && merged && st.capLens;
      // размытие — шагами по полпикселя: разницы глазом не видно, а телефон пересобирает фильтр стекла в разы реже
      const gbf = `${lensOn ? `url(#${st.lens.id}) ` : capLens ? `url(#${st.capLens.id}) ` : ''}blur(${(Math.round(lerp(b0.b, b1.b, m) * 2) / 2).toFixed(1)}px) saturate(${(Math.round(lerp(b0.s, b1.s, m) * 20) / 20).toFixed(2)})`;
      if (st.gbf !== gbf) { goo.style.backdropFilter = goo.style.webkitBackdropFilter = gbf; st.gbf = gbf; }
    }
    goo.style.opacity = (go * st.fade).toFixed(3);   // тает — каждый слой сам по себе: прозрачный общий слой лишил бы каплю размытия фона
    st.rim.style.opacity = st.shw.style.opacity = st.fade < 1 ? st.fade.toFixed(3) : '';
    // контур: одна капля — или капля, слитая с кнопкой перемычкой
    let x0, y0, bw, bh, d;
    if (!merged) {
      x0 = head.x - head.hw; y0 = head.y - head.hh; bw = g.w; bh = g.h;
      d = rrPath(0, 0, g.w, g.h, g.r);
      goo.style.borderRadius = f2(g.r) + 'px';
      goo.style.clipPath = 'none';
    } else {
      const pad = kk * 0.35 + 3;
      // слой — по целым пикселям: иначе край кнопки (и кромка) рисуется со сдвигом в полпикселя и мылится
      x0 = Math.floor(Math.min(head.x - head.hw, b.x - b.hw) - pad); y0 = Math.floor(Math.min(head.y - head.hh, b.y - b.hh) - pad);
      const x1 = Math.max(head.x + head.hw, b.x + b.hw) + pad, y1 = Math.max(head.y + head.hh, b.y + b.hh) + pad;
      const span = Math.max(x1 - x0, y1 - y0), step = clamp(span / 72, 1.75, span > 300 ? 2 : 3);   // у широкой капсулы — мельче, чтобы скругления её концов были ровными
      const nx = Math.ceil((x1 - x0) / step), ny = Math.ceil((y1 - y0) / step);
      bw = nx * step; bh = ny * step;
      // капля ещё целиком внутри кнопки (первые и последние кадры) — контур ровно кнопки, без ступенек сетки
      const inside = Math.abs(head.x - b.x) + head.hw <= b.hw + 0.5 && Math.abs(head.y - b.y) + head.hh <= b.hh + 0.5;
      d = inside && kk < 3 ? rrPath(b.x - b.hw - x0, b.y - b.hh - y0, b.hw * 2, b.hh * 2, b.r) : contour(b, head, kk, x0, y0, nx, ny, step, st.wide ? st.dirE : null);
      goo.style.borderRadius = '0';
      goo.style.clipPath = `path(evenodd, "${d}")`;
    }
    place(goo, x0, y0, bw, bh);
    if (!lensOn && merged && st.capLens) {
      const Cf = st.capLens.f, Ci = st.capLens.img;
      Cf.setAttribute('width', f2(bw)); Cf.setAttribute('height', f2(bh));
      Ci.setAttribute('x', f2(b.x - b.hw - x0)); Ci.setAttribute('y', f2(b.y - b.hh - y0));
      Ci.setAttribute('width', f2(b.hw * 2)); Ci.setAttribute('height', f2(b.hh * 2));
    }
    if (lensOn) {
      const Lf = st.lens.f, Li = st.lens.img;
      Lf.setAttribute('width', f2(bw)); Lf.setAttribute('height', f2(bh));
      Li.setAttribute('x', f2(head.x - head.hw - x0)); Li.setAttribute('y', f2(head.y - head.hh - y0));
      Li.setAttribute('width', f2(g.w)); Li.setAttribute('height', f2(g.h));
    }
    // светлая кромка стекла по контуру (как у капсулы); у окна её нет — гаснет по мере роста
    // детали стекла: у кнопки — пока жидкость ещё её стекло, у окна — по мере того, как она становится окном
    place(st.rim, x0, y0, bw, bh);
    st.rimClip.setAttribute('d', d);
    const tr = `translate(${f2(-x0)} ${f2(-y0)})`;
    st.rimSets.forEach(part => {
      const op = part.side ? m : 1 - m;
      if (op < 0.004) { part.g.setAttribute('display', 'none'); return; }
      part.g.removeAttribute('display'); part.g.setAttribute('opacity', op.toFixed(3));
      part.insets.forEach(ins => {
        if (ins.ring) { ins.path.setAttribute('d', d); return; }   // линия по контуру; внутренняя половина — внутри обрезки
        const P = ins.pad;
        ins.f.setAttribute('x', -P - Math.abs(ins.ox)); ins.f.setAttribute('y', -P - Math.abs(ins.oy));
        ins.f.setAttribute('width', bw + 2 * P + 2 * Math.abs(ins.ox)); ins.f.setAttribute('height', bh + 2 * P + 2 * Math.abs(ins.oy));
        // внутренняя тень = всё снаружи фигуры, сдвинутое и размытое, видимое только внутри
        ins.path.setAttribute('d', `M${-P - 2} ${-P - 2}H${f2(bw + P + 2)}V${f2(bh + P + 2)}H${-P - 2}Z` + d);
        ins.path.setAttribute('transform', `translate(${ins.ox} ${ins.oy})`);
      });
      if (part.spec) {
        const ox = part.side ? 0 : st.mv.x, oy = part.side ? 0 : st.mv.y;   // блик кнопки — вместе с кнопкой
        part.specG.setAttribute('cx', f2(part.specAt.x + ox - x0)); part.specG.setAttribute('cy', f2(part.specAt.y + oy - y0));
        part.spec.setAttribute('width', f2(bw)); part.spec.setAttribute('height', f2(bh));
      }
      if (part.grad) part.grad.setAttribute('gradientTransform', part.side ? tr : `translate(${f2(st.mv.x - x0)} ${f2(st.mv.y - y0)})`);
      if (part.rim) part.rim.setAttribute('d', d);
    });
    // тени: у капли сначала как у капсулы, потом как у окна; у остатка капсулы — своя
    const F0 = st.F, h1 = st.h1, sw = smooth(0.1, 0.7, g.f);
    // вырез под кнопкой: обрезка — только вокруг капли и кнопки (с запасом на тень), а не на весь экран:
    // её телефон перерисовывает каждый кадр, и чем она меньше, тем легче
    if (merged) {
      const M = Math.ceil(Math.max(st.reachC * Math.max(g.w, g.h) / st.h1, st.reachH * Math.max(g.w / F0.w, g.h / F0.h)) + 6);
      const wx0 = Math.floor(Math.min(head.x - head.hw - M, b.x - b.hw)), wy0 = Math.floor(Math.min(head.y - head.hh - M, b.y - b.hh));
      const wx1 = Math.ceil(Math.max(head.x + head.hw + M, b.x + b.hw)), wy1 = Math.ceil(Math.max(head.y + head.hh + M, b.y + b.hh));
      const sw0 = st.shw.style;
      sw0.left = wx0 + 'px'; sw0.top = wy0 + 'px'; sw0.width = (wx1 - wx0) + 'px'; sw0.height = (wy1 - wy0) + 'px';
      sw0.clipPath = `path(evenodd, "M0 0H${wx1 - wx0}V${wy1 - wy0}H0Z${rrPath(b.x - b.hw - wx0, b.y - b.hh - wy0, b.hw * 2, b.hh * 2, b.r)}")`;
    } else if (st.shw.style.clipPath !== 'none') {
      const sw0 = st.shw.style;
      sw0.clipPath = 'none'; sw0.left = sw0.top = '0px'; sw0.width = '100vw'; sw0.height = '100vh';
    }
    stretch(st.shH, head.x - head.hw, head.y - head.hh, g.w / F0.w, g.h / F0.h);
    stretch(st.shC, head.x - head.hw, head.y - head.hh, g.w / h1, g.h / h1);
    st.shH.style.opacity = (go * sw).toFixed(3);
    // тень капли — только у той части, что вышла из кнопки (пока капля внутри, тень кнопки уже лежит под ней)
    st.shC.style.opacity = (go * (1 - sw) * smooth(0.2, 0.75, g.e)).toFixed(3);
    if (merged) { stretch(st.shB, b.x - b.hw, b.y - b.hh, g.s, g.s); st.shB.style.opacity = st.fade.toFixed(3); }
    else st.shB.style.opacity = '0';
    // содержимое окна: внутри капли, сначала сжато и размыто
    const box = st.box, sx = Math.max(0.001, g.w / F.w), sy = Math.max(0.001, g.h / F.h);
    box.style.transform = `translate(${f2(g.x - F.x)}px, ${f2(g.y - F.y)}px) scale(${sx.toFixed(5)}, ${sy.toFixed(5)})`;
    const op = smooth(0.05, 0.35, g.f);                         // содержимое видно почти сразу — форма читается как окно
    // не ноль: иначе браузер не рисует окно, пока капля вытекает, и рисует его целиком в момент отрыва — отсюда «бам»
    box.style.opacity = Math.max(0.004, op * st.fade).toFixed(3);
    // размытие считается в масштабе содержимого: ограничиваем, иначе у маленькой капли оно огромное и тормозит видеокарту
    const bl = Math.min(10, 8 * (1 - smooth(0.1, 0.55, g.f)) / ((sx + sy) / 2));
    box.style.setProperty('filter', bl > 0.05 ? `blur(${bl.toFixed(2)}px)` : 'none', 'important');
    const settled = Math.abs(sx - 1) < 0.002 && Math.abs(sy - 1) < 0.002 && Math.abs(g.r - F.r) < 0.5;
    box.style.setProperty('clip-path', settled ? 'none' : `inset(0px round ${f2(g.r / sx)}px / ${f2(g.r / sy)}px)`, 'important');
    // затемнение фона
    if (st.dim) st.dim.currentTime = 1000 * smooth(0.04, 0.8, g.p);   // пока капля держится за кнопку, фон не темнеет
  }

  function spring(x, v, target, sp, dt) {
    const w = 2 * Math.PI / sp[0], kk = w * w, c = 2 * sp[1] * w;
    const n = Math.max(1, Math.ceil(dt * 480)), h = dt / n;
    for (let i = 0; i < n && dt > 0; i++) { v += (-kk * (x - target) - c * v) * h; x += v * h; }
    if (target === 0 && x < 0) { x = 0; v = 0; }
    return [x, v];
  }
  // кривая полёта: открытие — как cubic-bezier(0.45, 0, 0.4, 1): мягкий старт, ровный разгон, плавная посадка.
  // Закрытие — (0.3, 0, 0.3, 1): окно сразу трогается и равномерно стекает, без задержки и рывка посередине
  function ease(x, close) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const a = close ? 0.3 : 0.45, c = close ? 0.3 : 0.4;
    const X = u => 3 * (1 - u) * (1 - u) * u * a + 3 * (1 - u) * u * u * c + u * u * u;
    const Y = u => 3 * (1 - u) * u * u + u * u * u;
    let lo = 0, hi = 1, u = x;
    for (let i = 0; i < 24; i++) { u = (lo + hi) / 2; if (X(u) < x) lo = u; else hi = u; }
    return Y(u);
  }
  function step(st, now) {
    st.raf = 0;
    // часы идут с первого показанного кадра; если кадр задержался, анимация замедляется, а не перескакивает
    // кадр задержался — анимация идёт с той же скоростью (на телефоне в энергосбережении кадров вдвое меньше),
    // и только совсем долгий кадр (больше 1/30 с) замедляет её, а не перескакивает
    const dt = st.last == null ? 1 / 60 : clamp((now - st.last) / 1000, 0, 1 / 30);
    st.last = now; st.dt = dt;
    const open = st.mode === 'open';
    const eT = open ? 1 : (st.p <= GATE_CLOSE ? 0 : 1);
    const pT = open ? (st.e >= GATE_OPEN || st.p > 0.001 ? 1 : 0) : 0;
    [st.e, st.ve] = spring(st.e, st.ve, eT, open ? st.EM.open : st.EM.close, dt);
    // полёт и раскрытие в окно — по плавной кривой за точное время: мягко трогается (видно, как капля отрывается),
    // разгоняется и спокойно садится на место, без долгого «доползания» в конце, как было у пружины
    if (!st.seg || st.seg.to !== pT) {
      const span = Math.abs(pT - st.p);
      st.seg = { from: st.p, to: pT, t: 0, D: Math.max(0.12, (open ? st.Dopen : st.Dclose) * Math.max(0.35, span)) };
    }
    if (st.seg.from !== st.seg.to) {
      const sg = st.seg, p0 = st.p;
      sg.t = Math.min(sg.D, sg.t + dt);
      st.p = sg.t >= sg.D ? sg.to : sg.from + (sg.to - sg.from) * ease(sg.t / sg.D, sg.to === 0);   // в конце — ровно в цель
      st.vp = dt > 0 ? (st.p - p0) / dt : 0;
    } else st.vp = 0;
    const done = open ? Math.abs(st.e - 1) < 0.003 && Math.abs(st.ve) < 0.05 && st.p === 1
      : st.e < 0.02 && st.p === 0;
    if (done) { st.e = st.p = open ? 1 : 0; st.ve = st.vp = 0; }
    try { render(st); } catch (err) { finish(st, open ? 'opened' : 'closed'); return; }   // что-то не поддерживается — без анимации, но и без зависания
    if (done) finish(st, open ? 'opened' : 'closed');
    else { st.raf = requestAnimationFrame(t => step(st, t)); arm(st); }
  }
  // страховка: окно приложения свернули и кадры не приходят — доводим до конца
  function arm(st) { clearTimeout(st.guard); st.guard = setTimeout(() => { if (S.get(st.box) === st) { st.e = st.p = st.mode === 'open' ? 1 : 0; try { render(st); } catch (e) { /* без последнего кадра */ } finish(st, st.mode === 'open' ? 'opened' : 'closed'); } }, 1500); }

  const BOX_PROPS = ['transform', 'opacity', 'filter', 'clip-path', 'transform-origin', 'pointer-events'];
  function restoreCap(src) {
    if (!src) return;
    ['scale', 'translate', 'opacity', 'transform-origin'].forEach(p => src.cap.style.removeProperty(p));
  }
  function teardown(st, how) {
    cancelAnimationFrame(st.raf); clearTimeout(st.guard);
    if (st.root) st.root.remove();
    try { if (st.dim) st.dim.cancel(); } catch (e) { /* уже */ }
    const box = st.box;
    box.style.transition = 'none';                             // вернуть на место без собственных переходов окна
    box.classList.remove('lg-morph', 'lg-morphing', 'lg-morph-closing', 'lq-on');
    BOX_PROPS.forEach(p => box.style.removeProperty(p));
    void box.offsetWidth;
    box.style.transition = st.savedTr;
    // большое окно открыто — кнопка остаётся спрятанной под ним, как в iOS; у маленькой панели кнопка всегда на месте
    if (how !== 'opened' || st.keep) restoreCap(SRC.get(box));
  }
  function finish(st, how) {
    if (S.get(st.box) !== st) return;
    teardown(st, how);
    S.delete(st.box);
    if (how === 'opened' && window.LGBar) LGBar.refresh();
    st.box.dispatchEvent(new CustomEvent('lg-morph-end', { detail: how }));
    const d = st.done; st.done = []; d.forEach(f => f(how));
  }

  function begin(box, src, mode, opts) {
    let st = S.get(box);
    if (st) {                                                   // развернуть на ходу с той же скоростью
      st.mode = mode;
      box.classList.toggle('lg-morph-closing', mode === 'close');
      if (!st.raf) { st.last = null; st.raf = requestAnimationFrame(t => step(st, t)); }
      return st;
    }
    let from = SRC.get(box);
    if (mode === 'open' || !from) {
      const cap = capOf(src);
      if (!cap) return null;
      from = { cap, btn: src };
      SRC.set(box, from);
    }
    const cap = from.cap;
    if (!cap.isConnected) { SRC.delete(box); return null; }
    const v0 = mode === 'open' ? 0 : 1;
    st = { box, cap, done: [], mode, e: v0, p: v0, ve: mode === 'open' ? KICK : 0, vp: 0, last: null, keep: !!(opts && opts.keep), savedTr: box.style.transition };
    // размеры без наших смещений: окно на своём месте (без сдвига закрытого состояния и его перехода), капсула в полный рост
    box.style.transition = 'none';
    box.style.transform = 'none';
    const fr = box.getBoundingClientRect();
    box.style.removeProperty('transform');
    cap.style.removeProperty('scale'); cap.style.removeProperty('translate');
    const cr = cap.getBoundingClientRect();
    const btn = from.btn && from.btn.isConnected && cap.contains(from.btn) ? from.btn : cap;
    const br = btn.getBoundingClientRect();
    const bcs = getComputedStyle(box), ccs = getComputedStyle(cap);
    st.F = { x: fr.left + fr.width / 2, y: fr.top + fr.height / 2, w: fr.width, h: fr.height, r: radiusOf(bcs, fr.width, fr.height) };
    st.C = { x: cr.left + cr.width / 2, y: cr.top + cr.height / 2, w: cr.width, h: cr.height, r: radiusOf(ccs, cr.width, cr.height) };
    st.G = { x: br.left + br.width / 2, y: br.top + br.height / 2 };
    st.h0 = Math.min(st.C.h * 0.62, 34);
    st.h1 = st.C.h * 1.1;                                      // размер капли, когда она вытекла
    // направление к окну и где капля выходит из капсулы
    const ddx = st.F.x - st.G.x, ddy = st.F.y - st.G.y, dd = Math.hypot(ddx, ddy) || 1;
    st.dir = { x: ddx / dd, y: ddy / dd };
    // капля вытекает прямо из-под нажатой кнопки (к ближней грани капсулы), чуть кренясь в сторону окна
    // капля вытекает строго к ближней грани капсулы (окно ниже — вниз), из-под нажатой кнопки, но не за край капсулы
    st.dirE = Math.abs(st.dir.y) >= Math.abs(st.dir.x) * 0.3 ? { x: 0, y: Math.sign(st.dir.y) || 1 } : { x: Math.sign(st.dir.x) || 1, y: 0 };
    const mg = st.h1 / 2 + 6;
    const within = (v, c, half) => half > mg ? clamp(v, c - half + mg, c + half - mg) : c;   // кнопка уже капли — из её середины
    st.Xe = st.dirE.y ? within(st.G.x, st.C.x, st.C.w / 2) : st.G.x;
    st.Ye = st.dirE.x ? within(st.G.y, st.C.y, st.C.h / 2) : st.G.y;
    const tx = st.dirE.x ? (st.dirE.x > 0 ? st.C.x + st.C.w / 2 - st.Xe : st.Xe - (st.C.x - st.C.w / 2)) : 1e9;
    const ty = st.dirE.y ? (st.dirE.y > 0 ? st.C.y + st.C.h / 2 - st.Ye : st.Ye - (st.C.y - st.C.h / 2)) : 1e9;
    st.E = Math.max(0, Math.min(tx, ty)) + st.h1 * 0.75;     // отдельная капля висит у края капсулы на липкой перемычке
    st.k = st.C.h * 1.1;                                     // насколько далеко тянется перемычка (рвётся на ~половине)
    st.wide = Math.max(st.C.w, st.C.h) > 240;                // широкая капсула (недели): стоит на месте, дальний край не вздувается
    const fz = clamp((Math.sqrt(st.F.w * st.F.h) - 300) / 350, 0, 1);
    st.EM = mixSp(EMERGE_S, EMERGE, fz);
    st.Dopen = lerp(0.5, 0.65, fz); st.Dclose = lerp(0.46, 0.58, fz);   // время полёта: маленькая панель — чуть быстрее
    // стекло: в начале — как у капсулы, в конце — как у окна
    const lite = document.body.classList.contains('glass-lite'), dark = document.body.classList.contains('dark-theme');
    st.look = {
      c0: color(ccs.backgroundColor) || [255, 255, 255, 0.5], c1: color(bcs.backgroundColor) || [246, 246, 248, 0.9],
      b0: lite ? null : blurOf(ccs.backdropFilter || ccs.webkitBackdropFilter), b1: lite ? null : blurOf(bcs.backdropFilter || bcs.webkitBackdropFilter)
    };
    // все слои жидкости — в одном контейнере перед окном; контейнер выравниваем по краю экрана,
    // даже если кто-то из родителей сдвинут (тогда «fixed» считается от него, а не от экрана)
    const root = document.createElement('div'); root.className = 'lq-root'; root.setAttribute('aria-hidden', 'true');
    box.parentNode.insertBefore(root, box);
    const rr = root.getBoundingClientRect();
    root.style.transform = `translate(${f2(-rr.left)}px, ${f2(-rr.top)}px)`;
    st.root = root;
    const layer = (cls, shadow) => { const el = document.createElement('div'); el.className = cls; el.setAttribute('aria-hidden', 'true'); if (shadow) el.style.boxShadow = shadow; root.appendChild(el); return el; };
    // тени капли лежат поверх кнопки — вырезаем место кнопки, чтобы тень не ложилась на неё
    st.shB = layer('lq-shadow', outerShadow(ccs.boxShadow)); sized(st.shB, st.C.w, st.C.h, st.C.r);
    st.shw = layer('lq-shwrap');
    st.shC = layer('lq-shadow', outerShadow(ccs.boxShadow)); sized(st.shC, st.h1, st.h1, st.h1 / 2);
    st.shH = layer('lq-shadow', outerShadow(bcs.boxShadow)); sized(st.shH, st.F.w, st.F.h, st.F.r);
    st.reachC = shadowReach(outerShadow(ccs.boxShadow)); st.reachH = shadowReach(outerShadow(bcs.boxShadow));
    st.shw.append(st.shC, st.shH);
    st.goo = layer('lq-goo');
    // окно с преломлением у края (data-lens): та же линза, что у окна, едет вместе с каплей и нарастает к концу
    if (box.hasAttribute('data-lens') && window.LGLensMap && !lite && document.documentElement.classList.contains('lg-can-refract')) {
      const NS0 = 'http://www.w3.org/2000/svg', W0 = Math.round(box.offsetWidth), H0 = Math.round(box.offsetHeight);
      const R0 = Math.round(Math.min(st.F.r, W0 / 2, H0 / 2));
      const bez = Number(box.dataset.lensBez) || Math.max(6, Math.min(18, Math.round(Math.min(W0, H0) * 0.34)));
      const svg = document.createElementNS(NS0, 'svg'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
      const id = 'lql' + (++seq), f = document.createElementNS(NS0, 'filter');
      f.id = id; f.setAttribute('filterUnits', 'userSpaceOnUse'); f.setAttribute('color-interpolation-filters', 'sRGB'); f.setAttribute('x', '0'); f.setAttribute('y', '0');
      f.innerHTML = `<feImage href="${LGLensMap(W0, H0, R0, bez)}" preserveAspectRatio="none" result="map"/><feDisplacementMap in="SourceGraphic" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G"/>`;
      svg.appendChild(f); root.appendChild(svg);
      st.lens = { id, f, img: f.firstChild, disp: f.lastChild, full: Math.round(bez * (Number(box.dataset.lens) || 1.5)) };
    }
    // у кнопки тоже преломление у края (data-lens): пока кнопку рисует жидкость, та же линза стоит на месте кнопки,
    // а вокруг неё (капля, перемычка) смещения нет — серый 128 и есть «без сдвига». Иначе на миг слияния края кнопки
    // переставали преломлять то, что под ней (у капсулы недель над списком это заметно)
    if (cap.hasAttribute('data-lens') && window.LGLensMap && !lite && document.documentElement.classList.contains('lg-can-refract')) {
      const NS1 = 'http://www.w3.org/2000/svg', Wc = Math.round(cap.offsetWidth), Hc = Math.round(cap.offsetHeight);
      const Rc = Math.round(Math.min(parseFloat(ccs.borderTopLeftRadius) || 0, Wc / 2, Hc / 2));   // как у самой кнопки (модуль 2)
      const bz = Number(cap.dataset.lensBez) || Math.max(6, Math.min(18, Math.round(Math.min(Wc, Hc) * 0.34)));
      const svg = document.createElementNS(NS1, 'svg'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
      const id = 'lqc' + (++seq), f = document.createElementNS(NS1, 'filter');
      f.id = id; f.setAttribute('filterUnits', 'userSpaceOnUse'); f.setAttribute('color-interpolation-filters', 'sRGB'); f.setAttribute('x', '0'); f.setAttribute('y', '0');
      f.innerHTML = `<feFlood flood-color="rgb(128,128,128)" result="bg"/><feImage href="${LGLensMap(Wc, Hc, Rc, bz)}" preserveAspectRatio="none" result="m"/>` +
        `<feComposite in="m" in2="bg" operator="over" result="map"/><feDisplacementMap in="SourceGraphic" in2="map" scale="${Math.round(bz * (Number(cap.dataset.lens) || 1.5))}" xChannelSelector="R" yChannelSelector="G"/>`;
      svg.appendChild(f); root.appendChild(svg);
      st.capLens = { id, f, img: f.children[1] };
    }
    // детали стекла поверх жидкости — точная копия того, что есть у кнопки (и у окна, к концу): внутреннее свечение,
    // светлая полоска сверху, кромка к свету и блик под курсором. Всё обрезано по контуру жидкости
    const NS = 'http://www.w3.org/2000/svg', uid = 'lq' + (++seq);
    const rim = document.createElementNS(NS, 'svg');
    rim.setAttribute('class', 'lq-rim'); rim.setAttribute('aria-hidden', 'true');
    const DC = details(cap, ccs, cr), DB = details(box, bcs, fr);
    const mk = (tag, at, parent) => { const n = document.createElementNS(NS, tag); Object.keys(at).forEach(k => n.setAttribute(k, at[k])); (parent || rim).appendChild(n); return n; };
    const defs = mk('defs', {});
    const clip = mk('clipPath', { id: uid + 'c' }, defs), clipP = mk('path', { 'clip-rule': 'evenodd' }, clip);
    const grp = mk('g', { 'clip-path': `url(#${uid}c)` });
    const sets = [];
    [DC, DB].forEach((D, side) => {
      const g = mk('g', {}, grp), part = { g, side, insets: [], rim: null, grad: null, spec: null, specG: null };
      D.insets.forEach((ins, n) => {
        if (ins.ring) { part.insets.push({ ring: ins.ring, path: mk('path', { fill: 'none', stroke: ins.col, 'stroke-width': ins.ring * 2 }, g) }); return; }
        const sd = ins.blur / 2, f = mk('filter', { id: `${uid}f${side}${n}`, filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' }, defs);
        if (sd > 0.05) mk('feGaussianBlur', { stdDeviation: sd.toFixed(2) }, f);
        const path = mk('path', { 'fill-rule': 'evenodd', fill: ins.col, filter: `url(#${uid}f${side}${n})` }, g);
        part.insets.push({ path, f, pad: Math.ceil(sd * 3 + Math.abs(ins.ox) + Math.abs(ins.oy) + 4), ox: ins.ox, oy: ins.oy });
      });
      if (D.spec) {
        const rg = mk('radialGradient', { id: `${uid}s${side}`, gradientUnits: 'userSpaceOnUse', r: '140' }, defs);
        mk('stop', { offset: '0', 'stop-color': D.spec.col }, rg); mk('stop', { offset: '0.7', 'stop-color': D.spec.col, 'stop-opacity': '0' }, rg);
        part.spec = mk('rect', { fill: `url(#${uid}s${side})`, opacity: D.spec.op.toFixed(3) }, g); part.specG = rg; part.specAt = D.spec;
      }
      if (D.rim) {
        let stroke = D.rim.flat || '';
        if (!stroke) {
          const R = D.rim.rect, a = D.rim.ang * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a);
          const Lh = (Math.abs(R.width * dx) + Math.abs(R.height * dy)) / 2, cx = R.left + R.width / 2, cy = R.top + R.height / 2;
          const lg = mk('linearGradient', { id: `${uid}g${side}`, gradientUnits: 'userSpaceOnUse', x1: f2(cx - dx * Lh), y1: f2(cy - dy * Lh), x2: f2(cx + dx * Lh), y2: f2(cy + dy * Lh) }, defs);
          [[0, 1], [0.24, 0.32], [0.5, 0], [0.76, 0.18], [1, 0.78]].forEach(([o, op]) => mk('stop', { offset: o, 'stop-color': D.rim.hi, 'stop-opacity': op }, lg));
          part.grad = lg; stroke = `url(#${uid}g${side})`;
        }
        part.rim = mk('path', { fill: 'none', stroke, 'stroke-width': '2' }, g);
      }
      sets.push(part);
    });
    root.appendChild(rim);
    st.rim = rim; st.rimClip = clipP; st.rimSets = sets;
    // значки кнопки поверх жидкости: копия капсулы без стекла (стекло теперь рисует жидкость)
    const ic = cap.cloneNode(true);
    ic.removeAttribute('id'); ic.removeAttribute('data-lens');
    ic.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    [ic, ...ic.querySelectorAll('[data-tip], [title]')].forEach(n => { n.removeAttribute('data-tip'); n.removeAttribute('title'); });
    ic.style.cssText = '';
    // без классов стекла: иначе правила панели дают копии своё размытие фона, и стекло ложится на стекло (капсула синеет)
    ic.classList.remove('lg-glass', 'lg-refract', 'is-lit', 'is-press');
    ic.classList.add('lq-icons'); ic.setAttribute('aria-hidden', 'true');
    ['display', 'alignItems', 'justifyContent', 'gap', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'color',
      'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'whiteSpace', 'textAlign'].forEach(n => { ic.style[n] = ccs[n]; });
    ic.style.boxSizing = 'border-box'; ic.style.whiteSpace = 'nowrap';   // ровно по размеру кнопки: подпись не переносится на вторую строку
    ic.style.width = cr.width + 'px'; ic.style.height = cr.height + 'px';
    // наведение и нажатие у копии не срабатывают — переносим, как кнопки выглядят сейчас (кружок под курсором и т. п.)
    const real = [...cap.querySelectorAll('*')], copy = [...ic.querySelectorAll('*')];
    real.forEach((el, n) => {
      const c = copy[n]; if (!c || c.tagName !== el.tagName) return;
      const q = getComputedStyle(el);
      ['backgroundColor', 'color', 'opacity', 'transform', 'boxShadow', 'fill', 'stroke'].forEach(k => { c.style[k] = q[k]; });
      if (el.matches('button, [role="button"]')) (st.live = st.live || []).push([el, c]);   // кнопки сверяем каждый кадр
    });
    ic.style.transformOrigin = `${f2(st.G.x - cr.left)}px ${f2(st.G.y - cr.top)}px`;
    root.appendChild(ic);
    st.icons = ic; st.cr = { left: cr.left, top: cr.top };
    st.ref = cap.parentElement; st.mv = { x: 0, y: 0 }; st.fade = 1;
    for (let e = cap.parentElement; e && e !== document.body; e = e.parentElement) {
      const q = getComputedStyle(e);
      if (!/(auto|scroll)/.test(q.overflowY)) continue;
      const vr = e.getBoundingClientRect();
      st.view = { top: vr.top + (parseFloat(q.paddingTop) || 0), bottom: vr.bottom };
      const hh = st.C.h / 2;
      st.vis0 = clamp(Math.min((st.C.y + hh - st.view.top) / st.C.h, (st.view.bottom - (st.C.y - hh)) / st.C.h), 0, 1);
      break;
    }
    if (st.ref) { const pr = st.ref.getBoundingClientRect(); st.refAt = { x: pr.left, y: pr.top }; }
    box.classList.add('lg-morph', 'lg-morphing', 'lq-on');
    box.classList.toggle('lg-morph-closing', mode === 'close');
    box.style.transformOrigin = '50% 50%';
    box.style.pointerEvents = 'none';                          // пока летит, курсор не цепляет подсказки внутри
    cap.style.transformOrigin = st.capOrigin = `${f2(st.G.x - cr.left)}px ${f2(st.G.y - cr.top)}px`;
    const ov = opts && opts.ov;
    if (ov) { try { st.dim = ov.animate([{ opacity: 0 }, { opacity: 1 }], { pseudoElement: '::before', duration: 1000, fill: 'both' }); st.dim.pause(); } catch (e) { st.dim = null; } }
    S.set(box, st);
    render(st);
    st.raf = requestAnimationFrame(t => step(st, t));
    arm(st);
    return st;
  }

  // Расчёт перемычки работает всего несколько кадров, и браузер не успевает его ускорить. Прогоняем его заранее,
  // когда приложение простаивает, — тогда первые кадры капли считаются за доли миллисекунды
  const warm = () => { try { const a = { x: 60, y: 30, hw: 45, hh: 26, r: 26 }, b = { x: 40, y: 60, hw: 30, hh: 30, r: 30 }; for (let n = 0; n < 6; n++) { b.x -= 4; contour(a, b, 57, -10, -10, 70, 60, 2); } } catch (e) { /* не страшно */ } };
  if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 4000 }); else setTimeout(warm, 2000);

  const run = mode => (box, src, opts) => new Promise(res => {
    const st = box && begin(box, src, mode, opts);
    if (st) st.done.push(res); else res(mode === 'open' ? 'opened' : 'closed');
  });
  function cancel(box) {
    const st = S.get(box);
    if (st) { teardown(st, 'cancel'); S.delete(box); box.dispatchEvent(new CustomEvent('lg-morph-end', { detail: 'cancel' })); const d = st.done; st.done = []; d.forEach(f => f('cancel')); }
    else restoreCap(SRC.get(box));
  }

  /* ---- Капсула из двух кнопок разделяется на два круга, как жидкое стекло в iOS 26 (колокольчик | шестерёнка):
     правый край капсулы втягивается к первой кнопке, а круг второй кнопки отходит в сторону на перемычке, она
     истончается и рвётся. Из отделившегося круга потом вырастает окно (модуль 20, вид zoom); на закрытии окно
     садится в этот круг, и он сливается с капсулой обратно. Пока идёт анимация, саму капсулу рисует жидкость:
     то же стекло, те же кромка, свечение и тень, значки — копия поверх. */
  function split(cap, btn) {
    const cr = cap.getBoundingClientRect(), br = btn.getBoundingClientRect(), ccs = getComputedStyle(cap);
    const R = cr.height / 2, cy = cr.top + R, dir = br.left + br.width / 2 > cr.left + cr.width / 2 ? 1 : -1;
    const gap = 10, K = R * 0.9;
    // где кончается капсула без кнопки (круг вокруг оставшейся) и откуда/куда идёт круг кнопки
    const keep = dir > 0 ? cr.left + 2 * R : cr.right - 2 * R;
    const g0 = br.left + br.width / 2, g1 = keep + dir * (gap + R);
    const lite = document.body.classList.contains('glass-lite');
    const bf = lite ? null : blurOf(ccs.backdropFilter || ccs.webkitBackdropFilter);
    const root = document.createElement('div'); root.className = 'lq-root lq-split'; root.setAttribute('aria-hidden', 'true');
    root.style.zIndex = '4000';   // над приложением, но под окнами: затемнение окна ложится и на неё
    document.body.appendChild(root);
    const rr0 = root.getBoundingClientRect();
    root.style.transform = `translate(${f2(-rr0.left)}px, ${f2(-rr0.top)}px)`;
    const mk = cls => { const d = document.createElement('div'); d.className = cls; d.setAttribute('aria-hidden', 'true'); root.appendChild(d); return d; };
    const shadow = outerShadow(ccs.boxShadow);
    const sL = mk('lq-shadow'), sG = mk('lq-shadow'); sL.style.boxShadow = sG.style.boxShadow = shadow;
    const goo = mk('lq-goo');
    goo.style.backgroundColor = ccs.backgroundColor;
    if (bf) goo.style.backdropFilter = goo.style.webkitBackdropFilter = `blur(${bf.b}px) saturate(${bf.s})`;
    // кромка и внутреннее свечение — по контуру жидкости
    const NS = 'http://www.w3.org/2000/svg', uid = 'lqs' + (++seq), D = details(cap, ccs, cr);
    const rim = document.createElementNS(NS, 'svg'); rim.setAttribute('class', 'lq-rim'); root.appendChild(rim);
    const el = (tag, at, parent) => { const n = document.createElementNS(NS, tag); Object.keys(at).forEach(k => n.setAttribute(k, at[k])); (parent || rim).appendChild(n); return n; };
    const defs = el('defs', {}), clip = el('clipPath', { id: uid + 'c' }, defs), clipP = el('path', { 'clip-rule': 'evenodd' }, clip);
    const grp = el('g', { 'clip-path': `url(#${uid}c)` }), parts = [];
    D.insets.forEach((ins, n) => {
      if (ins.ring) { parts.push({ ring: true, path: el('path', { fill: 'none', stroke: ins.col, 'stroke-width': ins.ring * 2 }, grp) }); return; }
      const sd = ins.blur / 2, f = el('filter', { id: `${uid}f${n}`, filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' }, defs);
      if (sd > 0.05) el('feGaussianBlur', { stdDeviation: sd.toFixed(2) }, f);
      parts.push({ f, pad: Math.ceil(sd * 3 + Math.abs(ins.ox) + Math.abs(ins.oy) + 4), ox: ins.ox, oy: ins.oy, path: el('path', { 'fill-rule': 'evenodd', fill: ins.col, filter: `url(#${uid}f${n})` }, grp) });
    });
    const rimP = D.rim ? el('path', { fill: 'none', stroke: D.rim.flat || D.rim.hi || 'rgba(255,255,255,0.8)', 'stroke-width': '2' }, grp) : null;
    // значки — копия капсулы без стекла; кнопка, которая отделяется, едет вместе со своим кругом
    const ic = cap.cloneNode(true);
    ic.removeAttribute('id'); ic.removeAttribute('data-lens');
    ic.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    [ic, ...ic.querySelectorAll('[data-tip], [title]')].forEach(n => { n.removeAttribute('data-tip'); n.removeAttribute('title'); });
    ic.style.cssText = '';
    ic.classList.remove('lg-glass', 'lg-refract', 'is-lit', 'is-press');
    ic.classList.add('lq-icons');
    ['display', 'alignItems', 'justifyContent', 'gap', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'color', 'boxSizing'].forEach(n => { ic.style[n] = ccs[n]; });
    ic.style.width = cr.width + 'px'; ic.style.height = cr.height + 'px';
    const real = [...cap.querySelectorAll('*')], copy = [...ic.querySelectorAll('*')];
    real.forEach((e, n) => {
      const c = copy[n]; if (!c || c.tagName !== e.tagName) return;
      const q = getComputedStyle(e);
      ['backgroundColor', 'color', 'opacity', 'transform', 'boxShadow', 'fill', 'stroke'].forEach(k => { c.style[k] = q[k]; });
    });
    const gIc = copy[real.indexOf(btn)] || null;
    if (gIc) gIc.style.backgroundColor = 'transparent';   // подсветка под курсором не нужна: кнопкой теперь стал сам круг
    ic.style.transform = `translate(${f2(cr.left)}px, ${f2(cr.top)}px)`;
    root.appendChild(ic);
    cap.style.opacity = '0';                                   // саму капсулу теперь рисует жидкость
    const S0 = { t: 0, v: 0, target: 0, raf: 0, last: null, done: [], gear: true };

    function draw() {
      const t = S0.t, e = clamp(t, 0, 1);
      // капсула без кнопки: её дальний край втягивается до круга вокруг оставшейся кнопки
      const far = lerp(dir > 0 ? cr.right : cr.left, keep, e);
      const l = dir > 0 ? cr.left : Math.min(far, cr.right - 2 * R), r = dir > 0 ? Math.max(far, cr.left + 2 * R) : cr.right;
      const L = { x: (l + r) / 2, y: cy, hw: (r - l) / 2, hh: R, r: R };
      const gx = lerp(g0, g1, t), G = { x: gx, y: cy, hw: R, hh: R, r: R };
      const k = Math.max(1e-4, K * smooth(0, 0.25, e) * (1 - smooth(0.6, 1, e)));
      const withG = S0.gear;
      const pad = k * 0.35 + 4;
      const x0 = Math.floor(Math.min(L.x - L.hw, withG ? G.x - R : 1e9) - pad), y0 = Math.floor(cy - R - pad);
      const x1 = Math.max(L.x + L.hw, withG ? G.x + R : -1e9) + pad, y1 = cy + R + pad;
      const step = 1.5, nx = Math.ceil((x1 - x0) / step), ny = Math.ceil((y1 - y0) / step), bw = nx * step, bh = ny * step;
      // в самом начале и без второго круга — ровный контур, без ступенек сетки
      const d = !withG ? rrPath(L.x - L.hw - x0, cy - R - y0, L.hw * 2, R * 2, R)
        : t < 0.004 ? rrPath(cr.left - x0, cr.top - y0, cr.width, cr.height, R) : contour(L, G, k, x0, y0, nx, ny, step);
      place(goo, x0, y0, bw, bh); goo.style.clipPath = `path(evenodd, "${d}")`;
      place(rim, x0, y0, bw, bh); clipP.setAttribute('d', d);
      parts.forEach(pt => {
        if (pt.ring) { pt.path.setAttribute('d', d); return; }
        const P = pt.pad;
        pt.f.setAttribute('x', -P - Math.abs(pt.ox)); pt.f.setAttribute('y', -P - Math.abs(pt.oy));
        pt.f.setAttribute('width', bw + 2 * P + 2 * Math.abs(pt.ox)); pt.f.setAttribute('height', bh + 2 * P + 2 * Math.abs(pt.oy));
        pt.path.setAttribute('d', `M${-P - 2} ${-P - 2}H${f2(bw + P + 2)}V${f2(bh + P + 2)}H${-P - 2}Z` + d);
        pt.path.setAttribute('transform', `translate(${pt.ox} ${pt.oy})`);
      });
      if (rimP) rimP.setAttribute('d', d);
      // тени: у капсулы — своя, у круга — проявляется, когда он отошёл (иначе на месте стыка тень двойная)
      sized(sL, L.hw * 2, R * 2, R); sL.style.transform = `translate(${f2(L.x - L.hw)}px, ${f2(cy - R)}px)`;
      sized(sG, R * 2, R * 2, R); sG.style.transform = `translate(${f2(G.x - R)}px, ${f2(cy - R)}px)`;
      sG.style.opacity = withG ? smooth(0.45, 0.9, e).toFixed(3) : '0';
      if (gIc) gIc.style.transform = `translateX(${f2(gx - g0)}px)`;
    }
    function step(now) {
      S0.raf = 0;
      const dt = S0.last == null ? 1 / 60 : clamp((now - S0.last) / 1000, 0, 1 / 30);
      S0.last = now;
      // разделение — с лёгким отскоком круга; слияние — без отскока, круг с ходу садится в капсулу
      [S0.t, S0.v] = spring(S0.t, S0.v, S0.target, S0.target ? [0.34, 0.7] : [0.3, 0.86], dt);
      const fin = Math.abs(S0.t - S0.target) < 0.002 && Math.abs(S0.v) < 0.03;
      if (fin) { S0.t = S0.target; S0.v = 0; }
      draw();
      // разделение: окно растёт, как только круг отделился (дальше круг лишь чуть покачивается — ждать незачем)
      if (fin || (S0.target === 1 && S0.t >= 0.96)) { const d = S0.done; S0.done = []; d.forEach(f => f()); }
      if (!fin) S0.raf = requestAnimationFrame(step);
    }
    draw();
    return {
      color: ccs.backgroundColor,
      gearIcon: gIc,
      gearRect: () => ({ x: lerp(g0, g1, S0.t), y: cy, w: 2 * R, h: 2 * R }),   // где круг кнопки сейчас
      to(target) {
        return new Promise(res => {
          S0.target = target; S0.done.push(res);
          if (!S0.raf) { S0.last = null; S0.raf = requestAnimationFrame(step); }
        });
      },
      gear(on) { S0.gear = on; draw(); },        // круг кнопки на время, пока он — окно, не рисуем
      remove() { cancelAnimationFrame(S0.raf); root.remove(); cap.style.removeProperty('opacity'); }
    };
  }

  return { can, open: run('open'), close: run('close'), cancel, split, busy: box => S.has(box) };
})();
