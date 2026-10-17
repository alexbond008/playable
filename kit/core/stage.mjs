import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { LOOKS, SEMANTIC } from "./looks.mjs";

const ROLES = {
  bench: ["scene.bench", 0.85, 0],
  graphite: ["scene.graphite", 0.8, 0],
  housing: ["scene.housing", 0.55, 0.15],
  clay: ["scene.clay", 0.7, 0],
  ceramic: ["scene.ceramic", 0.6, 0],
  steel: [0xa9adb5, 0.48, 0.85],
  brass: [0xc99a4b, 0.45, 0.8],
  copper: [0xb06a3c, 0.4, 0.8],
  rubber: [0x111214, 0.95, 0],
  carbon: [0x2b2b2e, 0.9, 0],
  magnet: [0x5b5f68, 0.5, 0.3],
  lamination: [0xffffff, 0.5, 0.6],
  insRed: [0x7e3434, 0.6, 0],
  insDark: [0x1a1a1c, 0.6, 0],
  hole: [0x070708, 1, 0],
};

export const isMobile = () => matchMedia("(max-width: 760px)").matches || /Mobi|Android/i.test(navigator.userAgent);
export const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    return null;
  }
}

export function createStage(container, cam = {}) {
  const MOBILE = isMobile();
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.5 : 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  renderer.info.autoReset = false;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.name = "root";
  scene.add(root);

  const camera = new THREE.PerspectiveCamera(cam.fov ?? 32, 1, 0.1, 200);
  camera.position.set(...(cam.position ?? [7.5, 7.2, 12.5]));
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...(cam.target ?? [0, 1, 0]));
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = cam.minDistance ?? 6;
  controls.maxDistance = cam.maxDistance ?? 24;
  controls.minPolarAngle = cam.minPolar ?? 0.35;
  controls.maxPolarAngle = cam.maxPolar ?? 1.38;
  controls.minAzimuthAngle = cam.minAzimuth ?? -1.2;
  controls.maxAzimuthAngle = cam.maxAzimuth ?? 1.3;
  controls.enablePan = false;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const key = new THREE.DirectionalLight(0xffe7cf, 1.5);
  key.position.set(6, 11, 7);
  key.castShadow = true;
  const sm = MOBILE ? 1024 : 2048;
  key.shadow.mapSize.set(sm, sm);
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 7, bottom: -7, near: 1, far: 40 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcd2ff, 0.6);
  rim.position.set(-7, 5, -8);
  scene.add(rim);
  const hemi = new THREE.HemisphereLight(0xdfe6ff, 0x101010, 0.12);
  scene.add(hemi);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 1.05);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const clipPlanes = [];
  const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const materials = new Map();
  const edgeMaterials = [];
  const lookBound = [];
  let look = "bench";

  function mat(role, { clip = false } = {}) {
    const k = role + (clip ? ":clip" : "");
    if (materials.has(k)) return materials.get(k);
    let m;
    if (role === "ink") m = new THREE.MeshBasicMaterial({ color: LOOKS[look].scene.ink });
    else if (role === "accent") m = new THREE.MeshStandardMaterial({ color: SEMANTIC.accent, roughness: 0.45, emissive: SEMANTIC.accent, emissiveIntensity: 0 });
    else if (role === "accentDark") m = new THREE.MeshStandardMaterial({ color: 0xd94a16, roughness: 0.5 });
    else {
      const [c, r, met] = ROLES[role] ?? [role, 0.7, 0];
      const color = typeof c === "string" ? LOOKS[look].scene[c.split(".")[1]] : c;
      m = new THREE.MeshStandardMaterial({ color, roughness: r, metalness: met });
      if (typeof c === "string") lookBound.push([m, c.split(".")[1]]);
    }
    if (role === "ink") lookBound.push([m, "ink"]);
    if (clip) {
      m.clippingPlanes = clipPlanes;
      m.clipShadows = true;
      m.side = THREE.DoubleSide;
    }
    materials.set(k, m);
    return m;
  }

  function edgeMat(clip = false) {
    const k = clip ? 1 : 0;
    if (!edgeMaterials[k]) {
      edgeMaterials[k] = new THREE.LineBasicMaterial({ color: LOOKS[look].edge.color, transparent: true, opacity: LOOKS[look].edge.opacity });
      if (clip) edgeMaterials[k].clippingPlanes = clipPlanes;
    }
    return edgeMaterials[k];
  }

  const glows = new Map();
  function glow(hex, boost = 2) {
    const k = hex + ":" + boost;
    if (!glows.has(k)) glows.set(k, new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(boost), toneMapped: false }));
    return glows.get(k);
  }

  const lookListeners = [];
  function setLook(name) {
    if (!LOOKS[name]) return;
    look = name;
    const L = LOOKS[name];
    scene.background = new THREE.Color(L.scene.bg);
    scene.fog = new THREE.Fog(L.scene.bg, 22, 46);
    for (const [m, token] of lookBound) m.color.setHex(L.scene[token]);
    for (const em of edgeMaterials) if (em) { em.color.setHex(L.edge.color); em.opacity = L.edge.opacity; }
    scene.environmentIntensity = L.light.env;
    key.intensity = L.light.key;
    rim.intensity = L.light.rim;
    hemi.intensity = L.light.hemi;
    renderer.toneMappingExposure = L.light.exposure;
    bloom.strength = L.bloom.strength;
    bloom.threshold = L.bloom.threshold;
    const r = document.documentElement.style;
    for (const [k2, v] of Object.entries(L.css)) if (k2 !== "scheme") r.setProperty(`--${k2}`, v);
    r.setProperty("color-scheme", L.css.scheme);
    document.documentElement.dataset.look = name;
    store("playable:look", name);
    for (const fn of lookListeners) fn(name, L);
  }

  let cut = false;
  function setCut(on) {
    cut = on;
    clipPlanes.length = 0;
    if (on) clipPlanes.push(cutPlane);
    for (const m of materials.values()) if (m.clippingPlanes === clipPlanes) m.needsUpdate = true;
    for (const em of edgeMaterials) if (em) em.needsUpdate = true;
  }

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = w < h ? (cam.portraitFov ?? 46) : (cam.fov ?? 32);
    camera.updateProjectionMatrix();
    bloom.resolution.set(w / 2, h / 2);
  }
  addEventListener("resize", resize);
  resize();

  const frameFns = [];
  const stage = {
    THREE, renderer, scene, root, camera, controls, composer, bloom, key, MOBILE,
    timeScale: 1,
    perf: { fps: 0, calls: 0, tris: 0, quality: 2 },
    mat, edgeMat, glow, setLook, setCut,
    get look() { return look; },
    get cut() { return cut; },
    onLook: (fn) => lookListeners.push(fn),
    onFrame: (fn) => frameFns.push(fn),
  };

  const clock = new THREE.Clock();
  let frames = 0, acc = 0, slow = 0;
  function frame() {
    const dtReal = Math.min(clock.getDelta(), 0.05);
    const dt = dtReal * stage.timeScale;
    for (const fn of frameFns) fn(dt, dtReal, clock.elapsedTime);
    controls.update();
    renderer.info.reset();
    composer.render();
    frames++;
    acc += dtReal;
    if (dtReal > 0.022) slow += dtReal; else slow = Math.max(0, slow - dtReal * 0.5);
    if (slow > 2 && stage.perf.quality > 0) {
      stage.perf.quality--;
      slow = 0;
      if (stage.perf.quality === 1) renderer.setPixelRatio(1);
      if (stage.perf.quality === 0) { bloom.enabled = false; key.castShadow = false; }
    }
    if (acc > 0.5) {
      const i = renderer.info.render;
      stage.perf.fps = Math.round(frames / acc);
      stage.perf.calls = i.calls;
      stage.perf.tris = i.triangles;
      frames = 0;
      acc = 0;
    }
    requestAnimationFrame(frame);
  }
  stage.start = () => {
    setLook(store("playable:look") || "bench");
    requestAnimationFrame(frame);
  };
  return stage;
}
