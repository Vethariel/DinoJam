import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { MAP_DEPTH_FOG, MAP_DEPTH_FOG_GLSL } from './mapDepthFog.js';

const MAP_SKY_STORM_COLOR = new THREE.Color(0xa97743);
const MAP_FLOOR_STORM_COLOR = new THREE.Color(0xdbc5ad);
const BW_BEAT_SECONDS = 60 / 161.5;

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
  varying float vViewDepth;

  void main(){
    #include <uv_vertex>
    #include <skinbase_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    #include <project_vertex>
    vUv       = uv;
    vNormal   = normalize(normalMatrix * normal);
    vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
    vec4 viewPos = viewMatrix * modelMatrix * vec4(transformed, 1.0);
    vViewDepth = -viewPos.z;
  }
`;

const rdLineMaskGLSL = /* glsl */`
  float rdLineMask(float v){
    // Mantiene trazos finos pero evita desaparecer cuando el rango de V baja.
    float x = clamp(v * 5.0, 0.0, 1.0);
    return x * x * x;
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
  uniform float     uHue;
  uniform float     uKick;
  uniform float     uHasBase;
  varying vec2 vUv;
  varying vec3 vNormal;

  ${rdLineMaskGLSL}

  vec3 hsl2rgb(float h, float s, float l){
    vec3 rgb = clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0, 0.0, 1.0);
    return l + s*(rgb-0.5)*(1.0-abs(2.0*l-1.0));
  }

  void main(){
    vec2 rd = texture2D(uRD, vUv).rg;
    float kick = clamp(uKick, 0.0, 1.0);
    float hue = fract(uHue);

    // Mantener dino oscuro, pero recuperar lectura del patrón RD.
    float lines = rdLineMask(rd.g);
    float linesWide = smoothstep(0.12, 0.42, rd.g);
    float pattern = clamp(lines + linesWide * kick * 0.75, 0.0, 1.0);

    vec3 patternCol = hsl2rgb(hue, 0.92, 0.52);
    vec3 base = vec3(0.005);
    vec3 color = mix(base, patternCol, pattern * (0.72 + kick * 0.38));

    // Contorno/emisión muy sutil para conservar sensación neon sin perder oscuridad.
    color += patternCol * pattern * (0.22 + kick * 0.36);

    float diff = max(dot(vNormal, normalize(vec3(1.0,2.0,1.0))), 0.0) * 0.3 + 0.7;
    color *= diff;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const neonSkyVert = /* glsl */`
  varying vec3 vLocalPos;
  void main(){
    vLocalPos = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const neonSkyFrag = /* glsl */`
  precision highp float;
  uniform float uTime;
  uniform float uHue;
  uniform float uKick;
  varying vec3 vLocalPos;

  vec3 hsl2rgb(float h, float s, float l){
    vec3 rgb = clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0, 0.0, 1.0);
    return l + s*(rgb-0.5)*(1.0-abs(2.0*l-1.0));
  }

  void main(){
    float baseHue = fract(uHue + 0.5);
    vec3 flatCol = hsl2rgb(baseHue, 0.28, 0.08);
    gl_FragColor = vec4(flatCol, 1.0);
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
  varying float vViewDepth;

  ${rdLineMaskGLSL}
  ${MAP_DEPTH_FOG_GLSL}

  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5); }
  float noise(vec2 p){
    vec2 i=floor(p); vec2 f=fract(p);
    float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
    vec2 u=f*f*(3.-2.*f);
    return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
  }

  void main(){
    vec2  rd      = texture2D(uRD, vUv).rg;
    float lines   = rdLineMask(rd.g);

    vec3  origTex = uHasBase > 0.5 ? texture2D(uBase, vUv).rgb : vec3(0.6,0.5,0.35);

    float lum     = dot(origTex, vec3(0.299,0.587,0.114));
    vec3  paperLo = vec3(0.58, 0.44, 0.28);
    vec3  paperHi = vec3(0.92, 0.83, 0.64);
    vec3  paper   = mix(paperLo, paperHi, clamp(lum * 1.08 + 0.10, 0.0, 1.0));
    float grain   = noise(vUv * 55.0 + vec2(0.0, uTime * 0.02)) * 0.05;
    float stain   = noise(vUv * 8.0 + vec2(3.2, -2.4)) * 0.18;
    paper *= 0.92 + grain - stain * 0.16;

    vec3  ink     = vec3(0.24, 0.14, 0.06);
    float pulse   = 0.90 + 0.08 * sin(uTime * 0.8);
    float fade    = 0.80 + noise(vUv * 6.0 + vec2(uTime * 0.05, -uTime * 0.03)) * 0.20;
    float mask    = clamp(lines * pulse * fade, 0.0, 1.0);
    float etch    = smoothstep(0.67, 0.95, noise(vUv * 130.0 + vec2(uTime * 0.13, 1.7))) * (1.0 - mask) * 0.10;
    vec3  color   = mix(paper, ink, mask * 0.80 + etch);

    float diff    = max(dot(vNormal, normalize(vec3(0.15, 1.0, 0.15))), 0.0);
    color *= 0.64 + diff * 0.44;

    // Guardrail de contraste para que no vuelva a "desaparecer" contra niebla/fondo.
    vec3 mapBg = vec3(0.9098, 0.8510, 0.7333);
    if (length(color - mapBg) < 0.20) {
      color = mix(color, vec3(0.18, 0.10, 0.04), 0.65);
    }

    float df = depthFogFactor();
    float fogPulse = 0.90 + 0.10 * sin(uTime * 0.8 + 0.7);
    vec3 fogTint = mix(paperLo, paperHi, 0.72);
    fogTint = mix(fogTint, vec3(0.77, 0.63, 0.42), 0.30 * fogPulse);
    color = mix(color, fogTint, df);
    gl_FragColor  = vec4(color, 1.0);
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
  uniform float     uCycle;
  varying vec2 vUv;
  varying vec3 vNormal;

  ${rdLineMaskGLSL}

  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5); }
  float noise(vec2 p){
    vec2 i=floor(p); vec2 f=fract(p);
    float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
    vec2 u=f*f*(3.-2.*f);
    return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
  }

  void main(){
    vec2  rd      = texture2D(uRD, vUv).rg;
    float linesSoft = rdLineMask(rd.g);
    float lines = smoothstep(0.20, 0.85, linesSoft);

    // Monocromo puro (sin influencia de mapa/base texture).
    float grain = (noise(vUv * 160.0 + vec2(uTime * 0.45, uTime * 0.16)) - 0.5) * 0.008;
    vec3 baseDark = vec3(0.01 + grain);
    vec3 baseLight = vec3(0.99 + grain);

    float switch01 = clamp(uCycle, 0.0, 1.0);
    vec3 darkInkMode  = mix(baseDark, vec3(1.0), lines * 0.96);
    vec3 lightInkMode = mix(baseLight, vec3(0.0), lines * 0.96);
    vec3 color = mix(darkInkMode, lightInkMode, switch01);

    float vignette = smoothstep(0.98, 0.12, length(vUv - 0.5));
    color *= mix(0.86, 1.0, vignette);

    gl_FragColor  = vec4(color, 1.0);
  }
`;

// ═══════════════════════════════════════════════════════════
//  FLOOR SHADERS
// ═══════════════════════════════════════════════════════════

// Vertex para todos los suelos (sin skinning)
const floorVert = /* glsl */`
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying float vViewDepth;
  void main(){
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position,1.0);
    vWorldPos = wp.xyz;
    vec4 viewPos = viewMatrix * wp;
    vViewDepth = -viewPos.z;
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

// ── Suelo MAPA ANTIGUO: pergamino/cartografía procedural ───
const floorMapFrag = /* glsl */`
  precision highp float;
  uniform float uTime;
  uniform vec3  uFloorFogColor;
  varying vec2  vUv;
  varying vec3  vWorldPos;
  varying float vViewDepth;

  ${MAP_DEPTH_FOG_GLSL}

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
    vec2 uv = vUv;
    vec2 p = (uv - 0.5) * vec2(2.8, 1.55);
    vec2 nUv = uv * 3.4 + vec2(2.1, -0.7);

    float fiber = fbm(nUv * 1.1);
    float grain = noise(nUv * 8.5) * 0.08 + noise(nUv * 18.0) * 0.04;
    float stain = fbm(nUv * 0.85 + vec2(6.3, 3.7));

    vec3 paperHi = vec3(0.97, 0.92, 0.80);
    vec3 paperLo = vec3(0.84, 0.71, 0.53);
    vec3 col = mix(paperLo, paperHi, clamp(fiber * 1.12 + 0.06, 0.0, 1.0));
    col *= 0.96 + grain - stain * 0.12;

    // Continentes más pequeños y con contraste moderado.
    float massA = smoothstep(0.50, 0.64, fbm(p * vec2(3.6, 4.6) + vec2(1.1, 0.4)));
    float massB = smoothstep(0.52, 0.66, fbm(p * vec2(4.4, 3.4) + vec2(-2.3, 1.5)));
    float massC = smoothstep(0.51, 0.65, fbm(p * vec2(4.0, 4.1) + vec2(2.6, -0.9)));
    float land = clamp(massA * 0.45 + massB * 0.50 + massC * 0.42, 0.0, 1.0);
    land *= smoothstep(1.70, 0.40, length(p));
    vec3 landCol = vec3(0.75, 0.62, 0.43);
    col = mix(col, landCol, land * 0.72);

    float edge = smoothstep(0.40, 0.95, length(vUv - 0.5) * 1.55);
    // EXTREMO: mezcla al color de cielo mucho antes para borrar cualquier banda.
    float farDepthFade = smoothstep(uDepthFogNear * 0.45, uDepthFogFar * 0.82, vViewDepth);
    col = mix(col, vec3(0.71, 0.58, 0.42), edge * 0.015 * (1.0 - farDepthFade));

    // Ruta única de mezcla piso->cielo para evitar bandas por blends superpuestos.
    float df = depthFogFactor();
    float floorToSky = smoothstep(0.28, 0.92, df);
    col = mix(col, uFloorFogColor, floorToSky);
    // Lock final en tramo lejano.
    col = mix(col, uFloorFogColor, farDepthFade);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ── Suelo B&W: negro puro con fade suave ───────────────────
const floorBWFrag = /* glsl */`
  precision highp float;
  uniform float uCycle;
  varying vec2 vUv;

  void main(){
    vec3 col = mix(vec3(0.0), vec3(1.0), uCycle);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ── Fog volumétrico shader para tormenta de arena (tema map) ──
const stormFogVert = /* glsl */`
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const stormFogFrag = /* glsl */`
  precision highp float;
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3  uColor;
  uniform vec3  uCamPos;
  varying vec3 vWorldPos;

  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5); }
  float dither(vec2 p){
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
  }
  float noise(vec2 p){
    vec2 i=floor(p); vec2 f=fract(p);
    float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
    vec2 u=f*f*(3.-2.*f);
    return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
  }

  void main() {
    vec2 p = vWorldPos.xz * 0.06;
    float n1 = noise(p + vec2(uTime * 0.45, -uTime * 0.18));
    float n2 = noise(p * 2.4 + vec2(-uTime * 0.7, uTime * 0.35));
    float cloud = n1 * 0.65 + n2 * 0.35;

    float h = clamp((vWorldPos.y - 0.2) / 72.0, 0.0, 1.0);
    float heightMask = 1.0 - smoothstep(0.82, 1.0, h);

    float dist = distance(vWorldPos.xz, uCamPos.xz);
    float distMask = smoothstep(18.0, 120.0, dist);

    float density = (0.10 + cloud * 0.55) * heightMask * distMask;
    float alpha = density * (0.45 + uIntensity * 0.95);
    float screenJitter = (dither(gl_FragCoord.xy + vec2(uTime * 13.7, -uTime * 9.1)) - 0.5) * 0.11;
    alpha += screenJitter;

    gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 0.52));
  }
`;

// Capa cercana de vetas de arena rápida (streaks) para tormenta intensa.
const stormStreakFrag = /* glsl */`
  precision highp float;
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3  uColor;
  varying vec3 vWorldPos;

  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5); }
  float dither(vec2 p){
    return fract(sin(dot(p, vec2(91.345, 37.891))) * 24634.6345);
  }
  float noise(vec2 p){
    vec2 i=floor(p); vec2 f=fract(p);
    float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
    vec2 u=f*f*(3.-2.*f);
    return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
  }

  void main() {
    vec2 base = vWorldPos.xz * vec2(0.19, 0.33);
    vec2 warp = vec2(
      noise(base * 0.93 + vec2(uTime * 2.9, -uTime * 0.8)),
      noise(base * 1.17 + vec2(-uTime * 2.1, uTime * 1.0))
    ) - 0.5;
    vec2 p = base + warp * 1.15;

    // Wisps irregulares en lugar de líneas periódicas visibles.
    float plumeA = smoothstep(0.60, 0.91, noise(p * vec2(1.5, 2.4) + vec2(uTime * 3.9, -uTime * 1.6)));
    float plumeB = smoothstep(0.64, 0.94, noise(p * vec2(2.2, 1.6) + vec2(-uTime * 5.4, uTime * 0.9)));
    float plumeC = smoothstep(0.66, 0.95, noise((p.yx + 1.7) * vec2(1.3, 2.1) + vec2(uTime * 2.2, -uTime * 3.1)));
    float fleck  = smoothstep(0.84, 0.985, noise(p * 4.6 + vec2(uTime * 6.6, 3.4)));

    float h = clamp((vWorldPos.y - 0.2) / 18.0, 0.0, 1.0);
    float nearMask = 1.0 - smoothstep(0.55, 1.0, h);

    float wisp = plumeA * 0.44 + plumeB * 0.33 + plumeC * 0.23;
    float a = (wisp * 0.72 + fleck * 0.15) * nearMask * (0.05 + uIntensity * 0.24);
    a += (dither(gl_FragCoord.xy + vec2(uTime * 21.0, uTime * 11.0)) - 0.5) * 0.085;
    gl_FragColor = vec4(uColor, clamp(a, 0.0, 0.34));
  }
`;

// Arbustos secos (tema map): shader liviano con fog por profundidad y sway.
const shrubVert = /* glsl */`
  uniform float uTime;
  uniform float uMotion;
  varying vec3 vNormalW;
  varying float vViewDepth;
  varying vec3 vWorldPos;
  varying vec2 vRdUv;

  void main() {
    vec3 p = position;
    float sway = sin(uTime * 2.2 + p.y * 9.0 + p.x * 6.0) * 0.08 * uMotion;
    p.x += sway * smoothstep(0.08, 0.52, p.y);
    p.z += sway * 0.65 * smoothstep(0.08, 0.52, p.y);

    vec4 localPos = instanceMatrix * vec4(p, 1.0);
    vec4 worldPos = modelMatrix * localPos;
    vWorldPos = worldPos.xyz;
    vRdUv = worldPos.xz * 0.022 + vec2(0.5);

    mat3 nMat = mat3(modelMatrix) * mat3(instanceMatrix);
    vNormalW = normalize(nMat * normal);

    vec4 viewPos = viewMatrix * worldPos;
    vViewDepth = -viewPos.z;
    gl_Position = projectionMatrix * viewPos;
  }
`;

const shrubFrag = /* glsl */`
  precision highp float;
  uniform float uTime;
  uniform sampler2D uRD;
  uniform vec3 uColorLo;
  uniform vec3 uColorHi;
  varying vec3 vNormalW;
  varying float vViewDepth;
  varying vec3 vWorldPos;
  varying vec2 vRdUv;

  ${rdLineMaskGLSL}
  ${MAP_DEPTH_FOG_GLSL}

  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5); }
  float noise(vec2 p){
    vec2 i=floor(p); vec2 f=fract(p);
    float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
    vec2 u=f*f*(3.-2.*f);
    return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
  }

  void main() {
    float n = noise(vWorldPos.xz * 0.55 + vec2(uTime * 0.04, -uTime * 0.03));
    vec3 base = mix(uColorLo, uColorHi, n);
    vec2 rdUv = fract(vRdUv + vec2(uTime * 0.010, -uTime * 0.008));
    float rdLines = rdLineMask(texture2D(uRD, rdUv).g);
    base = mix(base * 0.86, base * 1.15, rdLines * 0.72);
    float top = smoothstep(0.0, 1.0, clamp(vWorldPos.y * 1.2, 0.0, 1.0));
    base = mix(base, base * 1.12, top * 0.35);

    vec3 L = normalize(vec3(0.25, 1.0, 0.12));
    float diff = max(dot(normalize(vNormalW), L), 0.0);
    vec3 col = base * (0.55 + diff * 0.65);

    float df = depthFogFactor();
    // Niebla más contundente para igualar lectura con el dino/fondo.
    float fogAmt = clamp(0.22 * uDepthFogEnabled + pow(df, 0.55) * 1.20, 0.0, 1.0);
    col = mix(col, uDepthFogColor, fogAmt);
    float alpha = clamp(1.0 - fogAmt * 0.68, 0.20, 1.0);
    gl_FragColor = vec4(col, alpha);
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
      background: new THREE.Color(0xe8d9bb),
      fog:        null,
    },
    lights: {
      ambient:  { color: 0x9f7a43, intensity: 0.55 },
      key:      { color: 0xffefc4, intensity: 2.2, position: [0.8, 13.5, 0.6] },
      fill:     { color: 0xc18c52, intensity: 0.42, position: [-6.0, 3.0, -5.0] },
      rim:      { color: 0xe4b882, intensity: 0.46, position: [4.0, 4.0, -6.5] },
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
      background: new THREE.Color(0xffffff),
      fog:        new THREE.Fog(0xffffff, 20, 60),
    },
    lights: {
      ambient:  { color: 0x000000, intensity: 0.0 },
      key:      { color: 0x000000, intensity: 0.0, position: [0.2, 11.0, 0.3] },
      fill:     { color: 0x000000, intensity: 0.0, position: [-4.6, 3.2, -4.2] },
      rim:      { color: 0x000000, intensity: 0.0, position: [3.4, 4.6, -5.8] },
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
  #bwCycleUniform = { value: 0 };
  #floorTimeMat = null;   // ShaderMaterial del suelo (para uTime)
  #neonReflector = null;  // Reflector real para piso neon (sin grid)
  #neonSkyDome = null;    // Domo procedural para "lava lamp" sutil en cielo neon
  #shadowFloor = null;    // Receptor de sombra para suelos con shader custom
  #sandStorm = null;      // Partículas de arena ambiental (tema map)
  #sandVel = null;        // Velocidades por partícula (x,y,z)
  #sandPhase = null;      // Fase por partícula (turbulencia)
  #stormFog = null;       // Volumen de niebla shader para tormenta de arena
  #stormStreaks = null;   // Capa cercana de vetas rápidas de arena
  #mapShrubs = null;      // Arbustos secos sencillos para lectura de profundidad en map
  #mapShrubMesh = null;
  #mapShrubX = null;
  #mapShrubZ = null;
  #mapShrubVelX = null;
  #mapShrubVelZ = null;
  #mapShrubYaw = null;
  #mapShrubTiltX = null;
  #mapShrubTiltZ = null;
  #mapShrubScale = null;
  #mapShrubDummy = new THREE.Object3D();
  #mapShrubTimeUniform = { value: 0 };
  #mapShrubMotionUniform = { value: 0 };
  #activeAnimName = '';
  #camera = null;
  #depthFogEnabledUniform = { value: MAP_DEPTH_FOG.enabled ? 1.0 : 0.0 };
  #depthFogNearUniform = { value: MAP_DEPTH_FOG.near };
  #depthFogFarUniform = { value: MAP_DEPTH_FOG.far };
  #depthFogColorUniform = { value: new THREE.Color(...MAP_DEPTH_FOG.color) };
  #floorFogColorUniform = { value: new THREE.Color(...MAP_DEPTH_FOG.color) };
  #neonBaseHue = 0.08;
  #neonHue = this.#neonBaseHue;
  #neonFromHue = this.#neonHue;
  #neonToHue = this.#neonHue;
  #neonTransitionTime = 0.0;
  #neonTransitionDuration = 0.0;
  #neonKickTransitionSec = 0.014;
  #neonKickPulse = 0;
  #neonHueUniform = { value: this.#neonHue };
  #neonKickUniform = { value: 0.0 };
  #neonComplementPhase = this.#neonBaseHue;
  #neonComplementFlip = false;
  #neonHueAdvancePerKick = 0.042;
  #bwIsWhite = false;
  #bwFromCycle = 0.0;
  #bwToCycle = 0.0;
  #bwTransitionTime = 0.0;
  #bwTransitionDuration = 0.0;
  #bwMainTransitionSec = 0.08;
  #bwSecondaryTransitionSec = this.#bwMainTransitionSec * 0.5;
  #bwKickPulse = 0;

  init(scene, model, floorMesh, gridHelper, lights, rdSim, camera) {
    this.#scene      = scene;
    this.#model      = model;
    this.#floorMesh  = floorMesh;
    this.#gridHelper = gridHelper;
    this.#lights     = lights;
    this.#rdSim      = rdSim;
    this.#camera     = camera;
    this.#ensureNeonReflector();
    this.#ensureNeonSkyDome();
    this.#ensureShadowFloor();
    this.#ensureSandStorm();
    this.#ensureStormFog();
    this.#ensureStormStreaks();
    this.#ensureMapShrubs();
  }

  apply(id) {
    const theme = THEMES[id];
    if (!theme) return;
    this.#currentTheme = theme;
    const mapActive = theme.id === 'map';
    if (theme.id === 'neon') {
      // No reiniciar la fase: conserva continuidad cromática entre entradas/salidas de neon.
      this.#neonHue = this.#neonToHue;
      this.#neonFromHue = this.#neonHue;
      this.#neonToHue = this.#neonHue;
      this.#neonTransitionTime = 0.0;
      this.#neonTransitionDuration = this.#neonKickTransitionSec;
      this.#neonHueUniform.value = this.#neonHue;
      this.#neonKickUniform.value = 0.0;
    } else if (theme.id === 'bw') {
      this.#bwIsWhite = false;
      this.#bwFromCycle = 0.0;
      this.#bwToCycle = 0.0;
      this.#bwTransitionTime = 0.0;
      this.#bwTransitionDuration = this.#bwMainTransitionSec;
      this.#bwCycleUniform.value = 0.0;
      this.#bwKickPulse = 0;
    }

    // 1. Escena + fog
    this.#scene.background = theme.scene.background;
    this.#scene.fog        = theme.scene.fog;
    if (theme.id === 'neon') {
      // Fondo plano oscuro.
      this.#scene.background = new THREE.Color(0x000000);
      this.#scene.fog = null;
    }
    if (mapActive && MAP_DEPTH_FOG.enabled) {
      // En modo depth-fog, el cielo usa el mismo tono para evitar "línea de horizonte".
      this.#scene.background = new THREE.Color(...MAP_DEPTH_FOG.color);
      this.#scene.fog = null;
    }

    // 2. Suelo
    this.#applyFloorByTheme(theme);

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
      if (Array.isArray(L.key.position)) {
        this.#lights.key.position.set(...L.key.position);
      }
      this.#lights.key.castShadow = this.#currentTheme.id !== 'neon';
      this.#lights.key.shadow.bias = -0.00018;
    }
    if (this.#lights.fill) {
      this.#lights.fill.color.setHex(L.fill.color);
      this.#lights.fill.intensity = L.fill.intensity;
      if (Array.isArray(L.fill.position)) {
        this.#lights.fill.position.set(...L.fill.position);
      }
    }
    if (this.#lights.rim) {
      this.#lights.rim.color.setHex(L.rim.color);
      this.#lights.rim.intensity = L.rim.intensity;
      if (Array.isArray(L.rim.position)) {
        this.#lights.rim.position.set(...L.rim.position);
      }
    }

    // 5. RD
    // Mantener un único estado de simulación entre temas para evitar reinicios
    // y conservar un patrón visual consistente al cambiar de look.

    // 6. Materiales dino
    this.#applyDinoShader(theme);
  }

  #ensureNeonReflector() {
    if (this.#neonReflector || !this.#scene || !this.#floorMesh) return;

    const reflector = new Reflector(this.#floorMesh.geometry.clone(), {
      clipBias: 0.0025,
      textureWidth: 1024,
      textureHeight: 1024,
      // En Reflector, color = 0.5 gris mantiene el reflejo neutro (sin tinte).
      color: 0x808080,
    });

    reflector.rotation.copy(this.#floorMesh.rotation);
    reflector.position.copy(this.#floorMesh.position);
    reflector.visible = false;

    // Acabado oscuro y espejado estilo "black mirror".
    reflector.material.transparent = true;
    reflector.material.opacity = 0.74;
    reflector.material.depthWrite = false;
    // El render target del reflector ya viene transformado; evita doble tone mapping.
    reflector.material.toneMapped = false;

    this.#scene.add(reflector);
    this.#neonReflector = reflector;
  }

  #ensureNeonSkyDome() {
    if (this.#neonSkyDome || !this.#scene) return;
    const mat = new THREE.ShaderMaterial({
      vertexShader: neonSkyVert,
      fragmentShader: neonSkyFrag,
      uniforms: {
        uTime: this.#timeUniform,
        uHue: this.#neonHueUniform,
        uKick: this.#neonKickUniform,
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      transparent: false,
      toneMapped: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(240, 48, 32), mat);
    dome.visible = false;
    dome.frustumCulled = false;
    dome.renderOrder = -200;
    this.#scene.add(dome);
    this.#neonSkyDome = dome;
  }

  #applyFloorByTheme(theme) {
    const neonActive = theme.id === 'neon';
    const mapActive = theme.id === 'map';
    const depthOnlyMapFog = mapActive && MAP_DEPTH_FOG.enabled;

    if (this.#neonReflector) {
      this.#neonReflector.visible = neonActive;
    }
    if (this.#neonSkyDome) {
      this.#neonSkyDome.visible = neonActive;
    }

    if (this.#floorMesh) {
      this.#floorMesh.visible = !neonActive;
    }
    if (this.#shadowFloor) {
      this.#shadowFloor.visible = mapActive;
      if (mapActive) {
        this.#shadowFloor.material.color.setHex(0x2a1a0c);
        this.#shadowFloor.material.opacity = 0.42;
      }
    }
    if (this.#sandStorm) {
      this.#sandStorm.visible = mapActive;
    }
    if (this.#stormFog) {
      // Si depth-fog está activo, no usar volumen extra (evita bandas/horizonte).
      this.#stormFog.visible = mapActive && !depthOnlyMapFog;
    }
    if (this.#stormStreaks) {
      // Sin niebla cercana: solo niebla lejana volumétrica.
      this.#stormStreaks.visible = false;
    }
    if (this.#mapShrubs) {
      this.#mapShrubs.visible = mapActive;
    }

    // Solo los temas no-neon usan shader procedural de piso.
    if (!neonActive) {
      this.#applyFloorShader(theme);
    }
  }

  #ensureShadowFloor() {
    if (this.#shadowFloor || !this.#scene || !this.#floorMesh) return;

    const shadowMat = new THREE.ShadowMaterial({
      color: 0x2a1a0c,
      opacity: 0.42,
    });
    shadowMat.depthWrite = false;

    // Receptor local (no plano infinito) para evitar bandas de horizonte por shadow map.
    const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(120, 120, 1, 1), shadowMat);
    shadowPlane.rotation.copy(this.#floorMesh.rotation);
    shadowPlane.position.copy(this.#floorMesh.position);
    shadowPlane.position.y += 0.003;
    shadowPlane.receiveShadow = true;
    shadowPlane.visible = false;

    this.#scene.add(shadowPlane);
    this.#shadowFloor = shadowPlane;
  }

  #ensureMapShrubs() {
    if (this.#mapShrubs || !this.#scene) return;

    const group = new THREE.Group();
    group.visible = false;

    const twigGeo = new THREE.ConeGeometry(0.06, 0.52, 5);
    const twigMat = new THREE.ShaderMaterial({
      vertexShader: shrubVert,
      fragmentShader: shrubFrag,
      uniforms: {
        uTime: this.#mapShrubTimeUniform,
        uMotion: this.#mapShrubMotionUniform,
        uRD: { value: this.#rdSim?.rdTexture ?? null },
        uColorLo: { value: new THREE.Color(0x5f4125) },
        uColorHi: { value: new THREE.Color(0x8b6237) },
        uDepthFogEnabled: this.#depthFogEnabledUniform,
        uDepthFogNear: this.#depthFogNearUniform,
        uDepthFogFar: this.#depthFogFarUniform,
        uDepthFogColor: this.#depthFogColorUniform,
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const instances = 280;
    const twigs = new THREE.InstancedMesh(twigGeo, twigMat, instances);
    twigs.castShadow = false;
    twigs.receiveShadow = false;

    this.#mapShrubX = new Float32Array(instances);
    this.#mapShrubZ = new Float32Array(instances);
    this.#mapShrubVelX = new Float32Array(instances);
    this.#mapShrubVelZ = new Float32Array(instances);
    this.#mapShrubYaw = new Float32Array(instances);
    this.#mapShrubTiltX = new Float32Array(instances);
    this.#mapShrubTiltZ = new Float32Array(instances);
    this.#mapShrubScale = new Float32Array(instances);

    const dummy = this.#mapShrubDummy;
    for (let i = 0; i < instances; i++) {
      // Distribución radial amplia (evita saturar el centro del dino).
      const angle = Math.random() * Math.PI * 2;
      const radius = 4.5 + Math.pow(Math.random(), 0.72) * 72.0;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = 0.03;
      const tiltX = -0.18 + Math.random() * 0.30;
      const tiltZ = -0.18 + Math.random() * 0.30;
      const yaw = Math.random() * Math.PI * 2;
      const s = 0.65 + Math.random() * 1.05;

      this.#mapShrubX[i] = x;
      this.#mapShrubZ[i] = z;
      this.#mapShrubVelX[i] = 2.6 + Math.random() * 2.2;
      this.#mapShrubVelZ[i] = -1.6 + Math.random() * 0.9;
      this.#mapShrubYaw[i] = yaw;
      this.#mapShrubTiltX[i] = tiltX;
      this.#mapShrubTiltZ[i] = tiltZ;
      this.#mapShrubScale[i] = s;

      dummy.position.set(x, y, z);
      dummy.rotation.set(tiltX, yaw, tiltZ);
      dummy.scale.set(0.7 + Math.random() * 0.8, s, 0.7 + Math.random() * 0.8);
      dummy.updateMatrix();
      twigs.setMatrixAt(i, dummy.matrix);
    }
    twigs.instanceMatrix.needsUpdate = true;
    group.add(twigs);

    this.#scene.add(group);
    this.#mapShrubs = group;
    this.#mapShrubMesh = twigs;
  }

  #ensureSandStorm() {
    if (this.#sandStorm || !this.#scene) return;

    const count = 5000;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 140;      // x
      positions[i3 + 1] = 0.8 + Math.random() * 16.5;   // y
      positions[i3 + 2] = (Math.random() - 0.5) * 110;  // z
    }

    this.#sandVel = new Float32Array(count * 3);
    this.#sandPhase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      this.#sandVel[i3] = 6.5 + Math.random() * 7.0;          // viento principal x
      this.#sandVel[i3 + 1] = -0.2 + Math.random() * 0.4;     // deriva vertical leve
      this.#sandVel[i3 + 2] = -4.2 + Math.random() * 2.4;     // viento lateral z
      this.#sandPhase[i] = Math.random() * Math.PI * 2;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0x8f6230,
      size: 0.11,
      transparent: true,
      opacity: 0.20,
      depthWrite: false,
      depthTest: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geom, mat);
    points.visible = false;
    points.frustumCulled = false;
    points.renderOrder = 10;
    this.#scene.add(points);
    this.#sandStorm = points;
  }

  #ensureStormFog() {
    if (this.#stormFog || !this.#scene) return;

    const mat = new THREE.ShaderMaterial({
      vertexShader: stormFogVert,
      fragmentShader: stormFogFrag,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0.5 },
        uColor: { value: new THREE.Color(0xd2b481) },
        uCamPos: { value: new THREE.Vector3() },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(220, 180, 200), mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    this.#scene.add(mesh);
    this.#stormFog = mesh;
  }

  #ensureStormStreaks() {
    if (this.#stormStreaks || !this.#scene) return;

    const mat = new THREE.ShaderMaterial({
      vertexShader: stormFogVert,
      fragmentShader: stormStreakFrag,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0.5 },
        uColor: { value: new THREE.Color(0xd8bc86) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(90, 24, 70), mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    this.#scene.add(mesh);
    this.#stormStreaks = mesh;
  }

  #updateSandStorm(dt) {
    if (!this.#sandStorm || !this.#sandVel || !this.#sandPhase) return;
    const attr = this.#sandStorm.geometry.getAttribute('position');
    const p = attr.array;
    const t = this.#timeUniform.value * 2.0;
    const vel = this.#sandVel;
    const phase = this.#sandPhase;
    const windBoost = 1.0 + 0.55 * Math.max(Math.sin(t * 1.0 + 0.8), 0.0);

    for (let i = 0; i < p.length; i += 3) {
      const idx = i / 3;
      const i3 = i;

      // Viento no uniforme por partícula.
      p[i3] += dt * vel[i3] * windBoost;
      p[i3 + 2] += dt * vel[i3 + 2] * windBoost;
      p[i3 + 1] += dt * vel[i3 + 1];

      // Turbulencia tridimensional con fase propia (evita líneas paralelas).
      const ph = phase[idx];
      p[i3 + 1] += Math.sin(t * 3.0 + ph + p[i3] * 0.02) * dt * 0.85;
      p[i3] += Math.cos(t * 1.7 + ph + p[i3 + 2] * 0.015) * dt * 0.40;
      p[i3 + 2] += Math.sin(t * 2.2 + ph * 1.3 + p[i3] * 0.01) * dt * 0.30;

      // Respawn aleatorio cuando sale del volumen (no wrap directo -> menos banding).
      if (p[i3] > 78 || p[i3 + 2] < -64 || p[i3 + 1] < 0.4 || p[i3 + 1] > 19.5) {
        p[i3] = -78 - Math.random() * 8.0;
        p[i3 + 1] = 0.7 + Math.random() * 16.8;
        p[i3 + 2] = (Math.random() - 0.5) * 122.0;

        vel[i3] = 6.5 + Math.random() * 7.5;
        vel[i3 + 1] = -0.25 + Math.random() * 0.5;
        vel[i3 + 2] = -4.5 + Math.random() * 2.8;
        phase[idx] = Math.random() * Math.PI * 2;
      }
    }

    attr.needsUpdate = true;
  }

  #updateMapStormFog() {
    if (!this.#currentTheme || this.#currentTheme.id !== 'map') return;

    const t = this.#timeUniform.value;
    // Patrón por beats (doblado): 4 beats build + 2 beats pico + 2 beats caída.
    const beatTime = t / BW_BEAT_SECONDS;
    const phase = ((beatTime % 8) + 8) % 8;
    let intensity = 0.0;
    if (phase < 4.0) {
      // Build (4 beats)
      const a = THREE.MathUtils.smoothstep(phase / 4.0, 0, 1);
      intensity = THREE.MathUtils.lerp(0.30, 0.74, a);
    } else if (phase < 6.0) {
      // Peak (2 beats)
      const p = (phase - 4.0) / 2.0;
      intensity = THREE.MathUtils.lerp(0.82, 0.96, Math.sin(p * Math.PI));
    } else {
      // Decay/Clear (2 beats)
      const d = (phase - 6.0) / 2.0;
      const a = THREE.MathUtils.smoothstep(d, 0, 1);
      intensity = THREE.MathUtils.lerp(0.72, 0.24, a);
    }
    // Micro-oscilación musical (sutil) sin romper el patrón principal.
    intensity = THREE.MathUtils.clamp(intensity + 0.04 * Math.sin(beatTime * Math.PI), 0, 1);
    const skyPulse = 0.5 + 0.5 * Math.sin(t * 0.95 + 0.6);

    // El cielo "se inclina" hacia tonos de tormenta de arena.
    const skyMix = THREE.MathUtils.clamp(intensity * 0.88 + skyPulse * 0.42, 0, 1);
    if (this.#scene.background?.isColor) {
      this.#scene.background
        .setRGB(MAP_DEPTH_FOG.color[0], MAP_DEPTH_FOG.color[1], MAP_DEPTH_FOG.color[2])
        .lerp(MAP_SKY_STORM_COLOR, skyMix);
    }
    // Hace que el shader de profundidad use el mismo color dinámico del cielo.
    this.#depthFogColorUniform.value
      .setRGB(MAP_DEPTH_FOG.color[0], MAP_DEPTH_FOG.color[1], MAP_DEPTH_FOG.color[2])
      .lerp(MAP_SKY_STORM_COLOR, skyMix);
    this.#floorFogColorUniform.value
      .setRGB(MAP_DEPTH_FOG.color[0], MAP_DEPTH_FOG.color[1], MAP_DEPTH_FOG.color[2])
      .lerp(MAP_FLOOR_STORM_COLOR, skyMix);

    // Depth-fog-only: sin niebla global de motor, el shader maneja el fade.
    if (MAP_DEPTH_FOG.enabled) {
      this.#scene.fog = null;
    } else {
      if (!(this.#scene.fog instanceof THREE.FogExp2)) {
        this.#scene.fog = new THREE.FogExp2(0xd8c39b, 0.005);
      }
      this.#scene.fog.color.setHex(0xd8c39b);
      this.#scene.fog.density = THREE.MathUtils.lerp(0.003, 0.008, intensity);
    }

    // Sincroniza densidad percibida del polvo suspendido.
    if (this.#sandStorm?.material) {
      this.#sandStorm.material.opacity = THREE.MathUtils.lerp(0.16, 0.32, intensity);
      this.#sandStorm.material.size = THREE.MathUtils.lerp(0.08, 0.14, intensity);
    }

    // Reduce el impacto de iluminación a medida que la tormenta se vuelve fuerte.
    const mapLights = this.#currentTheme?.lights ?? THEMES.map.lights;
    const ambientMul = THREE.MathUtils.lerp(1.0, 0.55, intensity);
    const keyMul = THREE.MathUtils.lerp(1.0, 0.34, intensity);
    const fillMul = THREE.MathUtils.lerp(1.0, 0.28, intensity);
    const rimMul = THREE.MathUtils.lerp(1.0, 0.32, intensity);
    if (this.#lights.ambient) this.#lights.ambient.intensity = mapLights.ambient.intensity * ambientMul;
    if (this.#lights.key) this.#lights.key.intensity = mapLights.key.intensity * keyMul;
    if (this.#lights.fill) this.#lights.fill.intensity = mapLights.fill.intensity * fillMul;
    if (this.#lights.rim) this.#lights.rim.intensity = mapLights.rim.intensity * rimMul;

    if (this.#stormFog?.material?.uniforms) {
      const u = this.#stormFog.material.uniforms;
      u.uTime.value = t;
      u.uIntensity.value = intensity;
      if (this.#camera) u.uCamPos.value.copy(this.#camera.position);
    }
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
        uCycle: this.#bwCycleUniform,
        uDepthFogEnabled: this.#depthFogEnabledUniform,
        uDepthFogNear: this.#depthFogNearUniform,
        uDepthFogFar: this.#depthFogFarUniform,
        uDepthFogColor: this.#depthFogColorUniform,
        uFloorFogColor: this.#floorFogColorUniform,
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
            uHue:    this.#neonHueUniform,
            uKick:   this.#neonKickUniform,
            uCycle:  this.#bwCycleUniform,
            uHasBase:{ value: baseMap ? 1.0 : 0.0 },
            uDepthFogEnabled: this.#depthFogEnabledUniform,
            uDepthFogNear: this.#depthFogNearUniform,
            uDepthFogFar: this.#depthFogFarUniform,
            uDepthFogColor: this.#depthFogColorUniform,
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
    if (this.#neonSkyDome && this.#camera) {
      // Mantener el domo centrado en cámara evita parallax y "discos" gigantes estáticos.
      this.#neonSkyDome.position.copy(this.#camera.position);
    }

    this.#rdSim.update(dt, 8);

    const newTex = this.#rdSim.rdTexture;
    this.#dinoMats.forEach(m => {
      if (m.uniforms?.uRD) m.uniforms.uRD.value = newTex;
    });
    if (this.#mapShrubMesh?.material?.uniforms?.uRD) {
      this.#mapShrubMesh.material.uniforms.uRD.value = newTex;
    }

    if (this.#currentTheme.id === 'neon') {
      this.#updateNeonLights(dt);
    } else if (this.#currentTheme.id === 'bw') {
      this.#updateBWCycleEnvironment(dt);
    } else if (this.#currentTheme.id === 'map') {
      this.#updateSandStorm(dt);
      this.#updateMapStormFog();
    }

    if (this.#mapShrubs) {
      const runActive = this.#activeAnimName.includes('run');
      const targetMotion = this.#currentTheme.id === 'map' && runActive ? 1.0 : 0.18;
      this.#mapShrubMotionUniform.value = THREE.MathUtils.damp(
        this.#mapShrubMotionUniform.value,
        targetMotion,
        6.0,
        dt
      );
      this.#mapShrubTimeUniform.value += dt * (runActive ? 2.4 : 0.8);

      if (this.#currentTheme.id === 'map' && runActive && this.#mapShrubMesh) {
        const dummy = this.#mapShrubDummy;
        // Movimiento contrario al avance del dino: cabeza -> cola (eje -Z).
        const flowSpeed = 12.0;
        const count = this.#mapShrubX.length;
        for (let i = 0; i < count; i++) {
          this.#mapShrubZ[i] -= dt * flowSpeed;
          this.#mapShrubX[i] += Math.sin(this.#mapShrubTimeUniform.value * 0.9 + i * 0.37) * dt * 0.45;

          // Wrap/teleport al extremo opuesto para mantener densidad en escena.
          if (this.#mapShrubZ[i] < -115) {
            this.#mapShrubZ[i] = 115 + Math.random() * 22.0;
            this.#mapShrubX[i] = (Math.random() - 0.5) * 170.0;
          }

          dummy.position.set(this.#mapShrubX[i], 0.03, this.#mapShrubZ[i]);
          dummy.rotation.set(this.#mapShrubTiltX[i], this.#mapShrubYaw[i], this.#mapShrubTiltZ[i]);
          const s = this.#mapShrubScale[i];
          dummy.scale.set(0.7 + (s - 0.65) * 0.8, s, 0.7 + (s - 0.65) * 0.8);
          dummy.updateMatrix();
          this.#mapShrubMesh.setMatrixAt(i, dummy.matrix);
        }
        this.#mapShrubMesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  triggerSecondaryKick(strength = 1.0) {
    const themeId = this.#currentTheme?.id;
    const clamped = THREE.MathUtils.clamp(strength, 0.2, 1.25);
    if (themeId === 'neon') {
      this.#neonComplementPhase = (this.#neonComplementPhase + this.#neonHueAdvancePerKick) % 1.0;
      this.#neonComplementFlip = !this.#neonComplementFlip;
      this.#neonFromHue = this.#neonHue;
      // Mantiene contraste complementario pero rota la pareja de colores en cada kick.
      this.#neonToHue = this.#neonComplementFlip
        ? this.#neonComplementPhase
        : (this.#neonComplementPhase + 0.5) % 1.0;
      this.#neonTransitionTime = 0.0;
      this.#neonTransitionDuration = this.#neonKickTransitionSec;
      this.#neonKickPulse = Math.max(this.#neonKickPulse, clamped);
      return;
    }
    if (themeId === 'bw') {
      // BW agresivo: cada kick secundario alterna blanco/negro.
      this.#bwIsWhite = !this.#bwIsWhite;
      this.#bwFromCycle = this.#bwCycleUniform.value;
      this.#bwToCycle = this.#bwIsWhite ? 1.0 : 0.0;
      this.#bwTransitionTime = 0.0;
      this.#bwTransitionDuration = this.#bwSecondaryTransitionSec;
      this.#bwKickPulse = Math.max(this.#bwKickPulse, clamped);
    }
  }

  triggerMainKick() {
    if (this.#currentTheme?.id !== 'bw') return;
    // El kick principal marca el inicio del patrón (negro).
    this.#bwIsWhite = false;
    this.#bwFromCycle = this.#bwCycleUniform.value;
    this.#bwToCycle = 0.0;
    this.#bwTransitionTime = 0.0;
    this.#bwTransitionDuration = this.#bwMainTransitionSec;
    this.#bwKickPulse = 1.0;
  }

  #updateNeonLights(dt) {
    this.#neonTransitionTime += dt;
    const d = Math.max(1e-4, this.#neonTransitionDuration);
    const t = Math.min(this.#neonTransitionTime / d, 1.0);
    this.#neonHue = THREE.MathUtils.lerp(this.#neonFromHue, this.#neonToHue, t);
    this.#neonHueUniform.value = this.#neonHue;
    this.#neonKickPulse = THREE.MathUtils.damp(this.#neonKickPulse, 0.0, 12.0, dt);
    this.#neonKickUniform.value = Math.min(1.0, this.#neonKickPulse);
    const hue = this.#neonHue;
    const pulse = 0.76 + this.#neonKickPulse * 0.42;

    if (this.#lights.ambient) {
      this.#lights.ambient.color.setHSL((hue + 0.08) % 1, 0.7, 0.10);
      this.#lights.ambient.intensity = 0.22 + pulse * 0.16;
    }
    if (this.#lights.key) {
      this.#lights.key.color.setHSL(hue, 1.0, 0.56);
      this.#lights.key.intensity = 1.65 + pulse * 0.9;
    }
    if (this.#lights.fill) {
      this.#lights.fill.color.setHSL((hue + 0.18) % 1, 1.0, 0.52);
      this.#lights.fill.intensity = 0.5 + pulse * 0.45;
    }
    if (this.#lights.rim) {
      this.#lights.rim.color.setHSL((hue + 0.58) % 1, 1.0, 0.58);
      this.#lights.rim.intensity = 0.72 + pulse * 0.55;
    }

    const reflectorUniformColor = this.#neonReflector?.material?.uniforms?.color?.value;
    if (reflectorUniformColor?.isColor) {
      // 0.5 es neutro para el blendOverlay del Reflector (sin sesgo cromatico).
      reflectorUniformColor.setRGB(0.5, 0.5, 0.5);
    }
  }

  #updateBWCycleEnvironment(_dt) {
    this.#bwTransitionTime += _dt;
    const dur = Math.max(1e-4, this.#bwTransitionDuration);
    const t = Math.min(this.#bwTransitionTime / dur, 1.0);
    this.#bwCycleUniform.value = THREE.MathUtils.lerp(this.#bwFromCycle, this.#bwToCycle, t);
    this.#bwKickPulse = THREE.MathUtils.damp(this.#bwKickPulse, 0.0, 7.0, _dt);
    const cycle = this.#bwCycleUniform.value;
    const pulseLift = this.#bwKickPulse * 0.08;

    // El entorno cruza suavemente entre blanco y negro.
    const bg = THREE.MathUtils.clamp(1.0 - cycle + pulseLift, 0.0, 1.0);
    if (this.#scene?.background) this.#scene.background.setRGB(bg, bg, bg);
    if (this.#scene?.fog) this.#scene.fog.color.setRGB(bg, bg, bg);
  }

  setAnimationState(name = '') {
    this.#activeAnimName = String(name).toLowerCase();
  }

  get currentThemeId() { return this.#currentTheme?.id ?? null; }
  getNeonHue() { return this.#neonHue; }
}