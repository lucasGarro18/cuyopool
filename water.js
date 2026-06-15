/* water.js — Fondo de agua para las subpáginas.
 *
 * El agua la dibuja el shader WebGL de water-gl.js (canvas #water-gl, fijo al
 * viewport, con el patrón desplazado 1:1 por el scroll → se mueve junto con la
 * página). Acá solo montamos la vela de legibilidad y cargamos el shader.
 */
(function () {
  'use strict';

  // Vela de legibilidad sobre el agua (fija, igual que el index).
  if (!document.getElementById('bg-veil-style')) {
    var st = document.createElement('style');
    st.id = 'bg-veil-style';
    st.textContent = '#bg-veil{position:fixed;inset:0;z-index:1;pointer-events:none;' +
      'background:radial-gradient(ellipse at 50% 32%, rgba(2,11,17,.16) 0%, rgba(2,11,17,.44) 100%),' +
      'linear-gradient(to bottom, rgba(2,11,17,.34) 0%, rgba(2,11,17,.30) 50%, rgba(2,11,17,.46) 100%)}';
    document.head.appendChild(st);
  }
  function mountVeil() {
    if (document.body && !document.getElementById('bg-veil')) {
      var v = document.createElement('div'); v.id = 'bg-veil'; v.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(v, document.body.firstChild);
    }
  }
  function loadShader() {
    if (document.getElementById('water-gl-loader')) return;
    var s = document.createElement('script'); s.id = 'water-gl-loader'; s.src = 'water-gl.js?v=1';
    document.body.appendChild(s);
  }
  function init() { mountVeil(); loadShader(); }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
}());
