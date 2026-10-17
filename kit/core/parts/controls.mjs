import * as THREE from "three";
import { rbox, M4, canvasTex } from "../geo.mjs";

// A linear slider on the bench: graphite rail, tick marks, an orange carriage the student drags.
// `set(k)` takes 0…1; `fromRay(ray)` returns the 0…1 position under a pointer ray (or null).
export function slider(B, stage, { pos = [0, 0, 0], rotY = 0, length = 3, ticks = 10, label = "", marks = [], dynamic = false } = {}) {
  const g = B.group({ pos, rot: [0, rotY, 0], dynamic });
  B.part(rbox(length + 0.5, 0.1, 0.5, 0.04), "graphite", { parent: g, pos: [0, 0.05, 0] });
  B.part(rbox(length, 0.02, 0.07, 0.01), "hole", { parent: g, pos: [0, 0.105, 0], edges: false });
  const tm = [];
  for (let i = 0; i <= ticks; i++) tm.push(M4(-length / 2 + (i / ticks) * length, 0.105, 0.17, 0, 0, 0, 1, 1, i % 5 === 0 ? 1.6 : 1));
  B.inst(new THREE.BoxGeometry(0.014, 0.01, 0.07), "ink", tm, { parent: g, cast: false });
  if (label || marks.length) {
    const plate = canvasTex(1024, 96, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#e9e3d6";
      ctx.font = '600 34px "JetBrains Mono", monospace';
      ctx.textBaseline = "middle";
      ctx.fillText(label, 8, h / 2);
      ctx.textAlign = "center";
      ctx.font = '500 28px "JetBrains Mono", monospace';
      for (const m of marks) ctx.fillText(m.text, (m.at * (length / (length + 0.5)) + 0.25 / (length + 0.5)) * w, h / 2);
    });
    B.part(new THREE.PlaneGeometry(length + 0.5, 0.14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: plate.tex, transparent: true }), { parent: g, pos: [0, 0.102, 0.19 + 0.0], edges: false, cast: false });
    g.userData.redraw = plate.redraw;
  }
  const carriage = B.group({ parent: g, dynamic: true, pos: [-length / 2, 0, 0] });
  const knob = B.part(rbox(0.24, 0.24, 0.34, 0.07), "accent", { parent: carriage, pos: [0, 0.22, -0.02] });
  B.part(rbox(0.05, 0.02, 0.3, 0.01), "accentDark", { parent: carriage, pos: [0, 0.345, -0.02], edges: false });
  const plane = new THREE.Plane();
  const hit = new THREE.Vector3();
  let k = 0;
  return {
    group: g, grab: [knob], length,
    get k() { return k; },
    set(v) { k = Math.max(0, Math.min(1, v)); carriage.position.x = -length / 2 + k * length; },
    fromRay(rc) {
      const ray = rc.ray ?? rc; // a THREE.Raycaster (what interaction passes) or a THREE.Ray
      g.updateMatrixWorld();
      const n = new THREE.Vector3(0, 1, 0);
      const p = new THREE.Vector3(0, 0.22, 0).applyMatrix4(g.matrixWorld);
      plane.setFromNormalAndCoplanarPoint(n, p);
      if (!ray.intersectPlane(plane, hit)) return null;
      const local = g.worldToLocal(hit.clone());
      return Math.max(0, Math.min(1, (local.x + length / 2) / length));
    },
    anchor: () => knob.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0)),
    redraw: () => g.userData.redraw?.(),
  };
}
