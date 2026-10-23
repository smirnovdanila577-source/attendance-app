/* ПРОБА (только демо): преломление у края нижнего бара на iPhone, как у жидкого стекла в Телеграме.
   Safari не даёт странице картинку того, что лежит под баром, поэтому расписание (оно почти всегда под баром)
   рисуется заранее в картинку: карточки, их фон, тексты. В баре, под вкладками, лежит холст WebGL — он и есть стекло:
   размытая картинка того, что под баром, в тоне стекла; к кромке, как выпуклая линза, загибает то, что лежит рядом
   с баром (сильнее всего на скруглённых концах). При прокрутке меняется только сдвиг. */
(function () {
  'use strict';
  const mq = window.matchMedia('(max-width: 760px)');
  const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  const FS = [
    'precision mediump float;',
    'uniform sampler2D t;uniform sampler2D tl;uniform vec2 res;uniform float dpr;uniform vec2 org;uniform vec2 tsz;uniform vec2 hs;uniform float r;',
    'uniform float bez;uniform float str;uniform vec3 bg;uniform vec4 tone;uniform float lift;uniform float sat;',
    'uniform vec2 kc;uniform vec2 khs;uniform float kr;uniform float glow;uniform float tw;uniform float pill;uniform float rf;',
    'float sk(vec2 p){vec2 q=abs(p-kc)-khs+vec2(kr);return length(max(q,0.))+min(max(q.x,q.y),0.)-kr;}',
    'float sd(vec2 p){vec2 q=abs(p)-hs+vec2(r);return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}',
    'vec3 tex(vec2 c){vec2 u=c/tsz; if(u.y<0.||u.y>1.||u.x<0.||u.x>1.) return bg; return texture2D(t,u).rgb;}',
    'vec3 lo(vec2 c){vec2 u=c/tsz; if(u.y<0.||u.y>1.||u.x<0.||u.x>1.) return bg; return texture2D(tl,u).rgb;}',
    'void main(){',
    '  vec2 p=vec2(gl_FragCoord.x,res.y-gl_FragCoord.y)/dpr; vec2 lp=p-hs; float d=sd(lp);',
    '  if(d>1.){gl_FragColor=vec4(0.);return;}',
    '  vec2 g=vec2(sd(lp+vec2(.5,0.))-sd(lp-vec2(.5,0.)),sd(lp+vec2(0.,.5))-sd(lp-vec2(0.,.5))); g=g/max(length(g),1e-4);',
    // стекло — как выпуклая линза: в середине ровное, к кромке всё сильнее загибает то, что лежит рядом с баром
    // (на скруглённых концах — заметнее всего). Под каплей (выбранной вкладкой) не гнёт: у неё чёткие края
    // у кромки — мягкое увеличение: видно то, что чуть дальше за краем, но без растягивания в полосы
    '  float t=clamp(1.+d/bez,0.,1.); float m=t*t*clamp(1.+sk(p)/5.,0.,1.);',
    '  vec2 c=org+p+g*m*str;',
    // размытие: в середине — сильное и гладкое (мелкая уменьшенная картинка), у кромки — почти чёткое,
    // текст под краем читается; между ними плавный переход
    '  vec3 cl=lo(c)*.28+(lo(c+vec2(3.,0.))+lo(c-vec2(3.,0.))+lo(c+vec2(0.,3.))+lo(c-vec2(0.,3.)))*.18;',
    // у кромки — тоже размыто (слабее, чем в середине) и чуть смазано поперёк края, как в толстом стекле
    '  vec2 gt=vec2(-g.y,g.x);',
    '  vec3 ch=tex(c)*.2+(tex(c+gt*2.2)+tex(c-gt*2.2)+tex(c+g*2.5)+tex(c-g*2.5))*.12;',
    '  ch+=(tex(c+g*5.)+tex(c-g*5.)+tex(c+gt*4.)+tex(c-gt*4.))*.08;',
    '  vec3 col=mix(cl,ch/.8,.75*smoothstep(.35,.95,t));',

    '  col*=lift; float l=dot(col,vec3(.2126,.7152,.0722)); col=clamp(mix(vec3(l),col,sat),0.,1.);',
    // стекло гасит контраст к среднему серому и снижает насыщенность (как в Телеграме: чёрное под ним становится
    // серым, белое — сероватым), а не высветляет всё к белому
    // плотный серый тон (как у бара в Телеграме: под ним всё гаснет до серого), у самой кромки тон слабее —
    // там ярко видно то, что загибается в край
    '  col=mix(col,tone.rgb,tone.a*(1.-rf*m));',
    // выбранная вкладка — заметно светлее (тёмная тема) или темнее (светлая) серая капсула, как в Телеграме
    '  float inK=clamp(.5-sk(p),0.,1.); col=mix(col,vec3(abs(pill)),.72*inK);',
    // у кромки стекло собирает свет — светлее
    '  col+=vec3(glow)*t*t*t*t;',
    '  float a=clamp(.5-d,0.,1.);',
    '  gl_FragColor=vec4(col*a,a);',
    '}'].join('\n');

  let ms, sched, side, app, src = null, srcLo = null, texW = 0, texH = 0, mtop = 0, mleft = 0, dirty = true, tmr = 0;
  const hosts = [];

  // Холст стекла внутри элемента: над его фоном, под содержимым (у бара — под каплей и вкладками)
  function glassFor(el, opt) {
    const cv = document.createElement('canvas');
    cv.className = 'lg-lens-gl lg-bar-refr';   // lg-lens-gl — чтобы бар не принял холст за вкладку (glass.js, модуль 3)
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = `position:absolute;left:0;top:0;pointer-events:none;z-index:${opt.z};border-radius:inherit;`;
    const gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return null;
    const sh = (type, code) => { const x = gl.createShader(type); gl.shaderSource(x, code); gl.compileShader(x); return gl.getShaderParameter(x, gl.COMPILE_STATUS) ? x : null; };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return null;
    const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    const mk = () => { const x = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, x);
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(w => gl.texParameteri(gl.TEXTURE_2D, w, gl.CLAMP_TO_EDGE));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); return x; };
    const tex = mk(), texLo = mk();
    const U = {}; ['t', 'tl', 'res', 'dpr', 'org', 'tsz', 'hs', 'r', 'bez', 'str', 'bg', 'tone', 'lift', 'sat', 'kc', 'khs', 'kr', 'glow', 'tw', 'pill', 'rf'].forEach(n => { U[n] = gl.getUniformLocation(prog, n); });
    el.insertBefore(cv, el.firstChild);
    return { el, cv, gl, prog, tex, texLo, U, knob: opt.knob, up: 0 };
  }

  const num = s => (String(s).match(/-?[\d.]+/g) || []).map(Number);
  const pageBg = () => { const n = num(getComputedStyle(document.querySelector('.window-frame') || document.body).backgroundColor); return n.length >= 3 ? n.slice(0, 3) : [244, 244, 247]; };

  // Расписание — в картинку: фон и скругления блоков, тексты. Значки (svg) не рисуем: под стеклом они всё равно
  // размыты, а картинка строилась бы дольше. Картинка мелкая (в полмасштаба) — строится и грузится быстро
  function build() {
    dirty = false;
    const mr = ms.getBoundingClientRect();
    mtop = mr.top - ms.scrollTop; mleft = mr.left;
    const W = Math.ceil(ms.clientWidth), H = Math.ceil(ms.scrollHeight);
    const max = Math.min(...hosts.map(h => h.gl.getParameter(h.gl.MAX_TEXTURE_SIZE) || 4096));
    const k = Math.min(1.5, (max - 2) / Math.max(W, H));   // чёткая картинка: у кромки текст под стеклом читается
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.floor(W * k)); c.height = Math.max(1, Math.floor(H * k));
    const x = c.getContext('2d'); x.setTransform(k, 0, 0, k, 0, 0);
    const bgc = pageBg(); x.fillStyle = `rgb(${bgc.join(',')})`; x.fillRect(0, 0, W, H);
    const rng = document.createRange();
    const walk = (el, alpha) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const op = alpha * (parseFloat(cs.opacity) || 0); if (op < 0.02) return;
      if (el instanceof SVGElement) return;
      const b = num(cs.backgroundColor);
      if (b.length >= 3 && (b[3] === undefined || b[3] > 0.02)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          const rad = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, r.width / 2, r.height / 2);
          x.globalAlpha = op * (b[3] === undefined ? 1 : b[3]); x.fillStyle = `rgb(${b[0]},${b[1]},${b[2]})`;
          x.beginPath(); if (x.roundRect) x.roundRect(r.left - mleft, r.top - mtop, r.width, r.height, rad); else x.rect(r.left - mleft, r.top - mtop, r.width, r.height); x.fill();
        }
      }
      for (const n of el.childNodes) {
        if (n.nodeType === 1) walk(n, op);
        else if (n.nodeType === 3 && n.textContent.trim()) {
          x.globalAlpha = op; x.fillStyle = cs.color; x.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; x.textBaseline = 'middle';
          const t = n.textContent, re = /\S+/g; let m;
          while ((m = re.exec(t))) {
            rng.setStart(n, m.index); rng.setEnd(n, m.index + m[0].length);
            const r = rng.getBoundingClientRect(); if (!r.width) continue;
            x.fillText(m[0], r.left - mleft, r.top - mtop + r.height / 2);
          }
        }
      }
    };
    try { walk(ms, 1); } catch (e) { /* что-то не нарисовалось — не страшно */ }
    // уменьшенная копия для сильного размытия в середине стекла (сглаживание при уменьшении — это и есть размытие)
    const lw = Math.max(1, Math.round(W * 0.16)), lh = Math.max(1, Math.round(H * 0.16));
    const c2 = document.createElement('canvas'); c2.width = lw; c2.height = lh;
    const y = c2.getContext('2d'); y.imageSmoothingEnabled = true; if ('imageSmoothingQuality' in y) y.imageSmoothingQuality = 'high';
    const mid = document.createElement('canvas'); mid.width = Math.max(1, Math.round(W * 0.4)); mid.height = Math.max(1, Math.round(H * 0.4));
    const mz = mid.getContext('2d'); mz.imageSmoothingEnabled = true; if ('imageSmoothingQuality' in mz) mz.imageSmoothingQuality = 'high';
    mz.drawImage(c, 0, 0, mid.width, mid.height); y.drawImage(mid, 0, 0, lw, lh);
    srcLo = c2;
    src = c; texW = W; texH = H;
    hosts.forEach(h => { h.up = 0; h.bg = bgc; });
  }

  function drawHost(h, look) {
    const { el, cv, gl, U } = h;
    const dpr = Math.min(3, window.devicePixelRatio || 1), w = el.clientWidth, hh = el.clientHeight;
    if (!w || !hh) return;
    if (h.flat) { cv.style.width = cv.style.height = '100%'; } else { cv.style.width = w + 'px'; cv.style.height = hh + 'px'; }
    const CW = Math.round(w * dpr), CH = Math.round(hh * dpr);
    if (cv.width !== CW || cv.height !== CH) { cv.width = CW; cv.height = CH; }
    gl.useProgram(h.prog);
    if (!h.up && src) { gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, h.texLo); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcLo || src);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, h.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); h.up = 1; const bb = h.bg || (h.bg = pageBg()); gl.uniform3f(U.bg, bb[0] / 255, bb[1] / 255, bb[2] / 255); }
    const br = el.getBoundingClientRect(), mr = ms.getBoundingClientRect();
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, h.texLo); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, h.tex);
    gl.viewport(0, 0, cv.width, cv.height); gl.uniform1i(U.t, 0); gl.uniform1i(U.tl, 1);
    gl.uniform2f(U.res, cv.width, cv.height); gl.uniform1f(U.dpr, dpr);
    // где элемент в координатах картинки расписания (она прокручивается вместе со списком)
    gl.uniform2f(U.org, br.left + el.clientLeft - mr.left, br.top + el.clientTop - (mr.top - ms.scrollTop));
    gl.uniform2f(U.tsz, texW, texH);
    gl.uniform2f(U.hs, w / 2, hh / 2); gl.uniform1f(U.r, Math.min(w, hh) / 2);
    gl.uniform1f(U.bez, hh * 0.5); gl.uniform1f(U.str, h.flat ? 0 : hh * 0.42);
    // светлая тема: без белой полосы у кромки и с более светлой капсулой — бар по цвету как остальные стеклянные кнопки
    gl.uniform1f(U.glow, look.dark ? 0.03 : 0); gl.uniform1f(U.tw, 1); gl.uniform1f(U.pill, look.dark ? 0.3 : 0.86); gl.uniform1f(U.rf, look.dark ? 0.6 : 0.3);
    const kn = h.knob && el.querySelector(':scope > .lg-knob');
    // пока каплю держат или она едет (линза поднята), серой капсулы под ней нет — линза прозрачная, как в Телеграме
    if (kn && kn.style.opacity !== '0' && !kn.classList.contains('is-press')) {
      const kr = kn.getBoundingClientRect();
      gl.uniform2f(U.kc, kr.left + kr.width / 2 - br.left - el.clientLeft, kr.top + kr.height / 2 - br.top - el.clientTop);
      gl.uniform2f(U.khs, kr.width / 2, kr.height / 2); gl.uniform1f(U.kr, Math.min(kr.width, kr.height) / 2);
    } else { gl.uniform2f(U.kc, -999, -999); gl.uniform2f(U.khs, 1, 1); gl.uniform1f(U.kr, 1); }
    gl.uniform1f(U.sat, look.sat); gl.uniform1f(U.lift, look.lift);
    gl.uniform4f(U.tone, look.tone[0], look.tone[1], look.tone[2], look.tone[3]);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  // что лежит под баром: расписание или «Статистика». Пока экраны едут друг над другом, картинку не меняем
  function pick() {
    if (app.classList.contains('tab-slide')) return;
    const want = app.dataset.tab === 'stats' && side ? side : sched;
    if (want !== ms) { ms = want; dirty = true; }
  }
  function draw() {
    pick();
    // стекло одно и то же всегда: и на «Статистике», и пока тянут линзу или едут экраны
    const show = mq.matches && app && !document.body.classList.contains('glass-lite');
    hosts.forEach(h => { h.cv.style.display = show ? '' : 'none'; });
    if (!show) return;
    if (dirty || !src) build();
    // тон стекла — к среднему серому (тёмная тема — тёмно-серый, светлая — светло-серый), насыщенность ниже
    const dk = document.body.classList.contains('dark-theme');
    const look = { dark: dk, lift: 1, sat: 0.75, tone: dk ? [0.095, 0.095, 0.105, 0.86] : [0.9, 0.9, 0.915, 0.68] };   // чуть «задымлённое» стекло; в светлой теме — не белее остальных стеклянных кнопок
    // линза под пальцем (glass.js) берёт цвет бара для своих краёв — даём ей цвет нашего стекла, чтобы края линзы
    // не были светлее или темнее бара
    const pb = pageBg(), a = look.tone[3], bc = `rgb(${look.tone.slice(0, 3).map((v, n) => Math.round(v * 255 * a + pb[n] * (1 - a))).join(', ')})`;
    if (hosts[0].bc !== bc) { hosts[0].bc = bc; hosts[0].el.style.backgroundColor = bc; }
    hosts.forEach(h => drawHost(h, look));
  }

  let raf = 0;
  const soon = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  const rebuild = () => { clearTimeout(tmr); tmr = setTimeout(() => { dirty = true; soon(); }, 250); };
  const watchKnob = el => {
    const on = k => { if (k && !k.__bgw) { k.__bgw = 1; new MutationObserver(soon).observe(k, { attributes: true, attributeFilter: ['style', 'class'] }); } };
    on(el.querySelector(':scope > .lg-knob'));
    new MutationObserver(() => { on(el.querySelector(':scope > .lg-knob')); soon(); }).observe(el, { childList: true });
  };

  function start() {
    sched = ms = document.getElementById('mainScroll'); app = document.getElementById('mainApp');
    side = app && app.querySelector('.layout-grid > .sidebar-panel');
    const bar = document.querySelector('.lg-tabbar-inner');
    if (!ms || !app || !bar) return;
    const h1 = glassFor(bar, { z: -1, knob: true });   // нижний бар: над фоном, под каплей и вкладками (ниже них в любом браузере)
    if (!h1) return;
    hosts.push(h1);
    const css = document.createElement('style');
    // выбранная вкладка рисуется в самом стекле (чуть светлее/темнее, без серой плёнки) — у капли остаётся только тонкая кромка
    css.textContent = '@media (max-width: 760px) { .lg-tabbar-inner .lg-knob:not(.is-press) { background: transparent !important; box-shadow: none !important; } }';
    document.head.appendChild(css);
    [sched, side].filter(Boolean).forEach(el => {
      el.addEventListener('scroll', () => { if (el === ms) draw(); }, { passive: true });   // сразу в обработчике прокрутки — без отставания на кадр
      new MutationObserver(recs => { if (el === ms && recs.some(r => r.target !== el)) rebuild(); }).observe(el, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    });
    new MutationObserver(() => { dirty = true; soon(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(soon).observe(app, { attributes: true, attributeFilter: ['class', 'data-tab'] });
    watchKnob(bar);
    window.addEventListener('resize', () => { dirty = true; soon(); });
    if (mq.addEventListener) mq.addEventListener('change', soon);
    dirty = true; soon();
    [1500, 4000].forEach(t => setTimeout(() => { dirty = true; soon(); }, t));   // экран приложения мог появиться позже
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 600)); else setTimeout(start, 600);
})();
