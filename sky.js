(function () {
    'use strict';

    /* ===== Sky — порт фоновой анимации noxai.vip («Sky»-сцена) + собственные
       дополнения: мини-планеты солнечной системы на заднем плане и слабые
       «шлейфы» глифов при удержании указателя.

       Два режима:
         hero — главная (canvas #sky в .hero-sky): звёзды, купол, фото-планета
                с глифовым кольцом, планеты на заднем плане;
         bg   — остальные страницы (fixed canvas #sky-bg): звёзды и планеты
                на фоне всего сайта, без купола и фото-планеты.

       Работает в обеих темах (тёмной и светлой) — палитра читается из CSS-
       переменных (loadPalette); burst/trail рисует именно sky.js.
       reduced-motion → статичный кадр. */

    var root = document.documentElement;
    var heroCanvas = document.getElementById('sky');
    var bgCanvas = document.getElementById('sky-bg');
    var canvas = heroCanvas || bgCanvas;
    if (!canvas || !canvas.getContext) return;
    var mode = heroCanvas ? 'hero' : 'bg';
    var hero = mode === 'hero' ? document.querySelector('.hero-sky') : null;
    if (mode === 'hero' && !hero) return;
    var ctx = canvas.getContext('2d');
    var glow = document.getElementById('sky-glow');
    var planetImg = mode === 'hero' ? hero.querySelector('.sky-planet') : null;
    var card = mode === 'hero' ? hero.querySelector('.next-up') : null;

    var TAU = Math.PI * 2;
    var MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    var SGA = '"SGA Smooth", ' + MONO;
    var GUARD = 'a,button,input,select,textarea,label,summary,dialog,[contenteditable="true"]';
    var TRAIL = '[]/\\%#_^!$?&<>*~+=';          /* пул глифов (как в symbols.js) */

    var STAR_COL = '#e8ecf4';
    var DOME_COL = '#b9c4dd';
    var RING_COL = '#6b8cff';
    var NEB1C = { r: 120, g: 90, b: 220, a: 0.14 };   /* глубина неба: туманности (loadPalette) */
    var NEB2C = { r: 40, g: 160, b: 175, a: 0.10 };
    var COMETC = { r: 255, g: 255, b: 255, a: 1 };

    /* палитра неба из CSS-переменных темы: пересобирается при layout()
       и при cpm-themechange */
    function parseRGBA(str, fallback) {
        var m = /rgba?\(([^)]+)\)/.exec(str || '');
        if (!m) return fallback || { r: 0, g: 0, b: 0, a: 1 };
        var p = m[1].split(',');
        return {
            r: (parseInt(p[0], 10) || 0),
            g: (parseInt(p[1], 10) || 0),
            b: (parseInt(p[2], 10) || 0),
            a: p.length > 3 ? (parseFloat(p[3]) || 1) : 1
        };
    }

    function loadPalette() {
        try {
            var cs = getComputedStyle(document.documentElement);
            var star = cs.getPropertyValue('--sky-star').trim();
            var ring = cs.getPropertyValue('--sky-ring').trim();
            var dome = cs.getPropertyValue('--sky-dome').trim();
            if (star) STAR_COL = star;
            if (ring) RING_COL = ring;
            if (dome) DOME_COL = dome;
            NEB1C = parseRGBA(cs.getPropertyValue('--sky-neb-1').trim(), NEB1C);
            NEB2C = parseRGBA(cs.getPropertyValue('--sky-neb-2').trim(), NEB2C);
            COMETC = parseRGBA(cs.getPropertyValue('--sky-comet').trim(), COMETC);
        } catch (e) { /* оставляем дефолтные цвета */ }
    }
    var DCELL = 32, DROWS = 14, DRAD = 984;       /* dome: ячейка 32px, 14 рядов, хорда от R=984 */
    var BANDS = [
        { g: '@', a: 0.50 },                       /* ряды 1–4 (у горизонта) */
        { g: '%', a: 0.32 },                       /* ряды 5–9 */
        { g: '+', a: 0.15 }                        /* ряды 10–14 */
    ];
    var RING_N = 64, RING2_N = 20;                 /* глифовое кольцо вокруг фото-планеты */
    var RING_SPIN = 0.015;                          /* рад/с, полный оборот ≈ 7 мин */

    /* Планеты солнечной системы — маленькие, приглушённые, «на заднем плане».
       v — базовая скорость дрейфа (px/c), а — непрозрачность. */
    var SOLAR = [
        { key: 'mercury', r: 4.5, c1: '#d7dbe8', c2: '#8f95a3', a: 0.55, v: 8.5 },
        { key: 'venus',   r: 7,   c1: '#f2dd9b', c2: '#c9a85f', a: 0.50, v: 5.5 },
        { key: 'earth',   r: 9,   c1: '#8fc0ff', c2: '#3565d8', a: 0.60, v: 4.5 },
        { key: 'mars',    r: 6,   c1: '#e8925f', c2: '#b3562f', a: 0.55, v: 6.5 },
        { key: 'saturn',  r: 11,  ring: true, c1: '#efe0b4', c2: '#b3985f', a: 0.50, v: 3.5 },
        { key: 'jupiter', r: 13,  bands: true, c1: '#e6cda4', c2: '#a67c4f', a: 0.45, v: 2.5 },
        { key: 'neptune', r: 10,  halo: true, c1: '#8fb4e6', c2: '#3a5fa8', a: 0.55, v: 3.0 },
        { key: 'uranus',  r: 8,   halo: true, c1: '#bfe3e0', c2: '#7fb0ac', a: 0.50, v: 4.0 }
    ];

    var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    var reduced = mqReduce.matches;

    function themeDark() { return root.getAttribute('data-theme') === 'dark'; }

    var W = 0, H = 0, dpr = 1;
    var D = 300;                                     /* диаметр планеты-фото (по брейкпоинтам) */
    var planetX = 0, planetY = 0;
    var parX = 0, parY = 0, parTX = 0, parTY = 0;    /* параллакс (lerp) */
    var heroLeft = 0, heroTop = 0;
    var stars = [], dome = [], ring = [], ring2 = [], solars = [];
    var nebula = [], comets = [], cometWait = 2;       /* глубина неба: туманности + редкие кометы */
    var parts = [];
    var trail = [];                                    /* слабый шлейф при удержании */
    var holding = false;
    var knock = [];
    var raf = 0, lastDraw = 0, lastNow = 0, bootAt = 0;
    var swapAcc = 0, driftAcc = 0, domeAcc = 0;
    var lastGx = NaN, lastGy = NaN;
    var SAT_SPIN = TAU / 14;                            /* спутник вокруг фото: полный оборот ≈ 14 c */

    function mulberry32(seed) {
        var t = seed >>> 0;
        return function () {
            t += 0x6D2B79F5;
            var r = Math.imul(t ^ (t >>> 15), 1 | t);
            r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
            return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
        };
    }

    function inKnock(x, y) {
        for (var k = 0; k < knock.length; k++) {
            var r = knock[k];
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
        }
        return false;
    }

    /* ---------- layout / resize ---------- */

    function layout() {
        loadPalette();   /* --sky-star/--sky-ring/--sky-dome текущей темы */
        var r;
        if (mode === 'hero') {
            r = hero.getBoundingClientRect();
            heroLeft = r.left; heroTop = r.top;
            W = Math.max(320, Math.round(r.width));
            H = Math.max(240, Math.round(r.height));
        } else {
            heroLeft = 0; heroTop = 0;
            W = Math.max(320, window.innerWidth);
            H = Math.max(240, window.innerHeight);
        }
        dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (mode === 'hero') {
            if (W >= 1024) { D = 300; }
            else if (W >= 640) { D = 220; }
            else { D = 180; }
            /* зона под планету: её центр в D/2+24 от верха hero, контент ниже */
            hero.style.setProperty('--sky-zone', (D + 56) + 'px');
            hero.style.setProperty('--gs', Math.round(D * 1.5) + 'px');

            if (card) {
                var cr = card.getBoundingClientRect();
                planetX = Math.round(cr.left + cr.width / 2 - r.left);
            } else {
                planetX = Math.round(W / 2);
            }
            planetX = Math.min(Math.max(planetX, D / 2 + 12), W - D / 2 - 12);
            planetY = Math.round(D / 2 + 24);

            if (planetImg) {
                planetImg.style.width = D + 'px';
                planetImg.style.height = D + 'px';
                planetImg.style.left = Math.round(planetX - D / 2) + 'px';
                planetImg.style.top = Math.round(planetY - D / 2) + 'px';
                if (reduced) planetImg.style.transform = 'none';
            }

            knock = buildKnock(r);
        } else {
            D = 0; planetX = 0; planetY = 0;
            knock = [];
        }

        buildStars();
        buildDome();
        buildRing();
        buildSolar();
        buildNebula();
        comets.length = 0; cometWait = 1.5 + Math.random() * 3;
        setGlow();
        sync();
    }

    function buildKnock(r) {
        var list = [];
        var els = [];
        var c1 = hero.querySelector('.hero-content');
        if (c1) els.push(c1);
        if (card) els.push(card);
        for (var i = 0; i < els.length; i++) {
            var b = els[i].getBoundingClientRect();
            list.push({
                x: b.left - r.left - 28,
                y: b.top - r.top - 28,
                w: b.width + 56,
                h: b.height + 56
            });
        }
        return list;
    }

    /* ---------- звёзды ---------- */

    function pickStarGlyph() {
        var g = Math.random();
        return g < 0.5 ? '.' : g < 0.78 ? ':' : g < 0.9 ? ';' : '`';
    }

    function buildStars() {
        stars = [];
        /* в hero-режиме с куполом звёзды не лезут в нижние 14 рядов */
        var skyH = (mode === 'hero' && W >= 820) ? H - DROWS * DCELL : H;
        var cols = Math.ceil(W / 8), rows = Math.ceil(Math.max(40, skyH) / 13);
        var target = W >= 820 ? 180 : 90;
        var p = target / Math.max(1, cols * rows);
        var rnd = mulberry32(4242);
        for (var c = 0; c < cols; c++) {
            for (var rr = 0; rr < rows; rr++) {
                if (rnd() >= p) continue;
                var x = c * 8 + 4, y = rr * 13 + 6.5;
                if (inKnock(x, y)) continue;
                stars.push({
                    x: x, y: y,
                    g: pickStarGlyph(),
                    a0: 0.16 + rnd() * 0.26,
                    tw: 0.18 + rnd() * 0.30,
                    w: TAU / (2.8 + rnd() * 3.2),
                    ph: rnd() * TAU
                });
            }
        }
        swapAcc = 0; driftAcc = 0;
    }

    /* ---------- купол (dome) — только hero ---------- */

    function bandOf(rr) { return rr <= 4 ? 0 : rr <= 9 ? 1 : 2; }

    function buildDome() {
        dome = [];
        if (mode !== 'hero' || W < 820) { domeAcc = 0; return; }
        /* та же «языко» символов, что у кольца вокруг фото (TRAIL), — как продолжение
           вниз. Каждый глиф у ячейки свой; b — полоса прозрачности (ближе к «горизонту» сильнее). */
        var rnd = mulberry32(555);
        for (var rr = 1; rr <= DROWS; rr++) {
            var y = H - rr * DCELL + DCELL / 2;
            var halfW = Math.sqrt(DRAD * DRAD - Math.pow((rr - 0.5) * DCELL, 2));
            var c0 = Math.ceil((W / 2 - halfW - 16) / DCELL);
            var c1 = Math.floor((W / 2 + halfW + 16) / DCELL);
            for (var c = c0; c <= c1; c++) {
                if ((c + rr) % 4 !== 0) continue;
                var x = c * DCELL + DCELL / 2;
                if (inKnock(x, y)) continue;
                dome.push({ x: x, y: y, b: bandOf(rr), g: (rnd() * TRAIL.length) | 0 });
            }
        }
        domeAcc = 0;
    }

    /* ---------- глифовое кольцо вокруг фото-планеты (hero) ---------- */

    function buildRing() {
        ring = []; ring2 = [];
        if (mode !== 'hero') return;
        var rnd = mulberry32(99);
        var k;
        for (k = 0; k < RING_N; k++) {
            ring.push({
                a: k / RING_N * TAU,
                g: TRAIL[(rnd() * TRAIL.length) | 0],
                al: 0.10 + rnd() * 0.22
            });
        }
        for (k = 0; k < RING2_N; k++) {
            ring2.push({
                a: k / RING2_N * TAU + 0.1,
                g: TRAIL[(rnd() * TRAIL.length) | 0],
                al: 0.05 + rnd() * 0.10
            });
        }
    }

    /* ---------- планеты солнечной системы (задний план) ---------- */

    function buildSolar() {
        solars = [];
        var rnd = mulberry32(777);
        /* больше планет → «все» планеты системы кружат одновременно */
        var n = W >= 1024 ? (mode === 'hero' ? 6 : 7) : (W >= 640 ? 4 : 3);
        var scale = W >= 1024 ? 1 : (W >= 640 ? 0.78 : 0.58);
        var pool = SOLAR.slice();
        var picks = [];
        for (var k = 0; k < n && pool.length; k++) {
            var s = pool[(rnd() * pool.length) | 0];
            pool.splice(pool.indexOf(s), 1);
            picks.push(s);
        }
        /* центр орбит: hero — фото-планета («Солнце» сцены), bg — точка вверху */
        var cx = mode === 'hero' ? planetX : W * 0.5;
        var cy = mode === 'hero' ? planetY : Math.max(120, H * 0.30);
        /* орбиты расходятся от центра: f=0 — ближе, f=1 — дальше */
        var rMin = mode === 'hero' ? D / 2 + 40 * scale + 10 : 60;
        var rMax = mode === 'hero'
            ? D / 2 + 40 * scale + 10 + 130 * scale
            : Math.min(W, H) * 0.42;
        for (var i = 0; i < picks.length; i++) {
            var p = picks[i];
            var f = picks.length > 1 ? i / (picks.length - 1) : 0.5;
            var R = rMin + (rMax - rMin) * f + (rnd() * 2 - 1) * 12;
            var period = 90 + 150 * f + rnd() * 50;   /* сек/оборот: дальше — медленнее */
            solars.push({
                key: p.key, cx: cx, cy: cy, R: R,
                w: TAU / period, th0: rnd() * TAU,
                r: p.r * scale, c1: p.c1, c2: p.c2, a: p.a,
                depth: 0.25 + rnd() * 0.5,   /* параллакс: близкие глубже двигаются */
                ring: !!p.ring, bands: !!p.bands
            });
        }
    }

    /* ---------- туманности + кометы (глубина неба, обе темы) ---------- */

    function buildNebula() {
        var base = Math.max(W, H);
        /* ph — фаза дыхания/дрейфа; dr — амплитуда дрейфа, px; br — амплитуда «дыхания» */
        nebula = [
            { x: W * 0.80, y: H * 0.24, R: base * 0.54, c: NEB1C, depth: 0.11, ph: 0.0, dr: 26, br: 0.12 },
            { x: W * 0.14, y: H * 0.68, R: base * 0.46, c: NEB2C, depth: 0.07, ph: 2.1, dr: 20, br: 0.16 }
        ];
    }

    function drawNebula(T) {
        T = T || 0;
        for (var i = 0; i < nebula.length; i++) {
            var nb = nebula[i];
            /* медленный дрейф + дыхание: небула живёт, а не висит статично */
            var ox = nb.dr * Math.sin(T * 0.10 + nb.ph);
            var oy = nb.dr * 0.6 * Math.cos(T * 0.08 + nb.ph);
            var breathe = 1 + nb.br * Math.sin(T * 0.13 + nb.ph);
            var a0 = nb.c.a * breathe;
            var x = nb.x + parX * nb.depth + ox, y = nb.y + parY * nb.depth + oy;
            var R = nb.R * (1 + 0.06 * Math.sin(T * 0.11 + nb.ph));
            var g = ctx.createRadialGradient(x, y, 0, x, y, R);
            g.addColorStop(0, 'rgba(' + nb.c.r + ',' + nb.c.g + ',' + nb.c.b + ',' + a0.toFixed(3) + ')');
            g.addColorStop(0.55, 'rgba(' + nb.c.r + ',' + nb.c.g + ',' + nb.c.b + ',' + (a0 * 0.4).toFixed(3) + ')');
            g.addColorStop(1, 'rgba(' + nb.c.r + ',' + nb.c.g + ',' + nb.c.b + ',0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
        }
    }

    function spawnComet() {
        var T = (performance.now() - bootAt) / 1000;
        var fromLeft = Math.random() < 0.5;
        var dir = fromLeft ? 1 : (Math.random() < 0.5 ? 1 : -1);
        var ang = 0.42 + Math.random() * 0.42;        /* вниз, небольшой наклон */
        var sp = 420 + Math.random() * 260;
        var big = Math.random() < 0.18;                /* изредка — яркая крупная комета */
        comets.push({
            x: fromLeft ? -20 : Math.random() * W,
            y: Math.random() * H * 0.34,
            vx: Math.cos(ang) * sp * dir,
            vy: Math.sin(ang) * sp,
            t0: T, life: (big ? 1.1 : 0.7) + Math.random() * 0.5,
            len: (big ? 90 : 46) + Math.random() * 40,
            big: big
        });
    }

    function drawComets(T) {
        if (!comets.length) return;
        ctx.lineCap = 'round';
        for (var k = comets.length - 1; k >= 0; k--) {
            var c = comets[k];
            var age = T - c.t0;
            if (age < 0) continue;
            if (age > c.life) { comets.splice(k, 1); continue; }
            var fade = 1 - age / c.life;
            var hx = c.x + c.vx * age, hy = c.y + c.vy * age;
            var nl = Math.hypot(c.vx, c.vy) || 1;
            var tx = hx - (c.vx / nl) * c.len, ty = hy - (c.vy / nl) * c.len;
            var base = 'rgba(' + COMETC.r + ',' + COMETC.g + ',' + COMETC.b + ',';
            var grad = ctx.createLinearGradient(hx, hy, tx, ty);
            grad.addColorStop(0, base + (0.9 * fade * COMETC.a).toFixed(3) + ')');
            grad.addColorStop(0.45, base + (0.35 * fade * COMETC.a).toFixed(3) + ')');
            grad.addColorStop(1, base + '0)');
            ctx.globalAlpha = 1;
            ctx.strokeStyle = grad;
            ctx.lineWidth = c.big ? 2.4 : 1.6;
            ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
            /* у крупной кометы — мягкое свечение в голове */
            if (c.big) {
                var hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 9);
                hg.addColorStop(0, base + (0.8 * fade * COMETC.a).toFixed(3) + ')');
                hg.addColorStop(1, base + '0)');
                ctx.fillStyle = hg;
                ctx.beginPath(); ctx.arc(hx, hy, 9, 0, TAU); ctx.fill();
            }
            ctx.globalAlpha = fade * COMETC.a;
            ctx.fillStyle = 'rgb(' + COMETC.r + ',' + COMETC.g + ',' + COMETC.b + ')';
            ctx.beginPath(); ctx.arc(hx, hy, c.big ? 2 : 1.4, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    /* ---------- орбитальный спутник вокруг фото-планеты (hero) ---------- */

    function drawOrbit(T, bob) {
        if (mode !== 'hero') return;
        var cx = planetX + parX, cy = planetY + parY + bob;
        var rSat = D / 2 + 44;
        var a = T * SAT_SPIN;
        /* тонкая орбитальная линия */
        ctx.globalAlpha = 0.14;
        ctx.strokeStyle = RING_COL;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, rSat, 0, TAU);
        ctx.stroke();
        /* длинный затухающий светящийся шлейф-дуга (14 точек) */
        var N = 14, t, tt, sx, sy, f;
        for (t = N - 1; t >= 1; t--) {
            tt = a - t * 0.055;
            sx = cx + Math.cos(tt) * rSat; sy = cy + Math.sin(tt) * rSat;
            f = 1 - t / N;
            ctx.globalAlpha = f * 0.40;
            ctx.fillStyle = RING_COL;
            ctx.beginPath();
            ctx.arc(sx, sy, 2.2 * f + 0.6, 0, TAU);
            ctx.fill();
        }
        /* головное свечение: мягкий ореол + яркий центр */
        var hx = cx + Math.cos(a) * rSat, hy = cy + Math.sin(a) * rSat;
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = RING_COL;
        ctx.beginPath(); ctx.arc(hx, hy, 8, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.95;
        ctx.beginPath(); ctx.arc(hx, hy, 3, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
    }

    /* ---------- burst / trail (указатель) ---------- */

    function burst(mx, my) {
        if (reduced || !themeDark()) return;
        var T = (performance.now() - bootAt) / 1000;
        for (var k = 0; k < 18; k++) {
            var ang = Math.random() * TAU, rad = 1.5 + Math.random() * 4;
            parts.push({
                c: Math.round(mx / 6.5 - 0.5 + Math.cos(ang) * rad),
                r: Math.round(my / 10.6 - 0.5 + Math.sin(ang) * rad * 0.62),
                t0: T,
                life: 0.45 + Math.random() * 0.7,
                a: 0.6 + Math.random() * 0.4,
                g: (Math.random() * TRAIL.length) | 0,
                sw: T + 0.04 + Math.random() * 0.1,
                col: Math.random() < 0.1 ? '#4d8dff' : STAR_COL
            });
        }
        if (parts.length > 128) parts.splice(0, parts.length - 128);
        start();
    }

    /* «Хвост» при удержании: 1–2 слабых глифа прямо под курсором —
       та же сетка 6.5×10.6 и 16-ступенчатое квантование альфы, но низкий
       пик (~0.25–0.4) и короткий life (~0.4–0.6 c). Лимит 30 живых глифов. */
    function emitTrail(mx, my) {
        if (reduced || !themeDark()) return;
        var T = (performance.now() - bootAt) / 1000;
        var n = 1 + (Math.random() < 0.5 ? 1 : 0);
        for (var k = 0; k < n; k++) {
            trail.push({
                c: Math.round(mx / 6.5 - 0.5 + (Math.random() * 3 - 1)),
                r: Math.round(my / 10.6 - 0.5 + (Math.random() * 1.6 - 0.8)),
                t0: T,
                life: 0.4 + Math.random() * 0.2,
                a: 0.25 + Math.random() * 0.15,
                g: (Math.random() * TRAIL.length) | 0
            });
        }
        if (trail.length > 30) trail.splice(0, trail.length - 30);
        start();
    }

    /* ---------- цикл ---------- */

    function frame(now) {
        raf = requestAnimationFrame(frame);
        if (now - lastDraw < 15.5) return;               /* ≈64.5 fps cap, как в оригинале */
        lastDraw = now;
        var dt = Math.min(0.05, lastNow ? (now - lastNow) / 1000 : 0.016);
        lastNow = now;
        var T = (now - bootAt) / 1000;

        /* параллакс (lerp 4.5/с) */
        var k = 1 - Math.exp(-dt * 4.5);
        parX += (parTX - parX) * k;
        parY += (parTY - parY) * k;

        /* звёзды: ~18%/с переключают глиф, ~6%/с дрейфуют на ячейку */
        if (stars.length) {
            swapAcc += dt * stars.length * 0.18;
            driftAcc += dt * stars.length * 0.06;
            while (swapAcc >= 1) {
                swapAcc -= 1;
                stars[(Math.random() * stars.length) | 0].g = pickStarGlyph();
            }
            while (driftAcc >= 1) {
                driftAcc -= 1;
                var s2 = stars[(Math.random() * stars.length) | 0];
                s2.x += (Math.random() < 0.5 ? -1 : 1) * 8;
                if (s2.x < 4) s2.x += 16;
                if (s2.x > W - 4) s2.x -= 16;
                if (s2.y + 13 < Math.max(0, H - DROWS * DCELL)) s2.y += 13;
            }
        }
        /* купол: ~3%/с перебирают уровень прозрачности */
        if (dome.length) {
            domeAcc += dt * dome.length * 0.03;
            while (domeAcc >= 1) {
                domeAcc -= 1;
                dome[(Math.random() * dome.length) | 0].g = (Math.random() * TRAIL.length) | 0;
            }
        }
        /* планеты: медленный ход по кругу — позиция считается от T в drawSolar() */

        /* редкие кометы: запуск раз в 4–14 c, одновременно ≤2 */
        cometWait -= dt;
        if (cometWait <= 0) {
            spawnComet();
            cometWait = 4 + Math.random() * 10;
        }

        /* фото-планета: парение 7 c + параллакс (ring на канвасе движется тем же центром) */
        var bob = reduced ? 0 : Math.sin(T * TAU / 7) * 6;
        if (planetImg) {
            planetImg.style.transform =
                'translate3d(' + parX.toFixed(2) + 'px,' + (parY + bob).toFixed(2) + 'px,0)';
        }

        ctx.clearRect(0, 0, W, H);
        drawNebula(T);
        drawSolar(T);
        drawDome();
        drawStars(T);
        drawComets(T);
        if (mode === 'hero') { drawPlanetBob(T, bob); drawOrbit(T, bob); }
        drawParts(T);
        drawTrail(T);
        setGlow();
    }

    /* Кольцо рисуется вокруг фото с тем же центром, что и парение фото */
    function drawPlanetBob(T, bob) {
        var cx = planetX + parX, cy = planetY + parY + bob;
        var r1 = D / 2 + 12, r2 = D / 2 + 28;
        var spin = T * RING_SPIN;
        ctx.font = '400 ' + Math.max(9, D * 0.04).toFixed(1) + 'px ' + SGA;
        ctx.fillStyle = RING_COL;
        for (var i = 0; i < ring.length; i++) {
            var p = ring[i];
            var ang = p.a + spin;
            ctx.globalAlpha = p.al;
            ctx.fillText(p.g, cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
        }
        for (var j = 0; j < ring2.length; j++) {
            var q = ring2[j];
            var ang2 = q.a - spin * 0.6;
            ctx.globalAlpha = q.al;
            ctx.fillText(q.g, cx + Math.cos(ang2) * r2, cy + Math.sin(ang2) * r2);
        }
        ctx.globalAlpha = 1;
    }

    function drawStars(T) {
        if (!stars.length) return;
        ctx.font = '400 12px ' + MONO;
        ctx.fillStyle = STAR_COL;
        for (var k = 0; k < stars.length; k++) {
            var st = stars[k];
            var a = reduced ? st.a0 : st.a0 * (1 - st.tw * (0.5 + 0.5 * Math.sin(T * st.w + st.ph)));
            if (a < 0.03) continue;
            ctx.globalAlpha = Math.min(1, a);
            ctx.fillText(st.g, st.x, st.y);
        }
        ctx.globalAlpha = 1;
    }

    function drawDome() {
        if (!dome.length) return;
        ctx.font = '400 22px ' + SGA;
        ctx.fillStyle = DOME_COL;
        var off = -parX * 0.4;                            /* контр-параллакс: дальний слой */
        for (var k = 0; k < dome.length; k++) {
            var dc = dome[k];
            ctx.globalAlpha = BANDS[dc.b].a;
            ctx.fillText(TRAIL[dc.g], dc.x + off, dc.y);
        }
        ctx.globalAlpha = 1;
    }

    /* Мини-планеты: градиент-сфера + ночная сторона + (для Сатурна) кольцо,
      (для Юпитера) полосы. Рисуются первыми — самый дальний слой. */
    function drawSolar(T) {
        if (!solars.length) return;
        for (var i = 0; i < solars.length; i++) {
            var s = solars[i];
            var th = s.th0 + s.w * T;
            var x = s.cx + Math.cos(th) * s.R + parX * s.depth;
            var y = s.cy + Math.sin(th) * s.R + parY * s.depth * 0.6;
            var r = s.r;

            /* атмосфера/ореол (Нептун, Уран) — мягкое свечение за телом */
            if (s.halo) {
                var hg = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 1.9);
                hg.addColorStop(0, s.c1);
                hg.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.globalAlpha = 0.5 * s.a;
                ctx.fillStyle = hg;
                ctx.beginPath(); ctx.arc(x, y, r * 1.9, 0, TAU); ctx.fill();
                ctx.globalAlpha = s.a;
            }

            /* тело */
            var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
            g.addColorStop(0, s.c1);
            g.addColorStop(1, s.c2);
            ctx.globalAlpha = s.a;
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, TAU);
            ctx.fill();

            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, r, 0, TAU);
            ctx.clip();
            if (s.bands) {
                /* полосы Юпитера */
                ctx.globalAlpha = 0.4;
                ctx.fillStyle = '#7a5636';
                ctx.fillRect(x - r, y - r * 0.5, r * 2, r * 0.34);
                ctx.fillRect(x - r, y + r * 0.08, r * 2, r * 0.28);
            }
            /* ночная сторона */
            var gn = ctx.createRadialGradient(x + r * 1.1, y + r * 0.8, r * 0.4, x + r * 0.5, y + r * 0.4, r * 1.9);
            gn.addColorStop(0, 'rgba(3,5,12,0.62)');
            gn.addColorStop(0.55, 'rgba(3,5,12,0.18)');
            gn.addColorStop(1, 'rgba(3,5,12,0)');
            ctx.globalAlpha = 1;
            ctx.fillStyle = gn;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
            ctx.restore();

            if (s.ring) {
                /* кольцо Сатурна */
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(-0.42);
                ctx.scale(1, 0.42);
                ctx.globalAlpha = s.a * 0.9;
                ctx.strokeStyle = 'rgba(214, 196, 154, 0.7)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(0, 0, r * 1.85, 0, TAU);
                ctx.stroke();
                ctx.restore();
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawParts(T) {
        if (!parts.length) return;
        ctx.font = '400 10.8px ' + MONO;
        for (var k = parts.length - 1; k >= 0; k--) {
            var p = parts[k], age = T - p.t0;
            if (age > p.life) { parts.splice(k, 1); continue; }
            if (age < 0) continue; /* ещё не «родился» (rAF-часы отстают от performance.now) */
            if (T > p.sw) {
                p.g = (Math.random() * TRAIL.length) | 0;
                p.sw = T + 0.05 + Math.random() * 0.16;
                var m = Math.random();
                if (m < 0.14) p.c -= 1;
                else if (m < 0.28) p.c += 1;
                else if (m < 0.4) p.r += 1;
            }
            var a = p.a * Math.pow(1 - age / p.life, 1.25);
            var q = Math.round(a * 15) / 15;
            if (q < 0.07) continue;
            ctx.globalAlpha = q;
            ctx.fillStyle = p.col;
            ctx.fillText(TRAIL[p.g], p.c * 6.5 + 3.25, p.r * 10.6 + 5.3);
        }
        ctx.globalAlpha = 1;
    }

    function drawTrail(T) {
        if (!trail.length) return;
        ctx.font = '400 10.8px ' + MONO;
        ctx.fillStyle = STAR_COL;
        for (var k = trail.length - 1; k >= 0; k--) {
            var p = trail[k], age = T - p.t0;
            if (age > p.life) { trail.splice(k, 1); continue; }
            if (age < 0) continue;
            var a = p.a * Math.pow(1 - age / p.life, 1.25);
            var q = Math.round(a * 15) / 15;
            if (q < 0.07) continue;
            ctx.globalAlpha = q;
            ctx.fillText(TRAIL[p.g], p.c * 6.5 + 3.25, p.r * 10.6 + 5.3);
        }
        ctx.globalAlpha = 1;
    }

    function setGlow() {
        if (!glow) return;
        var gx = Math.round((planetX + parX) * 10) / 10;
        var gy = Math.round((planetY + parY) * 10) / 10;
        if (gx !== lastGx || gy !== lastGy) {
            lastGx = gx; lastGy = gy;
            hero.style.setProperty('--gx', gx + 'px');
            hero.style.setProperty('--gy', gy + 'px');
        }
    }

    /* ---------- запуск/пауза/тема ---------- */

    function clearCanvas() {
        if (W && H) ctx.clearRect(0, 0, W, H);
    }

    function start() {
        if (raf || reduced) return;
        if (!bootAt) bootAt = performance.now();
        lastNow = 0;
        lastDraw = 0;
        raf = requestAnimationFrame(frame);
        paintOnce();   /* мгновенный кадр в текущей теме, не дожидаясь rAF */
    }

    /* Синхронная перерисовка одного кадра текущей темой. На части устройств
       rAF дёргается/троттлится: после cpm-themechange канвас мог ещё держать
       тёмный кадр, пока не наступил следующий rAF. paintOnce() гасит этот
       проскок — кадр перерисовывается сразу, в новой палитре. */
    function paintOnce() {
        if (reduced || !W) return;
        var T = bootAt ? (performance.now() - bootAt) / 1000 : 0;
        var bob = Math.sin(T * TAU / 7) * 6;
        ctx.clearRect(0, 0, W, H);
        drawNebula(T);
        drawSolar(T);
        drawDome();
        drawStars(T);
        drawComets(T);
        if (mode === 'hero') {
            if (planetImg) planetImg.style.transform =
                'translate3d(' + parX.toFixed(2) + 'px,' + (parY + bob).toFixed(2) + 'px,0)';
            drawPlanetBob(T, bob);
            drawOrbit(T, bob);
        }
        setGlow();
    }

    function stop() {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }

    function staticFrame() {
        stop();
        parX = parY = parTX = parTY = 0;
        if (planetImg) planetImg.style.transform = 'none';
        if (!W) return;
        ctx.clearRect(0, 0, W, H);
        drawNebula(0);
        drawSolar(0);
        drawDome();
        drawStars(0);
        if (mode === 'hero') {
            /* статичное кольцо (T=0) */
            var cx = planetX, cy = planetY;
            var r1 = D / 2 + 12, r2 = D / 2 + 28;
            ctx.font = '400 ' + Math.max(9, D * 0.04).toFixed(1) + 'px ' + SGA;
            ctx.fillStyle = RING_COL;
            var i;
            for (i = 0; i < ring.length; i++) {
                ctx.globalAlpha = ring[i].al;
                ctx.fillText(ring[i].g, cx + Math.cos(ring[i].a) * r1, cy + Math.sin(ring[i].a) * r1);
            }
            for (i = 0; i < ring2.length; i++) {
                ctx.globalAlpha = ring2[i].al;
                ctx.fillText(ring2[i].g, cx + Math.cos(ring2[i].a) * r2, cy + Math.sin(ring2[i].a) * r2);
            }
            ctx.globalAlpha = 1;
            drawOrbit(0, 0);
        }
        setGlow();
    }

    function sync() {
        /* сцена (звёзды/купол/кольцо/планеты) работает в обеих темах —
           палитра берётся из --sky-*; burst/trail в светлой делает symbols.js */
        if (reduced) { stop(); staticFrame(); }
        else start();
    }

    var heroVisible = true, tabVisible = typeof document !== 'undefined' && !document.hidden;

    if (mode === 'hero' && 'IntersectionObserver' in window) {
        new IntersectionObserver(function (es) {
            heroVisible = !!es.length && es[0].isIntersecting;
            if (reduced) return;
            if (heroVisible && tabVisible) start(); else stop();
        }, { rootMargin: '0px 0px -10% 0px' }).observe(hero);
    }
    document.addEventListener('visibilitychange', function () {
        tabVisible = !document.hidden;
        if (reduced) return;
        if (tabVisible) start(); else stop();
    });
    if (mqReduce.addEventListener) {
        mqReduce.addEventListener('change', function (e) {
            reduced = e.matches;
            sync();
        });
    }
    /* смена темы: событие от main.js + MutationObserver-страховка */
    function onTheme() { layout(); paintOnce(); sync(); }
    window.addEventListener('cpm-themechange', onTheme);
    if ('MutationObserver' in window) {
        new MutationObserver(onTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    }

    /* ---------- указатель ---------- */

    addEventListener('pointermove', function (e) {
        if (reduced || (e.pointerType || 'mouse') === 'touch') return;
        /* параллакс работает в обеих темах; шлейф глифов — только в тёмной
           (в светлой burst/trail рисует symbols.js). Тач-устройства пропускаем:
           на телефоне свайп не должен раскидывать глифы и дёргать параллакс. */
        var mx = mode === 'hero' ? e.clientX - heroLeft : e.clientX;
        var my = mode === 'hero' ? e.clientY - heroTop : e.clientY;
        if (mx < 0 || my < 0 || mx > W || my > H) { parTX = 0; parTY = 0; return; }
        parTX = (mx / W - 0.5) * 28;
        parTY = (my / H - 0.5) * 20;
        if (themeDark() && holding) {
            var hr = mode === 'hero' ? hero.getBoundingClientRect() : null;
            emitTrail(e.clientX - (hr ? hr.left : 0), e.clientY - (hr ? hr.top : 0));
        }
    }, { passive: true });

    addEventListener('pointerdown', function (e) {
        if (reduced || !themeDark() || (e.pointerType || 'mouse') === 'touch') return;
        /* тач-тап не спавнит глифы — только мышь/стилус */
        if (e.target.closest && e.target.closest(GUARD)) return;
        var hr = mode === 'hero' ? hero.getBoundingClientRect() : null;
        var mx = e.clientX - (hr ? hr.left : 0);
        var my = e.clientY - (hr ? hr.top : 0);
        if (mx < 0 || my < 0 || mx > W || my > H) return;
        holding = true;
        burst(mx, my);
    }, { passive: true });

    /* конец удержания: pointerup / pointercancel / выход указателя за
       вьюпорт (pointerout без relatedTarget — «покинул страницу») */
    addEventListener('pointerup', function () { holding = false; }, { passive: true });
    addEventListener('pointercancel', function () { holding = false; }, { passive: true });
    document.addEventListener('pointerout', function (e) {
        if (!e.relatedTarget) holding = false;
    }, { passive: true });

    /* ---------- resize ---------- */

    var rz = null;
    addEventListener('resize', function () {
        if (rz) clearTimeout(rz);
        rz = setTimeout(function () { rz = null; layout(); }, 120);
    }, { passive: true });

    /* ---------- старт ---------- */

    layout();

    /* рукописный SGA Smooth для кольца вокруг фото и купольной сетки снизу:
       до загрузки глифы рисуются fallback-шрифтом, после — SGA. В режиме без
       анимации перерисовываем статичный кадр сразу, как только шрифт готов. */
    if (document.fonts) {
        if (document.fonts.load) document.fonts.load('400 24px "SGA Smooth"');
        if (document.fonts.ready) document.fonts.ready.then(function () {
            if (reduced) staticFrame();
        });
    }

    /* отладка (как __sky в оригинале) */
    window.__sky = {
        dump: function () {
            return {
                mode: mode, W: W, H: H, D: D,
                stars: stars.length, dome: dome.length,
                ring: ring.length, parts: parts.length,
                trail: trail.length, solar: solars.length,
                nebula: nebula.length, comets: comets.length,
                reduced: reduced, dark: themeDark(),
                planetX: planetX, planetY: planetY
            };
        },
        get running() { return !!raf; }
    };
})();
