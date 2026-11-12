(function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

    function run(el, keyframes, options) {
        if (reduceMotion || !el.animate) return;
        el.animate(keyframes, Object.assign({ easing: EASE, fill: 'both' }, options));
    }

    function cancel(el) {
        if (el.getAnimations) {
            el.getAnimations().forEach(function (a) { a.cancel(); });
        }
    }

    /* Мобильное меню */
    var btn = document.querySelector('.burger');
    var nav = document.getElementById('site-nav');
    if (btn && nav) {
        var lines = btn.querySelectorAll('span');
        var hideTimer = null;

        function setOpen(open) {
            if (window.innerWidth > 820) {
                cancel(nav);
                cancel(btn);
                if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
                btn.setAttribute('aria-expanded', 'false');
                btn.setAttribute('aria-label', 'Открыть меню');
                nav.classList.remove('open');
                return;
            }
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            btn.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
            if (open) {
                if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
                nav.classList.add('open');
            }
            run(nav, [
                { opacity: open ? 0 : 1, transform: open ? 'translateY(-8px)' : 'translateY(0px)' },
                { opacity: open ? 1 : 0, transform: open ? 'translateY(0px)' : 'translateY(-8px)' }
            ], { duration: 200 });
            if (lines.length === 3) {
                run(lines[0], [
                    { transform: open ? 'translateY(0px) rotate(0deg)' : 'translateY(7px) rotate(45deg)' },
                    { transform: open ? 'translateY(7px) rotate(45deg)' : 'translateY(0px) rotate(0deg)' }
                ], { duration: 200 });
                run(lines[1], [
                    { opacity: open ? 1 : 0 },
                    { opacity: open ? 0 : 1 }
                ], { duration: 200 });
                run(lines[2], [
                    { transform: open ? 'translateY(0px) rotate(0deg)' : 'translateY(-7px) rotate(-45deg)' },
                    { transform: open ? 'translateY(-7px) rotate(-45deg)' : 'translateY(0px) rotate(0deg)' }
                ], { duration: 200 });
            }
            if (!open) {
                if (reduceMotion || !nav.animate) {
                    nav.classList.remove('open');
                } else {
                    hideTimer = setTimeout(function () {
                        nav.classList.remove('open');
                        hideTimer = null;
                    }, 220);
                }
            }
        }

        btn.addEventListener('click', function () {
            setOpen(btn.getAttribute('aria-expanded') !== 'true');
        });
        nav.addEventListener('click', function (e) {
            if (e.target.closest('a')) setOpen(false);
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') setOpen(false);
        });
        window.addEventListener('resize', function () {
            if (window.innerWidth > 820) setOpen(false);
        });
    }

    /* Появление блоков: fade + rise с задержкой */
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
    if (items.length && !reduceMotion && 'IntersectionObserver' in window) {
        items.forEach(function (el) {
            el.style.opacity = '0';
            el.style.transform = 'translateY(12px)';
        });
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                observer.unobserve(entry.target);
                var el = entry.target;
                var delay = (parseInt(el.getAttribute('data-stagger'), 10) || 0) * 60;
                var anim = el.animate(
                    [
                        { opacity: 0, transform: 'translateY(12px)' },
                        { opacity: 1, transform: 'translateY(0px)' }
                    ],
                    { duration: 450, delay: delay, easing: EASE, fill: 'both' }
                );
                anim.onfinish = function () {
                    el.style.opacity = '';
                    el.style.transform = '';
                    anim.cancel();
                };
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -4% 0px' });
        items.forEach(function (el) { observer.observe(el); });
    }

    /* Переключатель темы (правый нижний угол, fixed — остаётся при прокрутке).
       Тема сохраняется в localStorage['cpm-theme']; при переключении
       шлётся cpm-themechange (sky.js / symbols.js перестраиваются). */
    (function () {
        var root = document.documentElement;
        var themeBtn = document.createElement('button');
        themeBtn.id = 'theme-toggle';
        themeBtn.type = 'button';
        themeBtn.innerHTML =
            '<svg class="tt-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.5 5.5l1.9 1.9M16.6 16.6l1.9 1.9M18.5 5.5l-1.9 1.9M7.4 16.6l-1.9 1.9"/></svg>' +
            '<svg class="tt-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 13.4A8.4 8.4 0 0 1 10.6 3.6a8.4 8.4 0 1 0 9.8 9.8Z"/></svg>';
        document.body.appendChild(themeBtn);

        function refreshToggle() {
            var dark = root.getAttribute('data-theme') === 'dark';
            themeBtn.classList.toggle('is-dark', dark);
            themeBtn.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
        }

        themeBtn.addEventListener('click', function () {
            var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', next);
            try { localStorage.setItem('cpm-theme', next); } catch (e) {}
            refreshToggle();
            window.dispatchEvent(new CustomEvent('cpm-themechange', { detail: { theme: next } }));
        });

        refreshToggle();
    })();
})();
