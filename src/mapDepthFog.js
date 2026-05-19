export const MAP_DEPTH_FOG = {
  // Set to false to fully disable depth fog in map shaders.
  enabled: true,
  near: 2.0,
  far: 42.0,
  color: [0.82, 0.72, 0.58],
};

export const MAP_DEPTH_FOG_GLSL = /* glsl */`
  uniform float uDepthFogEnabled;
  uniform float uDepthFogNear;
  uniform float uDepthFogFar;
  uniform vec3  uDepthFogColor;

  float depthFogFactor(){
    // Jitter suave para romper "línea de horizonte" en planos extensos.
    float jitter = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + uTime * 0.31) * 43758.5453) - 0.5) * 5.0;
    float d = vViewDepth + jitter;
    float f = smoothstep(uDepthFogNear, uDepthFogFar, d);
    f = pow(f, 0.92);
    // Refuerzo específico en rango lejano para eliminar línea de horizonte.
    float farBoost = smoothstep(0.62, 1.0, f) * 0.28;
    f = clamp(f + farBoost, 0.0, 1.0);
    // Nunca llega a blanco total: evita borde duro visual.
    return f * uDepthFogEnabled * 0.96;
  }
`;
