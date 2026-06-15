/* water.js — Fondo de agua interactivo FIJO, reutilizable en todas las páginas.
 *
 * Inyecta el fondo (#ripple-bg + #water-bg de respaldo + #bg-veil), su CSS, y
 * arranca jquery.ripples sobre una foto de pileta. El agua queda fija mientras
 * el contenido scrollea por encima, y reacciona al dedo/cursor en toda la página
 * (sin robar el scroll, porque escucha a nivel documento de forma pasiva).
 *
 * Si el dispositivo no soporta las texturas float de ripples, cae automáticamente
 * al motor procedural Canvas 2D (water-bg.js).
 *
 * Uso en una subpágina:  <script src="water.js?v=1"></script>
 * (No usar en index.html, que ya tiene su propia inicialización.)
 */
(function () {
  'use strict';

  // Si la página ya tiene el fondo (ej. index), no hacemos nada.
  if (document.getElementById('ripple-bg')) return;

  // La imagen de fondo se decide al iniciar: usamos la PORTADA de la obra
  // (.lp-hero__img) para que esa misma foto quede FIJA con el agua encima.

  // ── 1) CSS del fondo ──
  var css =
    "#ripple-bg{position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;z-index:0;" +
      "background:#06222e center center/cover no-repeat;pointer-events:none}" +
    "#water-bg{position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;z-index:0;display:block;" +
      "background:#03131e;pointer-events:none;opacity:0;transition:opacity 1s ease}" +
    "#water-bg.is-ready{opacity:1}" +
    "#bg-veil{position:fixed;inset:0;z-index:1;pointer-events:none;" +
      "background:radial-gradient(ellipse at 50% 26%, rgba(2,11,17,.30) 0%, rgba(2,11,17,.66) 100%)," +
      "linear-gradient(to bottom, rgba(2,11,17,.66) 0%, rgba(2,11,17,.42) 26%, rgba(2,11,17,.48) 72%, rgba(2,11,17,.72) 100%)}";
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  // ── 2) Elementos del fondo (al principio del body, detrás del contenido) ──
  function mountEls() {
    if (document.getElementById('ripple-bg') || !document.body) return;
    var rb = document.createElement('div');    rb.id = 'ripple-bg'; rb.setAttribute('aria-hidden', 'true');
    var wb = document.createElement('canvas'); wb.id = 'water-bg';  wb.setAttribute('aria-hidden', 'true');
    var bv = document.createElement('div');    bv.id = 'bg-veil';   bv.setAttribute('aria-hidden', 'true');
    var first = document.body.firstChild;
    document.body.insertBefore(bv, first);
    document.body.insertBefore(wb, bv);
    document.body.insertBefore(rb, wb);
  }

  function loadScript(src, cb) {
    var s = document.createElement('script'); s.src = src;
    s.onload = cb; s.onerror = cb; document.head.appendChild(s);
  }

  function fallbackCanvas() {
    if (window.__waterCanvasLoaded) return;
    window.__waterCanvasLoaded = true;
    var rb = document.getElementById('ripple-bg'); if (rb) rb.style.display = 'none';
    loadScript('water-bg.js?v=3', function () {});
  }

  function startRipples() {
    if (!window.jQuery || typeof jQuery.fn.ripples !== 'function') return false;
    var $bg = jQuery('#ripple-bg'); if (!$bg.length) return false;
    try {
      $bg.ripples({ resolution: 512, dropRadius: 22, perturbance: 0.02, interactive: false });
    } catch (e) { return false; }
    if (!$bg.data('ripples')) return false;

    function drop(x, y, s) { try { $bg.ripples('drop', x, y, 20, s); } catch (e) {} }
    var last = 0;
    document.addEventListener('mousemove', function (e) {
      var n = Date.now(); if (n - last < 60) return; last = n; drop(e.clientX, e.clientY, 0.022);
    }, { passive: true });
    document.addEventListener('mousedown', function (e) { drop(e.clientX, e.clientY, 0.03); }, { passive: true });
    document.addEventListener('touchstart', function (e) {
      var t = e.touches[0]; if (t) drop(t.clientX, t.clientY, 0.03);
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      var n = Date.now(); if (n - last < 60) return; last = n;
      var t = e.touches[0]; if (t) drop(t.clientX, t.clientY, 0.022);
    }, { passive: true });
    setInterval(function () {
      drop(Math.random() * window.innerWidth, Math.random() * window.innerHeight, 0.022);
    }, 5200);
    return true;
  }

  function init() {
    // AGUA GLOBAL del sitio (no la foto del hero): fondo fijo detrás de TODO.
    // La foto del hero vive dentro del hero y scrollea/desaparece normalmente.
    var IMG = 'assets/lp-porcelana.jpg';

    // Para el respaldo Canvas 2D: misma imagen de agua, completa.
    window.POOL_WATER_PARAMS = { imageURL: IMG, uvOrigin: [0, 0], uvScale: [1, 1] };

    mountEls();
    var rb = document.getElementById('ripple-bg');
    if (rb) rb.style.backgroundImage = "url('" + IMG + "')";

    // Respeta prefers-reduced-motion: el fondo (foto) queda fijo, sin agua animada.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    function go() { if (!startRipples()) fallbackCanvas(); }
    if (window.jQuery && jQuery.fn && jQuery.fn.ripples) { go(); return; }
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js', function () {
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/jquery.ripples/0.5.3/jquery.ripples.min.js', go);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
