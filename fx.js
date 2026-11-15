/* FX-плейграунд — WebGL-шейдерные фоны без зависимостей.
   Работает только на play.html: девять пресетов, карточки-переключатели,
   tilt по курсору, клавиши 1–9. Все шейдеры — один <canvas>, один цикл rAF. */
(function () {
    'use strict';

    var canvas = document.getElementById('fx-bg');
    if (!canvas) return;
    var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    var fallback = document.getElementById('fx-fallback');
    if (!gl) {
        if (fallback) fallback.hidden = false;
        return;
    }

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var finePointer = window.matchMedia('(pointer: fine)').matches;

    /* ---------- GLSL: общий преамбула (uniforms + шум) ---------- */

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

    /* ---------- Пресеты ---------- */

    var FX = [
        {
            id: 'aurora',
            title: 'Сияние',
            desc: 'Зелёно-фиолетовые завесы струятся над звёздным небом',
            frag: [
                'void main(){',
                '  vec2 frag = gl_FragCoord.xy;',
                '  vec2 uv = (frag - 0.5*u_res) / u_res.y;',
                '  uv.x += (u_mouse.x - 0.5) * 0.08;',
                '  uv.y += (0.5 - u_mouse.y) * 0.05;',
                '  float t = u_time * 0.12;',
                '',
                '  float curl = fbm(vec2(uv.x*2.0 - t*0.4, uv.y*3.5));',
                '  float band0 = exp(-pow((uv.y - 0.15 + curl*0.55 - 0.2)*2.6, 2.0));',
                '  float band1 = exp(-pow((uv.y + 0.35 - curl*0.8 + 0.25)*3.2, 2.0));',
                '',
                '  vec3 c = vec3(0.004, 0.01, 0.03);',
                '  c += vec3(0.05, 1.0, 0.45) * band0 * (0.7 + 0.3*curl);',
                '  c += vec3(0.45, 0.15, 0.95) * band1 * 0.6;',
                '  c += vec3(0.1, 0.7, 0.9) * band0*band0 * 0.5;',
                '',
                '  vec2 gid = floor(frag / 2.0);',
                '  float h = hash12(gid * 1.31);',
                '  float tw = 0.5 + 0.5*sin(u_time*(1.0 + 2.0*fract(h*7.0)) + h*90.0);',
                '  float star = step(0.992, h) * tw * smoothstep(0.1, 0.45, uv.y + 0.3);',
                '  c += vec3(star) * 0.8;',
                '',
                '  c *= 1.0 - 0.35*dot(uv, uv)*0.6;',
                '  gl_FragColor = vec4(c, 1.0);',
                '}'
            ].join('\n')
        },
        {
            id: 'matrix',
            title: 'Матрица',
            desc: 'Зелённые символы падают колоннами, свет тянется к курсору',
            frag: [
                'void main(){',
                '  vec2 frag = gl_FragCoord.xy;',
                '  float H = u_res.y; float W = u_res.x;',
                '  float colW = 9.0;',
                '  float col = floor(frag.x / colW);',
                '  float seed = hash11(col * 7.13 + 1.7);',
                '  float speed = 0.25 + seed*0.85;',
                '  float span = H + 600.0;',
                '  float head = mod(u_time*speed*span*0.35 + seed*span, span) - 300.0;',
                '  float d = head - frag.y;',
                '  float a = smoothstep(420.0, 0.0, d) * step(0.0, d);',
                '  float ch = fract(frag.y / 16.0);',
                '  float block = step(0.15, ch) * (1.0 - step(0.82, ch));',
                '  float cell = hash12(vec2(col, floor(frag.y / 16.0) * 0.37));',
                '  block *= step(0.22, cell);',
                '  float headGlow = exp(-d*d/300.0) * step(0.0, d);',
                '  vec3 green = vec3(0.0, 1.0, 0.35);',
                '  vec3 c = vec3(0.0, 0.02, 0.012);',
                '  c += green * a * block * 0.5;',
                '  c += vec3(0.8, 1.0, 0.9) * headGlow * block;',
                '  float mx = abs(frag.x - u_mouse.x*W);',
                '  c += green * exp(-mx*mx*0.00002) * 0.15;',
                '  gl_FragColor = vec4(c, 1.0);',
                '}'
            ].join('\n')
        },
        {
            id: 'nebula',
            title: 'Туманность',
            desc: 'Медленно текущие цветовые поля — розовое и бирюзовое',
            frag: [
                'void main(){',
                '  vec2 frag = gl_FragCoord.xy;',
                '  vec2 uv = (frag - 0.5*u_res) / u_res.y;',
                '  uv.x += (u_mouse.x - 0.5) * 0.15;',
                '  uv.y += (0.5 - u_mouse.y) * 0.10;',
                '  float t = u_time * 0.06;',
                '',
                '  vec2 p = uv * 1.8;',
                '  float f1 = fbm(p + t + fbm(p - t*0.7)*0.8);',
                '  float f2 = fbm(p*1.7 - t*1.3);',
                '',
                '  vec3 c = mix(vec3(0.01, 0.0, 0.06), vec3(0.08, 0.12, 0.35), f1);',
                '  c += vec3(0.85, 0.25, 0.55) * pow(smoothstep(0.45, 0.95, f2), 2.0) * 0.55;',
                '  c += vec3(0.15, 0.8, 0.75) * pow(f1*f1, 3.0) * 0.6;',
                '',
                '  vec2 gid = floor(frag / 2.4);',
                '  float h = hash12(gid * 2.11);',
                '  float tw = 0.6 + 0.4*sin(u_time*(1.5 + 3.0*fract(h*3.7)) + h*200.0);',
                '  c += vec3(0.9, 0.95, 1.0) * step(0.995, h) * tw;',
                '',
                '  gl_FragColor = vec4(c, 1.0);',
                '}'
            ].join('\n')
        },
        {
            id: 'stars',
            title: 'Звёздное поле',
            desc: 'Дрейфующие звёзды с мерцанием и лёгким параллаксом от курсора',
            frag: [
                'void main(){',
                '  vec2 frag = gl_FragCoord.xy;',
                '  vec2 uv = (frag - 0.5*u_res) / u_res.y;',
                '  vec2 p = uv * 3.0;',
                '  vec2 drift = vec2(u_time*0.015, -u_time*0.008);',
                '  p += drift + vec2((u_mouse.x-0.5)*0.12, (0.5-u_mouse.y)*0.08);',
                '',
                '  vec2 id = floor(p);',
                '  vec2 f = fract(p);',
                '  float h = hash12(id);',
                '  vec2 sp = (hash22(id) - 0.5) * 0.55;',
                '  float d = length(f - 0.5 - sp);',
                '  float has = step(0.72, h);',
                '  float tw = 0.55 + 0.45*sin(u_time*(1.0 + 4.0*fract(h*11.0)) + h*120.0);',
                '  float star = smoothstep(0.06, 0.0, d) * has * tw;',
                '  vec3 tint = mix(vec3(0.65,0.8,1.0), vec3(1.0,0.85,0.6), step(0.5, fract(h*13.1)));',
                '  vec3 c = vec3(0.008, 0.01, 0.03) + tint*star*0.9;',
                '',
                '  float n = fbm(uv*2.0 + drift*0.5);',
                '  c += vec3(0.05, 0.1, 0.22) * n * 0.5;',
                '  gl_FragColor = vec4(c, 1.0);',
                '}'
            ].join('\n')
        },
        {
            id: 'vortex',
            title: 'Гравитация',
            desc: 'Пространство изгибается вокруг точки под курсором',
            frag: [
                'void main(){',
                '  vec2 frag = gl_FragCoord.xy;',
                '  vec2 uv = (frag - 0.5*u_res) / u_res.y;',
                '  vec2 mv = vec2(u_mouse.x*(u_res.x/u_res.y) - 0.5, 0.5 - u_mouse.y);',
                '  vec2 p = uv - mv;',
                '  float r = length(p) + 0.0001;',
                '  float a = atan(p.y, p.x);',
                '  float pull = 0.55 * exp(-r*2.2);',
                '  a += pull*3.5 + u_time*0.15;',
                '  float rr = r * (1.0 + 0.25*sin(a*5.0 + u_time*0.4));',
                '  vec2 q = vec2(cos(a), sin(a)) * rr;',
                '  float f = fbm(q*2.2 + u_time*0.04);',
                '  vec3 c = mix(vec3(0.04, 0.0, 0.12), vec3(0.85, 0.35, 0.25), f*f);',
                '  c += vec3(0.2, 0.55, 1.0) * pow(clamp(1.0 - r*1.4, 0.0, 1.0), 3.0) * 0.5;',
                '  c *= smoothstep(0.02, 0.12, r);',
                '  gl_FragColor = vec4(c, 1.0);',
                '}'
            ].join('\n')
        },
        {
            id: 'goo',
            title: 'Капли',
            desc: 'Метаболлы: плавающие капли слипаются и разбегаются',
            frag: [
                'void main(){',
                '  vec2 frag = gl_FragCoord.xy;',
                '  vec2 uv = (frag - 0.5*u_res) / u_res.y;',
                '  uv.x += (u_mouse.x - 0.5) * 0.10;',
                '  float t = u_time;',
                '  float f = 0.0;',
                '  for (int i = 0; i < 6; i++){',
                '    float fi = float(i);',
                '    vec2 pos = vec2(sin(t*0.31 + fi*1.7)*0.55, cos(t*0.23 + fi*2.3)*0.40);',
                '    vec2 dp = uv - pos;',
                '    f += 0.055 / dot(dp, dp);',
                '  }',
                '  float m = smoothstep(0.55, 1.5, f);',
                '  vec3 bgc = vec3(0.02, 0.01, 0.05);',
                '  vec3 blob = mix(vec3(0.9, 0.35, 0.75), vec3(0.3, 0.75, 1.0), 0.5 + 0.5*sin(t*0.1));',
                '  vec3 c = mix(bgc, blob, m);',
                '  c += vec3(0.9, 0.85, 1.0) * smoothstep(1.2, 2.4, f) * 0.35;',
                '  c *= clamp(1.0 - 0.5*dot(uv, uv), 0.0, 1.0);',
                '  gl_FragColor = vec4(c, 1.0);',
                '}'
            ].join('\n')
        },
        {
            id: 'synthwave',
            title: 'Синтвейв',
            desc: 'Ретро-солнце и неоновая сетка, плывущая к зрителю',
            frag: [
                'void main(){',
                '  vec2 frag = gl_FragCoord.xy;',
                '  vec2 uv = (frag - 0.5*u_res) / u_res.y;',
                '  uv.x += (u_mouse.x - 0.5) * 0.06;',
                '  uv.y += (0.5 - u_mouse.y) * 0.03;',
                '  float t = u_time;',
                '  float h = -0.12;',
                '',
                '  vec3 c = mix(vec3(0.30, 0.04, 0.38), vec3(0.02, 0.01, 0.08), smoothstep(h, 0.7, uv.y));',
                '  c += vec3(0.95, 0.35, 0.25) * exp(-abs(uv.y - h) * 3.2) * 0.30;',
                '',
                '  float sd = length(vec2(uv.x, (uv.y - 0.04) * 1.7));',
                '  float sun = smoothstep(0.30, 0.29, sd);',
                '  float stripes = smoothstep(0.2, 0.8, 0.5 + 0.5*sin(uv.y * 34.0 - t * 0.35));',
                '  vec3 sunC = mix(vec3(1.0, 0.75, 0.30), vec3(1.0, 0.30, 0.55), smoothstep(0.3, -0.1, uv.y));',
                '  c += sunC * sun * (0.45 + 0.55*stripes) * 0.9;',
                '',
                '  vec2 gp = uv - vec2(0.0, h);',
                '  float depth = max(-gp.y, 0.0005);',
                '  float mask = 1.0 - step(0.0, gp.y);',
                '  float wx = gp.x * depth * 2.2;',
                '  float vl = (1.0 - smoothstep(0.0, 0.012*depth*2.2 + 0.004, abs(fract(wx) - 0.5))) * 0.8;',
                '  float hz = fract(depth * 1.8 - t * 0.25);',
                '  float hl = exp(-hz * 22.0) * step(0.01, depth);',
                '  float fade = smoothstep(0.0, 0.05, depth) * (1.0 - smoothstep(0.30, 0.75, depth));',
                '  vec3 gcol = mix(vec3(0.25, 0.95, 1.0), vec3(0.95, 0.25, 0.85), 0.5 + 0.5*sin(wx * 0.9 + t * 0.2));',
                '  c += gcol * (vl + hl * 0.9) * fade * mask;',
                '',
                '  vec2 gid = floor(frag / 2.0);',
                '  float hs = hash12(gid * 1.7);',
                '  float tw = 0.5 + 0.5*sin(t*(1.0 + 2.0*fract(hs*7.0)) + hs*80.0);',
                '  float starMask = (1.0 - step(h, uv.y)) * smoothstep(h + 0.02, h + 0.18, uv.y);',
                '  c += vec3(0.9, 0.9, 1.0) * step(0.986, hs) * tw * starMask * 0.8;',
                '',
                '  c *= 1.0 - 0.3*dot(uv, uv)*0.5;',
                '  gl_FragColor = vec4(c, 1.0);',
                '}'
            ].join('\n')
        },
        {
            id: 'storm',
            title: 'Гроза',
            desc: 'Тёмные облака и внезапные вспышки молний',
            frag: [
                'void main(){',
                '  vec2 frag = gl_FragCoord.xy;',
                '  vec2 uv = (frag - 0.5*u_res) / u_res.y;',
                '  uv.x += (u_mouse.x - 0.5) * 0.05;',
                '  float t = u_time;',
                '',
                '  vec2 p = uv * 1.6 + vec2(t * 0.05, -t * 0.015);',
                '  float cl = fbm(p + 0.6 * fbm(p * 1.7 - t * 0.05));',
                '  vec3 c = mix(vec3(0.012, 0.018, 0.04), vec3(0.17, 0.19, 0.28), cl);',
                '  c *= mix(1.0, 0.55, smoothstep(-0.5, 0.5, uv.y));',
                '',
                '  float chunk = floor(t * 1.4);',
                '  float ct = fract(t * 1.4);',
                '  float flash = 0.0;',
                '  for (int i = 0; i < 5; i++){',
                '    float fi = float(i);',
                '    float hs = hash11(chunk * 17.23 + fi * 7.31);',
                '    if (hs > 0.90){',
                '      float cx = (hash11(chunk * 31.7 + fi * 3.1) - 0.5) * 1.2;',
                '      float env = pow(max(0.0, 1.0 - ct * 5.0), 2.0) * (0.5 + 0.5*fract(hs * 9.0));',
                '      float jit = (vnoise(vec2(frag.y * 0.025, chunk * 13.7 + fi * 5.0)) - 0.5) * (0.5 - uv.y) * 0.45;',
                '      float d = abs(uv.x - (cx + jit));',
                '      flash += exp(-d * d * 900.0) * env;',
                '      flash += exp(-d * d * 14000.0) * env * 1.6;',
                '      flash += 0.05 * env;',
                '    }',
                '  }',
                '  c += vec3(0.72, 0.82, 1.0) * flash;',
                '',
                '  c *= 1.0 - 0.3*dot(uv, uv)*0.5;',
                '  gl_FragColor = vec4(c, 1.0);',
                '}'
            ].join('\n')
        },
        {
            id: 'ocean',
            title: 'Океан',
            desc: 'Спокойные вечерние волны и мерцание света на воде',
            frag: [
                'void main(){',
                '  vec2 frag = gl_FragCoord.xy;',
                '  vec2 uv = (frag - 0.5*u_res) / u_res.y;',
                '  uv.x += (u_mouse.x - 0.5) * 0.05;',
                '  float t = u_time;',
                '  float hor = 0.18;',
                '',
                '  vec3 c = mix(vec3(0.015, 0.045, 0.10), vec3(0.05, 0.16, 0.22), smoothstep(-0.5, hor, uv.y));',
                '  c += vec3(0.1, 0.6, 0.6) * exp(-abs(uv.y - hor) * 3.0) * 0.12;',
                '  vec2 gid = floor(frag / 2.4);',
                '  float hs = hash12(gid * 2.3);',
                '  float tw = 0.6 + 0.4*sin(t*(1.5 + 3.0*fract(hs*5.0)) + hs*140.0);',
                '  c += vec3(0.8, 0.9, 1.0) * step(0.988, hs) * tw * step(hor, uv.y) * 0.7;',
                '',
                '  float wm = 1.0 - step(hor, uv.y);',
                '  vec3 wc = mix(vec3(0.0, 0.22, 0.28), vec3(0.01, 0.03, 0.08), smoothstep(hor, -0.5, uv.y));',
                '  c = mix(c, wc, wm);',
                '  float d = hor - uv.y;',
                '',
                '  float gl = 0.0;',
                '  for (int i = 0; i < 6; i++){',
                '    float fi = float(i);',
                '    float ph = t * (0.5 + 0.14*fi) + fi * 2.1;',
                '    float yy = hor - 0.04 - fi * 0.055;',
                '    float wave = sin(uv.x * (2.0 + fi * 1.3) + ph + vnoise(vec2(uv.x * 0.7, fi * 1.7 + t * 0.1)) * 2.0) * (0.010 + 0.006*fi);',
                '    float row = abs(uv.y - (yy + wave));',
                '    gl += exp(-row * row * 240000.0) * (0.30 + 0.70 * (fi / 5.0));',
                '  }',
                '  c += vec3(0.35, 0.9, 0.85) * gl * wm * 0.45;',
                '  vec2 sid = floor(frag / 3.0);',
                '  float gk = hash12(sid * 1.3 + floor(t * 2.2) * 7.0);',
                '  c += vec3(0.7, 1.0, 0.95) * step(0.985, gk) * wm * smoothstep(0.4, 0.02, d) * 0.5;',
                '',
                '  c *= 1.0 - 0.3*dot(uv, uv)*0.4;',
                '  gl_FragColor = vec4(c, 1.0);',
                '}'
            ].join('\n')
        }
    ];

    var byId = {};
    FX.forEach(function (fx) { byId[fx.id] = fx; });

    /* ---------- Движок ---------- */

    var VERT = 'attribute vec2 a_pos; void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }';

    function compileShader(type, src) {
        var s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error('FX: ошибка компиляции шейдера:', gl.getShaderInfoLog(s));
            return null;
        }
        return s;
    }

    function makeProgram(fragSrc) {
        var vs = compileShader(gl.VERTEX_SHADER, VERT);
        var fs = compileShader(gl.FRAGMENT_SHADER, fragSrc);
        if (!vs || !fs) return null;
        var prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.bindAttribLocation(prog, 0, 'a_pos');
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error('FX: ошибка линковки:', gl.getProgramInfoLog(prog));
            return null;
        }
        return {
            prog: prog,
            locs: {
                uRes: gl.getUniformLocation(prog, 'u_res'),
                uTime: gl.getUniformLocation(prog, 'u_time'),
                uMouse: gl.getUniformLocation(prog, 'u_mouse')
            }
        };
    }

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    var programs = {};
    var cur = null;
    var mouse = [0.5, 0.5];
    var mouseTarget = [0.5, 0.5];

    function drawFrame(t) {
        if (!cur) return;
        gl.useProgram(cur.prog);
        gl.uniform2f(cur.locs.uRes, gl.canvas.width, gl.canvas.height);
        gl.uniform1f(cur.locs.uTime, t);
        gl.uniform2f(cur.locs.uMouse, mouse[0], mouse[1]);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function resize() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
        canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
        gl.viewport(0, 0, canvas.width, canvas.height);
        if (reduceMotion) drawFrame(8.0);
    }

    /* ---------- UI ---------- */

    var nameEl = document.getElementById('fx-name');
    var cards = Array.prototype.slice.call(document.querySelectorAll('.fx-card'));

    function select(id) {
        var fx = byId[id];
        if (!fx) return;
        if (!programs[id]) programs[id] = makeProgram(HEAD + NOISE + fx.frag);
        var next = programs[id];
        if (!next) {
            if (fallback) fallback.hidden = false;
            return;
        }
        cur = next;

        cards.forEach(function (card) {
            var on = card.getAttribute('data-fx') === id;
            card.classList.toggle('is-active', on);
            card.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        if (nameEl) {
            nameEl.textContent = fx.title;
            if (!reduceMotion && nameEl.animate) {
                nameEl.animate(
                    [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
                    { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
                );
            }
        }
        if (reduceMotion) drawFrame(8.0);
    }

    cards.forEach(function (card) {
        card.addEventListener('click', function () { select(card.getAttribute('data-fx')); });
        card.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                select(card.getAttribute('data-fx'));
            }
        });
        if (finePointer && !reduceMotion) {
            card.addEventListener('pointermove', function (e) {
                var r = card.getBoundingClientRect();
                var nx = (e.clientX - r.left) / r.width - 0.5;
                var ny = (e.clientY - r.top) / r.height - 0.5;
                card.style.transform =
                    'perspective(700px) rotateX(' + (-ny * 10).toFixed(2) + 'deg) rotateY(' + (nx * 12).toFixed(2) + 'deg) translateY(-4px)';
            });
            card.addEventListener('pointerleave', function () { card.style.transform = ''; });
        }
    });

    window.addEventListener('pointermove', function (e) {
        mouseTarget[0] = e.clientX / window.innerWidth;
        mouseTarget[1] = 1 - e.clientY / window.innerHeight;
        if (reduceMotion) {
            mouse[0] = mouseTarget[0];
            mouse[1] = mouseTarget[1];
            drawFrame(8.0);
        }
    });

    window.addEventListener('keydown', function (e) {
        if (/^[1-9]$/.test(e.key)) select(FX[Number(e.key) - 1].id);
    });

    window.addEventListener('resize', resize);

    resize();
    select('aurora');

    if (!reduceMotion) {
        var start = performance.now();
        (function frame(now) {
            var t = (now - start) / 1000;
            mouse[0] += (mouseTarget[0] - mouse[0]) * 0.06;
            mouse[1] += (mouseTarget[1] - mouse[1]) * 0.06;
            drawFrame(t);
            requestAnimationFrame(frame);
        })(start);
    }
})();
