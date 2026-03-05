/**
 * HTML code generators for WebGL animation export.
 *
 * Two modes:
 * - Raw WebGL2: zero-dependency standalone HTML
 * - Three.js CDN: imports Three.js module from jsdelivr
 *
 * Both produce self-contained HTML documents with embedded GLSL shaders
 * and a requestAnimationFrame loop.
 */

import type { ExportGraph, ExportPass, UniformValue, TimeControlExport } from './export-graph';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function escapeGLSL(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');
}

function formatUniformValue(v: UniformValue): string {
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `[${v.join(', ')}]`;
  return `"${v}"`;
}

function buildTimeLogic(tc: TimeControlExport | null): string {
  if (!tc) {
    return `
    // Simple infinite loop
    function getTime(rawTime) {
      return rawTime * 0.001;
    }`;
  }

  const { speed, loopMode, rangeStart, rangeEnd } = tc;
  const duration = rangeEnd - rangeStart;

  if (loopMode === 'once') {
    return `
    // Once mode: clamp to range
    function getTime(rawTime) {
      const t = rawTime * 0.001 * ${speed};
      return Math.min(t + ${rangeStart}, ${rangeEnd});
    }`;
  }

  if (loopMode === 'ping-pong') {
    return `
    // Ping-pong loop
    function getTime(rawTime) {
      const t = rawTime * 0.001 * ${speed};
      const cycle = t % (${duration} * 2);
      return cycle <= ${duration}
        ? ${rangeStart} + cycle
        : ${rangeEnd} - (cycle - ${duration});
    }`;
  }

  // Default: loop
  return `
    // Loop mode
    function getTime(rawTime) {
      const t = rawTime * 0.001 * ${speed};
      return ${rangeStart} + (t % ${duration});
    }`;
}

function buildMouseLogic(hasMouse: boolean): string {
  if (!hasMouse) return '';
  return `
    // Mouse interaction
    const mouse = { x: 0.5, y: 0.5, pressed: false, scroll: 0 };
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      mouse.y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    });
    canvas.addEventListener('mousedown', () => { mouse.pressed = true; });
    canvas.addEventListener('mouseup', () => { mouse.pressed = false; });
    canvas.addEventListener('wheel', (e) => { mouse.scroll += e.deltaY * 0.01; }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const t = e.touches[0];
      mouse.x = Math.max(0, Math.min(1, (t.clientX - r.left) / r.width));
      mouse.y = Math.max(0, Math.min(1, (t.clientY - r.top) / r.height));
      mouse.pressed = true;
    }, { passive: false });
    canvas.addEventListener('touchend', () => { mouse.pressed = false; });`;
}

// ---------------------------------------------------------------------------
// RAW WebGL2 template
// ---------------------------------------------------------------------------

function buildRawShaderCompilation(passes: ExportPass[]): string {
  const lines: string[] = [];

  lines.push(`
    // --- Shader sources ---`);

  for (let i = 0; i < passes.length; i++) {
    lines.push(`
    const vertSrc${i} = \`${escapeGLSL(convertToWebGL2Vert(passes[i].vertexShader))}\`;
    const fragSrc${i} = \`${escapeGLSL(convertToWebGL2Frag(passes[i].fragmentShader))}\`;`);
  }

  lines.push(`
    // --- Compile shaders ---
    function createShader(gl, type, source) {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('Shader error:', gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    }
    function createProgram(gl, vs, fs) {
      const p = gl.createProgram();
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error('Program error:', gl.getProgramInfoLog(p));
        return null;
      }
      return p;
    }

    const programs = [];`);

  for (let i = 0; i < passes.length; i++) {
    lines.push(`
    {
      const vs = createShader(gl, gl.VERTEX_SHADER, vertSrc${i});
      const fs = createShader(gl, gl.FRAGMENT_SHADER, fragSrc${i});
      programs.push(createProgram(gl, vs, fs));
    }`);
  }

  return lines.join('');
}

/** Convert Three.js style vertex shader to WebGL2 (GLSL 300 es) */
function convertToWebGL2Vert(src: string): string {
  // If already has #version, return as-is
  if (src.includes('#version')) return src;
  return `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;
}

/** Convert GLSL ES 1.0 fragment shader to WebGL2 (GLSL 300 es) */
function convertToWebGL2Frag(src: string): string {
  if (src.includes('#version')) return src;

  let converted = src;
  // Add version header
  converted = `#version 300 es\n${converted}`;
  // Replace varying with in
  converted = converted.replace(/\bvarying\b/g, 'in');
  // Replace texture2D with texture
  converted = converted.replace(/\btexture2D\b/g, 'texture');
  // Replace gl_FragColor with out variable
  converted = converted.replace(
    /precision\s+(highp|mediump|lowp)\s+float\s*;/,
    (match) => `${match}\nout vec4 fragColor;`,
  );
  converted = converted.replace(/\bgl_FragColor\b/g, 'fragColor');

  return converted;
}

function buildRawUniformSetters(passes: ExportPass[]): string {
  const lines: string[] = [];

  for (let i = 0; i < passes.length; i++) {
    const pass = passes[i];
    lines.push(`
    // Pass ${i} uniforms`);

    for (const [name, value] of Object.entries(pass.uniforms)) {
      if (name === 'uTime') continue; // Set in RAF loop
      lines.push(buildRawUniformSetter(i, name, value));
    }
  }

  return lines.join('');
}

function buildRawUniformSetter(passIdx: number, name: string, value: UniformValue): string {
  const loc = `gl.getUniformLocation(programs[${passIdx}], '${name}')`;

  if (typeof value === 'boolean') {
    return `
    gl.useProgram(programs[${passIdx}]);
    gl.uniform1i(${loc}, ${value ? 1 : 0});`;
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value) && (name.startsWith('uColor') || name === 'uOctaves' || name === 'uSides' || name === 'uBlendMode')) {
      return `
    gl.useProgram(programs[${passIdx}]);
    gl.uniform1i(${loc}, ${value});`;
    }
    return `
    gl.useProgram(programs[${passIdx}]);
    gl.uniform1f(${loc}, ${value});`;
  }
  if (Array.isArray(value)) {
    if (value.length === 2) {
      return `
    gl.useProgram(programs[${passIdx}]);
    gl.uniform2f(${loc}, ${value[0]}, ${value[1]});`;
    }
    if (value.length === 3) {
      return `
    gl.useProgram(programs[${passIdx}]);
    gl.uniform3f(${loc}, ${value[0]}, ${value[1]}, ${value[2]});`;
    }
    if (value.length === 4) {
      return `
    gl.useProgram(programs[${passIdx}]);
    gl.uniform4f(${loc}, ${value[0]}, ${value[1]}, ${value[2]}, ${value[3]});`;
    }
    // Array uniforms (e.g. uColors[8] = 24 floats, uPositions[8])
    if (name === 'uColors') {
      return `
    gl.useProgram(programs[${passIdx}]);
    gl.uniform3fv(${loc}, new Float32Array([${value.join(', ')}]));`;
    }
    if (name === 'uPositions') {
      return `
    gl.useProgram(programs[${passIdx}]);
    gl.uniform1fv(${loc}, new Float32Array([${value.join(', ')}]));`;
    }
    return `
    gl.useProgram(programs[${passIdx}]);
    gl.uniform1fv(${loc}, new Float32Array([${value.join(', ')}]));`;
  }
  return '';
}

function buildRawFramebuffers(passCount: number): string {
  if (passCount <= 1) return '';

  return `
    // --- Framebuffers for multi-pass ---
    const fbos = [];
    const fboTextures = [];
    for (let i = 0; i < ${passCount}; i++) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      fbos.push(fbo);
      fboTextures.push(tex);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    function resizeFBOs() {
      for (let i = 0; i < ${passCount}; i++) {
        gl.bindTexture(gl.TEXTURE_2D, fboTextures[i]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
    }`;
}

function buildRawRenderLoop(passes: ExportPass[], fpsCap: number, _tc: TimeControlExport | null, _hasMouse: boolean): string {
  const lines: string[] = [];
  const minFrameTime = fpsCap > 0 ? `const MIN_FRAME = ${Math.round(1000 / fpsCap)};` : 'const MIN_FRAME = 0;';

  lines.push(`
    // --- Render loop ---
    ${minFrameTime}
    let lastFrame = 0;
    const startTime = performance.now();

    function render(now) {
      requestAnimationFrame(render);
      if (MIN_FRAME > 0 && now - lastFrame < MIN_FRAME) return;
      lastFrame = now;

      const time = getTime(now - startTime);
      gl.viewport(0, 0, canvas.width, canvas.height);`);

  for (let i = 0; i < passes.length; i++) {
    const pass = passes[i];
    const isLast = i === passes.length - 1;

    lines.push(`
      // --- Pass ${i}: ${pass.nodeType} ---
      gl.useProgram(programs[${i}]);`);

    // Bind framebuffer (last pass goes to screen)
    if (passes.length > 1) {
      if (isLast) {
        lines.push(`      gl.bindFramebuffer(gl.FRAMEBUFFER, null);`);
      } else {
        lines.push(`      gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[${i}]);`);
      }
    }

    // Set time uniform
    if (pass.needsTime) {
      lines.push(`      gl.uniform1f(gl.getUniformLocation(programs[${i}], 'uTime'), time);`);
    }

    // Bind input textures
    let texUnit = 0;
    for (const ti of pass.textureInputs) {
      lines.push(`      gl.activeTexture(gl.TEXTURE${texUnit});
      gl.bindTexture(gl.TEXTURE_2D, fboTextures[${ti.passIndex}]);
      gl.uniform1i(gl.getUniformLocation(programs[${i}], '${ti.uniformName}'), ${texUnit});`);
      texUnit++;
    }

    lines.push(`      gl.drawArrays(gl.TRIANGLES, 0, 6);`);
  }

  lines.push(`
    }
    requestAnimationFrame(render);`);

  return lines.join('');
}

export function generateRawWebGLHTML(graph: ExportGraph): string {
  const { passes, width, height, fpsCap, timeControl, hasMouseInteraction } = graph;

  if (passes.length === 0) {
    return '<!-- No WebGL passes to export -->';
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Caraca WebGL Export</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #000; overflow: hidden; }
  canvas { width: 100vw; height: 100vh; display: block; }
</style>
</head>
<body>
<canvas id="c" width="${width}" height="${height}"></canvas>
<script>
  (() => {
    const canvas = document.getElementById('c');
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, alpha: true });
    if (!gl) { document.body.textContent = 'WebGL2 not supported'; return; }

    // Responsive resize
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
      ${passes.length > 1 ? 'resizeFBOs();' : ''}
    });
    ro.observe(canvas);
    ${buildTimeLogic(timeControl)}
    ${buildMouseLogic(hasMouseInteraction)}
    ${buildRawShaderCompilation(passes)}

    // --- Fullscreen quad geometry ---
    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    for (let i = 0; i < programs.length; i++) {
      const loc = gl.getAttribLocation(programs[i], 'aPosition');
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      }
    }
    ${buildRawFramebuffers(passes.length)}
    ${buildRawUniformSetters(passes)}
    ${buildRawRenderLoop(passes, fpsCap, timeControl, hasMouseInteraction)}
  })();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// THREE.JS CDN template
// ---------------------------------------------------------------------------

function buildThreeJSPasses(passes: ExportPass[]): string {
  const lines: string[] = [];

  for (let i = 0; i < passes.length; i++) {
    const pass = passes[i];
    lines.push(`
    // --- Pass ${i}: ${pass.nodeType} ---
    const vert${i} = \`${escapeGLSL(pass.vertexShader)}\`;
    const frag${i} = \`${escapeGLSL(pass.fragmentShader)}\`;
    const uniforms${i} = {`);

    // Build uniform object
    for (const [name, value] of Object.entries(pass.uniforms)) {
      if (name === 'uTime') {
        lines.push(`      uTime: { value: 0.0 },`);
        continue;
      }
      lines.push(`      ${name}: { value: ${formatUniformValue(value)} },`);
    }

    // Add sampler uniforms
    for (const ti of pass.textureInputs) {
      lines.push(`      ${ti.uniformName}: { value: null },`);
    }

    lines.push(`    };
    const mat${i} = new THREE.ShaderMaterial({
      vertexShader: vert${i},
      fragmentShader: frag${i},
      uniforms: uniforms${i},
    });
    const mesh${i} = new THREE.Mesh(quad, mat${i});`);

    // Create render target for non-final passes
    if (i < passes.length - 1) {
      lines.push(`
    const rt${i} = new THREE.WebGLRenderTarget(${passes.length > 0 ? 'W' : '1280'}, ${passes.length > 0 ? 'H' : '720'}, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });`);
    }
  }

  return lines.join('');
}

function buildThreeJSRenderLoop(passes: ExportPass[], fpsCap: number): string {
  const lines: string[] = [];
  const minFrame = fpsCap > 0 ? Math.round(1000 / fpsCap) : 0;

  lines.push(`
    let lastFrame = 0;
    const startTime = performance.now();

    function render(now) {
      requestAnimationFrame(render);
      ${minFrame > 0 ? `if (now - lastFrame < ${minFrame}) return;` : ''}
      lastFrame = now;
      const time = getTime(now - startTime);`);

  for (let i = 0; i < passes.length; i++) {
    const pass = passes[i];
    const isLast = i === passes.length - 1;

    lines.push(`
      // Pass ${i}`);

    // Set time uniform
    if (pass.needsTime) {
      lines.push(`      uniforms${i}.uTime.value = time;`);
    }

    // Bind input textures
    for (const ti of pass.textureInputs) {
      lines.push(`      uniforms${i}.${ti.uniformName}.value = rt${ti.passIndex}.texture;`);
    }

    // Render
    lines.push(`      scene.children[0] = mesh${i};`);
    if (isLast) {
      lines.push(`      renderer.setRenderTarget(null);`);
    } else {
      lines.push(`      renderer.setRenderTarget(rt${i});`);
    }
    lines.push(`      renderer.render(scene, camera);`);
  }

  lines.push(`
    }
    requestAnimationFrame(render);`);

  return lines.join('');
}

export function generateThreeJSHTML(graph: ExportGraph): string {
  const { passes, width, height, fpsCap, timeControl, hasMouseInteraction } = graph;

  if (passes.length === 0) {
    return '<!-- No WebGL passes to export -->';
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Caraca WebGL Export</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #000; overflow: hidden; }
  canvas { width: 100vw; height: 100vh; display: block; }
</style>
</head>
<body>
<script type="module">
  import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.min.js';

  const W = ${width}, H = ${height};
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, premultipliedAlpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(devicePixelRatio);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.PlaneGeometry(2, 2);
  ${buildTimeLogic(timeControl)}
  ${buildMouseLogic(hasMouseInteraction)}
  ${buildThreeJSPasses(passes)}

  // Add first mesh as placeholder
  scene.add(mesh0);
  ${buildThreeJSRenderLoop(passes, fpsCap)}
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Iframe snippet
// ---------------------------------------------------------------------------

export function generateIframeSnippet(html: string, width: number, height: number): string {
  const escaped = html
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<iframe
  width="${width}"
  height="${height}"
  srcdoc="${escaped}"
  frameborder="0"
  allow="fullscreen"
  style="border: none;"
></iframe>`;
}
