(function () {
    'use strict';

    /* Активен только в светлой теме: в тёмной burst/trail рисует
       sky.js на канвасах #sky / #sky-bg (CSS скрывает .symbols-burst). */

    var root = document.documentElement;
    function isLight() { return root.getAttribute('data-theme') !== 'dark'; }

    var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mqReduce.matches) return;

    var TAU = Math.PI * 2;
    var TRAIL = '[]/\\%#_^!$?&<>*~+=';          // набор глифов (как в оригинале)
    var CW = 6.5, CH = 10.6;                     // сетка ячеек ≈ 6.43/10.46 px оригинала
    var FONT_PX = CW / 0.6;                      // ≈10.8, как у оригинала (cw/0.6)
    var NA = 16;                                  // 16-ступенчатое квантование прозрачности
    var MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    var GUARD = 'a,button,input,select,textarea,label,summary,dialog,[contenteditable="true"]';

    var canvas = document.createElement('canvas');
    canvas.className = 'symbols-burst';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;';
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');

    var parts = [];
    var trail = [];                                     /* слабый шлейф при удержании */
    var holding = false;
    var raf = 0;
    var bootAt = performance.now();

    /* цвет глифов: читаем --text (в светлой теме — тёмные глифы) */
    var color = '#1f1b16';
    function refreshColor() {
        try {
            var t = getComputedStyle(root).getPropertyValue('--text').trim();
            if (t) color = t;
        } catch (e) { /* оставляем fallback */ }
        ctx.fillStyle = color;
    }
    refreshColor();

    function resize() {
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(window.innerWidth * dpr);
        canvas.height = Math.round(window.innerHeight * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.font = '400 ' + FONT_PX.toFixed(2) + 'px ' + MONO;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }

    function burst(px, py) {
        var T = (performance.now() - bootAt) / 1000;
        for (var k = 0; k < 18; k++) {
            var ang = Math.random() * TAU, rad = 1.5 + Math.random() * 4;
            parts.push({
                c: Math.round(px / CW - 0.5 + Math.cos(ang) * rad),
                r: Math.round(py / CH - 0.5 + Math.sin(ang) * rad * 0.62),
                t0: T,
                life: 0.45 + Math.random() * 0.7,
                a: 0.6 + Math.random() * 0.4,
                g: (Math.random() * TRAIL.length) | 0,
                sw: T + 0.04 + Math.random() * 0.1
            });
        }
        if (!raf) raf = requestAnimationFrame(frame);
    }

    /* «Хвост» при удержании: 1–2 слабых глифа прямо под курсором —
       та же сетка CW×CH и 16-ступенчатое квантование, но низкий пик
       (~0.25–0.4) и короткий life (~0.4–0.6 c). Лимит 30 живых глифов. */
    function emitTrail(px, py) {
        if (mqReduce.matches) return;
        var T = (performance.now() - bootAt) / 1000;
        var n = 1 + (Math.random() < 0.5 ? 1 : 0);
        for (var k = 0; k < n; k++) {
            trail.push({
                c: Math.round(px / CW - 0.5 + (Math.random() * 3 - 1)),
                r: Math.round(py / CH - 0.5 + (Math.random() * 1.6 - 0.8)),
                t0: T,
                life: 0.4 + Math.random() * 0.2,
                a: 0.25 + Math.random() * 0.15,
                g: (Math.random() * TRAIL.length) | 0
            });
        }
        if (trail.length > 30) trail.splice(0, trail.length - 30);
        if (!raf) raf = requestAnimationFrame(frame);
    }

    function frame() {
        raf = requestAnimationFrame(frame);
        var T = (performance.now() - bootAt) / 1000;
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        for (var k = parts.length - 1; k >= 0; k--) {
            var p = parts[k], age = T - p.t0;
            if (age > p.life) { parts.splice(k, 1); continue; }
            if (T > p.sw) {
                p.g = (Math.random() * TRAIL.length) | 0;
                p.sw = T + 0.05 + Math.random() * 0.16;
                var m = Math.random();
                if (m < 0.14) p.c -= 1;
                else if (m < 0.28) p.c += 1;
                else if (m < 0.4) p.r += 1;
            }
            var a = p.a * Math.pow(1 - age / p.life, 1.25);
            var q = Math.round(a * (NA - 1));
            if (q < 1) continue;
            ctx.globalAlpha = q / (NA - 1);
            ctx.fillText(TRAIL[p.g], p.c * CW + CW / 2, p.r * CH + CH / 2);
        }
        /* шлейф: без скрембл/дрейфа, просто затухание */
        for (var j = trail.length - 1; j >= 0; j--) {
            var t = trail[j], tAge = T - t.t0;
            if (tAge > t.life) { trail.splice(j, 1); continue; }
            if (tAge < 0) continue; /* ещё не «родился» в этом кадре */
            var a2 = t.a * Math.pow(1 - tAge / t.life, 1.25);
            var q2 = Math.round(a2 * (NA - 1));
            if (q2 < 1) continue;
            ctx.globalAlpha = q2 / (NA - 1);
            ctx.fillText(TRAIL[t.g], t.c * CW + CW / 2, t.r * CH + CH / 2);
        }
        ctx.globalAlpha = 1;
        if (!parts.length && !trail.length) {
            cancelAnimationFrame(raf);
            raf = 0;
        }
    }

    addEventListener('pointerdown', function (e) {
        if (!isLight() || mqReduce.matches) return;
        if (e.target.closest && e.target.closest(GUARD)) return;
        holding = true;
        burst(e.clientX, e.clientY);
    }, { passive: true });

    /* «шлейф» при удержании: каждый pointermove эммитит 1–2 слабых глифа */
    addEventListener('pointermove', function (e) {
        if (holding && isLight() && !mqReduce.matches) emitTrail(e.clientX, e.clientY);
    }, { passive: true });

    /* конец удержания: pointerup / pointercancel / выход указателя за
       вьюпорт (pointerout без relatedTarget — «покинул страницу») */
    addEventListener('pointerup', function () { holding = false; }, { passive: true });
    addEventListener('pointercancel', function () { holding = false; }, { passive: true });
    document.addEventListener('pointerout', function (e) {
        if (!e.relatedTarget) holding = false;
    }, { passive: true });

    /* смена темы: тёмная → глушим всё (burst берёт на себя sky.js),
       светлая → перечитываем --text и восстанавливаем канвас */
    window.addEventListener('cpm-themechange', function () {
        if (isLight()) {
            refreshColor();
            resize();
        } else {
            cancelAnimationFrame(raf);
            raf = 0;
            parts.length = 0;
            trail.length = 0;
            holding = false;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    });

    addEventListener('resize', resize, { passive: true });
    if (mqReduce.addEventListener) {
        mqReduce.addEventListener('change', function (e) {
            if (e.matches) {
                cancelAnimationFrame(raf);
                raf = 0;
                parts.length = 0;
                trail.length = 0;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        });
    }

    resize();
})();
