/* water-bg.js — Agua PROCEDURAL interactiva a pantalla completa (Cuyo Pool)
 *
 * Fondo de toda la página: una superficie de agua generada por código (sin
 * ninguna imagen) con cáusticas en movimiento y ondas que siguen el dedo
 * (táctil) o el cursor (compu).
 *
 * - WebGL: shader procedural, SIN texturas → no depende de imágenes ni de
 *   límites de textura del celular. Precisión highp donde se pueda + tiempo
 *   acotado → nítido en todo GPU.
 * - Respaldo automático: si el dispositivo no tiene WebGL, dibuja una versión
 *   equivalente con Canvas 2D. Así funciona en el 100% de los dispositivos.
 *
 * NO usa "reducir movimiento" para apagarse: el agua es el centro de la marca.
 */
(function () {
  'use strict';

  function qnum(k){ var m = location.search.match(new RegExp('[?&]' + k + '=([0-9.]+)')); return m ? parseFloat(m[1]) : null; }
  var DIAG = /[?&]diag\b/.test(location.search);

  var canvas = document.getElementById('water-bg');
  if (!canvas) return;

  // ── Diagnóstico opcional en pantalla (?diag) ──
  var diagEl = null, frameCount = 0, status = 'init', engine = '-';
  if (DIAG) {
    diagEl = document.createElement('div');
    diagEl.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;max-width:94vw;' +
      'background:rgba(0,0,0,.85);color:#8ff0c8;font:11px/1.45 monospace;padding:9px 11px;' +
      'border-radius:9px;white-space:pre;pointer-events:none;box-shadow:0 4px 20px rgba(0,0,0,.5)';
    var mnt = function(){ if (document.body && !diagEl.parentNode) document.body.appendChild(diagEl); };
    mnt(); document.addEventListener('DOMContentLoaded', mnt);
  }
  function diag(){
    if (!diagEl) return;
    diagEl.textContent =
      'WATER-BG DIAG\n' +
      'motor: ' + engine + '\n' +
      'estado: ' + status + '\n' +
      'frames: ' + frameCount + '\n' +
      'canvas: ' + canvas.width + 'x' + canvas.height + '\n' +
      'dpr: ' + (window.devicePixelRatio || 1) + '\n' +
      'UA: ' + navigator.userAgent.slice(0, 64);
  }

  var MAX_DROPS = 10;

  // ── Tamaño del canvas (cap para rendir bien en mobile) ──
  var W = 2, H = 2;
  function resize() {
    var cw = window.innerWidth, ch = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var longest = Math.max(cw, ch) * dpr;
    var s = Math.min(1, 2200 / longest);   // techo de resolución
    W = Math.max(2, Math.round(cw * dpr * s));
    H = Math.max(2, Math.round(ch * dpr * s));
    if (canvas.width !== W)  canvas.width  = W;
    if (canvas.height !== H) canvas.height = H;
  }

  // ── Gotas interactivas (toque / cursor) ──
  var drops = [];               // {x,y,t0}  x,y en 0..1 (coords de viewport)
  var lastMove = 0;
  function addDrop(x, y) {
    drops.push({ x: x, y: y, t0: performance.now() / 1000 });
    if (drops.length > MAX_DROPS) drops.shift();
  }
  function toUV(cx, cy) {
    return { x: cx / window.innerWidth, y: cy / window.innerHeight };
  }
  document.addEventListener('mousemove', function (e) {
    var now = performance.now(); if (now - lastMove < 55) return; lastMove = now;
    var p = toUV(e.clientX, e.clientY); addDrop(p.x, p.y);
  }, { passive: true });
  document.addEventListener('mousedown', function (e) {
    var p = toUV(e.clientX, e.clientY); addDrop(p.x, p.y);
  }, { passive: true });
  document.addEventListener('touchstart', function (e) {
    var t = e.touches[0]; if (!t) return; var p = toUV(t.clientX, t.clientY); addDrop(p.x, p.y);
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    var now = performance.now(); if (now - lastMove < 40) return; lastMove = now;
    var t = e.touches[0]; if (!t) return; var p = toUV(t.clientX, t.clientY); addDrop(p.x, p.y);
  }, { passive: true });

  // ════════════════════════════════════════════════════════════════════
  //  MOTOR WEBGL
  // ════════════════════════════════════════════════════════════════════
  function startWebGL() {
    var gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false })
          || canvas.getContext('experimental-webgl', { alpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) return false;

    var VS = [
      'attribute vec2 a_pos;',
      'varying vec2 v_uv;',
      'void main(){ v_uv = a_pos*0.5+0.5; gl_Position = vec4(a_pos,0.0,1.0); }'
    ].join('\n');

    var FS = [
      '#ifdef GL_FRAGMENT_PRECISION_HIGH',
      'precision highp float;',
      '#else',
      'precision mediump float;',
      '#endif',
      'varying vec2 v_uv;',
      'uniform float u_time;',
      'uniform vec2  u_res;',
      'uniform vec3  u_drops[' + MAX_DROPS + '];',
      'void main(){',
      '  vec2 uv = v_uv;',
      '  float aspect = u_res.x / u_res.y;',
      '  vec2 p = vec2(uv.x*aspect, uv.y);',
      '  float t = u_time;',
      '  vec2 disp = vec2(0.0);',
      '  float glow = 0.0;',
      '  for(int i=0;i<' + MAX_DROPS + ';i++){',
      '    vec3 d = u_drops[i];',
      '    if(d.z < 0.0) continue;',
      '    vec2 c = vec2(d.x*aspect, d.y);',
      '    vec2 diff = p - c;',
      '    float dist = length(diff);',
      '    float age = d.z;',
      '    float radius = age*0.6;',
      '    float ring = sin((dist - radius)*38.0);',
      '    float env = exp(-dist*5.0)*exp(-age*1.8)*smoothstep(0.9,0.0,dist);',
      '    float w = ring*env;',
      '    disp += (dist>1e-4 ? diff/dist : vec2(0.0)) * w * 0.06;',
      '    glow += max(0.0, w);',
      '  }',
      '  vec2 q = p*7.0 + disp*9.0;',
      '  float c = 0.0;',
      '  c += sin(q.x*1.0 + t*1.1);',
      '  c += sin(q.y*1.3 - t*0.9);',
      '  c += sin((q.x+q.y)*0.7 + t*0.8);',
      '  c += sin((q.x-q.y)*1.1 - t*1.3);',
      '  c += sin(length(q - vec2(3.0,2.0)) - t*1.5);',
      '  c /= 5.0;',
      '  float caust  = pow(max(0.0, 0.5+0.5*c), 4.0);',
      '  float caust2 = pow(max(0.0, 0.5+0.5*sin(q.x*2.1 + q.y*1.7 + t*1.7)), 6.0);',
      '  vec3 deep    = vec3(0.012,0.070,0.105);',
      '  vec3 mid     = vec3(0.035,0.165,0.205);',
      '  vec3 shallow = vec3(0.075,0.285,0.320);',
      '  vec3 hi      = vec3(0.62,0.93,0.92);',
      '  vec3 col = mix(deep, mid, smoothstep(-1.0,1.0,c));',
      '  col = mix(col, shallow, caust*0.55);',
      '  col += hi*caust2*0.35;',
      '  col += hi*glow*0.28;',
      '  float vig = smoothstep(1.3, 0.2, length(uv-0.5));',
      '  col *= 0.76 + 0.24*vig;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n');

    function sh(type, src){ var s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){ console.warn('[water-bg]', gl.getShaderInfoLog(s)); return null; } return s; }
    var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if(!vs || !fs) return false;
    var prog = gl.createProgram(); gl.attachShader(prog,vs); gl.attachShader(prog,fs);
    gl.bindAttribLocation(prog,0,'a_pos'); gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog,gl.LINK_STATUS)) return false;
    gl.useProgram(prog);

    var U = { time: gl.getUniformLocation(prog,'u_time'), res: gl.getUniformLocation(prog,'u_res'), drops: gl.getUniformLocation(prog,'u_drops') };
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);

    canvas.addEventListener('webglcontextlost', function(e){ e.preventDefault(); status='context lost'; });

    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(document.documentElement);
    window.addEventListener('resize', resize);

    var t0 = performance.now();
    var dropBuf = new Float32Array(MAX_DROPS * 3);
    var ready = false;
    engine = 'webgl';

    function frame(){
      frameCount++; status = 'running';
      if (!ready) { canvas.classList.add('is-ready'); ready = true; }
      var now = performance.now();
      // tiempo acotado a 20π → seamless (todos los coef. ×10 son enteros) y nítido en mobile
      var t = ((now - t0) / 1000) % (20 * Math.PI);

      for (var i=0;i<MAX_DROPS;i++){
        var d = drops[i];
        if (d){ var age = now/1000 - d.t0;
          if (age > 3.2){ dropBuf[i*3]=0; dropBuf[i*3+1]=0; dropBuf[i*3+2]=-1; }
          else { dropBuf[i*3]=d.x; dropBuf[i*3+1]=1.0-d.y; dropBuf[i*3+2]=age; }
        } else { dropBuf[i*3]=0; dropBuf[i*3+1]=0; dropBuf[i*3+2]=-1; }
      }

      gl.viewport(0,0,canvas.width,canvas.height);
      gl.uniform1f(U.time, t);
      gl.uniform2f(U.res, canvas.width, canvas.height);
      gl.uniform3fv(U.drops, dropBuf);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (DIAG && (frameCount & 7) === 0) diag();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return true;
  }

  // ════════════════════════════════════════════════════════════════════
  //  MOTOR CANVAS 2D (respaldo universal)
  // ════════════════════════════════════════════════════════════════════
  function startCanvas2D() {
    var ctx = canvas.getContext('2d');
    if (!ctx) return false;
    engine = 'canvas2d';
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(document.documentElement);
    window.addEventListener('resize', resize);

    var t0 = performance.now();
    var ready = false;

    function frame(){
      frameCount++; status = 'running';
      if (!ready) { canvas.classList.add('is-ready'); ready = true; }
      var now = performance.now();
      var t = (now - t0) / 1000;

      // gradiente base
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#072233'); g.addColorStop(0.5, '#0a2e3c'); g.addColorStop(1, '#06222e');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      // cáusticas en movimiento (blobs radiales suaves)
      ctx.globalCompositeOperation = 'lighter';
      for (var k = 0; k < 7; k++) {
        var fx = 0.5 + 0.42 * Math.sin(t * (0.3 + k * 0.07) + k * 1.7);
        var fy = 0.5 + 0.42 * Math.cos(t * (0.25 + k * 0.05) + k * 2.3);
        var rad = (0.18 + 0.06 * Math.sin(t * 0.6 + k)) * Math.max(W, H);
        var rg = ctx.createRadialGradient(fx * W, fy * H, 0, fx * W, fy * H, rad);
        rg.addColorStop(0, 'rgba(120,220,210,0.10)');
        rg.addColorStop(1, 'rgba(120,220,210,0)');
        ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      }

      // ondas interactivas: anillos que se expanden desde cada toque
      for (var i = 0; i < drops.length; i++) {
        var d = drops[i]; var age = now / 1000 - d.t0;
        if (age > 3.2) continue;
        var cx = d.x * W, cy = d.y * H;
        var rings = 3;
        for (var r = 0; r < rings; r++) {
          var rr = (age * 0.6 - r * 0.06) * Math.max(W, H) * 0.5;
          if (rr <= 0) continue;
          var a = Math.max(0, (1 - age / 3.2)) * (1 - r / rings) * 0.5;
          ctx.strokeStyle = 'rgba(160,235,225,' + a.toFixed(3) + ')';
          ctx.lineWidth = Math.max(1, Math.max(W, H) * 0.004);
          ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';

      // viñeta
      var vg = ctx.createRadialGradient(W/2, H*0.42, 0, W/2, H*0.42, Math.max(W,H)*0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(2,14,22,0.45)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

      if (DIAG && (frameCount & 7) === 0) diag();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return true;
  }

  // Arranque: WebGL primero, Canvas 2D de respaldo.
  if (!startWebGL()) {
    status = 'webgl falló → canvas2d';
    startCanvas2D();
  }
}());
