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
  // Todo SCROLLEA con la página (no fijo). El hero lleva el agua ripple real
  // (se va con el scroll) y #water-fx es el agua en movimiento (CSS) de fondo.
  var css =
    "#ripple-bg{position:absolute;top:0;left:0;width:100%;height:100vh;height:100dvh;z-index:0;" +
      "background:#0a3a4c center center/cover no-repeat;pointer-events:none}" +
    "#water-bg{position:absolute;top:0;left:0;width:100%;height:100vh;height:100dvh;z-index:0;display:block;" +
      "background:transparent;pointer-events:none;opacity:0;transition:opacity 1s ease}" +
    "#water-bg.is-ready{opacity:1}" +
    "#water-fx{position:absolute;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;overflow:clip}" +
    "#water-fx i{position:absolute;top:0;left:0;width:100%;height:100%;display:block;filter:blur(16px);" +
      "will-change:transform;transform-origin:center;background-repeat:no-repeat}" +
    "#water-fx i:nth-child(1){background-image:" +
      "radial-gradient(32% 22% at 24% 18%, rgba(126,226,238,.42), transparent 60%)," +
      "radial-gradient(28% 18% at 70% 34%, rgba(96,204,226,.36), transparent 60%)," +
      "radial-gradient(36% 24% at 44% 60%, rgba(116,216,232,.34), transparent 62%)," +
      "radial-gradient(28% 18% at 84% 74%, rgba(100,200,222,.34), transparent 60%)," +
      "radial-gradient(32% 22% at 14% 86%, rgba(126,222,236,.30), transparent 62%);" +
      "animation:waterFlowA 24s ease-in-out infinite alternate}" +
    "#water-fx i:nth-child(2){background-image:" +
      "radial-gradient(28% 18% at 60% 12%, rgba(146,232,242,.30), transparent 60%)," +
      "radial-gradient(32% 22% at 30% 44%, rgba(100,204,226,.28), transparent 62%)," +
      "radial-gradient(26% 16% at 82% 56%, rgba(124,218,234,.30), transparent 60%)," +
      "radial-gradient(32% 22% at 18% 72%, rgba(112,212,230,.26), transparent 62%);" +
      "animation:waterFlowB 31s ease-in-out infinite alternate}" +
    "@keyframes waterFlowA{0%{transform:translate3d(-3%,-2.4%,0) scale(1.06)}100%{transform:translate3d(3%,2.6%,0) scale(1.14)}}" +
    "@keyframes waterFlowB{0%{transform:translate3d(2.6%,1.8%,0) scale(1.12)}100%{transform:translate3d(-3%,-2.4%,0) scale(1.05)}}" +
    "@media (prefers-reduced-motion: reduce){#water-fx i{animation:none}}" +
    "#bg-veil{position:absolute;top:0;left:0;width:100%;height:100%;z-index:1;pointer-events:none;" +
      "background:linear-gradient(to bottom, rgba(2,11,17,.16) 0, rgba(2,11,17,.22) 100vh, rgba(2,11,17,.22) 100%)}";
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  // ── 2) Elementos del fondo (al principio del body, detrás del contenido) ──
  function mountEls() {
    if (document.getElementById('ripple-bg') || !document.body) return;
    var fx = document.createElement('div');    fx.id = 'water-fx'; fx.setAttribute('aria-hidden', 'true');
    fx.appendChild(document.createElement('i')); fx.appendChild(document.createElement('i'));
    var rb = document.createElement('div');    rb.id = 'ripple-bg'; rb.setAttribute('aria-hidden', 'true');
    var wb = document.createElement('canvas'); wb.id = 'water-bg';  wb.setAttribute('aria-hidden', 'true');
    var bv = document.createElement('div');    bv.id = 'bg-veil';   bv.setAttribute('aria-hidden', 'true');
    var first = document.body.firstChild;
    document.body.insertBefore(bv, first);
    document.body.insertBefore(wb, bv);
    document.body.insertBefore(rb, wb);
    document.body.insertBefore(fx, rb);
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
      $bg.ripples({ resolution: 512, dropRadius: 18, perturbance: 0.032, interactive: false });
    } catch (e) { return false; }
    if (!$bg.data('ripples')) return false;

    // El agua del hero (absoluta, alto = 1 pantalla) scrollea con la página.
    // Coords de PÁGINA (clientY + scrollY); la gota solo cuenta dentro del hero.
    function heroH(){ return $bg[0] ? $bg[0].offsetHeight : window.innerHeight; }
    function drop(x, y, s) { if (y < 0 || y > heroH()) return; try { $bg.ripples('drop', x, y, 20, s); } catch (e) {} }
    var last = 0;
    document.addEventListener('mousemove', function (e) {
      var n = Date.now(); if (n - last < 60) return; last = n; drop(e.clientX, e.clientY + window.scrollY, 0.022);
    }, { passive: true });
    document.addEventListener('mousedown', function (e) { drop(e.clientX, e.clientY + window.scrollY, 0.03); }, { passive: true });
    document.addEventListener('touchstart', function (e) {
      var t = e.touches[0]; if (t) drop(t.clientX, t.clientY + window.scrollY, 0.03);
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      var n = Date.now(); if (n - last < 60) return; last = n;
      var t = e.touches[0]; if (t) drop(t.clientX, t.clientY + window.scrollY, 0.022);
    }, { passive: true });
    // Gotas ambientales en el agua del hero (mientras está a la vista).
    setInterval(function () {
      if (window.scrollY > heroH()) return;
      drop(Math.random() * window.innerWidth, Math.random() * heroH(), 0.012 + Math.random() * 0.012);
    }, 1100);
    return true;
  }

  function init() {
    // AGUA GLOBAL del sitio (no la foto del hero): fondo fijo detrás de TODO.
    // La foto del hero vive dentro del hero y scrollea/desaparece normalmente.
    var IMG = 'assets/water-surface.jpg';

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
