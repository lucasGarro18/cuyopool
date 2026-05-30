/* water-flow.js — Agua en movimiento UNIVERSAL para Piscinas Cuyo / Cuyo Pool
 *
 * A diferencia de ripple.js (que usa texturas FLOAT y falla en muchos GPU de
 * celular), esta versión distorsiona la imagen de la pileta con ondas animadas
 * calculadas en el shader. Usa SOLO texturas estándar de 8 bits → funciona en
 * el 100% de los dispositivos con WebGL (casi todos los celulares y computadoras).
 *
 * - Movimiento de agua continuo (ondas suaves que fluyen sobre los azulejos).
 * - Gotas al tocar / mover el cursor (hasta 6 ondas expansivas).
 * - Sin framebuffers float, sin ping-pong → máxima compatibilidad.
 *
 * Lee #water (canvas) y window.POOL_WATER_PARAMS.{imageURL,uvOrigin,uvScale}
 * que posiciona syncLayout() en index.html.
 */
(function () {
  'use strict';
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;

  var canvas = document.getElementById('water');
  if (!canvas) return;

  var gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false })
        || canvas.getContext('experimental-webgl', { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) { canvas.style.display = 'none'; return; }

  var MAX_DROPS = 6;

  var VS = [
    'attribute vec2 a_pos;',
    'varying vec2 v_uv;',
    'void main(){ v_uv = a_pos*0.5+0.5; gl_Position = vec4(a_pos,0.0,1.0); }'
  ].join('\n');

  var FS = [
    // Alta precisión donde el GPU la soporte (casi todos los celulares
    // modernos). Sin esto, en mobile (mediump) los sin(tiempo) se degradan
    // y aparecen bandas/artefactos a los pocos segundos.
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec2 v_uv;',
    'uniform sampler2D u_img;',
    'uniform float u_time;',
    'uniform vec2  u_uvO;',
    'uniform vec2  u_uvS;',
    'uniform float u_amp;',
    'uniform float u_asp;',          // alto/ancho del canvas (para ondas circulares)
    'uniform vec3  u_drops[' + MAX_DROPS + '];', // x,y = centro(uv) ; z = edad(seg) (<0 = inactiva)
    '',
    'void main(){',
    '  vec2 uv = v_uv;',
    '  float t = u_time;',
    '  // Ondas ambientales: suma de senos que fluyen (movimiento continuo)',
    '  vec2 d;',
    '  d.x = sin(uv.y*20.0 + t*1.5) * 0.55',
    '      + sin(uv.y*9.0  - t*0.9) * 0.55',
    '      + sin((uv.x+uv.y)*13.0 + t*1.1) * 0.45;',
    '  d.y = cos(uv.x*18.0 + t*1.3) * 0.55',
    '      + cos(uv.x*8.0  + t*0.6) * 0.55',
    '      + sin((uv.x-uv.y)*12.0 - t*1.0) * 0.45;',
    '  d *= u_amp;',
    '',
    '  // Gotas interactivas: anillos que se expanden desde cada toque',
    '  float hi = 0.0;',
    '  for (int i=0;i<' + MAX_DROPS + ';i++){',
    '    vec3 dp = u_drops[i];',
    '    if (dp.z < 0.0) continue;',
    '    vec2 diff = (uv - dp.xy) * vec2(1.0, u_asp);',
    '    float dist = length(diff);',
    '    float radius = dp.z * 0.45;',          // velocidad de expansión
    '    float ring = sin((dist - radius)*42.0);',
    '    float env = exp(-dist*7.0) * exp(-dp.z*2.2) * smoothstep(0.6, 0.0, dist);',
    '    float w = ring * env;',
    '    vec2 dir = dist > 0.001 ? diff/dist : vec2(0.0);',
    '    d += dir * w * (u_amp*9.0);',
    '    hi += w;',
    '  }',
    '',
    '  vec2 uv2 = clamp(uv + d, 0.0, 1.0);',
    '  // Convención GL: y=1 arriba → mapeo a la región de imagen (uvO..uvO+uvS)',
    '  vec2 iUV = u_uvO + vec2(uv2.x, 1.0 - uv2.y) * u_uvS;',
    '  iUV = clamp(iUV, u_uvO, u_uvO + u_uvS);',
    '  vec3 col = texture2D(u_img, iUV).rgb;',
    '  // Reflejo especular sutil donde el agua se mueve',
    '  col += vec3(0.10) * smoothstep(0.0, u_amp*4.0, abs(d.x+d.y));',
    '  col += vec3(0.14) * max(0.0, hi);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function sh(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[water-flow]', gl.getShaderInfoLog(s)); return null;
    }
    return s;
  }
  var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) { canvas.style.display = 'none'; return; }
  var prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, 'a_pos'); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.style.display = 'none'; return; }
  gl.useProgram(prog);

  var U = {
    img:   gl.getUniformLocation(prog, 'u_img'),
    time:  gl.getUniformLocation(prog, 'u_time'),
    uvO:   gl.getUniformLocation(prog, 'u_uvO'),
    uvS:   gl.getUniformLocation(prog, 'u_uvS'),
    amp:   gl.getUniformLocation(prog, 'u_amp'),
    asp:   gl.getUniformLocation(prog, 'u_asp'),
    drops: gl.getUniformLocation(prog, 'u_drops')
  };

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // ── Imagen de la pileta (8 bits, universal) ──
  var imgTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, imgTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([18,58,72,255]));

  var imgReady = false;
  (function () {
    var url = (window.POOL_WATER_PARAMS || {}).imageURL || 'assets/pool-extended.jpg';
    var im = new Image(); im.decoding = 'async';
    im.onload = function () {
      gl.bindTexture(gl.TEXTURE_2D, imgTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      imgReady = true;
    };
    im.onerror = function () { canvas.style.display = 'none'; };
    im.src = url;
  }());

  // ── Tamaño del canvas ──
  function resize() {
    var cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var scale = Math.min(1, 2048 / Math.max(cw * dpr, ch * dpr));
    var w = Math.max(2, Math.floor(cw * dpr * scale));
    var h = Math.max(2, Math.floor(ch * dpr * scale));
    if (w !== canvas.width || h !== canvas.height) { canvas.width = w; canvas.height = h; }
  }
  resize();
  new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);

  // ── Gotas interactivas ──
  var drops = [];               // {x,y,t0}
  var lastMove = 0;
  function addDrop(uvX, uvY) {
    drops.push({ x: uvX, y: uvY, t0: performance.now() / 1000 });
    if (drops.length > MAX_DROPS) drops.shift();
  }
  function clientToUV(cx, cy) {
    var r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    var x = (cx - r.left) / r.width, y = (cy - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { u: x, v: 1 - y };   // GL UV
  }
  document.addEventListener('mousemove', function (e) {
    var now = performance.now(); if (now - lastMove < 60) return; lastMove = now;
    var uv = clientToUV(e.clientX, e.clientY); if (uv) addDrop(uv.u, uv.v);
  }, { passive: true });
  document.addEventListener('mousedown', function (e) {
    var uv = clientToUV(e.clientX, e.clientY); if (uv) addDrop(uv.u, uv.v);
  }, { passive: true });
  document.addEventListener('touchstart', function (e) {
    var t = e.touches[0]; if (!t) return;
    var uv = clientToUV(t.clientX, t.clientY); if (uv) addDrop(uv.u, uv.v);
  }, { passive: true });

  // ── Loop de render ──
  var t0 = performance.now();
  var dropBuf = new Float32Array(MAX_DROPS * 3);
  var shown = false;

  function tw(k, d) { var v = (window.WATER_TWEAKS || {})[k]; return v != null ? v : d; }

  function frame() {
    var now = performance.now();
    if (canvas.width < 2 || canvas.height < 2) { resize(); requestAnimationFrame(frame); return; }
    if (!shown && imgReady) { canvas.classList.add('is-ready'); shown = true; }

    var p = window.POOL_WATER_PARAMS || {};
    var uvO = p.uvOrigin || [0.2561, 0.0328];
    var uvS = p.uvScale  || [0.4878, 0.90];
    // Tiempo acotado a 10·2π: con los multiplicadores de las ondas (0.6, 0.9,
    // 1.0, 1.1, 1.3, 1.5) este wrap es PERFECTAMENTE continuo (sin saltos) y
    // mantiene los argumentos de sin() chicos → precisión nítida en TODO GPU.
    var tsec = ((now - t0) / 1000) % (10 * 2 * Math.PI);

    // armar gotas (edad en segundos; <0 = inactiva)
    for (var i = 0; i < MAX_DROPS; i++) {
      var d = drops[i];
      if (d) {
        var age = now / 1000 - d.t0;
        if (age > 2.6) { dropBuf[i*3] = 0; dropBuf[i*3+1] = 0; dropBuf[i*3+2] = -1; }
        else { dropBuf[i*3] = d.x; dropBuf[i*3+1] = d.y; dropBuf[i*3+2] = age; }
      } else { dropBuf[i*3] = 0; dropBuf[i*3+1] = 0; dropBuf[i*3+2] = -1; }
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, imgTex);
    gl.uniform1i(U.img, 0);
    gl.uniform1f(U.time, tsec);
    gl.uniform2f(U.uvO, uvO[0], uvO[1]);
    gl.uniform2f(U.uvS, uvS[0], uvS[1]);
    gl.uniform1f(U.amp, tw('flowAmp', 0.006));
    gl.uniform1f(U.asp, canvas.height / canvas.width);
    gl.uniform3fv(U.drops, dropBuf);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // pausar con pestaña oculta (ahorra batería); reanudar al volver
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { t0 = performance.now() - 0; }
  });

  if (/[?&]debug\b/.test(location.search)) {
    window._waterInfo = function () { return { imgReady: imgReady, shown: shown, cw: canvas.width, ch: canvas.height }; };
  }
}());
