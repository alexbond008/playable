import * as THREE from "three";
import { rbox, chamferCyl, lathe, toX, toZ, M4, canvasTex } from "../geo.mjs";
import { SEMANTIC, LOOKS } from "../looks.mjs";
import { drawSmithGrid, strokeR, strokeG, strokeVSWR, strokeTrail, dot, toCanvas } from "../smith.mjs";

// RF parts pack: a slotted air line with a cm scale, a standing-wave curtain, a stub tuner with a sliding short,
// a lumped-element jig with trimmers, a dipole that radiates what it accepts, a VNA with a phosphor S11 trace,
// and a Smith-chart instrument with a puck that follows the impedance. Orange only on what the student grabs.

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const hex = (n) => "#" + n.toString(16).padStart(6, "0");
const PLATE = {
  bench: { bg: "#18191c", ink: "#d6d1c6", faint: "rgba(214,209,198,.30)", y: "rgba(214,209,198,.16)" },
  cyanotype: { bg: "#0f3358", ink: "#f4f1e6", faint: "rgba(244,241,230,.34)", y: "rgba(244,241,230,.18)" },
  paper: { bg: "#f1ede4", ink: "#2a2c30", faint: "rgba(42,44,48,.30)", y: "rgba(42,44,48,.16)" },
};

// A flexible coax lead along a list of points (static unless `dynamic`).
export function coaxCable(B, stage, points, { radius = 0.05, role = "insDark", parent, dynamic = false } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : v3(...p))), false, "centripetal");
  B.part(new THREE.TubeGeometry(curve, Math.max(24, points.length * 16), radius, 10, false), role, { parent, edges: false, dynamic });
  return { curve };
}

// ---------------------------------------------------------------- slotted line
// A rigid air-dielectric line (vp = c, like MWO's Eeff = 1) running along x, generator at x0, load at x1.
// Distances are measured FROM THE LOAD, like every stub-matching calculation.
export function slottedLine(B, stage, { x0 = -3.15, x1 = 3.15, z = 1, y = 0.45, lengthCm = 15, r = 0.15, label = "d · distance from the load (cm)" } = {}) {
  const L = x1 - x0;
  const g = B.group({ name: "slotted-line" });
  B.part(toX(chamferCyl(r, L, 0.02, 40)), "steel", { parent: g, pos: [(x0 + x1) / 2, y, z] });
  B.part(rbox(L - 0.5, 0.04, 0.05, 0.01), "hole", { parent: g, pos: [(x0 + x1) / 2, y + r - 0.012, z], edges: false });
  for (const x of [x0, x1]) {
    B.part(toX(chamferCyl(r + 0.07, 0.12, 0.02, 32)), "clay", { parent: g, pos: [x + (x === x0 ? 0.06 : -0.06), y, z] });
  }
  // generator-end connector
  B.part(toX(chamferCyl(0.09, 0.3, 0.02, 24)), "brass", { parent: g, pos: [x0 - 0.15, y, z] });
  B.part(toX(chamferCyl(0.12, 0.12, 0.02, 6)), "brass", { parent: g, pos: [x0 - 0.06, y, z] });
  // standoffs
  const posts = [];
  const clamps = [];
  for (const k of [0.08, 0.5, 0.92]) {
    const x = x0 + k * L;
    posts.push(M4(x, (y - r) / 2, z, 0, 0, 0, 1, (y - r) / 0.3, 1));
    clamps.push(M4(x, y, z));
  }
  B.inst(chamferCyl(0.07, 0.3, 0.015, 16), "graphite", posts, { parent: g });
  B.inst(new THREE.TorusGeometry(r + 0.02, 0.035, 8, 28).rotateY(Math.PI / 2), "housing", clamps, { parent: g });
  B.inst(chamferCyl(0.28, 0.05, 0.02, 24), "graphite", [0.08, 0.5, 0.92].map((k) => M4(x0 + k * L, 0.025, z)), { parent: g });
  // cm scale on the bench in front of the line
  let ink = "#e9e3d6";
  const scale = canvasTex(2048, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = ink;
    c.strokeStyle = ink;
    c.lineWidth = 3;
    c.textAlign = "center";
    c.font = '500 30px "JetBrains Mono", monospace';
    for (let i = 0; i <= lengthCm * 2; i++) {
      const x = w - (i / (lengthCm * 2)) * (w - 4) - 2;
      const big = i % 2 === 0;
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, big ? 34 : 18);
      c.stroke();
      if (big && i % 2 === 0 && (i / 2) % 1 === 0) c.fillText(String(i / 2), Math.min(w - 14, Math.max(14, x)), 66);
    }
    c.textAlign = "left";
    c.font = '500 26px "JetBrains Mono", monospace';
    c.globalAlpha = 0.7;
    c.fillText(label, 6, 110);
    c.globalAlpha = 1;
  });
  stage.onLook((name) => { ink = hex(LOOKS[name].scene.ink); scale.redraw(); });
  B.part(new THREE.PlaneGeometry(L, L * (128 / 2048)).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: scale.tex, transparent: true }), { parent: g, pos: [(x0 + x1) / 2, 0.012, z + r + 0.42], edges: false, cast: false });
  const perCm = L / lengthCm;
  return {
    group: g, x0, x1, z, y, r, perCm, lengthCm,
    xOf: (dCm) => x1 - dCm * perCm,
    dOf: (x) => (x1 - x) / perCm,
    point: (dCm, dy = 0) => v3(x1 - dCm * perCm, y + dy, z),
    redraw: () => scale.redraw(),
  };
}

// ---------------------------------------------------------------- standing-wave curtain
// A translucent sheet above the line whose height is |V(x)|: VSWR you can see. A brighter line is the
// instantaneous voltage Re{V·e^{jωt}} moving inside it. `update(samples)` takes [{x: 0…1 along the line from the
// generator, v: {re, im}}] with |V| normalised to the incident wave (1 = matched, 1 + |Γ| at a maximum).
export function standingWave(stage, line, { lift = 0.75, height = 0.55, n = 160 } = {}) {
  const col = new THREE.Color(SEMANTIC.voltage);
  const g = new THREE.Group();
  g.userData.keep = true;
  stage.scene.add(g);
  const pos = new Float32Array((n + 1) * 2 * 3);
  const idx = [];
  for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const sheetGeo = new THREE.BufferGeometry();
  sheetGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  sheetGeo.setIndex(idx);
  const sheet = new THREE.Mesh(sheetGeo, new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.4), transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  const edgePos = new Float32Array(n * 2 * 2 * 3);
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePos, 3));
  const edges = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: col.clone().multiplyScalar(2.6), toneMapped: false }));
  const wavePos = new Float32Array((n + 1) * 3);
  const waveGeo = new THREE.BufferGeometry();
  waveGeo.setAttribute("position", new THREE.BufferAttribute(wavePos, 3));
  const wave = new THREE.Line(waveGeo, new THREE.LineBasicMaterial({ color: new THREE.Color(0x9fd8ff).multiplyScalar(1.6), toneMapped: false }));
  for (const m of [sheet, edges, wave]) { m.frustumCulled = false; m.userData.keep = true; g.add(m); }
  const base = line.y + lift;
  const zz = line.z;
  let phase = 0;
  let last = null;
  function write(samples) {
    const N = Math.min(n, samples.length - 1);
    for (let i = 0; i <= N; i++) {
      const s = samples[i];
      const x = line.x0 + s.x * (line.x1 - line.x0);
      const m = Math.hypot(s.v.re, s.v.im) * height * 0.5;
      pos.set([x, base - m, zz, x, base + m, zz], i * 6);
      const inst = (s.v.re * Math.cos(phase) - s.v.im * Math.sin(phase)) * height * 0.5;
      wavePos.set([x, base + inst, zz + 0.002], i * 3);
      if (i < N) {
        const t = samples[i + 1];
        const x2 = line.x0 + t.x * (line.x1 - line.x0);
        const m2 = Math.hypot(t.v.re, t.v.im) * height * 0.5;
        edgePos.set([x, base + m, zz, x2, base + m2, zz, x, base - m, zz, x2, base - m2, zz], i * 12);
      }
    }
    sheetGeo.attributes.position.needsUpdate = true;
    edgeGeo.attributes.position.needsUpdate = true;
    waveGeo.attributes.position.needsUpdate = true;
  }
  return {
    group: g,
    base,
    update(samples, dt = 0) {
      phase = (phase + dt * 5) % (Math.PI * 2);
      last = samples;
      write(samples);
    },
    tick(dt) { if (last) { phase = (phase + dt * 5) % (Math.PI * 2); write(last); } },
    setVisible(v) { g.visible = v; },
    heightAt(xWorld) {
      if (!last) return base;
      const k = (xWorld - line.x0) / (line.x1 - line.x0);
      const s = last[Math.max(0, Math.min(last.length - 1, Math.round(k * (last.length - 1))))];
      return base + Math.hypot(s.v.re, s.v.im) * height * 0.5;
    },
  };
}

// ---------------------------------------------------------------- probe carriage (slotted-line detector)
export function probeCarriage(B, stage, line) {
  const g = B.group({ dynamic: true, merge: true, name: "probe" });
  const y = line.y + line.r;
  const zf = line.r + 0.1;
  B.part(rbox(0.5, 0.14, 0.62, 0.04), "clay", { parent: g, pos: [0, y + 0.07, 0.04] });
  for (const s of [-1, 1]) B.part(rbox(0.5, 0.36, 0.06, 0.02), "clay", { parent: g, pos: [0, y - 0.1, s * (line.r + 0.06)] });
  B.part(new THREE.CylinderGeometry(0.03, 0.012, 0.2, 10), "brass", { parent: g, pos: [0, y - 0.02, 0] });
  B.part(chamferCyl(0.07, 0.16, 0.02, 20), "housing", { parent: g, pos: [0, y + 0.22, 0] });
  // detector head on the front
  B.part(rbox(0.42, 0.34, 0.2, 0.04), "housing", { parent: g, pos: [0, y - 0.05, zf + 0.06] });
  const handle = B.part(toZ(chamferCyl(0.15, 0.22, 0.04, 28)), "accent", { parent: g, pos: [0, y - 0.05, zf + 0.27] });
  handle.userData.noMerge = true;
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), stage.glow(SEMANTIC.voltage, 3));
  bead.userData.keep = true;
  stage.scene.add(bead);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(y - 0.05));
  const hit = new THREE.Vector3();
  return {
    group: g, grab: [handle], bead,
    setD(dCm) { g.position.set(line.xOf(dCm), 0, line.z); },
    fromRay(rc) { const ray = rc.ray ?? rc; if (!ray.intersectPlane(plane, hit)) return null; return Math.max(0, Math.min(line.lengthCm, line.dOf(hit.x))); },
    setVisible(v) { g.visible = v; bead.visible = v; },
    anchor: () => g.position.clone().add(v3(0, y + 0.55, zf + 0.27)),
  };
}

// ---------------------------------------------------------------- stub tuner
// A shunt stub on a sliding tee. The stub is an open-top slab line (trough + centre rod) so the shorting block is
// visible; its distance from the main line's axis is the stub length ℓ. Grab the orange collar to slide the tee
// along the line (d), grab the orange handle to slide the short (ℓ).
export function stubTuner(B, stage, line, { maxCm = 7.5, side = 1 } = {}) {
  const per = line.perCm;
  const len = maxCm * per;
  const tee = B.group({ dynamic: true, name: "stub-tee" });
  const body = B.group({ parent: tee, dynamic: true, merge: true });
  const y = line.y;
  B.part(rbox(0.62, 0.62, 0.62, 0.08), "clay", { parent: body, pos: [0, y, 0] });
  B.part(toX(chamferCyl(line.r + 0.05, 0.7, 0.02, 32)), "housing", { parent: body, pos: [0, y, 0] });
  // trough
  // the stub length is measured from the main line's axis; the trough starts at the tee's face
  const z0 = side * 0.31;
  const tl = len - 0.31 + 0.12;
  const zc = side * (0.31 + tl / 2);
  B.part(rbox(0.46, 0.06, tl, 0.02), "graphite", { parent: body, pos: [0, y - 0.2, zc] });
  for (const s of [-1, 1]) B.part(rbox(0.06, 0.3, tl, 0.02), "steel", { parent: body, pos: [s * 0.2, y - 0.05, zc] });
  B.part(toZ(chamferCyl(0.045, tl, 0.01, 16)), "copper", { parent: body, pos: [0, y, zc], edges: false });
  // cm ticks along the trough lip (every 0.5 cm, long ticks on whole cm)
  const ticks = [];
  for (let i = 0; i <= maxCm * 2; i++) if (i * per / 2 > 0.31) ticks.push(M4(0.235, y + 0.105, side * i * per / 2, 0, 0, 0, 1, 1, i % 2 ? 1 : 2));
  B.inst(new THREE.BoxGeometry(0.06, 0.01, 0.012), "ink", ticks, { parent: body, cast: false });
  // feet
  B.part(rbox(0.5, y - 0.23, 0.12, 0.02), "graphite", { parent: body, pos: [0, (y - 0.23) / 2, side * (len - 0.02)] });
  // the orange collar (slides the tee)
  const collar = B.part(toX(chamferCyl(0.4, 0.2, 0.05, 40)), "accent", { parent: tee, pos: [-0.42, y, 0], dynamic: true });
  const collar2 = B.part(toX(chamferCyl(0.4, 0.2, 0.05, 40)), "accent", { parent: tee, pos: [0.42, y, 0], dynamic: true });
  // the sliding short
  const short = B.group({ parent: tee, dynamic: true });
  const shortBody = B.group({ parent: short, dynamic: true, merge: true });
  B.part(rbox(0.36, 0.26, 0.12, 0.03), "brass", { parent: shortBody, pos: [0, y - 0.05, 0] });
  B.part(toZ(chamferCyl(0.03, 0.5, 0.01, 12)), "steel", { parent: shortBody, pos: [0, y + 0.18, side * 0.25] });
  const handle = B.part(rbox(0.26, 0.22, 0.26, 0.08), "accent", { parent: short, pos: [0, y + 0.22, side * 0.52], dynamic: true });
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.03), stage.glow(SEMANTIC.current, 2.4));
  glow.position.set(0, y + 0.06, 0);
  glow.userData.keep = true;
  short.add(glow);
  const planeT = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
  const planeS = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(y + 0.22));
  const hit = new THREE.Vector3();
  let dCm = 0, lCm = maxCm / 2;
  const api = {
    group: tee, grabTee: [collar, collar2], grabShort: [handle], maxCm,
    setD(d) { dCm = d; tee.position.set(line.xOf(d), 0, line.z); },
    setL(l) { lCm = Math.max(0.05, Math.min(maxCm, l)); short.position.z = side * (lCm * per); },
    get d() { return dCm; },
    get l() { return lCm; },
    dFromRay(rc) { const ray = rc.ray ?? rc; if (!ray.intersectPlane(planeT, hit)) return null; return Math.max(0, Math.min(line.lengthCm, line.dOf(hit.x))); },
    lFromRay(rc) { const ray = rc.ray ?? rc; if (!ray.intersectPlane(planeS, hit)) return null; return Math.max(0.05, Math.min(maxCm, ((hit.z - line.z) * side - 0.52) / per)); },
    setVisible(v) { tee.visible = v; },
    shortGlow: glow,
    teeAnchor: () => tee.position.clone().add(v3(0, y + 0.75, 0)),
    shortAnchor: () => tee.position.clone().add(v3(0, y + 0.6, side * (lCm * per + 0.52))),
  };
  api.setL(lCm);
  return api;
}

// ---------------------------------------------------------------- lumped jig
// A clamp-on block holding lumped parts. parts: [{ id, kind: "L" | "C", mode: "shunt" | "series", label }].
// Each part gets a trimmer with an orange knob; `set(id, k)` turns the knob (0…1).
export function lumpedJig(B, stage, line, { parts = [], name = "jig" } = {}) {
  const g = B.group({ dynamic: true, name });
  const body = B.group({ parent: g, dynamic: true, merge: true });
  const n = parts.length;
  const W = 0.95 * n + 0.25;
  const y = line.y;
  const zb = -0.55, zf = 0.62;
  B.part(rbox(W, 0.1, 1.55, 0.04), "graphite", { parent: body, pos: [0, 0.05, 0.02] });
  B.part(rbox(W - 0.12, 0.06, 0.2, 0.02), "brass", { parent: body, pos: [0, 0.13, zb], edges: false });
  // clamp blocks around the line
  for (const s of [-1, 1]) B.part(rbox(0.14, y + 0.22, 0.5, 0.03), "clay", { parent: body, pos: [s * (W / 2 - 0.07), (y + 0.22) / 2 + 0.1, 0] });
  // a low, sloped control console in front
  B.part(rbox(W, 0.26, 0.42, 0.05), "clay", { parent: body, pos: [0, 0.23, zf] });
  const knobs = {};
  parts.forEach((p, i) => {
    const x = -W / 2 + 0.6 + i * 0.95;
    if (p.kind === "L") {
      // a shunt coil: from the ground bar behind the line up, then a lead over to the centre conductor
      const pts = [];
      const turns = 6, bot = 0.18, top = 1.05;
      for (let k = 0; k <= turns * 28; k++) {
        const a = (k / 28) * Math.PI * 2;
        pts.push(v3(x + Math.cos(a) * 0.15, bot + (k / (turns * 28)) * (top - bot), zb + Math.sin(a) * 0.15));
      }
      pts.push(v3(x + 0.1, top + 0.12, zb + 0.15), v3(x, y + 0.3, -0.12), v3(x, y + 0.05, 0));
      B.part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 300, 0.03, 8), "copper", { parent: body, edges: false });
      B.part(chamferCyl(0.06, top - bot - 0.1, 0.01, 12), "ceramic", { parent: body, pos: [x, (top + bot) / 2, zb], edges: false });
    } else {
      // a disc capacitor sitting in the line
      B.part(toZ(chamferCyl(0.27, 0.11, 0.04, 36)), "ceramic", { parent: body, pos: [x, y + 0.5, 0] });
      for (const s of [-1, 1]) B.part(new THREE.CylinderGeometry(0.02, 0.02, 0.36), "brass", { parent: body, pos: [x + s * 0.1, y + 0.16, 0], edges: false });
    }
    const tilt = B.group({ parent: g, pos: [x, 0.37, zf + 0.12], rot: [-0.75, 0, 0], dynamic: true });
    const pivot = B.group({ parent: tilt, dynamic: true });
    const knob = B.part(toZ(lathe([[0, 0], [0.19, 0], [0.2, 0.03], [0.18, 0.18], [0.13, 0.22], [0, 0.22]], 32)), "accent", { parent: pivot, dynamic: true });
    B.part(new THREE.BoxGeometry(0.03, 0.14, 0.02), "ink", { parent: pivot, pos: [0, 0.08, 0.225], edges: false, cast: false, dynamic: true });
    knobs[p.id] = {
      grab: [knob],
      set: (k) => { pivot.rotation.z = -(-2.3 + 4.6 * k); },
      anchor: () => pivot.localToWorld(v3(0, 0, 0.2)).add(v3(0, 0.5, 0)),
    };
  });
  let ink = "#ece7dc";
  const lab = canvasTex(512, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = ink;
    c.font = '600 30px "JetBrains Mono", monospace';
    c.textBaseline = "middle";
    c.textAlign = "center";
    parts.forEach((p, i) => c.fillText(p.label ?? `${p.mode} ${p.kind}`, ((0.6 + i * 0.95) / W) * w, h / 2));
  });
  B.part(new THREE.PlaneGeometry(W, W / 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: lab.tex, transparent: true }), { parent: g, pos: [0, 0.012, zf + 0.42], edges: false, cast: false, dynamic: true });
  stage.onLook((name) => { ink = hex(LOOKS[name].scene.ink); lab.redraw(); });
  return {
    group: g, knobs,
    setX(x, z = line.z) { g.position.set(x, 0, z); },
    setVisible(v) { g.visible = v; },
    redraw: () => lab.redraw(),
  };
}

// ---------------------------------------------------------------- dipole antenna
// A vertical half-wave-ish dipole on a mast; rings of radiated field expand from the feed, brighter when matched.
export function dipoleAntenna(B, stage, { pos = [4.2, 0, 1], height = 2.2, arm = 0.85 } = {}) {
  const g = B.group({ pos, name: "antenna" });
  B.part(chamferCyl(0.42, 0.12, 0.03, 32), "graphite", { parent: g, pos: [0, 0.06, 0] });
  B.part(chamferCyl(0.06, height - arm - 0.2, 0.01, 16), "housing", { parent: g, pos: [0, (height - arm - 0.2) / 2 + 0.1, 0] });
  B.part(rbox(0.3, 0.36, 0.3, 0.05), "clay", { parent: g, pos: [0, height, 0] });
  for (const s of [-1, 1]) {
    B.part(chamferCyl(0.035, arm, 0.01, 12), "steel", { parent: g, pos: [0, height + s * (0.18 + arm / 2), 0] });
    B.part(new THREE.SphereGeometry(0.05, 12, 10), "steel", { parent: g, pos: [0, height + s * (0.18 + arm), 0] });
  }
  // offset so the rings clear the mast
  const N = 4;
  const ringGeo = new THREE.TorusGeometry(1, 0.01, 6, 64).rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const rings = new THREE.InstancedMesh(ringGeo, mat, N * 2);
  rings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 2 * 3), 3);
  rings.frustumCulled = false;
  rings.userData.keep = true;
  rings.position.set(pos[0], pos[1] + height, pos[2]);
  stage.scene.add(rings);
  const col = new THREE.Color(SEMANTIC.field);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  let t = 0;
  return {
    group: g, rings,
    feed: v3(pos[0], pos[1] + height, pos[2]),
    update(power, dt) {
      t += dt * 0.7;
      for (let i = 0; i < N * 2; i++) {
        const layer = Math.floor(i / N) ? 1 : -1; // two rings per wave front, either side of the feed
        const k = (((t + (i % N) / N) % 1) + 1) % 1;
        const r = 0.3 + k * 1.5;
        const y = layer * 0.2 * (1 - k * 0.5);
        m.makeScale(r, 1, r).setPosition(0, y, 0);
        rings.setMatrixAt(i, m);
        const a = power * (1 - k) ** 1.5;
        c.copy(col).multiplyScalar(a * 1.2);
        rings.setColorAt(i, c);
      }
      rings.instanceMatrix.needsUpdate = true;
      rings.instanceColor.needsUpdate = true;
      rings.visible = power > 0.01;
    },
    anchor: () => v3(pos[0], pos[1] + height + arm + 0.5, pos[2]),
  };
}

// ---------------------------------------------------------------- VNA
// A bench vector network analyser: phosphor screen with |S11| in dB versus frequency, a fixed marker at f0 and a
// live marker at the knob's frequency. The orange knob sets the marker frequency.
export function vna(B, stage, { pos = [-4.6, 0, -1.8], rotY = 0.35, span = [0.5e9, 3.5e9], f0 = 2e9 } = {}) {
  const g = B.group({ pos, rot: [0, rotY, 0], name: "vna" });
  B.part(rbox(2.8, 1.75, 1.6, 0.1, 4), "clay", { parent: g, pos: [0, 0.875 + 0.06, 0] });
  B.part(rbox(2.62, 1.5, 0.06, 0.04), "graphite", { parent: g, pos: [0, 0.94, 0.8] });
  for (const x of [-1.2, 1.2]) for (const z of [-0.6, 0.6]) B.part(chamferCyl(0.1, 0.06, 0.02, 16), "rubber", { parent: g, pos: [x, 0.03, z], edges: false });
  const vents = [];
  for (let i = 0; i < 12; i++) vents.push(M4(-1.0 + i * 0.18, 1.82, -0.2));
  B.inst(rbox(0.07, 0.02, 0.8, 0.01, 2), "hole", vents, { parent: g });
  const W = 1024, H = 560;
  let state = { trace: [], ghost: null, marker: f0, title: "S11", readout: "" };
  const fx = (f) => 70 + ((f - span[0]) / (span[1] - span[0])) * (W - 100);
  const dbMin = -45;
  const fy = (d) => 40 + (Math.max(dbMin, Math.min(0, d)) / dbMin) * (H - 120);
  const screen = canvasTex(W, H, (c, w, h, s = state) => {
    c.fillStyle = "#06110a";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(60,255,143,.05)";
    for (let y = 0; y < h; y += 4) c.fillRect(0, y, w, 1);
    c.strokeStyle = "rgba(60,255,143,.16)";
    c.lineWidth = 2;
    c.font = '500 22px "JetBrains Mono", monospace';
    c.fillStyle = "rgba(60,255,143,.55)";
    c.textAlign = "right";
    c.textBaseline = "middle";
    for (let d = 0; d >= dbMin; d -= 10) { c.beginPath(); c.moveTo(fx(span[0]), fy(d)); c.lineTo(fx(span[1]), fy(d)); c.stroke(); c.fillText(String(d), 62, fy(d)); }
    c.textAlign = "center";
    c.textBaseline = "top";
    for (let f = Math.ceil(span[0] / 0.5e9) * 0.5e9; f <= span[1] + 1; f += 0.5e9) { c.beginPath(); c.moveTo(fx(f), fy(0)); c.lineTo(fx(f), fy(dbMin)); c.stroke(); c.fillText((f / 1e9).toFixed(1), fx(f), fy(dbMin) + 8); }
    // -10 dB line
    c.setLineDash([10, 8]);
    c.strokeStyle = "rgba(60,255,143,.45)";
    c.beginPath(); c.moveTo(fx(span[0]), fy(-10)); c.lineTo(fx(span[1]), fy(-10)); c.stroke();
    c.setLineDash([]);
    const plot = (tr, style, width, blur) => {
      if (!tr?.length) return;
      c.strokeStyle = style;
      c.lineWidth = width;
      c.shadowColor = style;
      c.shadowBlur = blur;
      c.beginPath();
      tr.forEach((p, i) => (i ? c.lineTo(fx(p.f), fy(p.dB)) : c.moveTo(fx(p.f), fy(p.dB))));
      c.stroke();
      c.shadowBlur = 0;
    };
    plot(s.ghost, "rgba(60,255,143,.35)", 3, 0);
    plot(s.trace, "#3cff8f", 4, 16);
    // f0 marker
    c.strokeStyle = "rgba(240,228,66,.75)";
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(fx(f0), fy(0)); c.lineTo(fx(f0), fy(dbMin)); c.stroke();
    // live marker
    if (s.trace?.length) {
      const m = s.markerDB ?? 0;
      c.fillStyle = "#3cff8f";
      c.beginPath();
      const x = fx(s.marker), y = fy(m);
      c.moveTo(x, y - 4); c.lineTo(x - 12, y - 24); c.lineTo(x + 12, y - 24); c.closePath(); c.fill();
    }
    c.fillStyle = "#3cff8f";
    c.shadowColor = "#3cff8f";
    c.shadowBlur = 10;
    c.textAlign = "left";
    c.textBaseline = "top";
    c.font = '700 30px Doto, "JetBrains Mono", monospace';
    c.fillText(`${s.title}  |  M ${(s.marker / 1e9).toFixed(3)} GHz  ${s.markerDB != null ? s.markerDB.toFixed(1) : "--"} dB`, 74, 6);
    c.shadowBlur = 0;
    c.font = '500 22px "JetBrains Mono", monospace';
    c.fillStyle = "rgba(60,255,143,.6)";
    c.textAlign = "right";
    c.fillText(s.readout ?? "", w - 30, h - 34);
    c.textAlign = "left";
    c.fillText("GHz", 74, h - 34);
  });
  B.part(new THREE.PlaneGeometry(1.86, 1.02), new THREE.MeshBasicMaterial({ map: screen.tex, toneMapped: false, color: new THREE.Color(1.45, 1.45, 1.45) }), { parent: g, pos: [-0.3, 1.0, 0.835], edges: false, cast: false, dynamic: true });
  const knob = B.group({ parent: g, pos: [0.98, 1.2, 0.83], dynamic: true });
  const knobBody = B.part(toZ(lathe([[0, 0], [0.24, 0], [0.25, 0.04], [0.23, 0.22], [0.18, 0.27], [0, 0.27]], 40)), "accent", { parent: knob, thresh: 20, dynamic: true });
  const kn = [];
  for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2; kn.push(M4(Math.cos(a) * 0.24, Math.sin(a) * 0.24, 0.13, 0, 0, a)); }
  B.inst(new THREE.BoxGeometry(0.025, 0.025, 0.18), "accentDark", kn, { parent: knob });
  B.part(new THREE.BoxGeometry(0.04, 0.14, 0.02), "ink", { parent: knob, pos: [0, 0.11, 0.28], edges: false, cast: false, dynamic: true });
  const dial = [];
  for (let k = 0; k <= 12; k++) { const a = -2.4 + (4.8 * k) / 12; dial.push(M4(0.98 + Math.sin(a) * 0.36, 1.2 + Math.cos(a) * 0.36, 0.83, 0, 0, -a)); }
  B.inst(new THREE.BoxGeometry(0.018, 0.06, 0.01), "ink", dial, { parent: g, cast: false });
  // port
  B.part(toZ(chamferCyl(0.13, 0.12, 0.02, 6)), "brass", { parent: g, pos: [0.98, 0.45, 0.86] });
  B.part(toZ(chamferCyl(0.08, 0.26, 0.02, 20)), "brass", { parent: g, pos: [0.98, 0.45, 0.93] });
  const label = canvasTex(256, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = "#e9e3d6"; c.font = '600 30px "JetBrains Mono", monospace'; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("PORT 1", w / 2, h / 2); });
  B.part(new THREE.PlaneGeometry(0.5, 0.125), new THREE.MeshBasicMaterial({ map: label.tex, transparent: true }), { parent: g, pos: [0.4, 0.45, 0.835], edges: false, cast: false });
  return {
    group: g, grab: [knobBody], knob, span, f0,
    draw(next) { state = { ...state, ...next }; screen.redraw(state); },
    setKnob: (k) => { knob.rotation.z = -(-2.4 + 4.8 * k); },
    port: () => g.localToWorld(v3(0.98, 0.45, 1.06)),
    anchor: () => g.localToWorld(v3(-0.3, 2.0, 0.8)),
    knobAnchor: () => g.localToWorld(v3(0.98, 1.62, 0.9)),
    redraw: () => { screen.redraw(state); label.redraw(); },
  };
}

// ---------------------------------------------------------------- Smith-chart instrument
// An engraved YZ chart on a tilted plate with a brass bezel. A puck rides the plate at the current Γ; the
// overlay lights the circles a move follows (constant r for series parts, constant g for shunt parts,
// |Γ| for line length) and draws the trail. `draw({ gamma, trail, circles, marks })` redraws on change only.
export function smithInstrument(B, stage, { pos = [0.6, 0, -2.4], radius = 1.6, tilt = 0.32, height = 2.3 } = {}) {
  const g = B.group({ pos, name: "smith" });
  const head = B.group({ parent: g, pos: [0, height, 0], rot: [-tilt, 0, 0] });
  // stand
  B.part(rbox(1.5, 0.16, 1.0, 0.05), "graphite", { parent: g, pos: [0, 0.08, 0.1] });
  B.part(rbox(0.3, height - radius * 0.7, 0.24, 0.05), "housing", { parent: g, pos: [0, (height - radius * 0.7) / 2 + 0.1, -0.15] });
  // plate
  const Rp = radius * 1.32; // the plate includes the wavelength ring
  B.part(toZ(chamferCyl(Rp + 0.08, 0.14, 0.04, 96)), "housing", { parent: head, pos: [0, 0, -0.08] });
  B.part(new THREE.TorusGeometry(Rp + 0.06, 0.05, 12, 120), "brass", { parent: head, pos: [0, 0, 0.0] });
  const TW = 2048;
  const cxy = TW / 2, Rpx = (TW / 2) * (radius / Rp);
  let look = "bench";
  const plateTex = canvasTex(TW, TW, (c, w, h) => {
    const P = PLATE[look] ?? PLATE.bench;
    c.fillStyle = P.bg;
    c.fillRect(0, 0, w, h);
    drawSmithGrid(c, cxy, cxy, Rpx, { ink: P.ink, faint: P.faint, yInk: P.y });
    c.fillStyle = P.ink;
    c.font = '600 40px "JetBrains Mono", monospace';
    c.textAlign = "center";
    c.fillText("YZ SMITH CHART · Z0 = 50 Ω", cxy, cxy + Rpx * 1.255);
    c.font = '500 30px "JetBrains Mono", monospace';
    c.fillText("WAVELENGTHS TOWARD GENERATOR →", cxy, cxy - Rpx * 1.255);
  });
  plateTex.tex.anisotropy = 8;
  const face = new THREE.Mesh(new THREE.CircleGeometry(Rp, 96), new THREE.MeshStandardMaterial({ map: plateTex.tex, roughness: 0.8, metalness: 0 }));
  face.position.z = 0.0;
  face.receiveShadow = true;
  face.userData.keep = true;
  head.add(face);
  stage.onLook((name) => { look = name; plateTex.redraw(); });
  // overlay
  const OW = 1024;
  const ocx = OW / 2, oR = (OW / 2) * (radius / Rp);
  let key = "";
  let spec = {};
  const overlay = canvasTex(OW, OW, (c, w, h, s = spec) => {
    c.clearRect(0, 0, w, h);
    for (const ci of s.circles ?? []) {
      const color = hex(ci.color);
      const halo = "rgba(0,0,0,.5)", hw = (ci.width ?? 5) + 5;
      const dash = ci.dash === true ? [16, 12] : ci.dash ?? null;
      if (ci.kind === "r") { strokeR(c, ocx, ocx, oR, ci.value, halo, hw, dash); strokeR(c, ocx, ocx, oR, ci.value, color, ci.width ?? 5, dash); }
      else if (ci.kind === "g") { strokeG(c, ocx, ocx, oR, ci.value, halo, hw, dash); strokeG(c, ocx, ocx, oR, ci.value, color, ci.width ?? 5, dash); }
      else if (ci.kind === "vswr") { strokeVSWR(c, ocx, ocx, oR, ci.value, halo, (ci.width ?? 4) + 5, ci.dash ?? [14, 10]); strokeVSWR(c, ocx, ocx, oR, ci.value, color, ci.width ?? 4, ci.dash ?? [14, 10]); }
    }
    if (s.trail) { strokeTrail(c, ocx, ocx, oR, s.trail, "rgba(0,0,0,.5)", 11); strokeTrail(c, ocx, ocx, oR, s.trail, hex(SEMANTIC.signal), 6); }
    for (const m of s.marks ?? []) dot(c, ocx, ocx, oR, m.gamma, hex(m.color ?? SEMANTIC.signal), m.size ?? 9, m.label);
    // the match point
    c.strokeStyle = "rgba(255,255,255,.85)";
    c.lineWidth = 3;
    c.beginPath(); c.arc(ocx, ocx, 14, 0, Math.PI * 2); c.stroke();
  });
  const ov = new THREE.Mesh(new THREE.CircleGeometry(Rp, 96), new THREE.MeshBasicMaterial({ map: overlay.tex, transparent: true, toneMapped: false, depthWrite: false, color: new THREE.Color(1.5, 1.5, 1.5) }));
  ov.position.z = 0.006;
  ov.userData.keep = true;
  head.add(ov);
  // puck
  const puck = new THREE.Group();
  puck.userData.keep = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.03, 10, 32), stage.mat("brass"));
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 24).rotateX(Math.PI / 2), stage.glow(SEMANTIC.signal, 2.4));
  core.position.z = 0.02;
  ring.position.z = 0.03;
  for (const m of [ring, core]) { m.userData.keep = true; m.castShadow = false; puck.add(m); }
  head.add(puck);
  const toLocal = (G) => v3(G.re * radius, G.im * radius, 0.03);
  return {
    group: g, head, radius, puck,
    draw(next) {
      const k = JSON.stringify(next, (kk, v) => (typeof v === "number" ? Math.round(v * 2000) / 2000 : v));
      if (next.gamma) puck.position.copy(toLocal(next.gamma));
      if (k === key) return;
      key = k;
      spec = next;
      overlay.redraw(spec);
    },
    worldOf: (G, dz = 0.1) => head.localToWorld(toLocal(G).setZ(dz)),
    anchor: () => head.localToWorld(v3(0, radius * 1.45, 0.1)),
    redraw: () => { plateTex.redraw(); overlay.redraw(spec); },
  };
}
