/* «Гравитация» на главной: WebGL-слой под 2D-сценой неба (sky.js).
   Canvas #vortex внутри .hero-sky — самое нижний слой: пространство изгибается
   вокруг точки, следящей за курсором (с lerp), звёзды/планеты/спутник рисуются
   sky.js поверх. Только тёмная тема — в светлой CSS прячет канвас, движок
   стоит. reduced-motion → один статичный кадр. Ноль зависимостей. */
(function () {
    'use strict';

    var canvas = document.getElementById('vortex');
    if (!canvas) return;
    var hero = document.querySelector('.hero-sky');
    if (!hero) { canvas.remove(); return; }
    var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) { canvas.remove(); return; }   /* нет WebGL — слой просто не рисует, небо 2D работает */
    var root = document.documentElement;
    var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* ---------- GLSL: преамбула + «Гравитация» (тот же шейдер, что в плейграунде) ---------- */

    var HEAD = [
        '#ifdef GL_FRAGMENT_PRECISION_HIGH',
        'precision highp float;',
        '#else',
        'precision mediump float;',
        '#endif',
        '',
        'uniform vec2 u_res;',
        'uniform float u_time;',
        'uniform vec2 u_mouse;',
        ''
    ].join('\n');

    var NOISE = [
        'float hash11(float n){ return fract(sin(n)*43758.5453); }',
        'float hash12(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
        'vec2 hash22(vec2 p){ p = vec2(dot(p, vec2(127.1,311.7)), dot(p, vec2(311.7,74.7))); return fract(sin(p)*43758.5453); }',
        'float vnoise(vec2 p){',
        '  vec2 i = floor(p); vec2 f = fract(p);',
        '  vec2 u = f*f*(3.0-2.0*f);',
        '  return mix(mix(hash12(i), hash12(i+vec2(1.0,0.0)), u.x),',
        '             mix(hash12(i+vec2(0.0,1.0)), hash12(i+vec2(1.0,1.0)), u.x), u.y);',
        '}',
        'float fbm(vec2 p){',
        '  float a = 0.0; float w = 0.5;',
        '  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);',
        '  for (int i = 0; i < 5; i++){ a += w*vnoise(p); p = m*p; w *= 0.5; }',
        '  return a;',
        '}',
        ''
    ].join('\n');

    var FRAG = [
        'void main(){',
        '  vec2 frag = gl_FragCoord.xy;',
        '  vec2 uv = (frag - 0.5*u_res) / u_res.y;',
        '  vec2 mv = vec2(u_mouse.x*(u_res.x/u_res.y) - 0.5, 0.5 - u_mouse.y);',
        '  vec2 p = uv - mv;',
        '  float r = length(p) + 0.0001;',
        '  float a = atan(p.y, p.x);',
        '  float pull = 0.40 * exp(-r*2.2);   /* было 0.55: чувствительность к курсору −28% ещё −15% */',
        '  a += pull*3.5 + u_time*0.15;',
        '  float rr = r * (1.0 + 0.25*sin(a*5.0 + u_time*0.4));',
        '  vec2 q = vec2(cos(a), sin(a)) * rr;',
        '  float f = fbm(q*2.2 + u_time*0.04);',
        '  vec3 c = mix(vec3(0.04, 0.0, 0.12), vec3(0.85, 0.35, 0.25), f*f);',
        '  c += vec3(0.2, 0.55, 1.0) * pow(clamp(1.0 - r*1.4, 0.0, 1.0), 3.0) * 0.5;',
        '  c *= 1.25;   /* тонировка +25%: фон читается плотнее, не «стеклянным» */',
        '  c *= smoothstep(0.02, 0.12, r);',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'
    ].join('\n');

    var VERT = 'attribute vec2 a_pos; void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }';

    function compileShader(type, src) {
        var s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error('vortex: ошибка компиляции шейдера:', gl.getShaderInfoLog(s));
            return null;
        }
        return s;
    }

    var vs = compileShader(gl.VERTEX_SHADER, VERT);
    var fs = compileShader(gl.FRAGMENT_SHADER, HEAD + NOISE + FRAG);
    if (!vs || !fs) { canvas.remove(); return; }
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'a_pos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error('vortex: ошибка линковки:', gl.getProgramInfoLog(prog));
        canvas.remove();
        return;
    }
    gl.useProgram(prog);
    var locs = {
        uRes: gl.getUniformLocation(prog, 'u_res'),
        uTime: gl.getUniformLocation(prog, 'u_time'),
        uMouse: gl.getUniformLocation(prog, 'u_mouse')
    };

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    /* ---------- размер: следим за hero, как sky.js ---------- */

    var W = 0, H = 0, heroLeft = 0, heroTop = 0;
    var raf = 0, lastDraw = 0, lastNow = 0, bootAt = 0;
    var mouse = [0.5, 0.5], mouseTarget = [0.5, 0.5];

    function layout() {
        var r = hero.getBoundingClientRect();
        heroLeft = r.left; heroTop = r.top;
        W = Math.max(320, Math.round(r.width));
        H = Math.max(240, Math.round(r.height));
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);
        if (mqReduce.matches) drawFrame(8.0);
    }

    function drawFrame(t) {
        if (!W || !H) return;
        gl.uniform2f(locs.uRes, canvas.width, canvas.height);
        gl.uniform1f(locs.uTime, t);
        gl.uniform2f(locs.uMouse, mouse[0], mouse[1]);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /* ---------- запуск/пауза ---------- */

    function isDark() { return root.getAttribute('data-theme') !== 'light'; }
    var heroVisible = true, tabVisible = !document.hidden;

    function start() {
        if (raf || mqReduce.matches || !isDark()) return;
        if (!bootAt) bootAt = performance.now();
        lastNow = 0; lastDraw = 0;
        raf = requestAnimationFrame(frame);
        drawFrame(bootAt ? (performance.now() - bootAt) / 1000 : 0);
    }

    function stop() {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }

    function frame(now) {
        raf = requestAnimationFrame(frame);
        if (now - lastDraw < 15.5) return;   /* тот же потолок ~64 fps, что у sky.js */
        lastDraw = now;
        var T = (now - bootAt) / 1000;
        /* lerp мыши — тот же ритм, что у параллакса sky.js */
        var k = lastNow ? (1 - Math.exp(-Math.min(0.05, (now - lastNow) / 1000) * 4.5)) : 1;
        mouse[0] += (mouseTarget[0] - mouse[0]) * k;
        mouse[1] += (mouseTarget[1] - mouse[1]) * k;
        lastNow = now;
        drawFrame(T);
    }

    function sync() {
        if (mqReduce.matches) { stop(); layout(); return; }
        if (heroVisible && tabVisible) start(); else stop();
    }

    /* ---------- события ---------- */

    if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (es) {
            heroVisible = !!es.length && es[0].isIntersecting;
            if (mqReduce.matches) return;
            if (tabVisible) sync();
        }, { rootMargin: '0px 0px -10% 0px' }).observe(hero);
    }
    document.addEventListener('visibilitychange', function () {
        tabVisible = !document.hidden;
        if (!mqReduce.matches) sync();
    });
    if (mqReduce.addEventListener) {
        mqReduce.addEventListener('change', function () { sync(); });
    }
    /* тема: событие main.js + MutationObserver (как в sky.js) */
    function onTheme() {
        layout();
        sync();
    }
    window.addEventListener('cpm-themechange', onTheme);
    if ('MutationObserver' in window) {
        new MutationObserver(onTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    }

    /* курсор → normalized в координатах hero */
    addEventListener('pointermove', function (e) {
        if (mqReduce.matches || (e.pointerType || 'mouse') === 'touch') return;
        var mx = e.clientX - heroLeft, my = e.clientY - heroTop;
        if (mx < 0 || my < 0 || mx > W || my > H) { mouseTarget[0] = 0.5; mouseTarget[1] = 0.5; return; }
        mouseTarget[0] = mx / W;
        mouseTarget[1] = 1 - my / H;
    }, { passive: true });

    var rz = null;
    addEventListener('resize', function () {
        if (rz) clearTimeout(rz);
        rz = setTimeout(function () { rz = null; layout(); }, 120);
    }, { passive: true });

    /* отладка */
    window.__vortex = {
        get running() { return !!raf; },
        W: function () { return W; },
        H: function () { return H; }
    };

    layout();
    sync();
})();
