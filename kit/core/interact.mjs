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

  function register(meshes, handlers) {
    const t = { meshes, enabled: () => true, ...handlers };
    targets.push(t);
    return t;
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
    el.setPointerCapture(e.pointerId);
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
    const pulse = 0.12 + 0.1 * Math.sin(t * 3);
    accent.emissiveIntensity = drag ? 0.7 : hover ? 0.55 : pulse;
  });

  return {
    register,
    get dragging() { return !!drag; },
    setEnabled(v) { enabled = v; if (!v) el.style.cursor = ""; },
  };
}

export function detentValue(value, step, min, max) {
  return Math.max(min, Math.min(max, Math.round(value / step) * step));
}
