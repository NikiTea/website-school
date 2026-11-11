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
})();
