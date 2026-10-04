/**
 * Earth surface shading: daylight map lit by the Sun, city lights on the night side, a cloud
 * layer and a thin atmospheric rim. Textures: Solar System Scope (CC BY 4.0), based on NASA
 * Blue Marble / Black Marble imagery.
 */
import * as THREE from "three";

const VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uClouds;
  uniform vec3 uSunDir;
  uniform float uBoost;
  uniform float uHasNight;
  uniform float uHasClouds;
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vec3 n = normalize(vNormal);
    float ndl = dot(n, uSunDir);
    vec3 day = texture2D(uDay, vUv).rgb;
    float cloud = uHasClouds * texture2D(uClouds, vUv).r;
    float lit = max(ndl, 0.0);
    float dayAmt = smoothstep(-0.1, 0.2, ndl);
    vec3 col = day * (0.015 + 1.1 * lit);
    col = mix(col, vec3(0.95) * (0.02 + 1.05 * lit), cloud * 0.9);
    vec3 night = texture2D(uNight, vUv).rgb * vec3(1.0, 0.82, 0.58);
    col += uHasNight * night * (1.0 - dayAmt) * (1.0 - cloud * 0.8) * 1.6;
    float rim = pow(1.0 - max(n.z, 0.0), 2.6);
    col += vec3(0.28, 0.5, 1.0) * rim * smoothstep(-0.25, 0.35, ndl) * 0.85;
    col = mix(col, day, uBoost);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const HALO_FRAG = /* glsl */ `
  uniform vec3 uSunDir;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vec3 n = normalize(vNormal);
    float edge = 1.0 - abs(n.z);
    float glow = pow(edge, 5.0);
    float lit = smoothstep(-0.35, 0.4, dot(n, uSunDir));
    gl_FragColor = vec4(vec3(0.3, 0.55, 1.0) * glow * lit * uOpacity, 1.0);
    #include <colorspace_fragment>
  }
`;

export interface EarthMaterials {
  surface: THREE.ShaderMaterial;
  halo: THREE.ShaderMaterial;
}

export function createEarthMaterials(quality: "high" | "low", onLoad: () => void): EarthMaterials {
  // A useful blue surface remains visible if a texture cannot be loaded.
  const blank = new THREE.DataTexture(new Uint8Array([36, 83, 128, 255]), 1, 1);
  blank.needsUpdate = true;
  const surface = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uDay: { value: blank }, uNight: { value: blank }, uClouds: { value: blank },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) }, uBoost: { value: 0 }, uHasNight: { value: 0 }, uHasClouds: { value: 0 },
    },
  });
  const halo = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: HALO_FRAG,
    uniforms: { uSunDir: surface.uniforms.uSunDir, uOpacity: { value: 1 } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
  });
  const loader = new THREE.TextureLoader();
  let disposed = false;
  const textures = new Set<THREE.Texture>([blank]);
  surface.addEventListener("dispose", () => {
    disposed = true;
    textures.forEach((t) => t.dispose());
    textures.clear();
  });
  const res = quality === "high" ? "4k" : "2k";
  const load = (file: string, uniform: string, flag?: string) =>
    loader.load(`/textures/${file}`, (t) => {
      if (disposed) { t.dispose(); return; }
      textures.add(t);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      surface.uniforms[uniform].value = t;
      if (flag) surface.uniforms[flag].value = 1;
      onLoad();
    });
  load(`${res}_earth_daymap.jpg`, "uDay");
  load(`${res}_earth_nightmap.jpg`, "uNight", "uHasNight");
  load(`${res}_earth_clouds.jpg`, "uClouds", "uHasClouds");
  return { surface, halo };
}
