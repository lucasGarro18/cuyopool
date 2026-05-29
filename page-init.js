/* CUYO POOL — Inicialización común para subpáginas
   - Cursor custom
   - Nav scrolled state
   - Reveal-on-scroll
*/
(function(){
  'use strict';

  // ── Custom cursor ──
  const dot = document.getElementById('c-dot');
  const ring = document.getElementById('c-ring');
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  if (finePointer && dot && ring) {
    document.documentElement.classList.add('has-cursor');
    let mx = 0, my = 0, rx = 0, ry = 0;
    document.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; });
    document.addEventListener('mousedown', () => ring.classList.add('is-down'));
    document.addEventListener('mouseup', () => ring.classList.remove('is-down'));
    document.querySelectorAll('a, button').forEach((el) => {
      el.addEventListener('mouseenter', () => ring.classList.add('is-active'));
      el.addEventListener('mouseleave', () => ring.classList.remove('is-active'));
    });
    function tick() {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      dot.style.transform = `translate3d(${mx - 3}px, ${my - 3}px, 0)`;
      ring.style.transform = `translate3d(${rx - 19}px, ${ry - 19}px, 0)`;
      requestAnimationFrame(tick);
    }
    tick();
  }

  // ── Nav scrolled state ──
  const nav = document.getElementById('nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('is-scrolled', window.scrollY > 60);
    });
  }

  // ── Menú mobile (hamburguesa) ──
  const burger = document.getElementById('nav-burger');
  if (nav && burger) {
    const close = () => {
      nav.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    };
    burger.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
    });
    nav.querySelectorAll('.nav__links a').forEach((a) => a.addEventListener('click', close));
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }

  // ── Reveal on scroll ──
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -80px 0px' });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
})();
