import * as THREE from "three";
import { SEMANTIC } from "./looks.mjs";

const tmp = new THREE.Vector3();
const dummy = new THREE.Object3D();

export function currentFlow(stage, curve, opts = {}) {
  const len = curve.getLength();
  const n = Math.max(10, Math.round(len * (opts.density ?? 5)));
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(opts.size ?? 0.045, 10, 8), stage.glow(SEMANTIC.current, 2.6), n);
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  mesh.userData.keep = true;
  stage.scene.add(mesh);
  let phase = Math.random();
  return {
    mesh,
    update(current, dt, gain = 1) {
      const on = Math.abs(current) > 0.25;
      mesh.visible = on;
      if (!on) return;
      const speed = Math.min(3, Math.abs(current) * 0.06 + 0.2) * Math.sign(current) * gain;
      phase = (((phase + (speed * dt) / len) % 1) + 1) % 1;
      for (let i = 0; i < n; i++) {
        const u = (i / n + phase) % 1;
        curve.getPointAt(u, tmp);
        dummy.position.copy(tmp);
        dummy.scale.setScalar(0.8 + 0.4 * Math.sin(u * 40));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

export function torqueArrow(stage, parent, { radius = 0.42, axis = "x", color = SEMANTIC.force } = {}) {
  const g = new THREE.Group();
  const m = stage.glow(color, 1.8);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.035, 8, 48, Math.PI * 1.4), m);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 16), m);
  const a = Math.PI * 1.4;
  head.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
  head.rotation.z = a;
  g.add(arc, head);
  const holder = new THREE.Group();
  holder.add(g);
  if (axis === "x") g.rotation.y = Math.PI / 2;
  holder.userData.keep = true;
  arc.userData.keep = head.userData.keep = true;
  parent.add(holder);
  return {
    group: holder,
    set(torque, scale = 3) {
      const t = Math.abs(torque);
      holder.visible = t > 0.03;
      holder.scale.setScalar(0.55 + Math.min(1.6, t / scale));
      g.rotation.x = torque >= 0 ? 0 : Math.PI;
    },
  };
}

export function heatGlow(material) {
  const ramp = [[25, 0x000000], [70, 0x5a1500], [160, 0xb84a00], [260, 0xe69f00], [420, 0xffe6b0]];
  const c0 = new THREE.Color();
  const c1 = new THREE.Color();
  return (tempC) => {
    let col = new THREE.Color(0xffe6b0);
    for (let i = 1; i < ramp.length; i++) {
      if (tempC <= ramp[i][0]) {
        const [t0, a] = ramp[i - 1];
        const [t1, b] = ramp[i];
        col = c0.setHex(a).lerp(c1.setHex(b), (tempC - t0) / (t1 - t0));
        break;
      }
    }
    material.emissive.copy(col);
    material.emissiveIntensity = 1 + Math.min(3, Math.max(0, (tempC - 120) / 90));
  };
}

export function heatMotes(stage, center, spread = [0.9, 0.25]) {
  const n = 26;
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: SEMANTIC.heat, transparent: true, opacity: 0.8, toneMapped: false }), n);
  mesh.frustumCulled = false;
  mesh.userData.keep = true;
  stage.scene.add(mesh);
  const seeds = Array.from({ length: n }, () => [Math.random() * 2 - 1, Math.random(), Math.random() * 2 - 1]);
  return (tempC, dt, t) => {
    mesh.visible = tempC > 90;
    if (!mesh.visible) return;
    const k = Math.min(1, (tempC - 90) / 250);
    seeds.forEach((s, i) => {
      s[1] = (s[1] + dt * (0.3 + 0.4 * k)) % 1;
      dummy.position.set(center.x + s[0] * spread[0], center.y + 0.35 + s[1] * 1.2, center.z + s[2] * spread[1] + Math.sin(t * 3 + i) * 0.05);
      dummy.scale.setScalar((1 - s[1]) * (0.6 + k));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
}

export function fieldLoops(stage, parent, { xs = [-0.6, 0, 0.6], ks = [0.45, 0.7], r = 0.95 } = {}) {
  const g = new THREE.Group();
  g.userData.keep = true;
  const m = new THREE.LineDashedMaterial({ color: SEMANTIC.field, dashSize: 0.08, gapSize: 0.06, transparent: true, opacity: 0.95 });
  for (const x of xs)
    for (const k of ks) {
      const pts = [];
      for (let i = 0; i <= 64; i++) {
        const t = (i / 64) * Math.PI * 2;
        pts.push(new THREE.Vector3(x, Math.sin(t) * r, Math.cos(t) * k));
      }
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), m);
      l.computeLineDistances();
      l.userData.keep = true;
      g.add(l);
    }
  parent.add(g);
  return { group: g, set: (v) => { g.visible = v > 0.02; m.opacity = v; } };
}
