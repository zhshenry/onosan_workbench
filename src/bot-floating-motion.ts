export function playBotMarquee(dock: HTMLElement, glint: HTMLElement): () => void {
  const media = matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)');
  let animation: Animation | undefined;

  const update = () => {
    if (media.matches) {
      animation?.cancel();
      animation = undefined;
      return;
    }
    const { clientWidth: width, clientHeight: height } = dock;
    if (!width || !height) return;
    const radius = Math.min(width / 2, height / 2, parseFloat(getComputedStyle(dock).borderTopLeftRadius));
    const quarterTurn = Math.PI / 2;
    const arc = radius * quarterTurn;
    const sides = [width - 2 * radius, height - 2 * radius, width - 2 * radius, height - 2 * radius];
    const perimeter = 2 * (sides[0] + sides[1]) + 4 * arc;
    const corners = [[width - radius, radius], [width - radius, height - radius], [radius, height - radius], [radius, radius]];

    // The straight edges interpolate between corners. Only the small light changes transform.
    const frames: Keyframe[] = [{ offset: 0, transform: `translate(${radius - width / 2}px, 0px) rotate(0rad)` }];
    let distance = 0;
    corners.forEach(([centerX, centerY], corner) => {
      distance += sides[corner];
      const steps = 6;
      for (let step = 0; step <= steps; step++) {
        const fraction = step / steps;
        const rotation = (corner + fraction) * quarterTurn;
        const angle = rotation - quarterTurn;
        const x = centerX + radius * Math.cos(angle) - width / 2;
        const y = centerY + radius * Math.sin(angle);
        frames.push({
          offset: Math.min(1, (distance + arc * fraction) / perimeter),
          transform: `translate(${x}px, ${y}px) rotate(${rotation}rad)`,
        });
      }
      distance += arc;
    });
    frames[frames.length - 1].offset = 1;

    const effect = animation?.effect;
    if (effect instanceof KeyframeEffect) effect.setKeyframes(frames);
    else animation = glint.animate(frames, { duration: 5000, iterations: Infinity });
  };
  const resize = new ResizeObserver(update);
  resize.observe(dock);
  media.addEventListener('change', update);
  return () => {
    resize.disconnect();
    media.removeEventListener('change', update);
    animation?.cancel();
  };
}

// One local window frame supplies the lens; it is never persisted or sent to a model.
const vertex = `#version 300 es
in vec2 position;
out vec2 uv;
void main() { uv = position * .5 + .5; gl_Position = vec4(position, 0., 1.); }`;
const fragment = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform sampler2D image;
uniform vec2 size;
uniform vec2 viewport;
uniform vec2 origin;
uniform vec4 dock;
uniform float progress;
uniform float hasImage;
void main() {
  vec2 p = vec2(uv.x, 1. - uv.y) * size;
  if (p.x > dock.x && p.y > dock.y && p.x < dock.z && p.y < dock.w) discard;
  float eased = (1. - exp2(-9. * progress)) / (1. - exp2(-9.));
  vec2 direction = p - vec2(size.x * .5, size.y + 650.);
  float x = (length(direction) - 650. - max(800., size.y + 80.) * eased) / 64.;
  float strength = min(1., progress / .03) * (1. - pow(progress, 2.2));
  float band = exp(-1.1 * x * x / 4.) * (1. - smoothstep(1.2, 1.6, x));
  vec4 delta = (vec4(x) - vec4(-1.5, -.5, .5, 1.5)) / .8;
  vec4 weights = exp(-delta * delta);
  vec3 ring = (vec3(.67, .79, 1.) * weights.x + vec3(.78, .78, 1.) * weights.y
    + vec3(.87, .82, 1.) * weights.z + vec3(.76, .95, 1.) * weights.w) / max(.00001, dot(weights, vec4(1.)));
  if (hasImage < .5) { color = vec4(ring, strength * band * .24); return; }
  float edge = min(min(p.x, size.x - p.x), min(p.y, size.y - p.y));
  float z = x * .75;
  vec2 offset = normalize(direction) * 7. * 2.33 * z * exp(-z * z) * strength * smoothstep(0., 56., edge) / viewport;
  vec2 source = (p + origin) / viewport;
  vec3 page = texture(image, source - offset).rgb;
  page.r = texture(image, source - offset * 1.08).r;
  page.b = texture(image, source - offset * .92).b;
  color = vec4(mix(page, ring, strength * band * .22), min(1., band * 5.) * smoothstep(0., .03, strength));
}`;

export function playBotOpening(dock: HTMLElement, snapshot: Promise<string>, protectedBounds: DOMRect): () => void {
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  if (media.matches || matchMedia('(forced-colors: active)').matches) return () => {};
  const top = Math.ceil(document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 64) + 6;
  const layer = document.createElement('div');
  layer.className = 'bot-opening-effect'; layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, { top: `${top}px`, left: '8px', right: '8px', bottom: '8px' });
  const canvas = document.createElement('canvas'); layer.append(canvas); document.body.append(layer);
  const bounds = layer.getBoundingClientRect(), input = protectedBounds;
  const ratio = Math.min(devicePixelRatio, 2);
  canvas.width = Math.round(bounds.width * ratio); canvas.height = Math.round(bounds.height * ratio);
  let gl: WebGL2RenderingContext | null = null, program: WebGLProgram | null = null, texture: WebGLTexture | null = null, buffer: WebGLBuffer | null = null;
  const shaders: WebGLShader[] = [];
  let fallback: CanvasRenderingContext2D | null = null;
  let stopped = false, frame = 0, gpuReady = false;
  const stop = () => {
    if (stopped) return;
    stopped = true; cancelAnimationFrame(frame); layer.remove();
    window.removeEventListener('resize', stop); window.removeEventListener('pointerdown', interact); media.removeEventListener('change', stop);
    if (gl) { gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach(shader => gl!.deleteShader(shader)); gl.getExtension('WEBGL_lose_context')?.loseContext(); }
  };
  const interact = (event: PointerEvent) => { if (!dock.closest('.bot-panel')?.contains(event.target as Node)) stop(); };
  window.addEventListener('resize', stop); window.addEventListener('pointerdown', interact); media.addEventListener('change', stop);
  try {
    gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL unavailable');
    program = gl.createProgram()!;
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
      const shader = gl.createShader(type)!; shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Shader unavailable');
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Lens unavailable');
    gl.useProgram(program); buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(gl.getUniformLocation(program, 'size'), bounds.width, bounds.height);
    gl.uniform2f(gl.getUniformLocation(program, 'viewport'), innerWidth, innerHeight);
    gl.uniform2f(gl.getUniformLocation(program, 'origin'), bounds.left, bounds.top);
    gl.uniform4f(gl.getUniformLocation(program, 'dock'), input.left - bounds.left - 12, input.top - bounds.top - 52, input.right - bounds.left + 12, bounds.height);
    texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    void snapshot.then(source => {
      if (stopped || !source) return;
      const image = new Image(); image.onload = () => {
        if (stopped || !gl || !program) return;
        gl.bindTexture(gl.TEXTURE_2D, texture); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.uniform1f(gl.getUniformLocation(program, 'hasImage'), 1); layer.dataset.renderer = 'window-lens';
      }; image.src = source;
    }).catch(() => {});
    layer.dataset.renderer = 'color-halo';
    gpuReady = true;
  } catch {
    const plain = document.createElement('canvas'); plain.width = canvas.width; plain.height = canvas.height;
    canvas.replaceWith(plain); fallback = plain.getContext('2d'); layer.dataset.renderer = 'color-halo';
  }
  const start = performance.now();
  const draw = (now: number) => {
    if (stopped) return;
    const progress = Math.min(1, (now - start) / 1000);
    if (fallback) {
      const radius = 650 + Math.max(800, bounds.height + 80) * (1 - 2 ** (-9 * progress)) / (1 - 2 ** -9);
      const strength = Math.min(1, progress / .03) * (1 - progress ** 2.2);
      fallback.setTransform(ratio, 0, 0, ratio, 0, 0); fallback.clearRect(0, 0, bounds.width, bounds.height);
      const glow = fallback.createRadialGradient(bounds.width / 2, bounds.height + 650, radius - 160, bounds.width / 2, bounds.height + 650, radius + 104);
      glow.addColorStop(0, 'transparent'); glow.addColorStop(.4, `rgba(171,201,255,${strength * .18})`); glow.addColorStop(.7, `rgba(210,201,255,${strength * .24})`); glow.addColorStop(1, 'transparent');
      fallback.fillStyle = glow; fallback.fillRect(0, 0, bounds.width, bounds.height);
      fallback.clearRect(input.left - bounds.left - 12, input.top - bounds.top - 52, input.width + 24, bounds.height);
    } else if (gpuReady && gl && program) {
      gl.uniform1f(gl.getUniformLocation(program, 'progress'), progress); gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    if (progress < 1) frame = requestAnimationFrame(draw); else stop();
  };
  frame = requestAnimationFrame(draw);
  return stop;
}
