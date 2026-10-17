import * as THREE from "three";
import { rbox, chamferCyl, toZ, M4, canvasTex } from "../geo.mjs";

// ---------------------------------------------------------------------------------------------
// Phosphor plot: a pure 2D-canvas renderer for scope screens (and any plot texture).
// spec = {
//   x: [min, max], y: [min, max], div: [10, 8],            graticule divisions
//   xLabel, yLabel, title, unitX: "s", unitY: "rad/s",
//   traces: [{ x: [...] | t0+dt, y: [...], color, width, dash: [a, b], dots: true, every, upto: seconds, glow, label }],   dots: one per `every` samples (default ~140 per trace)
//   hlines: [{ y, color, dash, label }], vlines: [{ x, color, dash, label }],
//   bands: [{ x0, x1, y0, y1, color, hatch }],               e.g. a spec window, hatched when violated
//   cursor: seconds,                                          the beam position (a bright dot on each trace)
//   readout: ["line 1", "line 2"], readoutAt: "tl"|"tr"|"bl"|"br" (default "tl")
//   legendAt: "tl"|"tr"|"bl"|"br" (default "br")
//   legend: true,
// }
// Colours are CSS strings. Lines are thick enough to read on a phone at ~1/3 screen width.
export const SCOPE_COLORS = { phosphor: "#3cff8f", rig: "#f2ebdd", demand: "#f0e442", error: "#d55e00", current: "#56b4e9", force: "#009e73", grid: "rgba(60,255,143,.16)", gridMajor: "rgba(60,255,143,.34)", text: "rgba(60,255,143,.85)", bg: "#06100a" };

export function drawPlot(g, w, h, spec = {}) {
  const C = SCOPE_COLORS;
  const [x0, x1] = spec.x ?? [0, 1];
  const [y0, y1] = spec.y ?? [-1, 1];
  const [nx, ny] = spec.div ?? [10, 8];
  const pad = { l: Math.round(w * 0.125), r: Math.round(w * 0.025), t: Math.round(h * 0.11), b: Math.round(h * 0.12) };
  const W = w - pad.l - pad.r, H = h - pad.t - pad.b;
  const X = (x) => pad.l + ((x - x0) / (x1 - x0)) * W;
  const Y = (y) => pad.t + (1 - (y - y0) / (y1 - y0)) * H;
  const fs = Math.round(h * (spec.font ?? 0.06));

  g.save();
  g.fillStyle = C.bg;
  g.fillRect(0, 0, w, h);
  const vig = g.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.7);
  vig.addColorStop(0, "rgba(60,255,143,.05)");
  vig.addColorStop(1, "rgba(0,0,0,.35)");
  g.fillStyle = vig;
  g.fillRect(0, 0, w, h);

  // graticule
  g.lineWidth = 1;
  for (let i = 0; i <= nx; i++) {
    g.strokeStyle = i === 0 || i === nx ? C.gridMajor : C.grid;
    g.beginPath(); g.moveTo(pad.l + (i / nx) * W, pad.t); g.lineTo(pad.l + (i / nx) * W, pad.t + H); g.stroke();
  }
  for (let j = 0; j <= ny; j++) {
    g.strokeStyle = j === 0 || j === ny ? C.gridMajor : C.grid;
    g.beginPath(); g.moveTo(pad.l, pad.t + (j / ny) * H); g.lineTo(pad.l + W, pad.t + (j / ny) * H); g.stroke();
  }
  // zero line
  if (y0 < 0 && y1 > 0) { g.strokeStyle = C.gridMajor; g.lineWidth = 2; g.beginPath(); g.moveTo(pad.l, Y(0)); g.lineTo(pad.l + W, Y(0)); g.stroke(); }

  // axis labels (min / max of each axis)
  g.fillStyle = C.text;
  g.font = `500 ${fs}px "JetBrains Mono", monospace`;
  g.textBaseline = "middle";
  g.textAlign = "right";
  const fmt = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2)).replace(/^-0(\.0+)?$/, "0");
  for (const v of spec.yTicks ?? [y0, (y0 + y1) / 2, y1]) g.fillText(fmt(v), pad.l - 8, Y(v));
  g.textAlign = "center";
  g.textBaseline = "top";
  for (const v of spec.xTicks ?? [x0, (x0 + x1) / 2, x1]) g.fillText(fmt(v) + (spec.unitX ?? ""), X(v), pad.t + H + 6);
  if (spec.yLabel) { g.textAlign = "left"; g.textBaseline = "top"; g.fillText(spec.yLabel, pad.l, 8); }
  if (spec.title) { g.textAlign = "center"; g.textBaseline = "top"; g.font = `700 ${fs}px "JetBrains Mono", monospace`; g.fillText(spec.title, pad.l + W / 2, 8); }

  g.save();
  g.beginPath();
  g.rect(pad.l, pad.t, W, H);
  g.clip();
  // bands (spec windows)
  for (const b of spec.bands ?? []) {
    const bx0 = X(b.x0 ?? x0), bx1 = X(b.x1 ?? x1), by0 = Y(b.y1 ?? y1), by1 = Y(b.y0 ?? y0);
    g.fillStyle = b.color ?? "rgba(60,255,143,.10)";
    g.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    if (b.hatch) {
      g.strokeStyle = b.hatch;
      g.lineWidth = 2;
      for (let k = -H; k < bx1 - bx0; k += 14) { g.beginPath(); g.moveTo(bx0 + k, by1); g.lineTo(bx0 + k + (by1 - by0), by0); g.stroke(); }
    }
  }
  for (const l of spec.hlines ?? []) {
    g.strokeStyle = l.color ?? C.demand; g.lineWidth = l.width ?? 2; g.setLineDash(l.dash ?? [10, 8]);
    g.beginPath(); g.moveTo(pad.l, Y(l.y)); g.lineTo(pad.l + W, Y(l.y)); g.stroke(); g.setLineDash([]);
  }
  for (const l of spec.vlines ?? []) {
    g.strokeStyle = l.color ?? C.gridMajor; g.lineWidth = l.width ?? 2; g.setLineDash(l.dash ?? [6, 6]);
    g.beginPath(); g.moveTo(X(l.x), pad.t); g.lineTo(X(l.x), pad.t + H); g.stroke(); g.setLineDash([]);
  }
  // traces
  for (const tr of spec.traces ?? []) {
    const n = tr.y.length;
    const xs = (k) => (tr.x ? tr.x[k] : (tr.t0 ?? 0) + k * (tr.dt ?? 1));
    const upto = tr.upto ?? Infinity;
    g.strokeStyle = g.fillStyle = tr.color ?? C.phosphor;
    g.lineWidth = tr.width ?? 4;
    g.lineJoin = g.lineCap = "round";
    g.setLineDash(tr.dash ?? []);
    if (tr.glow !== false) { g.shadowColor = tr.color ?? C.phosphor; g.shadowBlur = tr.glow ?? 10; }
    const stride = Math.max(1, Math.floor(n / (W * 1.2)));
    if (tr.dots) {
      const r = tr.dotSize ?? 2.4;
      for (let k = 0; k < n; k += tr.every ?? Math.max(1, Math.round(n / 140))) {
        const xv = xs(k);
        if (xv > upto) break;
        if (xv < x0 || xv > x1) continue;
        g.fillRect(X(xv) - r / 2, Y(tr.y[k]) - r / 2, r, r);
      }
    } else {
      g.beginPath();
      let started = false;
      for (let k = 0; k < n; k += stride) {
        const xv = xs(k);
        if (xv > upto) break;
        if (xv < x0 - (x1 - x0) * 0.02) continue;
        const px = X(xv), py = Y(Math.max(y0 - (y1 - y0), Math.min(y1 + (y1 - y0), tr.y[k])));
        if (!started) { g.moveTo(px, py); started = true; } else g.lineTo(px, py);
      }
      g.stroke();
    }
    g.shadowBlur = 0;
    g.setLineDash([]);
    // beam dot at the cursor
    if (spec.cursor != null && tr.beam !== false && !tr.dots) {
      const k = Math.min(n - 1, Math.max(0, Math.round((Math.min(spec.cursor, upto) - (tr.x ? tr.x[0] : tr.t0 ?? 0)) / (tr.dt ?? 1))));
      if (xs(k) >= x0 && xs(k) <= x1) {
        g.shadowColor = "#ffffff"; g.shadowBlur = 18; g.fillStyle = "#eafff2";
        g.beginPath(); g.arc(X(xs(k)), Y(tr.y[k]), (tr.width ?? 4) * 1.3, 0, 7); g.fill();
        g.shadowBlur = 0;
      }
    }
  }
  g.restore();

  // legend (bottom-left inside the plot)
  if (spec.legend !== false) {
    const items = (spec.traces ?? []).filter((t) => t.label).concat((spec.hlines ?? []).filter((l) => l.label).map((l) => ({ ...l, dash: l.dash ?? [10, 8] })));
    g.font = `600 ${fs}px "JetBrains Mono", monospace`;
    g.textAlign = "left";
    g.textBaseline = "middle";
    const lc = spec.legendAt ?? "br";
    let ly = lc[0] === "t" ? pad.t + fs * 0.9 + 6 : pad.t + H - fs * 0.9 - (items.length - 1) * fs * 1.35;
    const boxW = Math.max(...items.map((it) => g.measureText(it.label).width), 0) + 72;
    const lx = lc[1] === "l" ? pad.l + 14 : pad.l + W - boxW + 2;
    if (items.length) {
      g.fillStyle = "rgba(4,10,6,.82)";
      g.fillRect(lx - 8, ly - fs * 0.9, boxW, items.length * fs * 1.35 + fs * 0.5);
    }
    for (const it of items) {
      g.strokeStyle = g.fillStyle = it.color ?? C.phosphor;
      if (it.dots) { for (let k = 0; k < 6; k++) g.fillRect(lx + k * 8, ly - 1.5, 3, 3); }
      else { g.lineWidth = Math.min(5, it.width ?? 4); g.setLineDash(it.dash ?? []); g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + 44, ly); g.stroke(); g.setLineDash([]); }
      g.fillText(it.label, lx + 56, ly);
      ly += fs * 1.35;
    }
  }
  // readout block (top-right)
  if (spec.readout?.length) {
    g.font = `700 ${Math.round(fs * 1.05)}px "JetBrains Mono", monospace`;
    g.textBaseline = "top";
    const rc = spec.readoutAt ?? "tl";
    let ry = rc[0] === "b" ? pad.t + H - spec.readout.length * fs * 1.4 - 8 : pad.t + 10;
    const rw = Math.max(...spec.readout.map((s) => g.measureText(typeof s === "string" ? s : s.text).width)) + 24;
    const right = rc[1] === "r";
    g.textAlign = right ? "right" : "left";
    const rx = right ? pad.l + W - rw - 6 : pad.l + 6;
    g.fillStyle = "rgba(4,10,6,.82)";
    g.fillRect(rx, ry - 6, rw + 2, spec.readout.length * fs * 1.4 + 8);
    for (const s of spec.readout) {
      const item = typeof s === "string" ? { text: s } : s;
      g.fillStyle = item.color ?? C.phosphor;
      g.fillText(item.text, right ? pad.l + W - 16 : rx + 12, ry);
      ry += fs * 1.4;
    }
  }
  // scanlines
  g.fillStyle = "rgba(0,0,0,.18)";
  for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
  g.restore();
  return { X, Y, pad, W, H };
}

// ---------------------------------------------------------------------------------------------
// A bench oscilloscope: clay case, graphite bezel, big phosphor screen (canvas), decorative controls.
// Nothing on it is orange: the student never grabs the scope, they read it.
// Returns { group, draw(spec), screen, anchor(), screenAnchor() }.
export function benchScope(B, stage, { pos = [3.4, 0, -1.6], rotY = -0.45, width = 3.6, height = 2.25, res = [1024, 640], dynamicScreen = true } = {}) {
  const g = B.group({ pos, rot: [0, rotY, 0] });
  const depth = 1.5;
  const W = width + 1.1, H = height + 0.7;
  B.part(rbox(W, H, depth, 0.12, 4), "clay", { parent: g, pos: [0, H / 2 + 0.12, 0] });
  // feet and a tilt bail
  for (const x of [-W / 2 + 0.35, W / 2 - 0.35]) for (const z of [-depth / 2 + 0.25, depth / 2 - 0.25]) B.part(chamferCyl(0.12, 0.12, 0.03, 16), "rubber", { parent: g, pos: [x, 0.06, z], edges: false });
  // front bezel
  const bz = depth / 2 + 0.01;
  B.part(rbox(W - 0.16, H - 0.16, 0.06, 0.06), "graphite", { parent: g, pos: [0, H / 2 + 0.12, bz] });
  const sx = -0.42; // screen offset left, controls on the right
  B.part(rbox(width + 0.18, height + 0.18, 0.08, 0.05), "housing", { parent: g, pos: [sx, H / 2 + 0.12, bz + 0.03] });
  const tex = canvasTex(res[0], res[1], (ctx, w, h, spec) => drawPlot(ctx, w, h, spec ?? {}));
  const screenMat = new THREE.MeshBasicMaterial({ map: tex.tex, toneMapped: false, color: new THREE.Color(1.35, 1.35, 1.35) });
  const screen = B.part(new THREE.PlaneGeometry(width, height), screenMat, { parent: g, pos: [sx, H / 2 + 0.12, bz + 0.075], edges: false, cast: false, dynamic: dynamicScreen });
  // right-hand control column: decorative knobs (graphite), a BNC row (brass), a power switch
  const cx = W / 2 - 0.42;
  const knobs = [];
  for (let k = 0; k < 4; k++) knobs.push(M4(cx, H - 0.35 - k * 0.52, bz + 0.1, Math.PI / 2, 0, 0));
  B.inst(chamferCyl(0.15, 0.16, 0.03, 24), "carbon", knobs, { parent: g });
  const caps = knobs.map((m) => m.clone().multiply(M4(0, 0.085, 0)));
  B.inst(new THREE.BoxGeometry(0.03, 0.01, 0.12), "ink", caps, { parent: g, cast: false });
  const bnc = [];
  for (let k = 0; k < 2; k++) bnc.push(M4(cx - 0.18 + k * 0.36, 0.42, bz + 0.08, Math.PI / 2, 0, 0));
  B.inst(chamferCyl(0.08, 0.14, 0.02, 16), "brass", bnc, { parent: g });
  // vents on top
  const vents = [];
  for (let i = 0; i < 12; i++) vents.push(M4(-W / 2 + 0.6 + i * ((W - 1.2) / 11), H + 0.12 + 0.001, -0.1));
  B.inst(rbox(0.07, 0.02, 0.8, 0.01, 2), "hole", vents, { parent: g });
  let last = null;
  return {
    group: g,
    screen,
    draw(spec) { last = spec; tex.redraw(spec); },
    redraw() { tex.redraw(last); },
    probes: () => bnc.map((m) => g.localToWorld(new THREE.Vector3().setFromMatrixPosition(m))),
    anchor: () => g.localToWorld(new THREE.Vector3(sx, H + 0.45, bz)),
    screenAnchor: () => g.localToWorld(new THREE.Vector3(sx, H / 2 + 0.12, bz + 0.1)),
    bounds: () => new THREE.Box3().setFromObject(g),
  };
}
