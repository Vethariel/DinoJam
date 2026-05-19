import * as THREE from 'three';

/* ─────────────────────────────────────────────────────────────
   Gray-Scott Reaction-Diffusion – GPU ping-pong
   Expone:
     • rdTexture   → THREE.Texture actualizada cada frame
     • step(n)     → avanza n pasos de simulación
     • reset()     → reinicia con semilla aleatoria
     • setParams() → cambia feed / kill en caliente
   ───────────────────────────────────────────────────────────── */

const SIM_RES = 512;
const RD_MUSIC_BPM = 161.5;
const RD_BEAT_SECONDS = 60 / RD_MUSIC_BPM;
const RD_SECONDARY_KICK_MIN_SECONDS = RD_BEAT_SECONDS; // no reaccionar mas rapido que el pulso secundario
const RD_MAIN_KICK_SECONDS = RD_BEAT_SECONDS * 4; // kick principal ~= 1 compas
const RD_CYCLE_SECONDS = Math.max(
  RD_MAIN_KICK_SECONDS,
  RD_SECONDARY_KICK_MIN_SECONDS * 2.6
);
const RD_GROW_SECONDS = RD_CYCLE_SECONDS * 0.62;
const RD_DECAY_SECONDS = RD_CYCLE_SECONDS - RD_GROW_SECONDS;

// ── Vertex trivial ──────────────────────────────────────────
const vertSrc = /* glsl */`
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// ── Fragment Gray-Scott ─────────────────────────────────────
const fragSrc = /* glsl */`
  precision highp float;
  uniform sampler2D uState;
  uniform vec2      uRes;
  uniform float     uFeed;
  uniform float     uKill;
  uniform float     uDu;
  uniform float     uDv;
  uniform float     uDt;
  uniform float     uDecay;
  uniform float     uClearMix;
  varying vec2 vUv;

  vec2 sampleRD(vec2 offset){
    return texture2D(uState, vUv + offset / uRes).rg;
  }

  void main(){
    vec2 uv = texture2D(uState, vUv).rg;
    float u = uv.r;
    float v = uv.g;

    // Laplaciano 9-tap
    vec2 lap =
      sampleRD(vec2(-1, 0)) + sampleRD(vec2(1, 0)) +
      sampleRD(vec2(0,-1)) + sampleRD(vec2(0, 1)) +
      0.05*(sampleRD(vec2(-1,-1)) + sampleRD(vec2(1,-1)) +
            sampleRD(vec2(-1, 1)) + sampleRD(vec2(1, 1))) -
      4.2 * uv;

    float uvv   = u * v * v;
    float dudt  = uDu * lap.r - uvv + uFeed * (1.0 - u);
    float dvdt  = uDv * lap.g + uvv - (uKill + uFeed) * v;

    float nu = clamp(u + uDt * dudt, 0.0, 1.0);
    float nv = clamp(v + uDt * dvdt, 0.0, 1.0);

    // Fase de degeneración: empuja lentamente el sistema hacia vacío.
    // uDecay es pequeño, pero acumulado por pasos/frame vacía el campo.
    nv = max(0.0, nv - uDecay);
    nu = min(1.0, nu + uDecay * 0.5);

    // Fuerza explícitamente el estado vacío al final del clear.
    nv = mix(nv, 0.0, uClearMix);
    nu = mix(nu, 1.0, uClearMix);

    gl_FragColor = vec4(nu, nv, 0.0, 1.0);
  }
`;

export class RDSimulation {
  /** @type {THREE.WebGLRenderer} */
  #renderer;
  #scene   = new THREE.Scene();
  #camera  = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  #mesh    = null;
  #mat     = null;
  /** @type {[THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]} */
  #fbo     = [];
  #current = 0;

  /** Parámetros actuales */
  feed = 0.055;
  kill = 0.062;
  Du   = 0.21;
  Dv   = 0.105;
  dt   = 1.0;

  #phase = 'grow';
  #phaseTime = 0;
  #growDuration = RD_GROW_SECONDS;
  #decayDuration = RD_DECAY_SECONDS;
  #cycleDuration = this.#growDuration + this.#decayDuration;
  #pendingRegenerate = false;
  #motifDecayBoost = 0;
  #motifClearBoost = 0;
  #presetIndex = 0;
  #musicClock = 0;
  #lastCyclePos = 0;
  #presets = [
    { feed: 0.053, kill: 0.061, Du: 0.205, Dv: 0.102, dt: 1.0, seedCount: 78, radiusMin: 3, radiusMax: 7 },
    { feed: 0.044, kill: 0.060, Du: 0.198, Dv: 0.099, dt: 1.0, seedCount: 70, radiusMin: 4, radiusMax: 8 },
    { feed: 0.036, kill: 0.058, Du: 0.192, Dv: 0.096, dt: 1.0, seedCount: 82, radiusMin: 3, radiusMax: 7 },
    { feed: 0.048, kill: 0.062, Du: 0.210, Dv: 0.104, dt: 1.0, seedCount: 68, radiusMin: 4, radiusMax: 8 },
  ];

  constructor(renderer) {
    this.#renderer = renderer;
    this.#buildFBOs();
    this.#buildMesh();
    this.#startGenerationCycle();
  }

  #buildFBOs() {
    const opts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format:    THREE.RGBAFormat,
      type:      THREE.FloatType,
    };
    this.#fbo = [
      new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, opts),
      new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, opts),
    ];
  }

  #buildMesh() {
    this.#mat = new THREE.ShaderMaterial({
      vertexShader:   vertSrc,
      fragmentShader: fragSrc,
      uniforms: {
        uState: { value: null },
        uRes:   { value: new THREE.Vector2(SIM_RES, SIM_RES) },
        uFeed:  { value: this.feed },
        uKill:  { value: this.kill },
        uDu:    { value: this.Du   },
        uDv:    { value: this.Dv   },
        uDt:    { value: this.dt   },
        uDecay: { value: 0.0 },
        uClearMix: { value: 0.0 },
      },
    });
    this.#mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.#mat);
    this.#scene.add(this.#mesh);
  }

  #startGenerationCycle() {
    const base = this.#presets[this.#presetIndex % this.#presets.length];
    this.#presetIndex += 1;

    // Variación ligera para obtener un patrón nuevo cada ciclo.
    const jitter = (value, amount) => value * (1 + (Math.random() * 2 - 1) * amount);

    const params = {
      feed: THREE.MathUtils.clamp(jitter(base.feed, 0.03), 0.030, 0.062),
      kill: THREE.MathUtils.clamp(jitter(base.kill, 0.03), 0.054, 0.068),
      Du: THREE.MathUtils.clamp(jitter(base.Du, 0.02), 0.180, 0.225),
      Dv: THREE.MathUtils.clamp(jitter(base.Dv, 0.02), 0.090, 0.115),
      dt: THREE.MathUtils.clamp(jitter(base.dt, 0.02), 0.90, 1.10),
    };

    this.setParams(params);
    this.reset({
      seedCount: base.seedCount,
      radiusMin: base.radiusMin,
      radiusMax: base.radiusMax,
    });

    this.#mat.uniforms.uDecay.value = 0.0;
    this.#mat.uniforms.uClearMix.value = 0.0;
    this.#phase = 'grow';
    this.#phaseTime = 0;
    this.#pendingRegenerate = false;
  }

  #startDecayCycle() {
    this.#phase = 'decay';
    this.#phaseTime = 0;
  }

  /** Reinicia con U=1 en todo el campo y semillas de V aleatorias */
  reset({ seedCount = 80, radiusMin = 4, radiusMax = 9 } = {}) {
    const n    = SIM_RES * SIM_RES;
    const data = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      data[i * 4]     = 1.0; // U
      data[i * 4 + 1] = 0.0; // V
      data[i * 4 + 2] = 0.0;
      data[i * 4 + 3] = 1.0;
    }

    // Sembrar manchas aleatorias de V
    const seeds = Math.max(0, Math.floor(seedCount));
    const minR = Math.max(1, Math.floor(radiusMin));
    const maxR = Math.max(minR, Math.floor(radiusMax));
    for (let s = 0; s < seeds; s++) {
      const cx = Math.floor(Math.random() * SIM_RES);
      const cy = Math.floor(Math.random() * SIM_RES);
      const r = minR + Math.floor(Math.random() * (maxR - minR + 1));
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx*dx + dy*dy > r*r) continue;
          const x = (cx + dx + SIM_RES) % SIM_RES;
          const y = (cy + dy + SIM_RES) % SIM_RES;
          const idx = (y * SIM_RES + x) * 4;
          data[idx]     = 0.5 + (Math.random() - 0.5) * 0.1;
          data[idx + 1] = 0.25 + (Math.random() - 0.5) * 0.1;
        }
      }
    }

    const initTex = new THREE.DataTexture(
      data, SIM_RES, SIM_RES,
      THREE.RGBAFormat, THREE.FloatType
    );
    initTex.needsUpdate = true;

    // Copiar estado inicial a ambos FBOs
    const copyMat = new THREE.MeshBasicMaterial({ map: initTex });
    const copyMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMat);
    const tmpScene = new THREE.Scene();
    tmpScene.add(copyMesh);

    this.#renderer.setRenderTarget(this.#fbo[0]);
    this.#renderer.render(tmpScene, this.#camera);
    this.#renderer.setRenderTarget(this.#fbo[1]);
    this.#renderer.render(tmpScene, this.#camera);
    this.#renderer.setRenderTarget(null);

    copyMat.dispose();
    initTex.dispose();
  }

  /** @param {{ feed, kill, Du, Dv, dt }} params */
  setParams({ feed, kill, Du, Dv, dt } = {}) {
    if (feed !== undefined) { this.feed = feed; this.#mat.uniforms.uFeed.value = feed; }
    if (kill !== undefined) { this.kill = kill; this.#mat.uniforms.uKill.value = kill; }
    if (Du   !== undefined) { this.Du   = Du;   this.#mat.uniforms.uDu.value   = Du;   }
    if (Dv   !== undefined) { this.Dv   = Dv;   this.#mat.uniforms.uDv.value   = Dv;   }
    if (dt   !== undefined) { this.dt   = dt;   this.#mat.uniforms.uDt.value   = dt;   }
  }

  /** Avanza `steps` iteraciones del simulador */
  step(steps = 8) {
    for (let i = 0; i < steps; i++) {
      const src = this.#fbo[this.#current];
      const dst = this.#fbo[1 - this.#current];
      this.#mat.uniforms.uState.value = src.texture;
      this.#renderer.setRenderTarget(dst);
      this.#renderer.render(this.#scene, this.#camera);
      this.#current = 1 - this.#current;
    }
    this.#renderer.setRenderTarget(null);
  }

  /**
   * Avanza simulación + máquina de estados:
   * grow (genera/estabiliza) -> decay (vacía) -> nuevo grow con params variados.
   */
  triggerMusicMotif(type = 'din_din_dan') {
    const major = type === 'din_din_din_din_dan';
    this.#motifDecayBoost = Math.max(this.#motifDecayBoost, major ? 0.0028 : 0.0014);
    this.#motifClearBoost = Math.max(this.#motifClearBoost, major ? 0.42 : 0.16);
    // La fase queda bloqueada al kick principal; los motivos solo alteran intensidad.
  }

  /**
   * Fuerza inicio de nuevo ciclo exactamente en el kick principal.
   */
  triggerMainKickCycle() {
    this.#musicClock = 0;
    this.#lastCyclePos = 0;
    this.#startGenerationCycle();
  }

  update(dt, steps = 8) {
    // Regenerar en tick separado evita saltar de puntos -> nuevo patrón en el mismo frame.
    this.#musicClock += dt;
    const cyclePos = this.#musicClock % this.#cycleDuration;
    const wrapped = cyclePos + 1e-6 < this.#lastCyclePos;
    if (this.#pendingRegenerate || wrapped) {
      this.#startGenerationCycle();
    }
    this.#pendingRegenerate = false;
    this.#lastCyclePos = cyclePos;

    // Bloqueo de fase:
    // - inicio de ciclo (kick principal): arranca grow con patrón nuevo
    // - fin de decay: coincide con el siguiente kick principal
    if (cyclePos < this.#growDuration) {
      this.#phase = 'grow';
      this.#phaseTime = cyclePos;
    } else {
      this.#phase = 'decay';
      this.#phaseTime = cyclePos - this.#growDuration;
    }

    if (this.#phase === 'grow') {
      this.#mat.uniforms.uDecay.value = 0.0;
      this.#mat.uniforms.uClearMix.value = 0.0;
    } else {
      const t = Math.min(this.#phaseTime / this.#decayDuration, 1.0);
      this.#mat.uniforms.uDecay.value = THREE.MathUtils.lerp(0.0002, 0.0020, t);
      this.#mat.uniforms.uClearMix.value = 0.0;
    }

    this.#mat.uniforms.uDecay.value = Math.min(0.02, this.#mat.uniforms.uDecay.value + this.#motifDecayBoost);
    this.#mat.uniforms.uClearMix.value = Math.min(1.0, this.#mat.uniforms.uClearMix.value + this.#motifClearBoost);
    this.#motifDecayBoost = Math.max(0, this.#motifDecayBoost - dt * 0.0021);
    this.#motifClearBoost = Math.max(0, this.#motifClearBoost - dt * 0.9);

    const phaseSteps = this.#phase === 'grow' ? Math.max(1, Math.round(steps * 2.7)) : steps;
    this.step(phaseSteps);
  }

  /** Textura de resultado actual (canal R=U, G=V) */
  get rdTexture() {
    return this.#fbo[this.#current].texture;
  }

  dispose() {
    this.#fbo.forEach(f => f.dispose());
    this.#mat.dispose();
  }
}