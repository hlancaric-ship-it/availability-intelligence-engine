const nav = document.getElementById('mainNav');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileMenu = document.getElementById('mobileMenu');

window.addEventListener('scroll', () => {
    nav?.classList.toggle('scrolled', window.scrollY > 12);
}, { passive: true });

mobileMenuBtn?.addEventListener('click', () => {
    mobileMenu?.classList.toggle('open');
});

mobileMenu?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => mobileMenu?.classList.remove('open'));
});

const reveals = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
        if (entry.isIntersecting) {
            entry.target.classList.add('in');
            revealObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

reveals.forEach((el) => revealObserver.observe(el));

document.querySelectorAll('.faq-q').forEach((btn) => {
    btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item');
        const wasOpen = item?.classList.contains('open');
        document.querySelectorAll('.faq-item.open').forEach((open) => open.classList.remove('open'));
        if (!wasOpen) item?.classList.add('open');
    });
});

// Pipeline horizontal scrollytelling
(function () {
    const wrap = document.getElementById('pipelineWrap');
    const track = document.getElementById('pipelineTrack');
    const dots = document.querySelectorAll('.pl-dot');
    const dotsContainer = document.getElementById('pipelineDots');
    if (!wrap || !track) return;

    const panelCount = track.children.length;

    function update() {
        const rect = wrap.getBoundingClientRect();
        const scrollable = wrap.offsetHeight - window.innerHeight;
        const progress = scrollable > 0
            ? Math.min(Math.max(-rect.top / scrollable, 0), 1)
            : 0;
        const maxTranslate = track.scrollWidth - window.innerWidth;
        track.style.transform = `translateX(${-progress * maxTranslate}px)`;

        const inView = rect.top < window.innerHeight && rect.bottom > 0;
        if (dotsContainer) dotsContainer.style.opacity = inView ? '1' : '0';

        const activeIndex = Math.min(Math.floor(progress * panelCount), panelCount - 1);
        dots.forEach((d, i) => d.classList.toggle('active', i === activeIndex));
    }

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
})();

