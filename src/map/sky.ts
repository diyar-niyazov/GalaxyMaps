/**
 * Background sky: an equirectangular panorama in ICRF/J2000 celestial coordinates (NASA SVS
 * Deep Star Maps 2020) on a sphere seen from its centre, rendered in its own scene so it only
 * rotates with the view and never translates (no parallax, never mixed with catalog geometry).
 */
import * as THREE from "three";
import type { Mat3 } from "../lib/vec";

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

// RA = 0 is the image centre and RA increases to the left; Dec = +90° is the top row.
const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  varying vec3 vDir;
  const float PI = 3.141592653589793;
  void main() {
    vec3 d = normalize(vDir);
    float ra = atan(d.y, d.x);
    float dec = asin(clamp(d.z, -1.0, 1.0));
    vec2 uv = vec2(fract(0.5 - ra / (2.0 * PI)), 0.5 + dec / PI);
    vec3 c = texture2D(uMap, uv).rgb;
    gl_FragColor = vec4(c * uOpacity, 1.0);
    #include <colorspace_fragment>
  }
`;

export class SkySphere {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
  private mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  loaded = false;
  private disposed = false;

  constructor(url: string, onLoad: () => void) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uMap: { value: null }, uOpacity: { value: 0 } },
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(5, 96, 48), this.mat);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    new THREE.TextureLoader().load(url, (t) => {
      if (this.disposed) { t.dispose(); return; }
      t.colorSpace = THREE.SRGBColorSpace;
      // No mipmaps: the RA wrap is a texture-coordinate discontinuity, and mip selection there would draw a seam.
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.wrapS = THREE.RepeatWrapping;
      this.mat.uniforms.uMap.value = t;
      this.loaded = true;
      onLoad();
    });
  }

  /** Orient so an ICRF direction v appears where the map's view matrix m sends it. */
  update(m: Mat3, aspect: number, opacity: number) {
    const e = new THREE.Matrix4().set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
    this.mesh.matrix.copy(e);
    this.mesh.matrixWorldNeedsUpdate = true;
    if (this.camera.aspect !== aspect) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    this.mat.uniforms.uOpacity.value = opacity;
  }

  dispose() {
    this.disposed = true;
    (this.mat.uniforms.uMap.value as THREE.Texture | null)?.dispose();
    this.mat.dispose();
    this.mesh.geometry.dispose();
  }
}
