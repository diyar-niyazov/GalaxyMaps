/** Fragment shaders for particle galaxies and clouds, shared by the map and the immersive view. */
export const GALAXY_LIGHT_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vEnergy;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d) * 4.0;
    if (r2 > 1.0) discard;
    gl_FragColor = vec4(vColor * exp(-r2 * 4.0) * vEnergy * uOpacity, 1.0);
  }`;

export const GALAXY_DUST_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying float vEnergy;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d) * 4.0;
    if (r2 > 1.0) discard;
    gl_FragColor = vec4(0.05, 0.03, 0.02, exp(-r2 * 3.0) * 0.32 * vEnergy * uOpacity);
  }`;
