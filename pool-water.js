/* Piscinas Cuyo — Pool ripple animation
 *
 * Cursor-reactive water ripples constrained to the pool tile rectangle.
 *
 * Technique: classic 2D wave equation on a height field, solved on the GPU
 * via ping-pong half-float textures (WebGL2 with WebGL1 fallback).
 *
 *   h_next = 2*h_cur - h_prev + c² · ∇²h_cur,  then h *= damping
 *
 * Cursor (or touch) writes a gaussian bump into h_cur each frame.
 * Display pass derives a surface normal from ∇h and outputs specular
 * highlights + soft shadows over a TRANSPARENT canvas. The underlying pool
 * tile image shows through via `mix-blend-mode: screen` on the canvas
 * element — no need to sample the image in-shader, no seams, mobile-friendly.
 *
 * Read tweak values from window.WATER_TWEAKS each frame (set by the React
 * Tweaks panel). Defaults below are used until the panel mounts.
 */
(function () {
  'use strict';

  const reducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.getElementById('water');
  if (!canvas) return;

  const params = { alpha: true, depth: false, stencil: false, antialias: false,
                   premultipliedAlpha: true, preserveDrawingBuffer: false,
                   powerPreference: 'low-power' };

  let gl = canvas.getContext('webgl2', params);
  const isWebGL2 = !!gl;
  if (!gl) gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
  if (!gl) {
    canvas.style.display = 'none';
    return;
  }

  // ── Float texture support ──────────────────────────────────────────────
  let halfFloat, supportLinearFiltering, halfFloatTexType;
  if (isWebGL2) {
    gl.getExtension('EXT_color_buffer_float');
    supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    halfFloatTexType = gl.HALF_FLOAT;
  } else {
    halfFloat = gl.getExtension('OES_texture_half_float');
    supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    halfFloatTexType = halfFloat ? halfFloat.HALF_FLOAT_OES : null;
  }

  if (!halfFloatTexType) {
    // No float textures — bail and let the static image alone do the work.
    canvas.style.display = 'none';
    return;
  }

  // ── Defaults (overridable via window.WATER_TWEAKS) ─────────────────────
  const DEFAULTS = {
    damping: 0.985,
    speed: 1.0,
    cursorStrength: 0.55,
    cursorRadius: 0.018,
    specularColor: [0.95, 1.00, 0.92],   // pale aqua-white
    specularStrength: 1.2,
    shadowStrength: 0.45,
    ambientWaves: 0.6,                    // 0..1 multiplier for auto-ripples
    ambientRate: 0.6,                     // ~waves per second
    sharpness: 60.0,                      // normal scale; higher = crisper highlights
  };
  window.WATER_TWEAKS = window.WATER_TWEAKS || {};
  function tw(key) {
    return (window.WATER_TWEAKS[key] !== undefined)
      ? window.WATER_TWEAKS[key] : DEFAULTS[key];
  }

  // ── Shaders ────────────────────────────────────────────────────────────
  const VS = `
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main() {
      v_uv = a_pos * 0.5 + 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  // Wave equation step. Reads h(cur) and h(prev), writes h(next) into target.
  const STEP_FS = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_cur;
    uniform sampler2D u_prev;
    uniform vec2 u_texel;
    uniform float u_damping;
    uniform float u_speed;
    void main() {
      float l = texture2D(u_cur, v_uv + vec2(-u_texel.x, 0.0)).r;
      float r = texture2D(u_cur, v_uv + vec2( u_texel.x, 0.0)).r;
      float u = texture2D(u_cur, v_uv + vec2(0.0,-u_texel.y)).r;
      float d = texture2D(u_cur, v_uv + vec2(0.0, u_texel.y)).r;
      float c = texture2D(u_cur, v_uv).r;
      float p = texture2D(u_prev, v_uv).r;
      float lap = (l + r + u + d) - 4.0 * c;
      float h = 2.0 * c - p + u_speed * lap * 0.5;
      h *= u_damping;
      // soft edge clamp so reflections die at the pool border
      float edge = smoothstep(0.0, 0.03, v_uv.x) * smoothstep(1.0, 0.97, v_uv.x)
                 * smoothstep(0.0, 0.015, v_uv.y) * smoothstep(1.0, 0.985, v_uv.y);
      h *= mix(0.9, 1.0, edge);
      gl_FragColor = vec4(h, 0.0, 0.0, 1.0);
    }
  `;

  // Splat: add gaussian bump at point (additive over previous content).
  const SPLAT_FS = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_h;
    uniform vec2 u_point;
    uniform float u_radius;
    uniform float u_strength;
    uniform float u_aspect;
    void main() {
      float h = texture2D(u_h, v_uv).r;
      vec2 d = v_uv - u_point;
      d.y *= u_aspect; // make splat circular in screen space
      float r2 = dot(d, d);
      float bump = u_strength * exp(-r2 / (u_radius * u_radius));
      gl_FragColor = vec4(h + bump, 0.0, 0.0, 1.0);
    }
  `;

  // Display: derive normal from gradient → specular + shadow on transparent bg.
  const DISPLAY_FS = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_h;
    uniform vec2 u_texel;
    uniform vec3 u_spec;
    uniform float u_specStrength;
    uniform float u_shadowStrength;
    uniform float u_sharpness;
    void main() {
      float hl = texture2D(u_h, v_uv - vec2(u_texel.x, 0.0)).r;
      float hr = texture2D(u_h, v_uv + vec2(u_texel.x, 0.0)).r;
      float hu = texture2D(u_h, v_uv - vec2(0.0, u_texel.y)).r;
      float hd = texture2D(u_h, v_uv + vec2(0.0, u_texel.y)).r;
      vec2 grad = vec2(hr - hl, hd - hu);

      vec3 normal = normalize(vec3(-grad * u_sharpness, 1.0));
      vec3 lightDir = normalize(vec3(0.35, -0.55, 0.8));
      float ndl = max(0.0, dot(normal, lightDir));
      float spec = pow(ndl, 24.0);

      // Modulate by local disturbance so calm water stays clean
      float disturb = length(grad) * 80.0;
      float mask = smoothstep(0.02, 0.20, disturb);

      vec3 color = u_spec * (spec * u_specStrength * mask);
      // Shadow on the back side of waves (cheap fresnel-ish)
      float shadow = clamp(grad.y * u_sharpness * 0.4, 0.0, 1.0) * u_shadowStrength * mask;
      // Use premultiplied alpha so blend = screen looks clean
      float a = clamp(spec * u_specStrength * mask + shadow, 0.0, 1.0);
      // Subtract shadow as a slight darkening — done by negative addition
      gl_FragColor = vec4(color, a);
    }
  `;

  // ── Compile helpers ────────────────────────────────────────────────────
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('shader err:', gl.getShaderInfoLog(s), src);
      return null;
    }
    return s;
  }
  function program(vsSrc, fsSrc) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.bindAttribLocation(p, 0, 'a_pos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('link err:', gl.getProgramInfoLog(p));
      return null;
    }
    // collect uniform locations
    const uniforms = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      uniforms[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { program: p, uniforms };
  }

  // Full-screen quad
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,   1, -1,  -1,  1,
    -1,  1,   1, -1,   1,  1
  ]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // Compile programs
  const progStep    = program(VS, STEP_FS);
  const progSplat   = program(VS, SPLAT_FS);
  const progDisplay = program(VS, DISPLAY_FS);
  if (!progStep || !progSplat || !progDisplay) {
    canvas.style.display = 'none';
    return;
  }

  // ── Render targets (single-channel float) ──────────────────────────────
  function createRT(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const filter = supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    let internalFormat, format;
    if (isWebGL2) { internalFormat = gl.R16F; format = gl.RED; }
    else          { internalFormat = gl.RGBA; format = gl.RGBA; }
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, halfFloatTexType, null);

    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return { tex, fb, w, h };
  }

  // Sim resolution: aspect-correct for the pool, scaled by DPR clamped.
  let simW, simH;
  let rtA, rtB, rtC; // h_prev (A), h_cur (B), h_next (C) — rotate
  function buildRTs() {
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    if (!cssW || !cssH) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    // Cap sim resolution to keep mobile happy
    const maxDim = Math.min(window.innerWidth, window.innerHeight) < 700 ? 320 : 540;
    const aspect = cssH / cssW;
    if (aspect >= 1) {
      simW = Math.min(maxDim / aspect, 256);
      simH = simW * aspect;
    } else {
      simH = maxDim;
      simW = simH / aspect;
    }
    simW = Math.max(64, Math.floor(simW));
    simH = Math.max(64, Math.floor(simH));

    canvas.width  = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);

    rtA = createRT(simW, simH);
    rtB = createRT(simW, simH);
    rtC = createRT(simW, simH);
    return true;
  }
  if (!buildRTs()) {
    // canvas not yet sized; wait and retry
    requestAnimationFrame(function retry() {
      if (!buildRTs()) requestAnimationFrame(retry);
    });
  }

  // ── Bind helpers ───────────────────────────────────────────────────────
  function drawQuad() {
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  function bindRT(rt) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt ? rt.fb : null);
    if (rt) gl.viewport(0, 0, rt.w, rt.h);
    else    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  // ── Cursor / touch handling ────────────────────────────────────────────
  // We listen on the document and translate to canvas-local UVs. Splats are
  // queued and applied in the render loop.
  const splats = [];
  let lastSplatTime = 0;
  let lastPointer = null;

  function pointerToUV(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right ||
        clientY < rect.top  || clientY > rect.bottom) return null;
    return {
      x: (clientX - rect.left) / rect.width,
      y: 1.0 - (clientY - rect.top) / rect.height,  // GL Y up
    };
  }

  function onMove(e) {
    const t = (e.touches && e.touches[0]) || e;
    const uv = pointerToUV(t.clientX, t.clientY);
    if (!uv) { lastPointer = null; return; }
    // throttle by distance + time
    const now = performance.now();
    const dt  = now - lastSplatTime;
    let dx = 0, dy = 0;
    if (lastPointer) { dx = uv.x - lastPointer.x; dy = uv.y - lastPointer.y; }
    const moved = Math.hypot(dx, dy);
    if (dt > 30 || moved > 0.008) {
      splats.push({ x: uv.x, y: uv.y, strength: tw('cursorStrength') });
      lastSplatTime = now;
    }
    lastPointer = uv;
  }
  function onDown(e) {
    const t = (e.touches && e.touches[0]) || e;
    const uv = pointerToUV(t.clientX, t.clientY);
    if (!uv) return;
    splats.push({ x: uv.x, y: uv.y, strength: tw('cursorStrength') * 2.2 });
    lastPointer = uv;
  }
  document.addEventListener('mousemove', onMove, { passive: true });
  document.addEventListener('mousedown', onDown, { passive: true });
  document.addEventListener('touchmove', onMove, { passive: true });
  document.addEventListener('touchstart', onDown, { passive: true });

  // ── Ambient ripples: occasional drops to keep the water alive ──────────
  let nextAmbient = performance.now() + 800;
  function scheduleAmbient(now) {
    const rate = Math.max(0.05, tw('ambientRate'));
    const interval = 1000 / rate;
    nextAmbient = now + interval * (0.6 + Math.random() * 0.8);
  }

  // ── Resize handling ────────────────────────────────────────────────────
  let resizePending = false;
  const ro = new ResizeObserver(() => {
    if (resizePending) return;
    resizePending = true;
    requestAnimationFrame(() => {
      resizePending = false;
      const cw = Math.floor(canvas.clientWidth  * Math.min(window.devicePixelRatio || 1, 1.5));
      const ch = Math.floor(canvas.clientHeight * Math.min(window.devicePixelRatio || 1, 1.5));
      if (cw !== canvas.width || ch !== canvas.height) {
        // Rebuild everything (simple, infrequent)
        if (rtA) { gl.deleteTexture(rtA.tex); gl.deleteFramebuffer(rtA.fb); }
        if (rtB) { gl.deleteTexture(rtB.tex); gl.deleteFramebuffer(rtB.fb); }
        if (rtC) { gl.deleteTexture(rtC.tex); gl.deleteFramebuffer(rtC.fb); }
        buildRTs();
      }
    });
  });
  ro.observe(canvas);

  // ── Frame loop ─────────────────────────────────────────────────────────
  if (reducedMotion) {
    // Just clear the canvas and stop. Underlying image alone is fine.
    return;
  }

  function frame(now) {
    if (!rtA || !rtB || !rtC) { requestAnimationFrame(frame); return; }

    // 1) Apply any pending splats into rtB (current height)
    // 2) Step the wave equation: rtC = step(rtB, rtA)
    // 3) Rotate: rtA <- rtB <- rtC

    // Queue ambient ripples
    if (tw('ambientWaves') > 0.001 && now >= nextAmbient) {
      const m = tw('ambientWaves');
      splats.push({
        x: 0.15 + Math.random() * 0.7,
        y: 0.05 + Math.random() * 0.9,
        strength: tw('cursorStrength') * (0.25 + Math.random() * 0.35) * m,
      });
      scheduleAmbient(now);
    }

    // Apply splats into rtB by reading rtB → splat shader → write back to rtB
    // We do this via a temp swap with rtC to avoid simultaneous read/write.
    if (splats.length) {
      gl.useProgram(progSplat.program);
      const u = progSplat.uniforms;
      gl.uniform1f(u.u_radius, tw('cursorRadius'));
      gl.uniform1f(u.u_aspect, simH / simW);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(u.u_h, 0);

      for (let i = 0; i < splats.length; i++) {
        const s = splats[i];
        gl.uniform2f(u.u_point, s.x, s.y);
        gl.uniform1f(u.u_strength, s.strength);
        gl.bindTexture(gl.TEXTURE_2D, rtB.tex);
        bindRT(rtC);
        drawQuad();
        // swap B and C
        const tmp = rtB; rtB = rtC; rtC = tmp;
      }
      splats.length = 0;
    }

    // Step wave: rtC = step(rtB cur, rtA prev)
    gl.useProgram(progStep.program);
    {
      const u = progStep.uniforms;
      gl.uniform2f(u.u_texel, 1.0 / simW, 1.0 / simH);
      gl.uniform1f(u.u_damping, tw('damping'));
      gl.uniform1f(u.u_speed, tw('speed'));
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rtB.tex);
      gl.uniform1i(u.u_cur, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, rtA.tex);
      gl.uniform1i(u.u_prev, 1);
      bindRT(rtC);
      drawQuad();
    }
    // Rotate: prev <- cur, cur <- next
    const oldA = rtA;
    rtA = rtB; rtB = rtC; rtC = oldA;

    // Display: render rtB (current cur) to default framebuffer
    gl.useProgram(progDisplay.program);
    {
      const u = progDisplay.uniforms;
      gl.uniform2f(u.u_texel, 1.0 / simW, 1.0 / simH);
      const sc = tw('specularColor');
      gl.uniform3f(u.u_spec, sc[0], sc[1], sc[2]);
      gl.uniform1f(u.u_specStrength, tw('specularStrength'));
      gl.uniform1f(u.u_shadowStrength, tw('shadowStrength'));
      gl.uniform1f(u.u_sharpness, tw('sharpness'));
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rtB.tex);
      gl.uniform1i(u.u_h, 0);
      bindRT(null);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied
      drawQuad();
      gl.disable(gl.BLEND);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
