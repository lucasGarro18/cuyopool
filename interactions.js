/* Piscinas Cuyo — interactions layer
 * Custom cursor, magnetic CTAs, scroll reveal, count-up stats, side rail
 * with section indicators, marquee, loader. Everything is progressive —
 * if a module fails the page still functions.
 */
(function () {
  'use strict';
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse  = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  // ── Loader ──────────────────────────────────────────────────────────────
  const loader = document.getElementById('loader');
  if (loader) {
    window.addEventListener('load', () => {
      setTimeout(() => loader.classList.add('out'), 600);
    });
    // Safety net: hide after 3s no matter what
    setTimeout(() => loader.classList.add('out'), 3000);
  }

  // ── Custom cursor (dot + ring) ─────────────────────────────────────────
  // Hidden on coarse pointer devices.
  if (!coarse && !reduced) {
    const dot = document.createElement('div');
    const ring = document.createElement('div');
    dot.id = 'c-dot'; ring.id = 'c-ring';
    document.body.appendChild(dot); document.body.appendChild(ring);
    document.documentElement.classList.add('has-cursor');

    let dx = window.innerWidth/2, dy = window.innerHeight/2;
    let rx = dx, ry = dy;
    let tx = dx, ty = dy;
    let hovering = false;

    window.addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; });
    // Hover state on interactive elements
    document.addEventListener('pointerover', (e) => {
      if (e.target.closest('a, button, [data-magnetic], [data-hover]')) {
        ring.classList.add('is-active');
        hovering = true;
      }
    });
    document.addEventListener('pointerout', (e) => {
      if (e.target.closest('a, button, [data-magnetic], [data-hover]')) {
        ring.classList.remove('is-active');
        hovering = false;
      }
    });
    // Click → big water splash
    document.addEventListener('pointerdown', (e) => {
      if (window.__splash) window.__splash(e.clientX, e.clientY, 1.4);
      ring.classList.add('is-down');
      setTimeout(() => ring.classList.remove('is-down'), 250);
    });

    function loop() {
      dx += (tx - dx) * 0.42; dy += (ty - dy) * 0.42;
      rx += (tx - rx) * 0.16; ry += (ty - ry) * 0.16;
      dot.style.transform = `translate3d(${dx}px, ${dy}px, 0) translate(-50%, -50%)`;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%)`;
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  // ── Magnetic CTAs ───────────────────────────────────────────────────────
  // Buttons with [data-magnetic] subtly pull toward the cursor when nearby.
  // UN SOLO listener global compartido entre todos los botones para evitar
  // que cada uno agregue su propio pointermove (que causaba N cálculos por mover).
  if (!coarse && !reduced) {
    const magnets = Array.from(document.querySelectorAll('[data-magnetic]')).map(el => ({
      el,
      strength: parseFloat(el.dataset.magnetic) || 0.28,
      raf: 0,
    }));
    if (magnets.length) {
      const RANGE = 120;
      window.addEventListener('pointermove', (e) => {
        magnets.forEach((m) => {
          const r = m.el.getBoundingClientRect();
          const ex = r.left + r.width/2, ey = r.top + r.height/2;
          const dx = e.clientX - ex, dy = e.clientY - ey;
          const d = Math.hypot(dx, dy);
          let cx = 0, cy = 0;
          if (d < RANGE + Math.max(r.width, r.height)/2) {
            cx = dx * m.strength; cy = dy * m.strength;
          }
          cancelAnimationFrame(m.raf);
          m.raf = requestAnimationFrame(() => {
            m.el.style.transform = `translate(${cx}px, ${cy}px)`;
          });
        });
      }, { passive: true });
      // Reset al salir del elemento
      magnets.forEach((m) => {
        m.el.addEventListener('pointerleave', () => {
          cancelAnimationFrame(m.raf);
          m.el.style.transform = 'translate(0, 0)';
        });
      });
    }
  }

  // ── Reveal on scroll ───────────────────────────────────────────────────
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -80px 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  // ── Count-up stats ──────────────────────────────────────────────────────
  // Element with [data-count-to] starts at 0 when in view and animates to its target.
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function animateCount(el) {
    const target = parseFloat(el.dataset.countTo);
    const dur = parseInt(el.dataset.countDur || '1600', 10);
    const decimals = parseInt(el.dataset.countDecimals || '0', 10);
    const suffix = el.dataset.countSuffix || '';
    const prefix = el.dataset.countPrefix || '';
    const start = performance.now();
    function tick(t) {
      const p = Math.min(1, (t - start) / dur);
      const v = target * easeOutCubic(p);
      el.textContent = prefix + v.toLocaleString('es-AR', {
        minimumFractionDigits: decimals, maximumFractionDigits: decimals
      }) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  const countIo = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { animateCount(e.target); countIo.unobserve(e.target); }
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-count-to]').forEach(el => countIo.observe(el));

  // ── Side rail ───────────────────────────────────────────────────────────
  // Right edge dots that mark current section + click to jump.
  const sections = Array.from(document.querySelectorAll('section[data-screen-label]'));
  const rail = document.getElementById('rail');
  if (rail && sections.length) {
    sections.forEach((s) => {
      const id = s.id || s.getAttribute('data-screen-label').replace(/\s+/g, '-').toLowerCase();
      if (!s.id) s.id = id;
      const dot = document.createElement('a');
      dot.href = '#' + id;
      dot.className = 'rail__dot';
      const label = s.getAttribute('data-screen-label').replace(/^\d+\s*/, '');
      dot.setAttribute('data-label', label);
      dot.setAttribute('aria-label', label);
      rail.appendChild(dot);
    });
    const dots = Array.from(rail.querySelectorAll('.rail__dot'));

    // Posiciones absolutas (px desde el top del documento).
    // getBoundingClientRect().top + scrollY = posición fija sin importar offsetParent.
    let tops = null;

    function buildTops() {
      const sy = window.scrollY;
      tops = sections.map(s => s.getBoundingClientRect().top + sy);
    }

    function paintRail() {
      if (!tops || !tops.length) buildTops();
      // Punto de referencia: 45% del viewport desde arriba
      const trigger = window.scrollY + window.innerHeight * 0.45;
      let idx = 0;
      for (let i = 0; i < tops.length; i++) {
        if (tops[i] <= trigger) idx = i;
      }
      for (let i = 0; i < dots.length; i++) {
        dots[i].classList.toggle('is-active', i === idx);
      }
    }

    // El cálculo es trivial (un array de 9 vs un número). Llamada directa,
    // sin rAF throttle — el throttle anterior tenía un edge case donde
    // requestAnimationFrame podía no dispararse si el navegador estaba
    // ocupado, dejando el id "pendiente" y bloqueando paint subsiguientes.
    window.addEventListener('scroll', paintRail, { passive: true });
    window.addEventListener('resize', () => { tops = null; paintRail(); });
    window.addEventListener('load',   () => { tops = null; paintRail(); });
    // Llamada inicial
    paintRail();
  }

  // ── Nav scroll state ────────────────────────────────────────────────────
  const nav = document.getElementById('nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ── Tilt cards ──────────────────────────────────────────────────────────
  // Cards with [data-tilt] tilt subtly toward the cursor for a 3D feel.
  if (!coarse && !reduced) {
    document.querySelectorAll('[data-tilt]').forEach((el) => {
      const STRENGTH = parseFloat(el.dataset.tilt) || 6;
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const rx = ((e.clientY - r.top) / r.height - 0.5) * -STRENGTH;
        const ry = ((e.clientX - r.left) / r.width - 0.5) * STRENGTH;
        el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
      });
      el.addEventListener('pointerleave', () => {
        el.style.transform = 'perspective(900px) rotateX(0) rotateY(0)';
      });
    });
  }
})();
