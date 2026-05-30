/* ripple.js — Realistic pool-water displacement effect
 * Piscinas Cuyo · no external dependencies
 *
 * Technique: 2-D wave equation (ping-pong float FBOs).
 * Display = DISPLACEMENT ONLY: water-surface gradient bends UV so pool
 * tiles appear to wobble when seen through moving water.
 *
 * BUG HISTORY:
 *   v1 — Edge Y-damping killed every wave in the visible viewport.
 *   v2 — UV Y-flip: CSS y (0=top) was passed as GL UV y (0=bottom),
 *         so ALL drops landed ~7000 px off-screen (invisible CSS bottom).
 *         Fixed by returning v = 1 - cssV in uvFromClient(), and
 *         recomputing the ambient range in GL UV space.
 *   v3 — Stronger drop strengths so displacement is clearly visible.
 */
(function () {
  'use strict';

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;

  const canvas = document.getElementById('water');
  if (!canvas) return;

  const ctxOpts = {alpha:false,depth:false,stencil:false,
                   antialias:false,preserveDrawingBuffer:false};
  const gl = canvas.getContext('webgl',ctxOpts)
          || canvas.getContext('experimental-webgl',ctxOpts);
  if (!gl) { canvas.style.display='none'; return; }

  /* Simulación en texturas FLOAT. Verificamos que el framebuffer float sea
     completo (renderizable) antes de aceptarlo; si el dispositivo no lo
     soporta, fallback elegante a la imagen estática (sin romperse). */
  let TEX_TYPE = null, extLinear = null;
  (function detectTexType(){
    if (!gl.getExtension('OES_texture_float')) return;
    try {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, gl.FLOAT, null);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb); gl.deleteTexture(tex);
      if (ok) { TEX_TYPE = gl.FLOAT; extLinear = gl.getExtension('OES_texture_float_linear'); }
    } catch (e) {}
  }());

  if (!TEX_TYPE) { canvas.style.display='none'; return; }

  /* ── Shaders ─────────────────────────────────────────────────────── */
  const VS = `
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main(){
      v_uv = a_pos*0.5+0.5;
      gl_Position = vec4(a_pos,0.0,1.0);
    }`;

  /* Wave equation — R=height, G=velocity.
     Soft wall only on X (left/right pool edges).
     No Y-axis damping: top/bottom are scroll-clip boundaries, not walls. */
  const STEP_FS = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_tex;
    uniform vec2 u_px;
    uniform float u_damp;
    void main(){
      vec4 c=texture2D(u_tex,v_uv);
      float l=texture2D(u_tex,v_uv+vec2(-u_px.x,0.0)).r;
      float r=texture2D(u_tex,v_uv+vec2( u_px.x,0.0)).r;
      float t=texture2D(u_tex,v_uv+vec2(0.0,-u_px.y)).r;
      float b=texture2D(u_tex,v_uv+vec2(0.0, u_px.y)).r;
      c.g+=((l+r+t+b)*0.25-c.r)*2.0;
      c.g*=u_damp;
      c.r+=c.g;
      float ex=smoothstep(0.0,0.06,v_uv.x)*smoothstep(1.0,0.94,v_uv.x);
      c.rg*=mix(0.95,1.0,ex);
      gl_FragColor=c;
    }`;

  /* Gaussian drop — aspect-corrected to look circular in CSS pixels.
     u_asp = simH/simW compensates for the ~11:1 canvas aspect ratio. */
  const DROP_FS = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_tex;
    uniform vec2  u_pt;
    uniform float u_rad;
    uniform float u_str;
    uniform float u_asp;
    void main(){
      vec4 c=texture2D(u_tex,v_uv);
      vec2 d=v_uv-u_pt; d.y*=u_asp;
      float f=dot(d,d)/(u_rad*u_rad);
      c.r+=u_str*max(0.0,1.0-f);
      gl_FragColor=c;
    }`;

  /* Display pass — displace pool image by water-surface normal.
   *
   * UV convention (WebGL standard):
   *   v_uv.y = 1  →  GL top  →  CSS top  (the VISIBLE pool)
   *   v_uv.y = 0  →  GL bot  →  CSS bottom (7000 px off-screen)
   *
   * With UNPACK_FLIP_Y=false: texture t=0 = image top.
   *   CSS top  (v_uv.y=1) → 1-v=0 → imgUV.y = uvOrigin.y         = pool tile top
   *   CSS bot  (v_uv.y=0) → 1-v=1 → imgUV.y = uvOrigin.y+uvScale = pool tile bot
   */
  const DISP_FS = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_h;
    uniform sampler2D u_img;
    uniform vec2  u_px;
    uniform vec2  u_uvO;
    uniform vec2  u_uvS;
    uniform float u_pert;
    void main(){
      float hl=texture2D(u_h,v_uv+vec2(-u_px.x,0.0)).r;
      float hr=texture2D(u_h,v_uv+vec2( u_px.x,0.0)).r;
      float ht=texture2D(u_h,v_uv+vec2(0.0,-u_px.y)).r;
      float hb=texture2D(u_h,v_uv+vec2(0.0, u_px.y)).r;
      vec2 grad=vec2(hr-hl,hb-ht);
      vec2 uv2=clamp(v_uv+grad*u_pert,0.0,1.0);
      vec2 iUV=u_uvO+vec2(uv2.x,1.0-uv2.y)*u_uvS;
      iUV=clamp(iUV,u_uvO,u_uvO+u_uvS);
      gl_FragColor=vec4(texture2D(u_img,iUV).rgb,1.0);
    }`;

  /* ── Compile ─────────────────────────────────────────────────────── */
  function mkShader(type,src){
    const s=gl.createShader(type);
    gl.shaderSource(s,src);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){
      console.warn('[ripple]',gl.getShaderInfoLog(s));return null;
    }
    return s;
  }
  function mkProg(vs,fs){
    const p=gl.createProgram();
    gl.attachShader(p,mkShader(gl.VERTEX_SHADER,vs));
    gl.attachShader(p,mkShader(gl.FRAGMENT_SHADER,fs));
    gl.bindAttribLocation(p,0,'a_pos');gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)){
      console.warn('[ripple]',gl.getProgramInfoLog(p));return null;
    }
    const u={};
    for(let i=0,n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i<n;i++){
      const info=gl.getActiveUniform(p,i);u[info.name]=gl.getUniformLocation(p,info.name);
    }
    return{p,u};
  }
  const pStep=mkProg(VS,STEP_FS),pDrop=mkProg(VS,DROP_FS),pDisp=mkProg(VS,DISP_FS);
  if(!pStep||!pDrop||!pDisp){canvas.style.display='none';return;}

  const qBuf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,qBuf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  function quad(){gl.bindBuffer(gl.ARRAY_BUFFER,qBuf);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLES,0,6);}

  /* ── Simulation textures ─────────────────────────────────────────── */
  let simW=128,simH=128,rtA=null,rtB=null;

  function mkRT(w,h){
    const f=extLinear?gl.LINEAR:gl.NEAREST;
    const tex=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,f);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,f);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,TEX_TYPE,null);
    const fb=gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
    gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
    return{tex,fb};
  }
  function dropRT(rt){if(!rt)return;gl.deleteTexture(rt.tex);gl.deleteFramebuffer(rt.fb);}

  function buildSim(){
    const cw=canvas.clientWidth,ch=canvas.clientHeight;
    if(!cw||!ch)return false;
    /* Aspect-correct: simW/simH matches canvas CSS aspect → circular ripples */
    const aspect=ch/cw;
    const isSmall=window.innerWidth<700;
    const baseMax=isSmall?320:540;
    if(aspect>=1){
      const maxH=Math.min(baseMax*Math.max(1,Math.min(aspect/1.5,2.5)),1080);
      simH=Math.round(maxH);
      simW=Math.max(48,Math.floor(simH/aspect));
    } else {
      simW=baseMax;
      simH=Math.max(48,Math.round(simW*aspect));
    }
    /* Backing buffer: priorizar resolución de ANCHO (lo que más se nota).
       Se permite alto hasta el límite de textura (4096). El alto del canvas
       ya está acotado desde syncLayout para que no se degrade la nitidez. */
    const dpr=Math.min(window.devicePixelRatio||1,1.5);
    const MAX_DIM=4096;
    const scale=Math.min(1,MAX_DIM/Math.max(cw*dpr,ch*dpr));
    canvas.width=Math.max(2,Math.floor(cw*dpr*scale));
    canvas.height=Math.max(2,Math.floor(ch*dpr*scale));
    dropRT(rtA);dropRT(rtB);
    rtA=mkRT(simW,simH);rtB=mkRT(simW,simH);
    return true;
  }

  /* ── Pool image texture ──────────────────────────────────────────── */
  const imgTex=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,imgTex);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([18,58,72,255]));

  let imgReady=false;
  (function(){
    const url=(window.POOL_WATER_PARAMS||{}).imageURL||'assets/pool-extended.jpg';
    const im=new Image();im.decoding='async';
    im.onload=()=>{
      gl.bindTexture(gl.TEXTURE_2D,imgTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,im);
      imgReady=true;
    };
    im.onerror=()=>{canvas.style.display='none';};
    im.src=url;
  }());

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function useRT(rt){
    if(rt){gl.bindFramebuffer(gl.FRAMEBUFFER,rt.fb);gl.viewport(0,0,simW,simH);}
    else{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);}
  }
  function bindTex(u,t){gl.activeTexture(gl.TEXTURE0+u);gl.bindTexture(gl.TEXTURE_2D,t);}
  function tw(k,d){const v=(window.WATER_TWEAKS||{})[k];return v!==undefined?v:d;}

  /* ── Drop queue ──────────────────────────────────────────────────── */
  const drops=[];
  let lastDrop=0;

  function addDrop(uvX,uvY,rad,str){drops.push({x:uvX,y:uvY,r:rad,s:str});}

  /* Convert client-space cursor to GL UV coordinates.
   *
   * CRITICAL — GL UV convention:  y=1 at CSS TOP,  y=0 at CSS BOTTOM.
   * The canvas is ~7000 CSS px tall, visible portion only at the top.
   * cssV = 0..1 from TOP to BOTTOM → glV = 1 - cssV.
   *
   * Without this flip every drop lands at the invisible CSS bottom
   * of the canvas (7000 px off-screen) and produces zero effect.
   */
  function uvFromClient(cx,cy){
    const rect=canvas.getBoundingClientRect();
    if(!rect.width||!rect.height)return null;
    const x=cx-rect.left,y=cy-rect.top;
    if(x<0||x>rect.width||y<0||y>rect.height)return null;
    return{u:x/rect.width, v:1-y/rect.height};
  }

  document.addEventListener('mousemove',e=>{
    const now=performance.now();
    if(now-lastDrop<30)return;
    const uv=uvFromClient(e.clientX,e.clientY);if(!uv)return;
    const minR=6/simW;
    addDrop(uv.u,uv.v,Math.max(tw('cursorRadius',0.040),minR),tw('cursorStrength',0.55)*0.055);
    lastDrop=now;
  },{passive:true});

  document.addEventListener('mousedown',e=>{
    const uv=uvFromClient(e.clientX,e.clientY);if(!uv)return;
    addDrop(uv.u,uv.v,Math.max(0.07,8/simW),tw('cursorStrength',0.55)*0.55);
  },{passive:true});

  document.addEventListener('touchmove',e=>{
    const now=performance.now();if(now-lastDrop<40)return;
    const t=e.touches[0];if(!t)return;
    const uv=uvFromClient(t.clientX,t.clientY);if(!uv)return;
    addDrop(uv.u,uv.v,Math.max(0.06,7/simW),0.12);
    lastDrop=now;
  },{passive:true});

  /* ── Ambient drops ───────────────────────────────────────────────────
   * Must land in the VISIBLE GL UV range (near y=1.0 = CSS top).
   *
   * Compute visible CSS pixel range → convert to GL UV (y = 1 - cssV).
   * 15% padding so drops near but just outside the viewport still
   * propagate waves into the visible area.
   */
  let nextAmb=performance.now()+400;
  function ambient(now){
    if(now<nextAmb)return;
    const m=tw('ambientWaves',0.50);if(m<0.001){nextAmb=now+4000;return;}

    const rect=canvas.getBoundingClientRect();
    let vy0=0.80,vy1=1.0;
    if(rect.height>0){
      const cssTOP = Math.max(0,-rect.top);          // canvas CSS px scrolled past top
      const cssVH  = Math.min(window.innerHeight, rect.top+rect.height) - Math.max(0,rect.top);
      const cssBOT = cssTOP + Math.max(0,cssVH);    // CSS bottom of visible portion
      const pad    = rect.height*0.15;
      vy0 = Math.max(0, 1-(cssBOT+pad)/rect.height);
      vy1 = Math.min(1, 1-(cssTOP-pad)/rect.height);
    }

    const minR=6/simW;
    addDrop(
      0.05+Math.random()*0.90,
      vy0+Math.random()*(vy1-vy0),
      Math.max(0.045+Math.random()*0.045,minR),
      (0.28+Math.random()*0.22)*(m/0.50)
    );
    const base=550/Math.max(m,0.02);
    nextAmb=now+base*(0.4+Math.random()*0.9);
  }

  /* ── Render loop ─────────────────────────────────────────────────── */
  let ready=false,rebuildPending=false;

  // Manejo de pérdida de contexto WebGL
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    canvas.style.display = 'none';
  }, false);

  function frame(now){
    if(!rtA||!rtB){if(!buildSim()){requestAnimationFrame(frame);return;}}
    if(!ready&&imgReady){canvas.classList.add('is-ready');ready=true;}

    ambient(now);

    /* 1. Apply queued drops */
    if(drops.length){
      gl.useProgram(pDrop.p);
      const u=pDrop.u;
      gl.uniform1i(u.u_tex,0);
      gl.uniform1f(u.u_asp,simH/simW);
      for(let i=0;i<drops.length;i++){
        const d=drops[i];
        gl.uniform2f(u.u_pt,d.x,d.y);
        gl.uniform1f(u.u_rad,d.r);
        gl.uniform1f(u.u_str,d.s);
        bindTex(0,rtA.tex);useRT(rtB);quad();
        const t=rtA;rtA=rtB;rtB=t;
      }
      drops.length=0;
    }

    /* 2. Wave propagation */
    gl.useProgram(pStep.p);
    gl.uniform1i(pStep.u.u_tex,0);
    gl.uniform2f(pStep.u.u_px,1/simW,1/simH);
    gl.uniform1f(pStep.u.u_damp,tw('damping',0.988));
    bindTex(0,rtA.tex);useRT(rtB);quad();
    {const t=rtA;rtA=rtB;rtB=t;}

    /* 3. Display — displace image by wave gradient */
    if(imgReady){
      const p=window.POOL_WATER_PARAMS||{};
      const uvO=p.uvOrigin||[0.2591,0.034];
      const uvS=p.uvScale ||[0.4818,0.647];
      gl.useProgram(pDisp.p);
      const u=pDisp.u;
      gl.uniform1i(u.u_h,0);gl.uniform1i(u.u_img,1);
      gl.uniform2f(u.u_px,1/simW,1/simH);
      gl.uniform2f(u.u_uvO,uvO[0],uvO[1]);
      gl.uniform2f(u.u_uvS,uvS[0],uvS[1]);
      gl.uniform1f(u.u_pert,tw('refract',0.055)*4.0);
      bindTex(0,rtA.tex);bindTex(1,imgTex);
      useRT(null);
      gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
      quad();
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* Debug / external access — solo expuesto con ?debug en URL.
     Inyectar drops directamente desde la consola sin eventos sintéticos. */
  if (/[?&]debug\b/.test(location.search)) {
    window._rippleDrop = function(x, y, r, s) { addDrop(x, y, r, s); };
    window._rippleInfo = function() {
      return { simW, simH, ready, imgReady,
               tweaks: window.WATER_TWEAKS,
               params: window.POOL_WATER_PARAMS };
    };
  }

  new ResizeObserver(()=>{
    if(rebuildPending)return;
    rebuildPending=true;
    requestAnimationFrame(()=>{rebuildPending=false;buildSim();});
  }).observe(canvas);
}());
