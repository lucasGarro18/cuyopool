/* water-canvas.js — Agua en movimiento UNIVERSAL (Canvas 2D)
 *
 * Reemplaza a water-flow.js (WebGL). Canvas 2D funciona IDÉNTICO en el 100% de
 * los dispositivos con navegador moderno (desde 2011), sin depender de la GPU,
 * de la precisión del shader ni de extensiones — por eso anda igual en la
 * computadora y en CUALQUIER celular.
 *
 * Técnica: corta la región de la pileta en franjas horizontales y desplaza cada
 * franja con una suma de senos que fluye en el tiempo → se ve como agua. Los
 * pequeños huecos en los bordes de cada franja dejan ver la MISMA imagen estática
 * de fondo (la pileta) que está justo detrás del canvas, así el efecto es
 * perfectamente continuo (sin cortes ni bordes negros).
 *
 * NO toca la imagen de fondo: la usa tal cual y solo la ondula.
 *
 * Lee #water (canvas) y window.POOL_WATER_PARAMS.{imageURL,uvOrigin,uvScale}
 * que posiciona syncLayout() en index.html.
 */
(function () {
  'use strict';

  function qnum(k){ var m = location.search.match(new RegExp('[?&]' + k + '=([0-9.]+)')); return m ? parseFloat(m[1]) : null; }
  var DIAG = /[?&]diag\b/.test(location.search);
  var WAVE = qnum('wave');            // override de amplitud (en px de pantalla)

  var canvas = document.getElementById('water');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  // ── Diagnóstico opcional en pantalla (?diag) — visible en el propio celular ──
  var diagEl = null, frameCount = 0, status = 'init';
  if (DIAG) {
    diagEl = document.createElement('div');
    diagEl.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;max-width:94vw;' +
      'background:rgba(0,0,0,.85);color:#8ff0c8;font:11px/1.45 monospace;padding:9px 11px;' +
      'border-radius:9px;white-space:pre;pointer-events:none;box-shadow:0 4px 20px rgba(0,0,0,.5)';
    var mount = function(){ if (document.body && !diagEl.parentNode) document.body.appendChild(diagEl); };
    mount(); document.addEventListener('DOMContentLoaded', mount);
  }
  function diag(amp){
    if (!diagEl) return;
    diagEl.textContent =
      'WATER DIAG (canvas2d)\n' +
      'estado: ' + status + '\n' +
      'frames: ' + frameCount + '\n' +
      'imgReady: ' + imgReady + '\n' +
      'canvas: ' + canvas.width + 'x' + canvas.height + '\n' +
      'client: ' + canvas.clientWidth + 'x' + canvas.clientHeight + '\n' +
      'dpr: ' + (window.devicePixelRatio || 1) + '\n' +
      'amp(px): ' + (amp != null ? amp.toFixed(2) : '-') + '\n' +
      'UA: ' + navigator.userAgent.slice(0, 64);
  }

  // ── Imagen de la pileta ──
  var img = new Image();
  img.decoding = 'async';
  var imgReady = false;
  img.onload = function () { imgReady = true; };
  img.onerror = function () { status = 'IMG ERROR'; diag(null); };
  img.src = (window.POOL_WATER_PARAMS || {}).imageURL || 'assets/pool-extended.jpg';

  // ── Tamaño del canvas (backing buffer acotado para rendir bien en mobile) ──
  var BW = 2, BH = 2;
  function resize() {
    var cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Acotamos: ancho hasta 480 (detalle horizontal), alto hasta 1024 (perf).
    BW = Math.max(2, Math.min(Math.round(cw * dpr), 480));
    BH = Math.max(2, Math.min(Math.round(ch * dpr), 1024));
    if (canvas.width !== BW)  canvas.width  = BW;
    if (canvas.height !== BH) canvas.height = BH;
  }
  resize();
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);

  // ── Loop de render ──
  var t0 = performance.now();
  var BAND = 3;                       // alto de cada franja en px de backing
  var imgShownClass = false;

  function frame() {
    frameCount++;
    status = 'running';
    var now = performance.now();
    var t = (now - t0) / 1000;

    if (!imgReady || BW < 2 || BH < 2) {
      if (BW < 2) resize();
      if (DIAG && (frameCount & 7) === 0) diag(null);
      return requestAnimationFrame(frame);
    }
    if (!imgShownClass) { canvas.classList.add('is-ready'); imgShownClass = true; }

    // Región de la imagen que corresponde a la pileta (en px de la imagen).
    var p = window.POOL_WATER_PARAMS || {};
    var uvO = p.uvOrigin || [0.2561, 0.0328];
    var uvS = p.uvScale  || [0.4878, 0.9192];
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var sx = uvO[0] * iw, sy = uvO[1] * ih;
    var sw = uvS[0] * iw, sh = uvS[1] * ih;

    // Amplitud del oleaje en px de backing. Escalamos con el ancho para que el
    // movimiento PERCIBIDO sea parecido en toda pantalla. WAVE (?wave) la fuerza.
    var amp = (WAVE != null) ? WAVE : Math.max(3, Math.min(9, BW / 42));

    ctx.clearRect(0, 0, BW, BH);     // transparente: los bordes dejan ver la pileta de atrás

    var bands = Math.ceil(BH / BAND);
    for (var b = 0; b < bands; b++) {
      var y = b * BAND;
      var bh = Math.min(BAND, BH - y);
      var yn = y / BH;               // 0..1 vertical

      // Suma de senos que fluyen (movimiento de agua continuo)
      var ox = Math.sin(yn * 22.0 + t * 1.5) * 0.55
             + Math.sin(yn * 9.0  - t * 0.9) * 0.55
             + Math.sin(yn * 41.0 + t * 2.2) * 0.30;
      ox *= amp;
      // leve bamboleo vertical para dar profundidad
      var oy = Math.sin(yn * 14.0 - t * 1.1) * (amp * 0.18);

      // Franja de origen correspondiente (en px de imagen)
      var ssy = sy + yn * sh;
      var ssh = (bh / BH) * sh;

      ctx.drawImage(
        img,
        sx, ssy, sw, ssh,            // origen: franja de la pileta
        ox, y + oy, BW, bh           // destino: desplazada horizontalmente
      );
    }

    if (DIAG && (frameCount & 7) === 0) diag(amp);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if (DIAG) { window._waterInfo = function () { return { imgReady: imgReady, frames: frameCount, bw: BW, bh: BH }; }; }
}());
