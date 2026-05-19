import * as THREE from 'three';

/* ─────────────────────────────────────────────────────────────
   Sistema de temas v2
   – RD sobre textura original del dino
   – Suelos infinitos por tema con shaders propios
   – Grid neon con fade radial
   ───────────────────────────────────────────────────────────── */

// ═══════════════════════════════════════════════════════════
//  VERTEX SHADER – dino (skinning)
// ═══════════════════════════════════════════════════════════
const dinoVert = /* glsl */`
  #include <common>
  #include <uv_pars_vertex>
  #include <skinning_pars_vertex>

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main(){
    #include <uv_vertex>
    #include <skinbase_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    #include <project_vertex>
    vUv       = uv;
    vNormal   = normalize(normalMatrix * normal);
    vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  }
`;

// ═══════════════════════════════════════════════════════════
//  FRAGMENT – NEON
//  Líneas RD (V alto) → color neon ciclante + emissive glow
//  Fondo  (V bajo)  → textura original oscurecida (~20%)
// ═══════════════════════════════════════════════════════════
const fragNeon = /* glsl */`
  precision highp float;
  uniform sampler2D uRD;
  uniform sampler2D uBase;
  uniform float     uTime;
  uniform float     uHasBase;
  varying vec2 vUv;
  varying vec3 vNormal;

  vec3 hsl2rgb(float h, float s, float l){
    vec3 rgb = clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0, 0.0, 1.0);
    return l + s*(rgb-0.5)*(1.0-abs(2.0*l-1.0));
  }

  void main(){
    vec2  rd      = texture2D(uRD, vUv).rg;
    // V alto = líneas del patrón RD
    float lines   = clamp(rd.g * 5.0, 0.0, 1.0);

    // Color neon ciclante en las líneas
    float hue     = fract(uTime * 0.07);
    vec3  neonCol = hsl2rgb(hue, 1.0, 0.55);

    // Textura original del dino, muy oscurecida en el fondo
    vec3  origTex = uHasBase > 0.5 ? texture2D(uBase, vUv).rgb : vec3(0.03);
    vec3  darkBase= origTex * 0.18;

    // Mezcla: líneas → neon, fondo → textura oscura
    vec3  color   = mix(darkBase, neonCol, lines);

    // Glow aditivo sobre líneas
    color += neonCol * lines * 0.9;

    // Sombreado suave para mantener volumen 3D
    float diff = max(dot(vNormal, normalize(vec3(1.0,2.0,1.0))), 0.0)*0.35 + 0.65;
    color *= diff;

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ═══════════════════════════════════════════════════════════
//  FRAGMENT – MAPA ANTIGUO
//  Líneas RD → tinta sepia oscura
//  Fondo     → textura original teñida en sepia
// ═══════════════════════════════════════════════════════════
const fragMap = /* glsl */`
  precision highp float;
  uniform sampler2D uRD;
  uniform sampler2D uBase;
  uniform float     uTime;
  uniform float     uHasBase;
  varying vec2 vUv;
  varying vec3 vNormal;

  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5); }
  float noise(vec2 p){
    vec2 i=floor(p); vec2 f=fract(p);
    float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
    vec2 u=f*f*(3.-2.*f);
    return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
  }

  void main(){
    vec2  rd      = texture2D(uRD, vUv).rg;
    float lines   = clamp(rd.g * 5.0, 0.0, 1.0);

    vec3  origTex = uHasBase > 0.5 ? texture2D(uBase, vUv).rgb : vec3(0.6,0.5,0.35);

    // Convierte textura original a sepia
    float lum     = dot(origTex, vec3(0.299,0.587,0.114));
    vec3  sepia   = vec3(lum*0.9+0.1, lum*0.7+0.05, lum*0.4);

    // Tinta oscura para las líneas RD
    vec3  ink     = vec3(0.12, 0.07, 0.02);

    // Ruido de envejecimiento
    float aged    = noise(vUv*18.0)*0.15 + noise(vUv*45.0)*0.07;

    vec3  color   = mix(sepia, ink, lines);
    color         = mix(color, color*0.7, aged*(1.0-lines)*0.5);

    float diff    = max(dot(vNormal,normalize(vec3(1,2,1))),0.0)*0.4+0.6;
    gl_FragColor  = vec4(color*diff, 1.0);
  }
`;

// ═══════════════════════════════════════════════════════════
//  FRAGMENT – B&W
//  Líneas RD → negro puro
//  Fondo     → textura original en escala de grises
// ═══════════════════════════════════════════════════════════
const fragBW = /* glsl */`
  precision highp float;
  uniform sampler2D uRD;
  uniform sampler2D uBase;
  uniform float     uTime;
  uniform float     uHasBase;
  varying vec2 vUv;
  varying vec3 vNormal;

  void main(){
    vec2  rd      = texture2D(uRD, vUv).rg;
    float lines   = clamp(rd.g * 5.0, 0.0, 1.0);

    vec3  origTex = uHasBase > 0.5 ? texture2D(uBase, vUv).rgb : vec3(0.85);
    float lum     = dot(origTex, vec3(0.299,0.587,0.114));
    // Alto contraste: refuerza blancos y negros
    lum = clamp((lum - 0.5)*1.4 + 0.5, 0.0, 1.0);
    vec3  greyBase= vec3(lum * 0.88 + 0.05);

    // Líneas duras negras
    vec3  color   = mix(greyBase, vec3(0.02), lines);

    float diff    = max(dot(vNormal,normalize(vec3(1,2,1))),0.0)*0.4+0.6;
    gl_FragColor  = vec4(color*diff, 1.0);
  }
`;

// ═══════════════════════════════════════════════════════════
//  FLOOR SHADERS
// ═══════════════════════════════════════════════════════════

// Vertex para todos los suelos (sin skinning)
const floorVert = /* glsl */`
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main(){
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position,1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  }
`;

// ── Suelo NEON: negro reflectivo con grid que se desvanece ──
const floorNeonFrag = /* glsl */`
  precision highp float;
  uniform float uTime;
  varying vec2  vUv;
  varying vec3  vWorldPos;

  void main(){
    // Distancia radial desde el centro para fade
    float dist  = length(vWorldPos.xz);
    float fade  = 1.0 - smoothstep(8.0, 45.0, dist);

    // Grid
    vec2  gCoord = vWorldPos.xz;
    vec2  gLine  = abs(fract(gCoord - 0.5) - 0.5) / fwidth(gCoord);
    float grid   = 1.0 - min(min(gLine.x, gLine.y), 1.0);

    // Color neon del grid ciclando lentamente
    float hue    = fract(uTime * 0.04);
    // HSL→RGB inline
    vec3 rgb = clamp(abs(mod(hue*6.0+vec3(0,4,2),6.0)-3.0)-1.0,0.0,1.0);
    vec3 gridCol = 0.35 + 0.65*(rgb-0.5)*(1.0-abs(2.0*0.35-1.0));

    // Reflexión muy sutil del entorno (gradiente vertical falso)
    float refl   = pow(1.0 - abs(vWorldPos.y + 0.01)*0.1, 3.0) * 0.08;
    vec3  reflCol= gridCol * refl;

    vec3  color  = mix(vec3(0.0), gridCol * 0.6, grid * fade) + reflCol * fade;
    float alpha  = mix(0.0, 1.0, fade);

    gl_FragColor = vec4(color, alpha);
  }
`;

// ── Suelo MAPA ANTIGUO: pradera procedural FBM ─────────────
const floorMapFrag = /* glsl */`
  precision highp float;
  uniform float uTime;
  varying vec2  vUv;
  varying vec3  vWorldPos;

  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5); }
  float noise(vec2 p){
    vec2 i=floor(p); vec2 f=fract(p);
    float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
    vec2 u=f*f*(3.-2.*f);
    return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
  }
  // FBM 4 octavas
  float fbm(vec2 p){
    float v=0.0,a=0.5;
    for(int i=0;i<4;i++){ v+=a*noise(p); p=p*2.1+vec2(1.7,9.2); a*=0.5; }
    return v;
  }

  void main(){
    float dist = length(vWorldPos.xz);
    float fade = 1.0 - smoothstep(10.0, 50.0, dist);

    vec2 wp   = vWorldPos.xz * 0.25;
    float f   = fbm(wp);
    float f2  = fbm(wp * 3.0 + vec2(5.2,1.3));

    // Colores: tierra seca, hierba vieja, tierra húmeda
    vec3  dry   = vec3(0.38, 0.28, 0.14);
    vec3  grass = vec3(0.28, 0.34, 0.12);
    vec3  dark  = vec3(0.18, 0.13, 0.06);

    vec3  col   = mix(dry, grass, smoothstep(0.3, 0.6, f));
    col         = mix(col, dark,  smoothstep(0.55, 0.75, f2));

    // Pequeñas variaciones de micro-textura
    float micro = noise(vWorldPos.xz * 4.0) * 0.08;
    col        += micro;

    // Fade hacia el color del fondo en los bordes
    vec3  fogCol = vec3(0.10, 0.08, 0.04);
    col = mix(fogCol, col, fade);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ── Suelo B&W: negro puro con fade suave ───────────────────
const floorBWFrag = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main(){
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  }
`;

// ═══════════════════════════════════════════════════════════
//  THEMES CONFIG
// ═══════════════════════════════════════════════════════════
export const THEMES = {
  neon: {
    id:          'neon',
    label:       'Neon',
    preview:     ['#000000', '#00ffcc', '#ff00ff'],
    fragShader:  fragNeon,
    floorFrag:   floorNeonFrag,
    floorBlend:  true,   // necesita transparencia para el fade
    rdParams:    { feed: 0.055, kill: 0.062, Du: 0.21, Dv: 0.105, dt: 1.0 },
    scene: {
      background: new THREE.Color(0x000000),
      fog:        new THREE.Fog(0x000000, 25, 70),
    },
    lights: {
      ambient:  { color: 0x000000, intensity: 0.3 },
      key:      { color: 0x00ffee, intensity: 1.8 },
      fill:     { color: 0xff00cc, intensity: 0.7 },
      rim:      { color: 0x4488ff, intensity: 1.0 },
    },
  },

  map: {
    id:          'map',
    label:       'Mapa Antiguo',
    preview:     ['#1a1208', '#c8a060', '#3d2008'],
    fragShader:  fragMap,
    floorFrag:   floorMapFrag,
    floorBlend:  false,
    rdParams:    { feed: 0.037, kill: 0.060, Du: 0.20, Dv: 0.10, dt: 1.0 },
    scene: {
      background: new THREE.Color(0x100d06),
      fog:        new THREE.Fog(0x100d06, 18, 55),
    },
    lights: {
      ambient:  { color: 0x5c3d10, intensity: 0.5 },
      key:      { color: 0xffe4a0, intensity: 1.6 },
      fill:     { color: 0x8b5c20, intensity: 0.4 },
      rim:      { color: 0xffd070, intensity: 0.5 },
    },
  },

  bw: {
    id:          'bw',
    label:       'B&W',
    preview:     ['#111111', '#888888', '#ffffff'],
    fragShader:  fragBW,
    floorFrag:   floorBWFrag,
    floorBlend:  false,
    rdParams:    { feed: 0.029, kill: 0.057, Du: 0.20, Dv: 0.10, dt: 1.0 },
    scene: {
      background: new THREE.Color(0x000000),
      fog:        new THREE.Fog(0x000000, 25, 70),
    },
    lights: {
      ambient:  { color: 0x333333, intensity: 0.5 },
      key:      { color: 0xffffff, intensity: 2.0 },
      fill:     { color: 0xaaaaaa, intensity: 0.4 },
      rim:      { color: 0xffffff, intensity: 0.7 },
    },
  },
};

// ═══════════════════════════════════════════════════════════
//  ThemeManager
// ═══════════════════════════════════════════════════════════
export class ThemeManager {
  #currentTheme = null;
  #model        = null;
  #dinoMats     = [];
  #scene        = null;
  #floorMesh    = null;   // suelo ShaderMaterial que reemplazamos
  #gridHelper   = null;
  #lights       = {};
  #rdSim        = null;
  #timeUniform  = { value: 0 };
  #floorTimeMat = null;   // ShaderMaterial del suelo (para uTime)

  init(scene, model, floorMesh, gridHelper, lights, rdSim) {
    this.#scene      = scene;
    this.#model      = model;
    this.#floorMesh  = floorMesh;
    this.#gridHelper = gridHelper;
    this.#lights     = lights;
    this.#rdSim      = rdSim;
  }

  apply(id) {
    const theme = THEMES[id];
    if (!theme) return;
    this.#currentTheme = theme;

    // 1. Escena + fog
    this.#scene.background = theme.scene.background;
    this.#scene.fog        = theme.scene.fog;

    // 2. Suelo – reemplazar ShaderMaterial completo
    this.#applyFloorShader(theme);

    // 3. Grid helper visible solo en neon
    if (this.#gridHelper) {
      this.#gridHelper.visible = false; // el grid neon está en el floor shader
    }

    // 4. Luces
    const L = theme.lights;
    if (this.#lights.ambient) {
      this.#lights.ambient.color.setHex(L.ambient.color);
      this.#lights.ambient.intensity = L.ambient.intensity;
    }
    if (this.#lights.key) {
      this.#lights.key.color.setHex(L.key.color);
      this.#lights.key.intensity = L.key.intensity;
    }
    if (this.#lights.fill) {
      this.#lights.fill.color.setHex(L.fill.color);
      this.#lights.fill.intensity = L.fill.intensity;
    }
    if (this.#lights.rim) {
      this.#lights.rim.color.setHex(L.rim.color);
      this.#lights.rim.intensity = L.rim.intensity;
    }

    // 5. RD
    this.#rdSim.setParams(theme.rdParams);
    this.#rdSim.reset();

    // 6. Materiales dino
    this.#applyDinoShader(theme);
  }

  #applyFloorShader(theme) {
    if (!this.#floorMesh) return;

    // Disponer material anterior si era nuestro
    if (this.#floorTimeMat) {
      this.#floorTimeMat.dispose();
      this.#floorTimeMat = null;
    }

    const mat = new THREE.ShaderMaterial({
      vertexShader:   floorVert,
      fragmentShader: theme.floorFrag,
      uniforms: {
        uTime: this.#timeUniform,
      },
      transparent: theme.floorBlend,
      depthWrite:  !theme.floorBlend,
      side:        THREE.FrontSide,
    });

    this.#floorMesh.material = mat;
    this.#floorTimeMat       = mat;
  }

  #applyDinoShader(theme) {
    this.#dinoMats.forEach(m => m.dispose());
    this.#dinoMats = [];

    this.#model.traverse((obj) => {
      if (!obj.isMesh) return;

      const origArr = Array.isArray(obj.material) ? obj.material : [obj.material];
      const newMats = origArr.map((orig) => {
        if (!orig) return orig;
        const baseMap = orig.map ?? null;

        const mat = new THREE.ShaderMaterial({
          vertexShader:   dinoVert,
          fragmentShader: theme.fragShader,
          uniforms: {
            uRD:     { value: this.#rdSim.rdTexture },
            uBase:   { value: baseMap },
            uTime:   this.#timeUniform,
            uHasBase:{ value: baseMap ? 1.0 : 0.0 },
          },
          defines: { USE_SKINNING: '' },
        });

        this.#dinoMats.push(mat);
        return mat;
      });

      obj.material = Array.isArray(obj.material) ? newMats : newMats[0];
    });
  }

  update(dt) {
    if (!this.#currentTheme) return;
    this.#timeUniform.value += dt;

    this.#rdSim.step(8);

    const newTex = this.#rdSim.rdTexture;
    this.#dinoMats.forEach(m => {
      if (m.uniforms?.uRD) m.uniforms.uRD.value = newTex;
    });
  }

  get currentThemeId() { return this.#currentTheme?.id ?? null; }
}