/* water-gl.js — Fondo de agua procedural (WebGL) para TODO el sitio.
 *
 * Un shader fullscreen genera agua con caustics (luz refractada). El patrón se
 * desplaza 1:1 con el SCROLL (uScroll) → el agua "se mueve junto" con la página,
 * aunque el canvas sea fijo al viewport: así es performante y no tiene el límite
 * de tamaño del GPU (un canvas WebGL no puede cubrir 15.000px en mobile).
 * Anima sola (uTime) y reacciona al cursor/dedo (uMouse). Si no hay WebGL, no
 * monta nada y queda el fondo CSS de respaldo.
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

  var gl = canvas.getContext('webgl', { antialias: false, depth: false, alpha: false })
        || canvas.getContext('experimental-webgl');
  if (!gl) { return; } // sin WebGL → queda el fondo CSS

  var VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}';
  var FS = [
    'precision highp float;',
    'uniform float uTime,uScroll,uMouseT;',
    'uniform vec2 uRes,uMouse;',
    'float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));vec2 u=f*f*(3.0-2.0*f);return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}',
    'float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03;a*=0.5;}return v;}',
    'void main(){',
    '  vec2 frag=gl_FragCoord.xy+vec2(0.0,uScroll);',     // scroll 1:1 con la página
    '  vec2 uv=frag/uRes.y;',
    '  float t=uTime*0.05;',
    '  vec2 q=vec2(fbm(uv*2.0+t),fbm(uv*2.0+vec2(5.2,1.3)-t));',  // domain warp → flujo
    '  float n=fbm(uv*2.6+q*1.5+t);',
    '  float n2=fbm(uv*5.5-q*0.8+t*1.4);',
    '  float net=pow(1.0-abs(n2-0.5)*2.0,5.0);',           // red fina de caustics
    '  float glow=pow(clamp(smoothstep(0.25,0.85,n),0.0,1.0),1.5);',
    '  float light=clamp(glow*0.7+net*0.95,0.0,1.3);',
    '  vec3 deep=vec3(0.02,0.13,0.18);',                   // paleta teal de la marca
    '  vec3 mid=vec3(0.04,0.30,0.36);',
    '  vec3 hi=vec3(0.55,0.92,0.95);',
    '  vec3 col=mix(deep,mid,glow);',
    '  col=mix(col,hi,clamp(light,0.0,1.0));',
    '  float md=distance(gl_FragCoord.xy,uMouse);',        // onda del cursor
    '  float rip=sin(md*0.06-uTime*5.0)*exp(-md*0.005)*exp(-uMouseT*2.5);',
    '  col+=rip*0.18*vec3(0.6,0.95,1.0);',
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
      uMouseT = gl.getUniformLocation(prog, 'uMouseT');

  // Render a resolución reducida (el agua es suave) → liviano en mobile.
  var DPR = Math.min(window.devicePixelRatio || 1, 1.0), SCALE = 0.6;
  var FPS = 30, FRAME_MS = 1000 / FPS;  // cap de fps → menos GPU/batería en celu
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

  var start = performance.now(), last = start, running = true;
  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    if (running) { last = performance.now(); requestAnimationFrame(frame); }
  });

  var lastDraw = 0;
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (now - lastDraw < FRAME_MS) return;   // cap de fps
    var dt = (now - lastDraw) / 1000; lastDraw = now; mt += dt;
    gl.uniform1f(uTime, reduce ? 0.0 : (now - start) / 1000);
    gl.uniform1f(uScroll, (window.scrollY || window.pageYOffset || 0) * DPR * SCALE);
    gl.uniform2f(uRes, W, H);
    gl.uniform2f(uMouse, mx, my);
    gl.uniform1f(uMouseT, mt);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  requestAnimationFrame(frame);
}());
