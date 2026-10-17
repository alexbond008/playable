import * as THREE from "three";

export function createInteraction(stage, audio) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const targets = [];
  const el = stage.renderer.domElement;
  let drag = null;
  let hover = null;
  let enabled = true;
  let lastHit = null;
  const accent = stage.mat("accent");

  function toNdc(e) {
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  function pick(e) {
    toNdc(e);
    ray.setFromCamera(ndc, stage.camera);
    const live = targets.filter((t) => t.enabled() && t.meshes.some((m) => m.visible && visibleChain(m)));
    const hits = ray.intersectObjects(live.flatMap((t) => t.meshes), false);
    if (!hits.length) return null;
    lastHit = hits[0];
    return live.find((t) => t.meshes.includes(hits[0].object)) || null;
  }

  function visibleChain(o) {
    for (let p = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  }

  const accentOff = stage.mat("accentOff");
  function register(meshes, handlers) {
    const t = { meshes, enabled: () => true, ...handlers };
    for (const m of meshes) m.userData.noMerge = true;
    targets.push(t);
    return t;
  }
  function syncAccents() {
    for (const t of targets) {
      const on = !!t.enabled();
      if (t.lastOn === on) continue;
      t.lastOn = on;
      for (const m of t.meshes) {
        m.traverse((o) => {
          if (!o.isMesh || o.isInstancedMesh) return;
          if (o.material === accent || o.material === accentOff) o.material = on ? accent : accentOff;
        });
      }
    }
  }

  el.addEventListener("pointerdown", (e) => {
    if (!enabled) return;
    const t = pick(e);
    if (!t) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    audio.unlock();
    if (t.onTap && !t.onDrag) {
      t.onTap();
      return;
    }
    drag = { t, x: e.clientX, y: e.clientY, moved: 0, data: t.onDragStart?.(e, ray, lastHit) };
    if (drag.data === false) { drag = null; return; }
    stage.controls.enabled = false;
    try { el.setPointerCapture(e.pointerId); } catch {}
  }, { capture: true });

  el.addEventListener("pointermove", (e) => {
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = drag.y - e.clientY;
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      toNdc(e);
      ray.setFromCamera(ndc, stage.camera);
      drag.t.onDrag?.({ dx, dy, ray, data: drag.data, event: e });
      return;
    }
    if (!enabled) return;
    const t = pick(e);
    if (t !== hover) {
      hover = t;
      el.style.cursor = t ? "grab" : "";
    }
  });

  const end = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    stage.controls.enabled = true;
    if (d.moved < 4 && d.t.onTap) d.t.onTap();
    d.t.onDragEnd?.({ ray, data: d.data });
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);

  stage.onFrame((dt, dtReal, t) => {
    syncAccents();
    const pulse = 0.12 + 0.1 * Math.sin(t * 3);
    accent.emissiveIntensity = drag ? 0.7 : hover ? 0.55 : pulse;
  });

  function probe() {
    const results = [];
    const r = el.getBoundingClientRect();
    const v = new THREE.Vector3();
    for (const t of targets) {
      if (!t.enabled()) continue;
      const m = t.meshes.find((x) => x.visible && visibleChain(x));
      if (!m) continue;
      if (m.isInstancedMesh) {
        const mx = new THREE.Matrix4();
        m.getMatrixAt(m.count - 1, mx);
        v.setFromMatrixPosition(mx).applyMatrix4(m.matrixWorld);
      } else m.getWorldPosition(v);
      v.project(stage.camera);
      if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1) { results.push({ ok: false, why: "off-screen" }); continue; }
      const x = r.left + ((v.x + 1) / 2) * r.width;
      const y = r.top + ((1 - v.y) / 2) * r.height;
      const fire = (type, dx = 0, dy = 0) => el.dispatchEvent(new PointerEvent(type, { clientX: x + dx, clientY: y + dy, pointerId: 7, bubbles: true, cancelable: true, button: 0, buttons: type === "pointerup" ? 0 : 1 }));
      fire("pointerdown");
      const grabbed = !!drag || !t.onDrag;
      fire("pointermove", 12, -18);
      fire("pointermove", 30, -40);
      fire("pointerup", 30, -40);
      results.push({ ok: grabbed, why: grabbed ? "" : "pointer did not grab it" });
    }
    return results;
  }

  return {
    register,
    probe,
    get dragging() { return !!drag; },
    setEnabled(v) { enabled = v; if (!v) el.style.cursor = ""; },
  };
}

export function detentValue(value, step, min, max) {
  return Math.max(min, Math.min(max, Math.round(value / step) * step));
}
