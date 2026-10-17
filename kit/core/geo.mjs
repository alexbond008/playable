import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const rbox = (w, h, d, r = 0.06, s = 3) => new RoundedBoxGeometry(w, h, d, s, Math.min(r, Math.min(w, h, d) / 2.2));
export const lathe = (profile, seg = 48) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
export const chamferCyl = (r, h, c = 0.04, seg = 48) =>
  lathe([[0, -h / 2], [r - c, -h / 2], [r, -h / 2 + c], [r, h / 2 - c], [r - c, h / 2], [0, h / 2]], seg);
export const toX = (g) => g.rotateZ(-Math.PI / 2);
export const toZ = (g) => g.rotateX(Math.PI / 2);
export const M4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

export function canvasTex(w, h, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const redraw = (...args) => {
    draw(ctx, w, h, ...args);
    tex.needsUpdate = true;
  };
  redraw();
  return { tex, ctx, canvas, redraw };
}

export function createBuilder(stage) {
  const isDynamic = (obj, root) => {
    for (let o = obj; o && o !== root; o = o.parent) if (o.userData.dynamic) return true;
    return false;
  };

  function place(obj, { parent, pos, rot, scale }) {
    if (pos) obj.position.set(...pos);
    if (rot) obj.rotation.set(...rot);
    if (scale) obj.scale.setScalar(scale);
    (parent || stage.root).add(obj);
    return obj;
  }

  function group(opts = {}) {
    const g = new THREE.Group();
    if (opts.dynamic) g.userData.dynamic = true;
    if (opts.name) g.name = opts.name;
    return place(g, opts);
  }

  function part(geo, role, opts = {}) {
    const material = typeof role === "string" ? stage.mat(role, { clip: opts.clip }) : role;
    const m = new THREE.Mesh(geo, material);
    m.castShadow = opts.cast ?? true;
    m.receiveShadow = opts.recv ?? true;
    m.userData.edges = opts.edges ?? true;
    m.userData.thresh = opts.thresh ?? 30;
    m.userData.clip = !!opts.clip;
    if (opts.dynamic) m.userData.dynamic = true;
    if (opts.name) m.name = opts.name;
    return place(m, opts);
  }

  function inst(geo, role, matrices, opts = {}) {
    const material = typeof role === "string" ? stage.mat(role, { clip: opts.clip }) : role;
    const im = new THREE.InstancedMesh(geo, material, matrices.length);
    matrices.forEach((mx, i) => {
      im.setMatrixAt(i, mx);
      if (opts.colors) im.setColorAt(i, opts.colors[i]);
    });
    im.castShadow = opts.cast ?? true;
    im.receiveShadow = true;
    return place(im, opts);
  }

  function attachEdges(mesh) {
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, mesh.userData.thresh), stage.edgeMat(mesh.userData.clip));
    e.raycast = () => {};
    e.userData.edgeLine = true;
    mesh.add(e);
  }

  function finalize(root = stage.root) {
    root.updateMatrixWorld(true);
    const meshBuckets = new Map();
    const edgeBuckets = new Map();
    const remove = [];
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.userData.keep) return;
      if (isDynamic(o, root)) {
        if (o.userData.edges && !o.children.some((c) => c.userData.edgeLine)) attachEdges(o);
        return;
      }
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(o.matrixWorld);
      const key = o.material.uuid + (o.castShadow ? "c" : "n");
      if (!meshBuckets.has(key)) meshBuckets.set(key, { material: o.material, cast: o.castShadow, geos: [] });
      meshBuckets.get(key).geos.push(g);
      if (o.userData.edges) {
        const em = stage.edgeMat(o.userData.clip);
        const eg = new THREE.EdgesGeometry(o.geometry, o.userData.thresh).applyMatrix4(o.matrixWorld);
        if (!edgeBuckets.has(em.uuid)) edgeBuckets.set(em.uuid, { material: em, geos: [] });
        edgeBuckets.get(em.uuid).geos.push(eg);
      }
      remove.push(o);
    });
    for (const o of remove) o.parent.remove(o);
    const merged = new THREE.Group();
    merged.name = "static";
    for (const { material, cast, geos } of meshBuckets.values()) {
      const m = new THREE.Mesh(mergeGeometries(geos, false), material);
      m.castShadow = cast;
      m.receiveShadow = true;
      m.userData.keep = true;
      merged.add(m);
    }
    for (const { material, geos } of edgeBuckets.values()) {
      const l = new THREE.LineSegments(mergeGeometries(geos, false), material);
      l.raycast = () => {};
      merged.add(l);
    }
    stage.scene.add(merged);
    return { meshes: meshBuckets.size, edges: edgeBuckets.size, removed: remove.length };
  }

  return { group, part, inst, finalize };
}
