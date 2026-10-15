(function(root) {
    'use strict';
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
    const url = value => /^(\/(?!\/)|#|https:\/\/)/.test(value || '') ? escape(value) : '#';

    function render(config = root.VeroVazHeroConfig) {
        const slides = config ?.slides || [];
        if (!slides.length) return '';
        return `<section class="editorial-hero hero-carousel" aria-label="Inspirações VeroVaz" aria-roledescription="carrossel" tabindex="0">
      <div class="hero-slides">${slides.map((s, i) => `<article class="hero-slide ${s.embeddedCopy ? 'hero-embedded-copy' : ''}" role="group" aria-roledescription="slide" aria-label="${i + 1} de ${slides.length}" ${i ? 'hidden' : ''}>
        <picture><source media="(max-width: 767.98px)" srcset="${url(s.mobileSrc)}" type="${escape(s.imageType || 'image/webp')}"><source media="(max-width: 767.98px)" srcset="${url(s.mobileFallback || s.mobileSrc)}"><source srcset="${url(s.desktopSrc)}" type="${escape(s.imageType || 'image/webp')}"><img src="${url(s.desktopFallback || s.desktopSrc)}" width="1920" height="640" alt="${escape(s.alt)}" loading="${i ? 'lazy' : 'eager'}" ${i ? '' : 'fetchpriority="high"'}></picture>
        <div class="editorial-hero-copy">${s.eyebrow ? `<p class="eyebrow">${escape(s.eyebrow)}</p>` : ''}<${i ? 'h2' : 'h1'}>${s.titleLines ? s.titleLines.map(escape).join('<br>') : escape(s.title)}${s.italic ? `<em>${escape(s.italic)}</em>` : ''}</${i ? 'h2' : 'h1'}><p>${escape(s.description)}</p><a class="button" href="${url(s.ctaHref)}">${escape(s.ctaLabel)}<span aria-hidden="true">→</span></a></div>
      </article>`).join('')}</div>
      <div class="hero-controls" ${slides.length < 2 ? 'hidden' : ''}><button type="button" data-hero="previous" aria-label="Slide anterior">←</button><div class="hero-dots">${slides.map((_,i)=>`<button type="button" data-slide="${i}" aria-label="Ir para o slide ${i+1}" aria-current="${i===0}"><span></span></button>`).join('')}</div><button type="button" data-hero="next" aria-label="Próximo slide">→</button>${config.autoplay ? '<button type="button" data-hero="pause" aria-label="Pausar apresentação automática">Pausar</button>' : ''}</div><span class="sr-only hero-announcement" role="status" aria-live="polite" aria-atomic="true"></span>
    </section>`;
    }

    function mount(element, config = root.VeroVazHeroConfig) {
        if (!element) return () => {};
        const slides = [...element.querySelectorAll('.hero-slide')];
        if (slides.length < 2) return () => {};
        const cleanups = [],
            motion = root.matchMedia('(prefers-reduced-motion: reduce)');
        let index = 0,
            timer, hovered = false,
            focused = false,
            stopped = false,
            touching = false,
            start = null;
        const listen = (target, event, fn, options) => {
            target.addEventListener(event, fn, options);
            cleanups.push(() => target.removeEventListener(event, fn, options));
        };

        function schedule() {
            clearTimeout(timer);
            if (config.autoplay && !motion.matches && !document.hidden && !hovered && !focused && !stopped && !touching) timer = setTimeout(() => {
                show(index + 1, false);
            }, Math.max(1000, config.interval || 6000));
        }

        function show(next, manual = true) {
            index = (next + slides.length) % slides.length;
            slides.forEach((slide, i) => {
                slide.hidden = i !== index;
            });
            element.querySelectorAll('[data-slide]').forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));
            if (manual) {
                stopped = true;
                element.querySelector('.hero-announcement').textContent = `Slide ${index+1} de ${slides.length}`;
            }
            const pause = element.querySelector('[data-hero=pause]');
            if (pause) {
                pause.textContent = stopped ? 'Retomar' : 'Pausar';
                pause.setAttribute('aria-label', stopped ? 'Retomar apresentação automática' : 'Pausar apresentação automática');
            }
            schedule();
        }
        listen(element, 'click', e => {
            const b = e.target.closest('button');
            if (!b) return;
            if (b.hasAttribute('data-slide')) show(Number(b.dataset.slide));
            else if (b.dataset.hero === 'previous') show(index - 1);
            else if (b.dataset.hero === 'next') show(index + 1);
            else if (b.dataset.hero === 'pause') {
                stopped = !stopped;
                show(index, false);
            }
        });
        listen(element, 'keydown', e => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                show(index + (e.key === 'ArrowLeft' ? -1 : 1));
            }
        });
        listen(element, 'mouseenter', () => {
            hovered = true;
            schedule();
        });
        listen(element, 'mouseleave', () => {
            hovered = false;
            schedule();
        });
        listen(element, 'focusin', () => {
            focused = true;
            schedule();
        });
        listen(element, 'focusout', e => {
            focused = element.contains(e.relatedTarget);
            schedule();
        });
        listen(element, 'pointerdown', e => {
            if (e.pointerType === 'mouse') return;
            touching = true;
            stopped = true;
            start = {
                x: e.clientX,
                y: e.clientY
            };
            schedule();
        }, {
            passive: true
        });
        listen(element, 'pointerup', e => {
            if (start && Math.abs(e.clientX - start.x) > 45 && Math.abs(e.clientX - start.x) > Math.abs(e.clientY - start.y)) show(index + (e.clientX < start.x ? 1 : -1));
            start = null;
            touching = false;
            schedule();
        }, {
            passive: true
        });
        listen(element, 'pointercancel', () => {
            start = null;
            touching = false;
            schedule();
        });
        listen(document, 'visibilitychange', schedule);
        listen(motion, 'change', schedule);
        schedule();
        return () => {
            clearTimeout(timer);
            cleanups.forEach(fn => fn());
        };
    }
    root.VeroVazHero = {
        render,
        mount
    };
})(window);