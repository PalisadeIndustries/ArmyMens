// Late-afternoon atmosphere: gradient sky dome with sun glow + soft procedural clouds, IBL from the sky,
// warm low sun whose shadow frustum follows the camera (texel-snapped to avoid shimmering), haze fog.
import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(-0.48, 0.46, 0.75).normalize();
const HORIZON = new THREE.Color(0xf3d7ae), ZENITH = new THREE.Color(0x5d8fd0), GROUNDC = new THREE.Color(0x6f7a4c);
export const FOG_COLOR = new THREE.Color(0xe9d4b0);

function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: ZENITH.clone() }, uHorizon: { value: HORIZON.clone() }, uGround: { value: GROUNDC.clone() },
      uSun: { value: SUN_DIR.clone() }, uSunCol: { value: new THREE.Color(1.0, 0.82, 0.55) }, uTime: { value: 0 }, uClouds: { value: 1 },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uHorizon, uGround, uSun, uSunCol; uniform float uTime, uClouds;
      varying vec3 vDir;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
      float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*vn(p); p*=2.07; a*=0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = mix(uHorizon, uTop, pow(clamp(h,0.0,1.0), 0.55));
        c = mix(c, uGround, smoothstep(0.0, -0.12, h));
        float s = max(dot(d, uSun), 0.0);
        c += uSunCol * (pow(s, 900.0) * 6.0 + pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.18);
        if (h > 0.02 && uClouds > 0.5) {
          vec2 uv = d.xz / (h + 0.12) * 1.4 + vec2(uTime * 0.004, uTime * 0.002);
          float n = fbm(uv * 1.3);
          float cl = smoothstep(0.52, 0.78, n) * smoothstep(0.02, 0.25, h);
          vec3 cc = mix(vec3(1.0, 0.93, 0.84), vec3(1.0, 0.85, 0.66), pow(s, 3.0));
          c = mix(c, cc * (0.85 + 0.25 * n), cl * 0.8);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
  });
}

// 'high' on real GPUs, 'low' on software rasterizers (headless tests). Override with ?quality=high|low.
export function detectQuality(renderer) {
  try {
    const q = new URLSearchParams(location.search).get('quality');
    if (q === 'high' || q === 'low') return q;
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    if (/swiftshader|llvmpipe|software/i.test(name)) return 'low';
  } catch (e) { /* ignore */ }
  return 'high';
}

export function createAtmosphere(game, quality = 'high') {
  const { scene, renderer } = game;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = quality === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), skyMaterial());
  if (quality === 'low') sky.material.uniforms.uClouds.value = 0;
  sky.frustumCulled = false; sky.renderOrder = -1000; sky.name = 'sky';
  scene.add(sky);
  scene.background = HORIZON.clone();
  scene.fog = new THREE.FogExp2(FOG_COLOR.clone(), 0.0024);

  // Image-based lighting from the sky (no clouds so it's smooth).
  if (quality !== 'low') try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMaterial());
    envSky.material.uniforms.uClouds.value = 0;
    envScene.add(envSky);
    const rt = pmrem.fromScene(envScene, 0.02);
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
  } catch (e) { console.warn('[world] env map failed', e); }

  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x56663a, quality === 'low' ? 1.25 : 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd7a0, 2.9);
  sun.castShadow = true;
  const S = 58;
  const SM = quality === 'low' ? 1024 : 2048;
  sun.shadow.mapSize.set(SM, SM);
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 420 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun); scene.add(sun.target);

  // basis for texel snapping in light space
  const lz = SUN_DIR.clone().negate();
  const lx = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), lz).normalize();
  const ly = new THREE.Vector3().crossVectors(lz, lx);
  const texel = (2 * S) / SM;
  const tmp = new THREE.Vector3(), fwd = new THREE.Vector3();

  function follow(camera) {
    camera.getWorldDirection(fwd); fwd.y = 0;
    if (fwd.lengthSq() > 1e-6) fwd.normalize();
    tmp.copy(camera.position).addScaledVector(fwd, S * 0.45); tmp.y = 0;
    let a = Math.round(tmp.dot(lx) / texel) * texel, b = Math.round(tmp.dot(ly) / texel) * texel, c = tmp.dot(lz);
    tmp.set(0, 0, 0).addScaledVector(lx, a).addScaledVector(ly, b).addScaledVector(lz, c);
    sun.target.position.copy(tmp);
    sun.position.copy(tmp).addScaledVector(SUN_DIR, 200);
    sun.target.updateMatrixWorld();
    sky.position.copy(camera.position);
  }

  return {
    sky, sun, hemi,
    update(dt, camera) {
      sky.material.uniforms.uTime.value += dt;
      follow(camera);
    },
  };
}
