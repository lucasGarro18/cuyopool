/* water-gl.js — Fondo de agua REALISTA (WebGL) para todo el sitio.
 *
 * Un shader fullscreen toma una FOTO real de agua de pileta (assets/water-surface.jpg)
 * y le aplica ondas de refracción + caustics → agua de pileta realista que se mueve
 * sola (uTime) y reacciona al cursor/dedo (uMouse). El canvas es fijo al viewport
 * (performante, sin el límite de tamaño del GPU); un leve parallax acompaña el scroll.
 * Si no hay WebGL, queda el fondo CSS de respaldo.
 */
(function () {
  'use strict';
  if (document.getElementById('water-gl')) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var canvas = document.createElement('canvas');
  canvas.id = 'water-gl';
  canvas.setAttribute('aria-hidden', 'true');
  var st = document.createElement('style');
  st.textContent = '#water-gl{position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;z-index:0;display:block;pointer-events:none}';
  document.head.appendChild(st);
  function mount() { if (document.body && !canvas.parentNode) document.body.insertBefore(canvas, document.body.firstChild); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  var gl = canvas.getContext('webgl', { antialias: false, depth: false, alpha: false, preserveDrawingBuffer: true })
        || canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true });
  if (!gl) { return; }

  var VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}';
  var FS = [
    'precision highp float;',
    'uniform float uTime,uScroll,uMouseT,uTexAspect,uReady;',
    'uniform vec2 uRes,uMouse;',
    'uniform sampler2D uTex;',
    'float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));vec2 u=f*f*(3.0-2.0*f);return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}',
    'float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<3;i++){v+=a*noise(p);p=p*2.03;a*=0.5;}return v;}',
    'void main(){',
    '  vec2 uv=gl_FragCoord.xy/uRes;',
    '  uv.y+=uScroll*0.00002;',                          // parallax suave con el scroll
    '  vec2 c=uv-0.5;',                                   // cover-fit de la textura
    '  float va=uRes.x/uRes.y;',
    '  if(va>uTexAspect){c.y*=uTexAspect/va;}else{c.x*=va/uTexAspect;}',
    '  vec2 tuv=c+0.5;',
    '  float t=uTime*0.13;',
    '  vec2 d=vec2(fbm(tuv*3.0+vec2(t,0.0)),fbm(tuv*3.0+vec2(0.0,t)+5.0))-0.5;',  // ondas
    '  vec3 col=texture2D(uTex,clamp(tuv+d*0.022,0.0,1.0)).rgb;',
    '  float ca=fbm(tuv*6.0+d*2.0+t*1.4);',              // brillo de caustics
    '  col+=pow(clamp(ca,0.0,1.0),3.0)*0.22*vec3(0.6,0.95,1.0);',
    '  float md=distance(gl_FragCoord.xy,uMouse);',      // onda del cursor
    '  float rip=sin(md*0.07-uTime*6.0)*exp(-md*0.006)*exp(-uMouseT*2.5);',
    '  col+=rip*0.12*vec3(0.7,1.0,1.0);',
    '  vec3 fallback=vec3(0.03,0.20,0.26);',             // color hasta que carga la foto
    '  col=mix(fallback,col,uReady);',
    '  gl_FragColor=vec4(col,1.0);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('[water-gl]', gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  var vs = compile(gl.VERTEX_SHADER, VS), fs = compile(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) { return; }
  var prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { return; }
  gl.useProgram(prog);

  var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var ploc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(ploc); gl.vertexAttribPointer(ploc, 2, gl.FLOAT, false, 0, 0);
  var uTime = gl.getUniformLocation(prog, 'uTime'), uScroll = gl.getUniformLocation(prog, 'uScroll'),
      uRes = gl.getUniformLocation(prog, 'uRes'), uMouse = gl.getUniformLocation(prog, 'uMouse'),
      uMouseT = gl.getUniformLocation(prog, 'uMouseT'), uTexAspect = gl.getUniformLocation(prog, 'uTexAspect'),
      uReady = gl.getUniformLocation(prog, 'uReady'), uTexLoc = gl.getUniformLocation(prog, 'uTex');

  // Textura de agua (foto real). NPOT → CLAMP + LINEAR (sin mipmaps).
  var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([8, 51, 66, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.uniform1i(uTexLoc, 0);
  var texAspect = 1920 / 2262, ready = 0;
  var img = new Image();
  img.onload = function () {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); texAspect = img.width / img.height; ready = 1; }
    catch (e) {}
  };
  img.src = 'assets/water-surface.jpg';

  var DPR = Math.min(window.devicePixelRatio || 1, 1.0), SCALE = 0.6;
  var FPS = 30, FRAME_MS = 1000 / FPS;
  var W, H, mx = -1e4, my = -1e4, mt = 999;
  function resize() {
    W = Math.max(1, Math.floor(window.innerWidth * DPR * SCALE));
    H = Math.max(1, Math.floor(window.innerHeight * DPR * SCALE));
    canvas.width = W; canvas.height = H; gl.viewport(0, 0, W, H);
  }
  resize();
  window.addEventListener('resize', resize);

  function setM(x, y) { mx = x * DPR * SCALE; my = (window.innerHeight - y) * DPR * SCALE; mt = 0; }
  document.addEventListener('mousemove', function (e) { setM(e.clientX, e.clientY); }, { passive: true });
  document.addEventListener('touchmove', function (e) { var t = e.touches[0]; if (t) setM(t.clientX, t.clientY); }, { passive: true });
  document.addEventListener('touchstart', function (e) { var t = e.touches[0]; if (t) setM(t.clientX, t.clientY); }, { passive: true });

  var start = performance.now(), running = true, lastDraw = 0;
  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    if (running) { requestAnimationFrame(frame); }
  });

  function frame(now) {
    if (!running || window.__waterPaused) return;     // __waterPaused: para capturas
    requestAnimationFrame(frame);
    if (now - lastDraw < FRAME_MS) return;
    var dt = (now - lastDraw) / 1000; lastDraw = now; mt += dt;
    gl.uniform1f(uTime, reduce ? 0.0 : (now - start) / 1000);
    gl.uniform1f(uScroll, (window.scrollY || window.pageYOffset || 0) * DPR * SCALE);
    gl.uniform2f(uRes, W, H);
    gl.uniform2f(uMouse, mx, my);
    gl.uniform1f(uMouseT, mt);
    gl.uniform1f(uTexAspect, texAspect);
    gl.uniform1f(uReady, ready);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  requestAnimationFrame(frame);
  // Permitir reanudar tras pausa (para capturas de verificación).
  window.__waterResume = function () { if (!running) return; window.__waterPaused = false; requestAnimationFrame(frame); };
}());
