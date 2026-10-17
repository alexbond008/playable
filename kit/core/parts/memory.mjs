import * as THREE from "three";
import { rbox, chamferCyl, toX, toZ, M4, canvasTex } from "../geo.mjs";
import { SEMANTIC } from "../looks.mjs";

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const hex = (n, digits = 4) => n.toString(16).toUpperCase().padStart(digits, "0").slice(-digits);

export function memoryWarehouse(B, stage, opts = {}) {
  const cellW = opts.cellW ?? 0.5;
  const perShelf = opts.perShelf ?? 8;
  const shelfGap = opts.shelfGap ?? 0.78;
  const bytesPerCell = opts.bytesPerCell ?? 4;
  const regions = new Map();
  const shelfY = (s) => 0.32 + s * shelfGap;

  for (const r of opts.regions ?? [
    { id: "stack", label: "STACK", base: 0x7ff7bfeff0a0, shelves: 3, x0: -6.2, z: -1.6 },
    { id: "heap", label: "HEAP", base: 0x600000c04000, shelves: 3, x0: 0.9, z: -1.6 },
  ]) {
    const width = perShelf * cellW;
    const g = B.group({ pos: [r.x0, 0, r.z] });
    const height = shelfY(r.shelves) + 0.15;
    for (const s of [0, 1]) B.part(rbox(0.12, height, 0.7, 0.03), "graphite", { parent: g, pos: [s * (width + 0.12) - 0.06, height / 2, 0] });
    B.part(rbox(width + 0.36, 0.08, 0.84, 0.03), "graphite", { parent: g, pos: [width / 2, 0.04, 0] });
    for (let s = 0; s < r.shelves; s++) {
      const y = shelfY(s) - 0.05;
      B.part(rbox(width + 0.12, 0.06, 0.7, 0.02), "housing", { parent: g, pos: [width / 2, y, 0] });
      const strip = canvasTex(1024, 64, (ctx, w, h) => {
        ctx.fillStyle = "#1d1f22";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#e9e3d6";
        ctx.font = '600 26px "JetBrains Mono", monospace';
        ctx.textBaseline = "middle";
        for (let c = 0; c < perShelf; c++) {
          const addr = r.base + (s * perShelf + c) * bytesPerCell;
          ctx.fillText(hex(addr), c * (w / perShelf) + 22, h / 2);
          ctx.fillRect(c * (w / perShelf), 0, 2, h);
        }
      });
      B.part(new THREE.PlaneGeometry(width, 0.11), new THREE.MeshBasicMaterial({ map: strip.tex }), { parent: g, pos: [width / 2, y - 0.02, 0.356], edges: false, cast: false });
      const ticks = [];
      for (let c = 0; c <= perShelf; c++) ticks.push(M4(c * cellW, y + 0.035, 0.3));
      B.inst(new THREE.BoxGeometry(0.015, 0.01, 0.12), "ink", ticks, { parent: g, cast: false });
    }
    const head = canvasTex(1024, 160, (ctx, w, h) => {
      ctx.fillStyle = "#c99a4b";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#3b2a12";
      ctx.font = '900 72px Doto, "JetBrains Mono", monospace';
      ctx.textBaseline = "middle";
      ctx.fillText(r.label, 30, 62);
      ctx.font = '500 34px "JetBrains Mono", monospace';
      ctx.fillText(`0x${r.base.toString(16).toUpperCase()} ↑ ${bytesPerCell} B / slot`, 32, 128);
    });
    B.part(rbox(Math.min(width, 3.2), 0.5, 0.05, 0.02), new THREE.MeshStandardMaterial({ map: head.tex, roughness: 0.4, metalness: 0.6 }), { parent: g, pos: [width / 2, height + 0.3, 0.1], edges: false });
    for (const s of [0, 1]) B.part(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), "steel", { parent: g, pos: [width / 2 + (s ? 1.2 : -1.2) * Math.min(1, width / 3.2), height + 0.05, 0.1] });
    regions.set(r.id, { ...r, group: g, width, redrawHead: head.redraw });
  }

  const pit = B.group({ pos: opts.pit ?? [-0.2, 0, 2.3] });
  B.part(rbox(1.3, 0.04, 1.3, 0.02), "graphite", { parent: pit, pos: [0, 0.02, 0] });
  const stripes = canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f0e442";
    for (let i = -h; i < w; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 20, 0); ctx.lineTo(i + 20 + h, h); ctx.lineTo(i + h, h); ctx.fill(); }
    ctx.fillStyle = "#050505";
    ctx.fillRect(40, 40, w - 80, h - 80);
    ctx.fillStyle = "#f0e442";
    ctx.font = '900 44px Doto, monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("0x0", w / 2, h / 2 - 16);
    ctx.font = '600 22px "JetBrains Mono", monospace';
    ctx.fillText("nullptr", w / 2, h / 2 + 26);
  });
  B.part(new THREE.PlaneGeometry(1.2, 1.2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: stripes.tex, roughness: 0.8 }), { parent: pit, pos: [0, 0.045, 0], edges: false, cast: false });
  const pitTop = v3(...(opts.pit ?? [-0.2, 0, 2.3])).add(v3(0, 0.05, 0));

  const crates = new Map();
  const edgeMat = () => stage.edgeMat();
  let crateSeq = 0;

  function cellPos(regionId, index) {
    const r = regions.get(regionId);
    const s = Math.floor(index / perShelf);
    const c = index % perShelf;
    return v3(r.x0 + c * cellW + cellW / 2, shelfY(s), r.z);
  }
  const addrOf = (regionId, index) => regions.get(regionId).base + index * bytesPerCell;

  function crateFace(spec) {
    const wide = spec.cells >= 3;
    return canvasTex(wide ? 512 : 256, 160, (ctx, w, h, value = spec.value ?? "", state = "") => {
      ctx.fillStyle = state === "error" ? "#3a120a" : state === "hot" ? "#2b2410" : "#efe9dc";
      ctx.fillRect(0, 0, w, h);
      if (state === "error") {
        ctx.strokeStyle = "#d55e00";
        ctx.lineWidth = 10;
        for (let i = -h; i < w; i += 28) { ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + h, 0); ctx.stroke(); }
      }
      const dark = state === "error" || state === "hot";
      ctx.fillStyle = dark ? "#f4f1e6" : "#26231d";
      ctx.font = '700 30px "JetBrains Mono", monospace';
      ctx.textBaseline = "top";
      ctx.fillText(spec.name, 14, 10);
      ctx.font = '500 20px "JetBrains Mono", monospace';
      ctx.fillStyle = dark ? "#e9dfc8" : "#6c6a64";
      ctx.fillText(spec.type ?? "", 14, 46);
      ctx.fillStyle = dark ? "#ffe6b0" : "#16110d";
      ctx.font = `900 ${String(value).length > 9 ? 34 : 52}px Doto, "JetBrains Mono", monospace`;
      ctx.textBaseline = "bottom";
      ctx.fillText(String(value), 14, h - 8);
    });
  }

  function crate(spec) {
    const id = spec.id ?? `c${++crateSeq}`;
    const cells = spec.cells ?? Math.max(1, Math.ceil((spec.bytes ?? 4) / bytesPerCell));
    const full = { ...spec, cells };
    const group = new THREE.Group();
    group.userData.keep = true;
    stage.scene.add(group);
    const w = cells * cellW - 0.06;
    const pad = new Set(spec.padding ?? []);
    const solid = [];
    let run = null;
    for (let c = 0; c < cells; c++) {
      if (pad.has(c)) { run = null; continue; }
      if (!run) { run = { start: c, len: 0 }; solid.push(run); }
      run.len++;
    }
    const material = new THREE.MeshStandardMaterial({ color: spec.color ?? 0xc9b48a, roughness: 0.7 });
    const face = crateFace(full);
    const faceMat = new THREE.MeshBasicMaterial({ map: face.tex });
    const meshes = [];
    for (const r of solid) {
      const bw = r.len * cellW - 0.06;
      const m = new THREE.Mesh(rbox(bw, 0.42, 0.52, 0.04), material);
      m.position.set((r.start + r.len / 2) * cellW - (cells * cellW) / 2, 0.21, 0);
      m.castShadow = m.receiveShadow = true;
      m.userData.keep = true;
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), edgeMat());
      e.raycast = () => {};
      m.add(e);
      group.add(m);
      meshes.push(m);
    }
    for (const c of pad) {
      const foam = new THREE.Mesh(rbox(cellW - 0.08, 0.3, 0.44, 0.08), new THREE.MeshStandardMaterial({ color: 0xe8e3d8, roughness: 1, transparent: true, opacity: 0.55 }));
      foam.position.set((c + 0.5) * cellW - (cells * cellW) / 2, 0.15, 0);
      foam.userData.keep = true;
      group.add(foam);
    }
    const first = solid.reduce((a, b) => (b.len > a.len ? b : a), solid[0]);
    const faceW = Math.min(first.len * cellW - 0.14, 2.6);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(faceW, 0.3), faceMat);
    label.position.set((first.start + first.len / 2) * cellW - (cells * cellW) / 2, 0.22, 0.265);
    label.userData.keep = true;
    group.add(label);
    const plug = new THREE.Mesh(chamferCyl(0.07, 0.08, 0.02, 16), stage.mat("steel"));
    plug.position.set(-w / 2 + 0.22, 0.46, 0.12);
    plug.visible = !!spec.pointer;
    plug.userData.keep = true;
    group.add(plug);

    const handle = {
      id, spec: full, group, meshes, plug, cells,
      region: spec.region, index: spec.index,
      get address() { return addrOf(handle.region, handle.index); },
      place(region, index, animator, dur = 0) {
        handle.region = region;
        handle.index = index;
        const to = cellPos(region, index).add(v3((cells - 1) * cellW / 2, 0, 0));
        if (!animator || !dur) { group.position.copy(to); return Promise.resolve(); }
        const from = group.position.clone();
        return animator.tween(dur, (k) => group.position.lerpVectors(from, to, k).add(v3(0, Math.sin(k * Math.PI) * 0.6, 0)));
      },
      setValue(value, state = handle.state) {
        handle.value = value;
        handle.state = state;
        face.redraw(value, state);
      },
      setState(state) { handle.setValue(handle.value ?? spec.value ?? "", state); },
      top() { return group.position.clone().add(v3(0, 0.5, 0)); },
      plugPos() { return plug.getWorldPosition(new THREE.Vector3()).add(v3(0, 0.05, 0)); },
      remove() { stage.scene.remove(group); crates.delete(id); },
      redraw() { face.redraw(handle.value ?? spec.value ?? "", handle.state); },
    };
    handle.value = spec.value ?? "";
    handle.place(spec.region, spec.index);
    crates.set(id, handle);
    return handle;
  }

  const cables = new Set();
  function cable(from, to, { grabbable = false } = {}) {
    const mat = grabbable ? stage.mat("accent") : stage.mat("insDark");
    let mesh = null;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), grabbable ? stage.mat("accent") : stage.mat("brass"));
    tip.userData.keep = true;
    stage.scene.add(tip);
    const handle = {
      from, to, tip, grabbable,
      dragPoint: null,
      rebuild() {
        const a = from.plugPos();
        const b = handle.dragPoint ?? (handle.to ? handle.to.top() : pitTop.clone());
        const lift = Math.max(a.y, b.y) + 0.8 + a.distanceTo(b) * 0.12;
        const curve = new THREE.CatmullRomCurve3([a, a.clone().add(v3(0, 0.4, 0)), a.clone().lerp(b, 0.5).setY(lift), b.clone().add(v3(0, handle.to || handle.dragPoint ? 0.35 : 0.8, 0)), b], false, "catmullrom", 0.5);
        if (mesh) { stage.scene.remove(mesh); mesh.geometry.dispose(); }
        mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.035, 8), mat);
        mesh.castShadow = true;
        mesh.userData.keep = true;
        stage.scene.add(mesh);
        tip.position.copy(b);
        handle.curve = curve;
      },
      retarget(next) { handle.to = next; handle.dragPoint = null; handle.rebuild(); },
      setVisible(v) { if (mesh) mesh.visible = v; tip.visible = v; },
      remove() { if (mesh) stage.scene.remove(mesh); stage.scene.remove(tip); cables.delete(handle); },
    };
    from.plug.visible = true;
    handle.rebuild();
    cables.add(handle);
    return handle;
  }

  function nearestTarget(point, exclude) {
    let best = null;
    let bestD = 0.9;
    for (const c of crates.values()) {
      if (c === exclude) continue;
      const d = c.top().distanceTo(point);
      if (d < bestD) { best = c; bestD = d; }
    }
    if (pitTop.distanceTo(point) < 1.0 && (!best || pitTop.distanceTo(point) < bestD)) return "null";
    return best;
  }

  const forklift = buildForklift(B, stage, opts.forkliftHome ?? [-0.2, 0, 0.6]);

  return {
    regions, cellPos, addrOf, crate, cable, crates, cables, pitTop, forklift, nearestTarget, cellW, perShelf, bytesPerCell, shelfY,
    redraw() { for (const c of crates.values()) c.redraw(); for (const r of regions.values()) r.redrawHead(); },
    refreshCables() { for (const c of cables) c.rebuild(); },
  };
}

function buildForklift(B, stage, home) {
  const g = B.group({ pos: home, dynamic: true });
  const body = B.group({ parent: g, dynamic: true });
  B.part(rbox(0.9, 0.32, 0.6, 0.08), "housing", { parent: body, pos: [0, 0.3, 0] });
  B.part(rbox(0.5, 0.42, 0.52, 0.06), "clay", { parent: body, pos: [0.12, 0.66, 0] });
  B.part(rbox(0.06, 0.3, 0.5, 0.02), "graphite", { parent: body, pos: [0.38, 0.95, 0] });
  for (const x of [-0.28, 0.28]) for (const z of [-0.3, 0.3]) B.part(toZ(chamferCyl(0.13, 0.1, 0.03, 20)), "rubber", { parent: body, pos: [x, 0.13, z], edges: false });
  for (const z of [-0.18, 0.18]) B.part(rbox(0.05, 1.5, 0.05, 0.01), "steel", { parent: body, pos: [0, 0.8, z] });
  const beacon = B.part(new THREE.SphereGeometry(0.06, 16, 12), stage.glow(SEMANTIC.signal, 1.6), { parent: body, pos: [0.12, 0.92, 0], edges: false });
  const carriage = B.group({ parent: body, dynamic: true, pos: [0, 0.3, 0] });
  B.part(rbox(0.08, 0.3, 0.46, 0.02), "graphite", { parent: carriage, pos: [0, 0.1, 0] });
  for (const z of [-0.14, 0.14]) B.part(rbox(0.03, 0.03, 0.42, 0.01), "steel", { parent: carriage, pos: [0, -0.02, z], rot: [0, 0, 0] });
  for (const z of [-0.14, 0.14]) B.part(rbox(0.04, 0.025, 0.5, 0.01), "steel", { parent: carriage, pos: [0, -0.03, z - (z > 0 ? -0 : 0)] });
  g.rotation.y = Math.PI / 2;
  const homePos = v3(...home);
  return {
    group: g, body, carriage, beacon, home: homePos,
    async drive(animator, target, liftY, dur = 1.2) {
      const from = g.position.clone();
      const to = v3(target.x, 0, target.z + 0.9);
      const lift0 = carriage.position.y;
      await animator.tween(dur, (k) => {
        g.position.lerpVectors(from, to, k);
        body.position.y = Math.sin(k * Math.PI * 6) * 0.01;
      });
      await animator.tween(0.6, (k) => { carriage.position.y = lift0 + (liftY - lift0) * k; });
    },
    async fall(animator, at) {
      const from = g.position.clone();
      const to = v3(at.x, 0, at.z + 0.2);
      await animator.tween(0.9, (k) => g.position.lerpVectors(from, to, k));
      await animator.tween(0.6, (k) => { g.position.y = -1.4 * k * k; body.rotation.x = k * 0.9; body.rotation.z = k * 0.4; }, (t) => t);
    },
    async home_(animator) {
      const from = g.position.clone();
      await animator.tween(0.8, (k) => {
        g.position.lerpVectors(from, homePos, k);
        carriage.position.y = 0.3 + (carriage.position.y - 0.3) * (1 - k);
      });
    },
    reset() {
      g.position.copy(homePos);
      body.rotation.set(0, 0, 0);
      body.position.y = 0;
      carriage.position.y = 0.3;
    },
  };
}
