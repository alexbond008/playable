import * as THREE from "three";
import { rbox, lathe, chamferCyl, toX, toZ, M4, canvasTex } from "../geo.mjs";
import { fieldLoops } from "../overlays.mjs";

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

export function dcMotor(B, stage, { pos = [-3.2, 1.45, 0], facing = 1, shaftLength = 2.3, clip = true, toggle = false, parent, rotY = 0, baseY = 0 } = {}) {
  const wrap = B.group({ parent, pos: [pos[0], baseY, pos[2]], rot: [0, rotY, 0], dynamic: toggle, merge: toggle });
  const motor = B.group({ parent: wrap, pos: [0, pos[1], 0] });
  if (facing < 0) motor.rotation.y = Math.PI;
  const RH = 1.0, LH = 2.4;
  B.part(toX(new THREE.CylinderGeometry(RH, RH, LH, 64, 1, true)), "housing", { parent: motor, clip });
  const fins = [];
  for (let i = 0; i < 11; i++) fins.push(M4(-1.0 + i * 0.2, 0, 0, 0, 0, -Math.PI / 2));
  B.inst(new THREE.CylinderGeometry(RH + 0.08, RH + 0.08, 0.06, 64, 1, true), stage.mat("housing", { clip }), fins, { parent: motor });
  for (const s of [-1, 1]) {
    const cap = lathe([[0, -0.14], [1.1, -0.14], [1.16, -0.08], [1.16, 0.06], [0.5, 0.12], [0.42, 0.24], [0, 0.24]].map(([r, y]) => [r, y * s]), 64);
    B.part(toX(cap), "clay", { parent: motor, pos: [s * (LH / 2 + 0.1), 0, 0], clip });
  }
  const rods = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    rods.push(M4(0, Math.cos(a) * 1.1, Math.sin(a) * 1.1, 0, 0, -Math.PI / 2));
  }
  B.inst(new THREE.CylinderGeometry(0.035, 0.035, LH + 0.7, 10), "steel", rods, { parent: motor });
  B.inst(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 6), "steel", rods.flatMap((m) => [-1, 1].map((s) => m.clone().multiply(M4(0, s * (LH / 2 + 0.33), 0)))), { parent: motor });
  B.part(rbox(2.6, 0.36, 1.7, 0.06), "graphite", { parent: wrap, pos: [0, 0.18, 0] });
  for (const x of [-0.75, 0.75]) B.part(rbox(0.32, 0.9, 1.5, 0.05), "graphite", { parent: motor, pos: [x, -0.85, 0] });
  const bolts = [];
  for (const x of [-1.15, 1.15]) for (const z of [-0.65, 0.65]) bolts.push(M4(x, 0.4, z));
  B.inst(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 6), "steel", bolts, { parent: wrap });

  B.part(rbox(0.9, 0.42, 0.75, 0.06), "clay", { parent: motor, pos: [-0.3, RH + 0.18, 0] });
  const termLocal = [v3(-0.52, RH + 0.52, 0.12), v3(-0.08, RH + 0.52, 0.12)];
  termLocal.forEach((p, i) => {
    B.part(chamferCyl(0.07, 0.16, 0.02, 16), "brass", { parent: motor, pos: [p.x, p.y - 0.04, p.z] });
    B.part(chamferCyl(0.1, 0.08, 0.03, 16), i ? "insDark" : "insRed", { parent: motor, pos: [p.x, p.y + 0.06, p.z] });
  });

  const plate = canvasTex(512, 160, (g, w, h, K = 0.2, R = 0.1, name = "M1") => {
    g.fillStyle = "#d8d2c4";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#26231d";
    g.font = '700 30px "JetBrains Mono", monospace';
    g.fillText(`DC MOTOR  ${name}`, 22, 46);
    g.font = '500 30px "JetBrains Mono", monospace';
    g.fillText(`K ${K.toFixed(3)} V·s/rad`, 22, 96);
    g.fillText(`Rₐ ${R.toFixed(R < 1 ? 3 : 2)} Ω`, 22, 140);
  });
  B.part(new THREE.PlaneGeometry(0.62, 0.2), new THREE.MeshStandardMaterial({ map: plate.tex, roughness: 0.6 }), { parent: motor, pos: [-0.3, RH + 0.18, facing > 0 ? 0.381 : -0.381], rot: [0, facing > 0 ? 0 : Math.PI, 0], edges: false, cast: false, dynamic: false });

  const rotor = B.group({ parent: motor, dynamic: true, merge: true });
  const lam = [];
  const lamCol = [];
  for (let i = 0; i < 34; i++) {
    lam.push(M4(-0.95 + i * 0.056, 0, 0, 0, 0, -Math.PI / 2));
    lamCol.push(new THREE.Color(i % 2 ? 0x7b8089 : 0x9aa0aa));
  }
  B.inst(new THREE.CylinderGeometry(0.64, 0.64, 0.045, 40), "lamination", lam, { parent: rotor, colors: lamCol });
  const bars = [];
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6;
    bars.push(M4(0, Math.cos(a) * 0.6, Math.sin(a) * 0.6, a, 0, 0));
  }
  B.inst(new THREE.BoxGeometry(1.95, 0.13, 0.13), "copper", bars, { parent: rotor });
  for (const s of [-1, 1]) B.part(new THREE.TorusGeometry(0.56, 0.1, 12, 40).rotateY(Math.PI / 2), "copper", { parent: rotor, pos: [s * 1.02, 0, 0], edges: false });
  B.part(toX(chamferCyl(0.34, 0.36, 0.03, 36)), "carbon", { parent: rotor, pos: [-1.27, 0, 0], edges: false });
  const segs = [];
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6;
    segs.push(M4(-1.27, Math.cos(a) * 0.34, Math.sin(a) * 0.34, a, 0, 0));
  }
  B.inst(new THREE.BoxGeometry(0.34, 0.03, 0.15), "brass", segs, { parent: rotor });
  B.part(toX(new THREE.CylinderGeometry(0.1, 0.1, LH + shaftLength, 24)), "steel", { parent: rotor, pos: [shaftLength / 2, 0, 0] });

  for (const a of [0, Math.PI]) B.part(toX(new THREE.CylinderGeometry(0.92, 0.92, 1.9, 40, 1, true, a + Math.PI * 0.2, Math.PI * 0.6)), "magnet", { parent: motor });
  for (const s of [-1, 1]) {
    B.part(rbox(0.16, 0.3, 0.2, 0.03), "carbon", { parent: motor, pos: [-1.27, s * 0.52, 0] });
    B.part(rbox(0.28, 0.22, 0.3, 0.03), "brass", { parent: motor, pos: [-1.27, s * 0.78, 0] });
  }
  const field = fieldLoops(stage, motor);
  field.set(0);

  return {
    wrap,
    group: motor,
    rotor,
    field,
    terminals: () => termLocal.map((p) => motor.localToWorld(p.clone())),
    setNameplate: (K, R, name) => plate.redraw(K, R, name),
    redraw: () => plate.redraw(),
    anchor: () => motor.localToWorld(v3(-0.2, 1.4, 0)),
  };
}

export function dyno(B, stage, { x = 0, axisY = 1.45, armLength = 2.4 } = {}) {
  const spin = B.group({ pos: [x, axisY, 0], dynamic: true, merge: true });
  B.part(toX(lathe([[0.12, -0.16], [1.1, -0.16], [1.18, -0.1], [1.18, 0.1], [1.1, 0.16], [0.4, 0.16], [0.32, 0.24], [0.12, 0.24]], 80)), "clay", { parent: spin });
  const holes = [];
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    holes.push(M4(0.17, Math.cos(a) * 0.72, Math.sin(a) * 0.72, 0, 0, -Math.PI / 2));
  }
  B.inst(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 24), "hole", holes, { parent: spin });
  const t = [];
  for (let k = 0; k < 48; k++) {
    const a = (k * Math.PI) / 24;
    t.push(M4(0.17, Math.cos(a) * 1.04, Math.sin(a) * 1.04, a, 0, 0));
  }
  B.inst(new THREE.BoxGeometry(0.012, 0.1, 0.025), "ink", t, { parent: spin, cast: false });
  B.part(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }), { parent: spin, pos: [0.18, 0.9, 0], edges: false });
  for (const s of [-1, 1]) B.part(toX(chamferCyl(0.3, 0.32, 0.04, 32)), "steel", { parent: spin, pos: [s * 1.25, 0, 0] });
  B.part(toX(new THREE.CylinderGeometry(0.27, 0.27, 0.08, 24)), "rubber", { parent: spin, pos: [-1.45, 0, 0], edges: false });

  for (const s of [-1, 1]) {
    B.part(rbox(0.5, axisY - 0.3, 1.0, 0.06), "graphite", { pos: [x + s * 0.75, (axisY - 0.3) / 2, 0] });
    B.part(toX(lathe([[0.12, -0.2], [0.36, -0.2], [0.4, -0.16], [0.4, 0.16], [0.36, 0.2], [0.12, 0.2]], 36)), "clay", { pos: [x + s * 0.75, axisY, 0] });
  }

  B.part(new THREE.TorusGeometry(1.21, 0.05, 10, 96).rotateY(Math.PI / 2), "carbon", { pos: [x, axisY, 0], edges: false });
  B.part(rbox(0.36, 0.5, 0.5, 0.05), "housing", { pos: [x, axisY, 1.3] });
  const armTip = v3(x, axisY, 1.3 + armLength);
  B.part(rbox(0.14, 0.14, armLength, 0.04), "housing", { pos: [x, axisY, 1.3 + armLength / 2] });
  B.part(chamferCyl(0.1, 0.12, 0.03, 20), "steel", { pos: [armTip.x, armTip.y + 0.09, armTip.z] });
  const panY = 0.42;
  B.part(new THREE.CylinderGeometry(0.03, 0.03, armTip.y - panY, 12), "steel", { pos: [armTip.x, (armTip.y + panY) / 2, armTip.z] });
  B.part(chamferCyl(0.42, 0.06, 0.02, 40), "steel", { pos: [armTip.x, panY, armTip.z] });
  B.part(rbox(0.36, 0.06, 0.36, 0.02), "graphite", { pos: [armTip.x, 0.03, armTip.z] });
  B.part(new THREE.CylinderGeometry(0.035, 0.035, panY - 0.05, 10), "graphite", { pos: [armTip.x, panY / 2, armTip.z] });

  const gauge = B.group({ pos: [x + 0.75, 0.62, 0.52] });
  B.part(toZ(chamferCyl(0.36, 0.06, 0.02, 40)), "clay", { parent: gauge });
  const gt = [];
  for (let k = 0; k <= 14; k++) {
    const a = -2.2 + (4.4 * k) / 14;
    gt.push(M4(Math.sin(a) * 0.29, Math.cos(a) * 0.29, 0.035, 0, 0, -a, 1, k % 2 ? 0.6 : 1, 1));
  }
  B.inst(new THREE.BoxGeometry(0.015, 0.07, 0.01), "ink", gt, { parent: gauge, cast: false });
  const needle = B.group({ parent: gauge, pos: [0, 0, 0.045], dynamic: true });
  B.part(new THREE.BoxGeometry(0.02, 0.27, 0.01).translate(0, 0.12, 0), stage.glow(0xd55e00, 1.2), { parent: needle, edges: false });
  B.part(chamferCyl(0.035, 0.02, 0.005, 16).rotateX(Math.PI / 2), "brass", { parent: gauge, pos: [0, 0, 0.05], edges: false });

  return {
    spin,
    armTip,
    panTop: panY + 0.03,
    setRpm: (n, max = 3500) => { needle.rotation.z = -(-2.2 + 4.4 * Math.min(1, Math.max(0, n / max))); },
  };
}

export function slottedWeights(B, stage, physics, { rackPos = [-4.6, 0, 2.6], hanger, big = 6, small = 5 }) {
  const discs = [];
  const geoBig = lathe([[0.07, -0.05], [0.3, -0.05], [0.32, -0.03], [0.32, 0.03], [0.3, 0.05], [0.07, 0.05]], 40);
  const geoSmall = lathe([[0.07, -0.025], [0.26, -0.025], [0.27, -0.012], [0.27, 0.012], [0.26, 0.025], [0.07, 0.025]], 40);
  const matBig = new THREE.MeshStandardMaterial({ color: 0x4a4d55, roughness: 0.45, metalness: 0.7 });
  const matSmall = stage.mat("brass");
  const [rx, , rz] = rackPos;
  B.part(rbox(1.7, 0.08, 0.9, 0.03), "graphite", { pos: [rx, 0.04, rz] });
  physics.fixedBox([1.7, 0.08, 0.9], [rx, 0.04, rz]);
  physics.fixedBox([14, 0.2, 8.4], [0, -0.1, 0]);
  physics.fixedCylinder(0.42, 0.06, [hanger.x, hanger.panY, hanger.z]);
  const instBig = new THREE.InstancedMesh(geoBig, matBig, big);
  const instSmall = new THREE.InstancedMesh(geoSmall, matSmall, small);
  for (const im of [instBig, instSmall]) {
    im.castShadow = im.receiveShadow = true;
    im.userData.keep = true;
    im.frustumCulled = false;
    stage.scene.add(im);
  }
  for (let i = 0; i < big + small; i++) {
    const isBig = i < big;
    const proxy = new THREE.Object3D();
    const h = isBig ? 0.1 : 0.05;
    const x = isBig ? rx - 0.4 : rx + 0.42;
    const idx = isBig ? i : i - big;
    const y = 0.09 + h / 2 + idx * (h + 0.004);
    const body = physics.dynamicCylinder(proxy, isBig ? 0.32 : 0.27, h, [x, y, rz], { mass: isBig ? 0.408 : 0.0815 });
    body.setEnabledRotations(false, true, false, true);
    discs.push({ mesh: proxy, inst: isBig ? instBig : instSmall, index: idx, body, torque: isBig ? 1 : 0.2, h, home: [x, y, rz], held: false });
  }
  function syncInstances() {
    for (const d of discs) {
      d.mesh.updateMatrix();
      d.inst.setMatrixAt(d.index, d.mesh.matrix);
    }
    instBig.instanceMatrix.needsUpdate = instSmall.instanceMatrix.needsUpdate = true;
  }
  const onHanger = (d) => {
    const t = d.body.translation();
    return Math.hypot(t.x - hanger.x, t.z - hanger.z) < 0.25 && t.y > hanger.panY && t.y < hanger.armY - 0.05;
  };
  function load() {
    return discs.filter((d) => !d.held && onHanger(d)).reduce((s, d) => s + d.torque, 0);
  }
  let stable = 0;
  let candidate = 0;
  let since = 0;
  function settle(dt) {
    syncInstances();
    for (const d of discs) {
      if (d.held || !onHanger(d)) continue;
      const t = d.body.translation();
      const v = d.body.linvel();
      const off = Math.hypot(t.x - hanger.x, t.z - hanger.z);
      if (off > 0.004 && Math.hypot(v.x, v.y, v.z) < 0.3) {
        const k = Math.min(1, dt * 4);
        d.body.setTranslation({ x: t.x + (hanger.x - t.x) * k, y: t.y, z: t.z + (hanger.z - t.z) * k }, false);
      }
    }
    const raw = Math.round(discs.filter((d) => !d.held && onHanger(d)).reduce((s, d) => s + d.torque, 0) * 10) / 10;
    if (raw !== candidate) { candidate = raw; since = 0; }
    since += dt;
    if (since >= 0.25 || raw === stable) stable = candidate;
  }
  const stableLoad = () => stable;
  function reset() {
    stable = candidate = 0;
    since = 0;
    for (const d of discs) {
      d.body.setTranslation({ x: d.home[0], y: d.home[1], z: d.home[2] }, true);
      d.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      d.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }
  function place(target) {
    reset();
    stable = candidate = Math.round(target * 10) / 10;
    let y = hanger.panY + 0.03;
    let remaining = Math.round(target * 10) / 10;
    const order = [...discs.filter((d) => d.torque === 1), ...discs.filter((d) => d.torque !== 1)];
    for (const d of order) {
      if (remaining + 1e-6 < d.torque) continue;
      d.body.setTranslation({ x: hanger.x, y: y + d.h / 2 + 0.002, z: hanger.z }, true);
      y += d.h + 0.004;
      remaining = Math.round((remaining - d.torque) * 10) / 10;
    }
  }
  function addOne(torque) {
    const d = discs.find((x) => x.torque === torque && !onHanger(x));
    if (!d) return false;
    d.body.setTranslation({ x: hanger.x, y: hanger.armY - 0.25, z: hanger.z }, true);
    d.body.setLinvel({ x: 0, y: -0.5, z: 0 }, true);
    return true;
  }
  function removeOne() {
    const on = discs.filter(onHanger).sort((a, b) => b.body.translation().y - a.body.translation().y);
    if (!on.length) return false;
    const d = on[0];
    d.body.setTranslation({ x: d.home[0], y: d.home[1] + 0.6, z: d.home[2] }, true);
    d.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    return true;
  }
  function draggable(interaction, audio) {
    const RAPIER = physics.RAPIER;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.75);
    const hitPt = new THREE.Vector3();
    for (const im of [instBig, instSmall]) {
      interaction.register([im], {
        enabled: () => enabledDrag,
        onDragStart(e, ray, hit) {
          const d = discs.find((x) => x.inst === im && x.index === hit?.instanceId);
          if (!d) return false;
          d.held = true;
          d.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
          audio.clack(0.2);
          return d;
        },
        onDrag({ ray, data: d }) {
          if (ray.ray.intersectPlane(plane, hitPt)) {
            const x = Math.max(-6.5, Math.min(6.5, hitPt.x));
            const z = Math.max(-3.5, Math.min(3.9, hitPt.z));
            d.body.setNextKinematicTranslation({ x, y: 1.75, z });
          }
        },
        onDragEnd({ data: d }) {
          const t = d.body.translation();
          d.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
          if (Math.hypot(t.x - hanger.x, t.z - hanger.z) < 1.0) d.body.setTranslation({ x: hanger.x, y: hanger.armY - 0.25, z: hanger.z }, true);
          d.body.setLinvel({ x: 0, y: -0.5, z: 0 }, true);
          d.held = false;
        },
      });
    }
  }
  let enabledDrag = true;
  const setDraggable = (v) => { enabledDrag = v; };
  return { discs, load: stableLoad, rawLoad: load, settle, reset, place, addOne, removeOne, onHanger, draggable, setDraggable };
}

export function benchSupply(B, stage, { pos = [-3.7, 0, -2.6], rotY = 0.3 } = {}) {
  const psu = B.group({ pos, rot: [0, rotY, 0] });
  B.part(rbox(2.9, 1.9, 1.7, 0.1, 4), "clay", { parent: psu, pos: [0, 0.95, 0] });
  B.part(rbox(2.7, 1.6, 0.06, 0.04), "graphite", { parent: psu, pos: [0, 0.95, 0.86] });
  const vents = [];
  for (let i = 0; i < 14; i++) vents.push(M4(-1.1 + i * 0.17, 1.91, -0.2));
  B.inst(rbox(0.07, 0.02, 0.9, 0.01, 2), "hole", vents, { parent: psu });
  for (const x of [-1.2, 1.2]) for (const z of [-0.65, 0.65]) B.part(chamferCyl(0.12, 0.08, 0.02, 16), "rubber", { parent: psu, pos: [x, 0.02, z], edges: false });
  const disp = canvasTex(512, 200, (g, w, h, a = "0.0", ua = "V", b = "0.0", ub = "A", mode = "CV", dark = true) => {
    g.fillStyle = dark ? "#07120b" : "#0d1a12";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(60,255,143,.06)";
    for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
    g.fillStyle = "#3cff8f";
    g.shadowColor = "#3cff8f";
    g.shadowBlur = 14;
    g.font = '900 92px Doto, "JetBrains Mono", monospace';
    g.fillText(a.padStart(5, " "), 10, 104);
    g.font = '700 40px Doto, "JetBrains Mono", monospace';
    g.fillText(ua, 330, 104);
    g.font = '900 60px Doto, "JetBrains Mono", monospace';
    g.fillText(b.padStart(5, " "), 20, 180);
    g.font = '700 34px Doto, "JetBrains Mono", monospace';
    g.fillText(ub, 236, 180);
    g.shadowBlur = 0;
    g.font = '500 22px "JetBrains Mono", monospace';
    g.fillStyle = "rgba(60,255,143,.65)";
    g.fillText(mode, 360, 180);
  });
  B.part(new THREE.PlaneGeometry(1.4, 0.55), new THREE.MeshBasicMaterial({ map: disp.tex, toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5) }), { parent: psu, pos: [-0.45, 1.25, 0.895], edges: false, cast: false, dynamic: true });
  const knob = B.group({ parent: psu, pos: [0.85, 1.15, 0.9], dynamic: true });
  const knobBody = B.part(toZ(lathe([[0, 0], [0.34, 0], [0.36, 0.04], [0.33, 0.3], [0.26, 0.36], [0, 0.36]], 48)), "accent", { parent: knob, thresh: 20 });
  const kn = [];
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    kn.push(M4(Math.cos(a) * 0.345, Math.sin(a) * 0.345, 0.17, 0, 0, a));
  }
  B.inst(new THREE.BoxGeometry(0.03, 0.03, 0.24), "accentDark", kn, { parent: knob });
  B.part(new THREE.BoxGeometry(0.05, 0.2, 0.02), "ink", { parent: knob, pos: [0, 0.16, 0.37], edges: false, cast: false });
  const dial = [];
  for (let k = 0; k <= 12; k++) {
    const a = -2.4 + (4.8 * k) / 12;
    dial.push(M4(0.85 + Math.sin(a) * 0.5, 1.15 + Math.cos(a) * 0.5, 0.9, 0, 0, -a));
  }
  B.inst(new THREE.BoxGeometry(0.02, 0.08, 0.01), "ink", dial, { parent: psu, cast: false });
  const posts = [v3(-0.85, 0.55, 1.0), v3(-0.35, 0.55, 1.0)];
  posts.forEach((p, i) => {
    B.part(toZ(chamferCyl(0.12, 0.22, 0.03, 20)), i ? "insDark" : "insRed", { parent: psu, pos: [p.x, p.y, p.z - 0.1] });
    B.part(toZ(chamferCyl(0.05, 0.2, 0.01, 12)), "brass", { parent: psu, pos: [p.x, p.y, p.z + 0.03] });
  });
  return {
    group: psu,
    knob,
    grab: [knobBody],
    setKnob: (f) => { knob.rotation.z = -(-2.4 + 4.8 * f); },
    display: disp.redraw,
    posts: () => posts.map((p) => psu.localToWorld(p.clone())),
    anchor: () => psu.localToWorld(v3(0, 2.15, 0)),
    knobAnchor: () => knob.localToWorld(v3(0, 0.55, 0)),
  };
}

export function toggleSwitch(B, stage, { pos = [-2.1, 0, 2.8] } = {}) {
  const sw = B.group({ pos });
  B.part(rbox(1.1, 0.45, 0.8, 0.06), "clay", { parent: sw, pos: [0, 0.23, 0] });
  B.part(chamferCyl(0.16, 0.08, 0.02, 24), "steel", { parent: sw, pos: [0, 0.49, 0] });
  const pivot = B.group({ parent: sw, pos: [0, 0.52, 0], dynamic: true });
  const bat = B.part(new THREE.CylinderGeometry(0.045, 0.065, 0.55, 16), "accent", { parent: pivot, pos: [0, 0.27, 0] });
  const tip = B.part(new THREE.SphereGeometry(0.085, 20, 14), "accent", { parent: pivot, pos: [0, 0.56, 0] });
  for (const s of [-1, 1]) B.part(chamferCyl(0.06, 0.1, 0.02, 12), "brass", { parent: sw, pos: [s * 0.4, 0.5, 0] });
  let angle = -0.55;
  return {
    grab: [bat, tip],
    contacts: () => [-1, 1].map((s) => sw.localToWorld(v3(s * 0.4, 0.55, 0))),
    update(on, dt) {
      angle += ((on ? 0.55 : -0.55) - angle) * Math.min(1, dt * 14);
      pivot.rotation.x = angle;
    },
    anchor: () => sw.localToWorld(v3(0, 1.1, 0)),
  };
}

export function rheostat(B, stage, { pos = [3.6, 0, 2.6], range = [0.5, 8] } = {}) {
  const g = B.group({ pos });
  const L = 2.2;
  B.part(rbox(2.9, 0.12, 0.8, 0.04), "graphite", { parent: g, pos: [0, 0.06, 0] });
  for (const s of [-1, 1]) B.part(rbox(0.16, 0.95, 0.6, 0.04), "steel", { parent: g, pos: [s * (L / 2 + 0.2), 0.55, 0] });
  const heat = new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.6, emissive: 0x000000 });
  stage.onLook((n, Lk) => heat.color.setHex(Lk.scene.ceramic));
  B.part(toX(lathe([[0.12, -L / 2], [0.27, -L / 2], [0.3, -L / 2 + 0.05], [0.3, L / 2 - 0.05], [0.27, L / 2], [0.12, L / 2]], 40)), heat, { parent: g, pos: [0, 0.6, 0], dynamic: true });
  const coils = [];
  for (let k = 0; k < 22; k++) coils.push(M4(-L / 2 + 0.12 + k * ((L - 0.24) / 21), 0.6, 0, 0, 0, -Math.PI / 2));
  B.inst(new THREE.TorusGeometry(0.305, 0.012, 6, 40).rotateX(Math.PI / 2), "copper", coils, { parent: g });
  B.part(toX(new THREE.CylinderGeometry(0.045, 0.045, L + 0.4, 12)), "steel", { parent: g, pos: [0, 1.08, 0] });
  const slider = B.group({ parent: g, pos: [0, 1.08, 0], dynamic: true });
  const handle = B.part(rbox(0.28, 0.22, 0.32, 0.06), "accent", { parent: slider, pos: [0, 0.05, 0] });
  const cap = B.part(new THREE.CylinderGeometry(0.06, 0.08, 0.22, 16), "accent", { parent: slider, pos: [0, 0.27, 0] });
  B.part(rbox(0.06, 0.2, 0.06, 0.02), "brass", { parent: slider, pos: [0, -0.18, 0] });
  for (const s of [-1, 1]) B.part(chamferCyl(0.08, 0.06, 0.02, 12), "brass", { parent: g, pos: [s * (L / 2 + 0.2), 1.06, 0.2] });
  let frac = 0.3;
  const R = () => range[0] + (range[1] - range[0]) * frac;
  return {
    heatMaterial: heat,
    grab: [handle, cap],
    get R() { return R(); },
    setR(r) {
      frac = Math.max(0, Math.min(1, (r - range[0]) / (range[1] - range[0])));
      slider.position.x = -L / 2 + 0.1 + frac * (L - 0.2);
    },
    range,
    terminals: () => [-1, 1].map((s) => g.localToWorld(v3(s * (L / 2 + 0.2), 1.08, 0.2))),
    center: () => g.localToWorld(v3(0, 0.6, 0)),
    anchor: () => g.localToWorld(v3(0, 1.6, 0)),
  };
}

export function wire(B, stage, a, b, { lift = 0.9, sag = 0.03, role = "insDark", radius = 0.045, parent } = {}) {
  const m1 = a.clone().lerp(b, 0.25);
  const m2 = a.clone().lerp(b, 0.75);
  m1.y = m2.y = sag + 0.05;
  const curve = new THREE.CatmullRomCurve3([a, a.clone().add(v3(0, lift * 0.5, 0)), m1, m2, b.clone().add(v3(0, lift * 0.5, 0)), b], false, "catmullrom", 0.4);
  const mesh = B.part(new THREE.TubeGeometry(curve, 140, radius, 10), role, { edges: false, parent });
  return { curve, mesh };
}
