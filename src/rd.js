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

  constructor(renderer) {
    this.#renderer = renderer;
    this.#buildFBOs();
    this.#buildMesh();
    this.reset();
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
      },
    });
    this.#mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.#mat);
    this.#scene.add(this.#mesh);
  }

  /** Reinicia con U=1 en todo el campo y semillas de V aleatorias */
  reset() {
    const n    = SIM_RES * SIM_RES;
    const data = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      data[i * 4]     = 1.0; // U
      data[i * 4 + 1] = 0.0; // V
      data[i * 4 + 2] = 0.0;
      data[i * 4 + 3] = 1.0;
    }

    // Sembrar manchas aleatorias de V
    const seeds = 80;
    for (let s = 0; s < seeds; s++) {
      const cx = Math.floor(Math.random() * SIM_RES);
      const cy = Math.floor(Math.random() * SIM_RES);
      const r  = 4 + Math.floor(Math.random() * 6);
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

  /** Textura de resultado actual (canal R=U, G=V) */
  get rdTexture() {
    return this.#fbo[this.#current].texture;
  }

  dispose() {
    this.#fbo.forEach(f => f.dispose());
    this.#mat.dispose();
  }
}