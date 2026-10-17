import * as THREE from "three";
import { playable } from "../../kit/core/game.mjs";
import { bench } from "../../kit/core/parts/bench.mjs";
import { slottedLine, standingWave, probeCarriage, stubTuner, lumpedJig, dipoleAntenna, vna, smithInstrument, coaxCable } from "../../kit/core/parts/rf.mjs";
import { gammaOfZ } from "../../kit/core/smith.mjs";
import { SEMANTIC } from "../../kit/core/looks.mjs";
import * as M from "./model.mjs";
import verified from "./verified.json";

const SERIAL = "PLAYABLE-03";
const F0 = M.F0;
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtZ = (z) => `${z.re.toFixed(2)} ${z.im < 0 ? "−" : "+"} j${Math.abs(z.im).toFixed(2)}`;
const fmtC = (G) => `${G.re.toFixed(3)} ${G.im < 0 ? "−" : "+"} j${Math.abs(G.im).toFixed(3)}`;
const sgn0 = (v, d = 1) => { const s = v.toFixed(d); return /^-0\.?0*$/.test(s) ? (0).toFixed(d) : s.replace("-", "−"); };
const STUB_A = M.stubDesigns()[0];
const STUB_B = M.stubDesigns()[1];
const EXACT = M.lNetwork()[1];
const CW_L = 33.16e-9, CW_C = 0.909e-12;
const VMIN = 1 - M.abs(M.gammaOf(M.ZANT));
const DMIN = 4.547;

// knob maps (log scales so a drag feels even)
const logMap = (k, a, b) => a * (b / a) ** k;
const logInv = (v, a, b) => Math.log(v / a) / Math.log(b / a);
const L1 = [200e-9, 10e-9], C1 = [20e-12, 0.3e-12], L3 = [12e-9, 0.6e-9];

const CAMERA = { position: [2.2, 7.6, 13.8], target: [0.3, 1.3, -0.2], fov: 32, portraitFov: 50, maxDistance: 30, minAzimuth: -0.9, maxAzimuth: 0.9, avoidReadouts: true, focus: { min: [-6.2, 0, -3.0], max: [6.4, 4.3, 3.6] } };

async function build({ stage, B, audio, interaction, h, overlay }) {
  const plate = bench(B, stage, { serial: SERIAL, subtitle: "Match maker · WSC339 CW2 · Smith chart", plate: [-4.6, 3.2] });
  const line = slottedLine(B, stage, { x0: -3.15, x1: 3.15, z: 1.0, y: 0.45, lengthCm: 15 });
  const ant = dipoleAntenna(B, stage, { pos: [5.75, 0, 1.0], height: 2.0, arm: 0.8 });
  // feed from the load end of the line to the antenna
  B.part(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 16).rotateZ(Math.PI / 2), "insDark", { pos: [4.45, 0.45, 1.0], edges: false });
  coaxCable(B, stage, [[5.3, 0.45, 1.0], [5.6, 0.45, 1.0], [5.75, 0.8, 1.0], [5.75, 1.75, 1.0]], { radius: 0.06 });
  const an = vna(B, stage, { pos: [-4.75, 0, -1.25], rotY: 0.42, span: [0.5e9, 3.5e9] });
  const port = an.port();
  coaxCable(B, stage, [port, port.clone().add(v3(0.25, -0.2, 0.5)), v3(-3.9, 0.2, 1.0), v3(-3.45, 0.45, 1.0)], { radius: 0.06 });
  const smith = smithInstrument(B, stage, { pos: [0.7, 0, -2.75], radius: 1.7, tilt: 0.36, height: 2.75 });
  const wave = standingWave(stage, line, { lift: 0.66, height: 0.56 });
  const probe = probeCarriage(B, stage, line);
  const stub = stubTuner(B, stage, line, { maxCm: 6.6 });
  const jig = lumpedJig(B, stage, line, { name: "lnet", parts: [{ id: "C", kind: "C", label: "series C" }, { id: "L", kind: "L", label: "shunt L" }] });
  const jig1 = lumpedJig(B, stage, line, { name: "lumped", parts: [{ id: "L", kind: "L", label: "shunt L" }] });
  jig.setX(4.2);
  jig1.setX(line.xOf(3.5));

  // ------------------------------------------------------------------ state
  const S = { lvl: null, L: null, mode: "bare", f: F0, probe: 9, lnet: { L: L1[0], C: C1[0] }, lump: { L: 2.39e-9, d: 3.5 }, d: 9, l: 3.75, stubPick: "B",
    grabbed: false, phase: "map", moved: null, visits: {}, visitT: {}, bw: null, net: null };
  let dirty = true;

  function net() {
    const tot = M.LINE_M;
    if (S.mode === "lnet") return [{ t: "shuntL", L: S.lnet.L }, { t: "seriesC", C: S.lnet.C }, { t: "line", l: tot }];
    if (S.mode === "stub") return [{ t: "line", l: S.d / 100 }, { t: "stub", l: S.l / 100 }, { t: "line", l: tot - S.d / 100 }];
    if (S.mode === "lumped") return [{ t: "line", l: S.lump.d / 100 }, { t: "shuntL", L: S.lump.L }, { t: "line", l: tot - S.lump.d / 100 }];
    return [{ t: "line", l: tot }];
  }
  // the part of the network the Smith puck follows (load → the point that matters)
  function chartNet() {
    if (S.mode === "lnet") return net().slice(0, 2);
    if (S.mode === "stub") return net().slice(0, 2);
    if (S.mode === "lumped") return S.L?.full ? net() : net().slice(0, 2);
    return [{ t: "line", l: S.probe / 100 }];
  }

  const live = { G: M.cx(0), s11: 0, vswr: 1, z: M.cx(1), zc: M.cx(1), Gc: M.cx(0), pin: 0, pv: 0, Gf0: M.cx(0) };
  function recompute() {
    const n = net();
    S.net = n;
    live.G = M.s11(n, S.f);
    live.Gf0 = M.s11(n, F0);
    live.s11 = M.dB(M.abs(live.G));
    live.vswr = M.vswrOf(Math.min(0.9999, M.abs(live.G)));
    live.pin = 1 - M.abs(live.G) ** 2;
    const cn = chartNet();
    const tr = M.trail(cn, S.f, 48);
    live.zc = tr[tr.length - 1];
    live.Gc = gammaOfZ(live.zc);
    const lv = M.lineVoltage(n, S.f, 160);
    live.samples = lv.samples.map((s) => ({ x: s.x / lv.total, v: s.v }));
    const pd = lv.samples.reduce((b, s) => (Math.abs(s.d * 100 - S.probe) < Math.abs(b.d * 100 - S.probe) ? s : b));
    live.pv = M.abs(pd.v);
    wave.update(live.samples);
    // VNA trace
    const trace = [];
    for (let i = 0; i <= 300; i++) { const f = an.span[0] + ((an.span[1] - an.span[0]) * i) / 300; trace.push({ f, dB: M.s11dB(n, f) }); }
    const ghost = S.L?.ghost?.() ?? null;
    an.draw({ trace, ghost, marker: S.f, markerDB: live.s11, title: "S11", readout: S.L?.vnaNote?.() ?? "" });
    // Smith overlay
    const yL = M.inv(M.div(M.ZANT, M.cx(50)));
    const circles = [];
    const ty = S.L?.chart ?? "none";
    if (ty === "vswr" || ty === "stub") circles.push({ kind: "vswr", value: M.abs(M.gammaOf(M.ZANT)), color: SEMANTIC.signal, width: 4 });
    if (ty === "lnet") {
      circles.push({ kind: "r", value: 1, color: SEMANTIC.current, width: 3, dash: true });
      circles.push({ kind: "g", value: yL.re, color: SEMANTIC.force, width: 5 });
      const zAfterShunt = M.trail(cn.slice(0, 1), S.f, 2).pop();
      circles.push({ kind: "r", value: Math.max(0.01, zAfterShunt.re), color: SEMANTIC.current, width: 5 });
    }
    if (ty === "stub") {
      circles.push({ kind: "g", value: 1, color: SEMANTIC.force, width: 3 });
      const zj = M.trail(cn.slice(0, 1), S.f, 2).pop();
      const yj = M.inv(zj);
      circles.push({ kind: "g", value: Math.max(0.01, yj.re), color: SEMANTIC.force, width: 5 });
    }
    const marks = (S.L?.marks?.() ?? []).map((m) => ({ ...m }));
    smith.draw({ gamma: live.Gc, trail: tr.map(gammaOfZ), circles, marks });
    if (S.L?.bw) S.bw = M.bandwidth(n).bw;
    dirty = false;
  }

  // ------------------------------------------------------------------ controls
  const en = { probe: false, tee: false, short: false, jigL: false, jigC: false, lumpL: false, freq: false };
  const canGrab = () => S.phase === "play" || S.phase === "reveal";
  const tick = (a, b, step) => { if (Math.round(a / step) !== Math.round(b / step)) audio.detent(); };

  function setProbe(d) { const nd = clamp(d, 0, 15); tick(S.probe, nd, 0.5); S.probe = nd; probe.setD(nd); dirty = true; }
  function setD(d) {
    let nd = clamp(d, 0, 15);
    if (S.L?.snapAB) { nd = Math.abs(nd - 3.5) < Math.abs(nd - 5.58) ? 3.5 : 5.58; const pick = nd === 3.5 ? "A" : "B"; if (pick !== S.stubPick) { S.stubPick = pick; audio.clack?.(0.6); S.l = pick === "A" ? 1.29 : 6.21; stub.setL(S.l); } }
    tick(S.d, nd, 0.5);
    S.d = nd; stub.setD(nd); dirty = true;
  }
  function setL(l) { const nl = clamp(l, 0.05, 6.6); tick(S.l, nl, 0.25); S.l = nl; stub.setL(nl); dirty = true; }
  function setLnet(which, v, quiet) {
    if (which === "L") { const nv = clamp(v, L1[1], L1[0]); if (!quiet) tick(S.lnet.L * 1e9, nv * 1e9, 1); S.lnet.L = nv; jig.knobs.L.set(logInv(nv, ...L1)); }
    else { const nv = clamp(v, C1[1], C1[0]); if (!quiet) tick(S.lnet.C * 1e13, nv * 1e13, 1); S.lnet.C = nv; jig.knobs.C.set(logInv(nv, ...C1)); }
    if (!quiet && S.L?.oneAtATime) {
      // one trimmer at a time: touching one puts the other back to the coursework value
      const other = which === "L" ? "C" : "L";
      const cw = other === "L" ? CW_L : CW_C;
      if (Math.abs((S.lnet[other] - cw) / cw) > 1e-6) { setLnet(other, cw, true); audio.clack?.(0.5); flash(`${other === "L" ? "L" : "C"} back to the coursework's ${other === "L" ? "33.16 nH" : "0.909 pF"}: one trimmer at a time`); }
    }
    dirty = true;
  }
  function setLump(v, quiet) { const nv = clamp(v, L3[1], L3[0]); if (!quiet) tick(S.lump.L * 1e10, nv * 1e10, 1); S.lump.L = nv; jig1.knobs.L.set(logInv(nv, ...L3)); dirty = true; }
  function setF(f) { const nf = clamp(Math.round(f / 1e6) * 1e6, an.span[0], an.span[1]); tick(S.f, nf, 50e6); S.f = nf; an.setKnob((nf - an.span[0]) / (an.span[1] - an.span[0])); dirty = true; }

  const flash = (text) => {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(flash.t);
    flash.t = setTimeout(() => (el.hidden = true), 2600);
  };

  interaction.register(probe.grab, {
    enabled: () => en.probe && canGrab(),
    onDragStart: (e, rc) => { S.grabbed = true; const d = probe.fromRay(rc); return { off: d == null ? 0 : d - S.probe }; },
    onDrag: ({ ray, data }) => { const d = probe.fromRay(ray); if (d != null) setProbe(d - data.off); },
  });
  interaction.register(stub.grabTee, {
    enabled: () => en.tee && canGrab(),
    onDragStart: (e, rc) => { S.grabbed = true; const d = stub.dFromRay(rc); return { off: d == null ? 0 : d - S.d }; },
    onDrag: ({ ray, data }) => { const d = stub.dFromRay(ray); if (d != null) setD(Math.round((d - data.off) / 0.05) * 0.05); },
  });
  interaction.register(stub.grabShort, {
    enabled: () => en.short && canGrab(),
    onDragStart: (e, rc) => { S.grabbed = true; const l = stub.lFromRay(rc); return { off: l == null ? 0 : l - S.l }; },
    onDrag: ({ ray, data }) => { const l = stub.lFromRay(ray); if (l != null) setL(Math.round((l - data.off) / 0.01) * 0.01); },
  });
  for (const id of ["L", "C"]) {
    interaction.register(jig.knobs[id].grab, {
      enabled: () => (id === "L" ? en.jigL : en.jigC) && canGrab(),
      onDragStart: () => { S.grabbed = true; return id === "L" ? logInv(S.lnet.L, ...L1) : logInv(S.lnet.C, ...C1); },
      onDrag: ({ dx, dy, data }) => { const k = clamp(data + (dy + dx * 0.5) / 700, 0, 1); setLnet(id, id === "L" ? logMap(k, ...L1) : logMap(k, ...C1)); },
    });
  }
  interaction.register(jig1.knobs.L.grab, {
    enabled: () => en.lumpL && canGrab(),
    onDragStart: () => { S.grabbed = true; return logInv(S.lump.L, ...L3); },
    onDrag: ({ dx, dy, data }) => setLump(logMap(clamp(data + (dy + dx * 0.5) / 700, 0, 1), ...L3)),
  });
  interaction.register(an.grab, {
    enabled: () => en.freq && canGrab(),
    onDragStart: () => { S.grabbed = true; return S.f; },
    onDrag: ({ dx, dy, data }) => setF(data + (dy + dx * 0.6) * 2.5e6),
  });

  // orange means "grab me": controls that are off in a level are repainted in housing grey
  const armed = new Map();
  function arm(objs, on) {
    for (const o of objs) o.traverse((m) => {
      if (!m.isMesh) return;
      if (!armed.has(m)) { const r = m.material === stage.mat("accent") ? "accent" : m.material === stage.mat("accentDark") ? "accentDark" : null; if (!r) return; armed.set(m, r); }
      const r = armed.get(m);
      m.material = on ? stage.mat(r) : stage.mat(r === "accent" ? "housing" : "graphite");
    });
  }
  const CTRL = { probe: probe.grab, tee: stub.grabTee, short: stub.grabShort, jigL: jig.knobs.L.grab, jigC: jig.knobs.C.grab, lumpL: jig1.knobs.L.grab, freq: [an.knob] };

  // ------------------------------------------------------------------ levels (world side)
  const LV = {
    Q0: { mode: "bare", chart: "vswr", controls: ["probe"], hint: "Slide the orange probe", hintAt: () => probe.anchor(), init: () => setProbe(9) },
    Q1: { mode: "lnet", chart: "lnet", controls: ["jigL", "jigC"], hint: "Turn the orange trimmers", hintAt: () => jig.knobs.L.anchor(), init: () => { setLnet("L", L1[0], true); setLnet("C", C1[0], true); } },
    Q1b: { mode: "lnet", chart: "lnet", oneAtATime: true, controls: ["jigL", "jigC", "freq"], hint: "One trimmer at a time", hintAt: () => jig.knobs.C.anchor(), init: () => { setLnet("L", CW_L, true); setLnet("C", CW_C, true); },
      ghost: () => sweep([{ t: "shuntL", L: EXACT.shunt.L }, { t: "seriesC", C: EXACT.series.C }, { t: "line", l: 0.15 }]), vnaNote: () => "ghost: exact design" },
    Q2a: { mode: "stub", chart: "stub", controls: ["tee"], hint: "Slide the orange tee", hintAt: () => stub.teeAnchor(), init: () => { setD(9.5); setL(3.75); } },
    Q2b: { mode: "stub", chart: "stub", controls: ["short"], hint: "Slide the orange short", hintAt: () => stub.shortAnchor(), init: () => { setD(STUB_A.d * 100); setL(3.75); } },
    Q2c: { mode: "stub", chart: "stub", snapAB: true, bw: true, controls: ["tee", "freq"], hint: "Turn the VNA knob, then swap the stub", hintAt: () => an.knobAnchor(), init: () => { S.stubPick = "B"; S.d = 5.58; S.l = 6.21; stub.setD(5.58); stub.setL(6.21); },
      ghost: () => sweep(S.stubPick === "A" ? M.CW.q2b : M.CW.q2a), vnaNote: () => `stub ${S.stubPick} · ghost: stub ${S.stubPick === "A" ? "B" : "A"}` },
    Q3: { mode: "lumped", chart: "stub", controls: ["lumpL"], hint: "Turn the orange trimmer", hintAt: () => jig1.knobs.L.anchor(), init: () => setLump(L3[0], true),
      ghost: () => sweep(M.CW.q2a), vnaNote: () => "ghost: stub A" },
    Q4: { mode: "lumped", chart: "q4", full: true, controls: ["freq"], hint: "Turn the VNA knob", hintAt: () => an.knobAnchor(), init: () => { setLump(2.39e-9, true); S.visits = {}; S.visitT = {}; setF(1.5e9); } },
    Boss: { mode: "stub", chart: "stub", bw: true, controls: ["tee", "short"], hint: "Slide the tee and the short", hintAt: () => stub.teeAnchor(), init: () => { setD(12); setL(3.75); } },
  };
  LV.Q3.marks = () => [];
  LV.Q2a.marks = () => (S.phase === "reveal" ? [{ gamma: M.gammaOf(M.zLine(M.ZANT, STUB_A.d, F0)), label: "A", color: SEMANTIC.force }, { gamma: M.gammaOf(M.zLine(M.ZANT, STUB_B.d, F0)), label: "B", color: SEMANTIC.force }] : []);
  LV.Q0.marks = () => [{ gamma: M.gammaOf(M.ZANT), label: "ZL", color: SEMANTIC.signal, size: 7 }];
  LV.Q1.marks = LV.Q1b.marks = () => [{ gamma: M.gammaOf(M.ZANT), label: "ZL", color: SEMANTIC.signal, size: 7 }];
  function sweep(n) { const out = []; for (let i = 0; i <= 300; i++) { const f = an.span[0] + ((an.span[1] - an.span[0]) * i) / 300; out.push({ f, dB: M.s11dB(n, f) }); } return out; }

  // ------------------------------------------------------------------ HUD hint
  const hint = h("div", { class: "tag grab" }, "");
  overlay.append(hint);

  function setLevel(l) {
    S.lvl = l;
    S.L = l ? LV[l.id] : null;
    S.grabbed = false;
    S.mode = S.L?.mode ?? "bare";
    S.f = F0;
    an.setKnob((F0 - an.span[0]) / (an.span[1] - an.span[0]));
    S.visits = {};
    S.visitT = {};
    S.bw = null;
    for (const k of Object.keys(en)) { en[k] = !!S.L?.controls.includes(k); arm(CTRL[k], en[k] || !l); }
    probe.setVisible(S.mode === "bare" && !!l);
    stub.setVisible(S.mode === "stub");
    jig.setVisible(S.mode === "lnet");
    jig1.setVisible(S.mode === "lumped");
    S.probe = 9;
    probe.setD(9);
    S.L?.init?.();
    if (!l) { S.probe = DMIN; setProbe(DMIN); }
    dirty = true;
    recompute();
  }

  const world = {
    S, live, LV, stub, jig, jig1, an, smith, CTRL,
    setLevel,
    get chart() { return live; },
    reveal(on) { dirty = true; if (on) recompute(); },
    redraw() { plate.redrawPlate(); line.redraw(); an.redraw(); smith.redraw(); jig.redraw(); jig1.redraw(); },
    anchors() {
      const show = S.L && !S.grabbed && S.phase === "play";
      hint.hidden = !show;
      if (!show) return [];
      hint.textContent = S.L.hint;
      return [{ el: hint, at: S.L.hintAt }];
    },
    onKey(e, phase) {
      if (phase !== "play" && phase !== "reveal") return;
      const k = e.key;
      const fine = e.shiftKey ? 0.2 : 1;
      let used = true;
      if (en.probe && (k === "ArrowLeft" || k === "ArrowRight")) setProbe(S.probe + (k === "ArrowLeft" ? 0.05 : -0.05) * fine * 5);
      else if (en.tee && (k === "ArrowLeft" || k === "ArrowRight")) setD(S.L.snapAB ? (k === "ArrowLeft" ? 5.58 : 3.5) : S.d + (k === "ArrowLeft" ? 0.05 : -0.05) * fine * 2);
      else if (en.short && (k === "ArrowUp" || k === "ArrowDown")) setL(S.l + (k === "ArrowUp" ? 0.05 : -0.05) * fine);
      else if (en.jigL && (k === "ArrowUp" || k === "ArrowDown")) setLnet("L", S.lnet.L * (k === "ArrowUp" ? 1 - 0.01 * fine : 1 + 0.01 * fine));
      else if (en.jigC && (k === "ArrowLeft" || k === "ArrowRight")) setLnet("C", S.lnet.C * (k === "ArrowRight" ? 1 - 0.01 * fine : 1 + 0.01 * fine));
      else if (en.lumpL && (k === "ArrowUp" || k === "ArrowDown")) setLump(S.lump.L * (k === "ArrowUp" ? 1 - 0.01 * fine : 1 + 0.01 * fine));
      else if (en.freq && (k === "," || k === "." || ((k === "ArrowLeft" || k === "ArrowRight") && !en.tee) || ((k === "ArrowUp" || k === "ArrowDown") && !en.jigL))) setF(S.f + ((k === "." || k === "ArrowRight" || k === "ArrowUp") ? 5e6 : -5e6) * (e.shiftKey ? 10 : 1));
      else used = false;
      if (used) { S.grabbed = true; e.preventDefault(); }
    },
    step(dt, dtReal, t, phase) {
      if (phase !== S.phase) { S.phase = phase; dirty = true; }
      if (S.L === LV.Q4 && phase === "play") {
        for (const g of [1, 2, 3]) {
          const near = Math.abs(S.f - g * 1e9) <= 15e6;
          S.visitT[g] = near ? (S.visitT[g] ?? 0) + dtReal : 0;
          if (S.visitT[g] > 0.4 && !S.visits[g]) { S.visits[g] = { G: M.q4GammaIn(g * 1e9) }; audio.commit(); }
        }
      }
      if (dirty) recompute();
      wave.tick(dt);
      const pin = S.lvl ? 1 - M.abs(live.Gf0) ** 2 : 0.98;
      ant.update(S.lvl ? 1 - M.abs(live.G) ** 2 : 0.98, dt);
      const bead = probe.bead;
      if (bead.visible) bead.position.set(line.xOf(S.probe), wave.heightAt(line.xOf(S.probe)), line.z);
      if (S.lvl && phase === "play") { audio.hiss?.(Math.min(0.06, M.abs(live.G) ** 2 * 0.07)); audio.motor?.("carrier", 180 + (S.f / 1e9) * 60, (1 - M.abs(live.G) ** 2) * 0.025, 700); }
      else { audio.hiss?.(0); audio.motor?.("carrier", 200, 0, 700); }
      void pin;
    },
    solve(sol) {
      S.grabbed = true;
      if (sol.probe != null) setProbe(sol.probe);
      if (sol.L != null) setLnet("L", sol.L, true);
      if (sol.C != null) setLnet("C", sol.C, true);
      if (sol.d != null) setD(sol.d);
      if (sol.l != null) setL(sol.l);
      if (sol.stub) setD(sol.stub === "A" ? 3.5 : 5.58);
      if (sol.lump != null) setLump(sol.lump, true);
      if (sol.f != null) setF(sol.f);
      if (sol.visit) for (const g of sol.visit) S.visits[g] = { G: M.q4GammaIn(g * 1e9) };
      recompute();
    },
  };
  setLevel(null);
  return world;
}

// ------------------------------------------------------------------ Toolbox
const equations = [
  { id: "gamma", f: "Γ = (ZL − Z0)/(ZL + Z0) · VSWR = (1 + |Γ|)/(1 − |Γ|)", source: "CW2 Q1 · Lab 1", live: (w) => `|Γ| = ${M.abs(w.live.G).toFixed(3)} · VSWR ${w.live.vswr.toFixed(2)} · ${(M.abs(w.live.G) ** 2 * 100).toFixed(1)} % reflected` },
  { id: "circles", f: "series jx → along constant r · shunt jb → along constant g", source: "CW2 Q1", live: (w) => `z = ${fmtZ(w.live.zc)}` },
  { id: "lvalues", f: "L = Z0/(ω|b|) · C = 1/(ω|x|·Z0) · ω = 2πf", source: "CW2 Q1", live: () => `ω = ${(M.omega(F0) / 1e9).toFixed(3)} × 10⁹ rad/s at 2 GHz` },
  { id: "rotate", f: "Γ(d) = ΓL · e^(−j2βd) · one turn = λ/2", source: "CW2 Q2", live: (w) => `λ = ${(M.lambda(w.S.f) * 100).toFixed(2)} cm at ${(w.S.f / 1e9).toFixed(3)} GHz` },
  { id: "stub", f: "shorted stub: y = −j·cot(βℓ)", source: "CW2 Q2", live: (w) => (w.S.mode === "stub" ? `ℓ = ${w.S.l.toFixed(2)} cm → y = −j${(1 / Math.tan(M.beta(w.S.f) * w.S.l / 100)).toFixed(2)}` : "") },
  { id: "bw", f: "a match is narrowband: the nearer the load, the wider", source: "CW2 Q2", live: (w) => `−10 dB band: ${(M.bandwidth(w.S.net ?? []).bw / 1e6).toFixed(0)} MHz` },
  { id: "zsc", f: "Zsc = jZ0·tan(βℓ) → L = X/ω or C = 1/(ω|X|)", source: "CW2 Q3", live: () => "1.29 cm → +j30.0 Ω → 2.39 nH" },
  { id: "cascade", f: "Γin = S11 + S12·S21·Γ′ / (1 − S22·Γ′), port by port", source: "CW2 Q4", live: (w) => `Γin = ${fmtC(w.live.G)} at ${(w.S.f / 1e9).toFixed(2)} GHz` },
];

// ------------------------------------------------------------------ Levels
const s11 = (w) => w.live.s11;
const s11At2 = (w) => M.dB(M.abs(w.live.Gf0));
const dbTxt = (v) => (v < -60 ? "< −60 dB" : `${sgn0(v)} dB`);
const FULL = { min: [-6.0, 0, -3.0], max: [6.4, 5.0, 2.2] };
const RIGHT = { min: [-3.4, 0, -3.0], max: [6.4, 5.0, 2.0] };
const LINE = { min: [-3.4, 0, -3.0], max: [3.6, 5.0, 3.8] };
const Q1F = { min: [-1.6, 0, -3.0], max: [6.3, 5.0, 2.0] };
const VNAF = { min: [-6.0, 0, -3.0], max: [3.6, 5.0, 2.2] };
const LEFT = { min: [-6.0, 0, -3.0], max: [3.6, 5.0, 3.8] };
const Q0F = { min: [-3.6, 0, -3.0], max: [3.6, 5.0, 2.0] };

const levels = [
  {
    id: "Q0", anchor: "Q1 · Lab 1", mechanic: "predict", source: "CW2 Q1 · Lab 1", title: "The mismatch you can see", focus: Q0F,
    brief: "The coursework's antenna, 72 + j100 Ω, hangs straight off the 15 cm, 50 Ω line. The blue curtain over the line is the voltage envelope; the bright line inside is the wave itself. The puck on the Smith chart shows the impedance you'd see looking towards the antenna from the probe.",
    readouts: ["s11", "probeV", "probeD", "z"], hide: ["s11"],
    predict: { type: "choice", prompt: "Of the power sent up the line, how much bounces back off the antenna?", options: ["About 5 %: 72 Ω is close to 50 Ω", "About 20 %", "About 42 %", "About 80 %"], answer: 2 },
    goal: {
      text: "Park the probe on a voltage minimum",
      instructions: "Drag the orange probe along the slotted line (or ←/→). Find where the voltage is smallest. Watch the puck: it circles the chart as you move.",
      check: (w) => w.live.pv < VMIN + 0.012,
      status: (w) => `|V| = ${w.live.pv.toFixed(3)} at ${w.S.probe.toFixed(2)} cm`,
      hold: 1.0,
    },
    hint: "There is a minimum 4.5 cm from the antenna, and another half a wavelength (7.5 cm) further.",
    reveal: {
      title: "42 % comes straight back",
      body: "The +j100 Ω matters as much as the 72 Ω: |Γ| = 0.649, so |Γ|² = 42 % of the power reflects and the line carries a standing wave with VSWR 4.70. The minimum you found (0.351 = 1 − |Γ|) sits 4.55 cm from the load, where the puck crosses the real axis at r = 1/VSWR = 0.21. Moving along the line only spins the puck around the yellow |Γ| circle; it never gets closer to the centre.",
      equations: [{ f: "Γ = (ZL − Z0)/(ZL + Z0) = 0.510 + j0.402", live: (w) => `|Γ| = ${M.abs(M.gammaOf(M.ZANT)).toFixed(3)} · ${(M.abs(M.gammaOf(M.ZANT)) ** 2 * 100).toFixed(1)} % reflected` }, { f: "VSWR = Vmax/Vmin = (1 + |Γ|)/(1 − |Γ|)", live: () => "1.649 / 0.351 = 4.70" }],
      note: "Checked claims: CW2 Q4's ΓL = 0.510 + 0.402j is right. Lab 1's VSWR 1.45 → |Γ| = 0.184, RL 14.7 dB and 3.386 % reflected are right too.",
      unlock: "gamma",
      tags: [{ text: "Vmin = 1 − |Γ|", at: () => new THREE.Vector3(3.15 - DMIN * 0.42, 1.45, 1.0) }],
    },
    recall: { q: "Lab 1 measured VSWR = 1.45 on a 50 Ω line. What is |Γ|?", options: ["0.184", "0.45", "0.69"], answer: 0 },
    solution: { probe: DMIN },
  },
  {
    id: "Q1", anchor: "Q1", mechanic: "tune", source: "CW2 Q1", title: "Shunt first, then series", focus: Q1F,
    brief: "Q1 builds a lumped L-network at the antenna: one shunt inductor, one series capacitor. The jig is clamped at the antenna terminals with both trimmers wound right out, so the puck sits on the load, zL = 1.44 + j2.",
    readouts: ["s11", "z", "Lval", "Cval", "power"],
    predict: { type: "choice", prompt: "zL = 1.44 + j2. Which element has to sit right at the antenna?", options: ["A series part: it slides along the r = 1.44 circle", "A shunt part: it slides along the g = 0.24 circle", "Either order works"], answer: 1 },
    goal: {
      text: "Get S11 below −30 dB at 2 GHz",
      instructions: "Turn the shunt L trimmer (↑/↓) until the puck rides the green g circle onto the dashed r = 1 circle. Then turn the series C trimmer (←/→) to slide along that circle into the centre.",
      check: (w) => s11At2(w) < -30,
      status: (w) => `${dbTxt(s11At2(w))} at 2 GHz · L ${(w.S.lnet.L * 1e9).toFixed(1)} nH · C ${(w.S.lnet.C * 1e12).toFixed(3)} pF`,
      hold: 1.0,
    },
    hint: "Aim the shunt L for about 41 nH: the puck lands on r = 1 at z = 1 + j1.79. Then C ≈ 0.89 pF.",
    reveal: {
      title: "41.4 nH and 0.887 pF",
      body: "A series part only adds jx, so it slides along its circle of constant r; a shunt part adds jb, so it slides along its circle of constant g. A series-first route would have to reach the g = 1 circle, but every point on that circle has r ≤ 1 and the load sits at r = 1.44: it can never get there. So the shunt part goes first. Shunting −j0.096 (an inductor) lands on z = 1 + j1.79, and a series capacitor's −j1.79 takes it to the centre.",
      equations: [{ f: "L = Z0/(ω·|b|) = 50/(1.257·10¹⁰ × 0.096)", live: (w) => `= 41.4 nH (yours ${(w.S.lnet.L * 1e9).toFixed(1)} nH)` }, { f: "C = 1/(ω·|x|·Z0) = 1/(1.257·10¹⁰ × 1.794 × 50)", live: (w) => `= 0.887 pF (yours ${(w.S.lnet.C * 1e12).toFixed(3)} pF)` }],
      note: "Shunt L + series C is one of two solutions; the other is a shunt 1.20 pF with a series 7.14 nH. Coursework: shunt inductor then series capacitor, right; z = 1.44 + j2, right.",
      unlock: "circles",
    },
    recall: { q: "Adding a series capacitor moves the point on the Smith chart along…", options: ["a circle of constant resistance r", "a circle of constant conductance g", "the |Γ| circle"], answer: 0 },
    solution: { L: EXACT.shunt.L, C: EXACT.series.C },
  },
  {
    id: "Q1b", anchor: "Q1", mechanic: "detective", source: "CW2 Q1 · MWO plot", title: "Check the coursework", focus: FULL,
    brief: "The jig now holds the coursework's own values: 33.16 nH and 0.909 pF. The VNA shows what the coursework's MWO plot showed: a dip of about −28 dB at 2.03 GHz, not at 2.00. The faint trace is the exact design.",
    readouts: ["s11", "z", "Lval", "Cval", "freq"],
    predict: { type: "choice", prompt: "Both values came from Smith-chart readings: b = −0.12 for the inductor, x = −1.75 for the capacitor. Which reading is further off?", options: ["The inductor's b = −0.12", "The capacitor's x = −1.75", "Neither: MWO's sweep is just coarse"], answer: 0 },
    goal: {
      text: "Beat −33 dB at 2 GHz moving ONE trimmer",
      instructions: "Moving one trimmer puts the other back to the coursework's value. Try each. Only one of them can fix the match on its own.",
      check: (w) => s11At2(w) < -33,
      status: (w) => `${dbTxt(s11At2(w))} at 2 GHz · L ${(w.S.lnet.L * 1e9).toFixed(2)} nH · C ${(w.S.lnet.C * 1e12).toFixed(3)} pF`,
      hold: 1.0,
    },
    hint: "The capacitor is within 3 %. Turn the inductor up to about 39 nH.",
    reveal: {
      title: "C was right; L was 20 % low",
      body: "The arithmetic is right (0.909 pF and 33.16 nH follow from the readings), and so is the topology. But the shunt step that lands on r = 1 is −0.096, not −0.12, so the inductor should be 41.4 nH. With 33.16 nH the puck overshoots the r = 1 circle and the series C can only bring it close: −27.4 dB at 2.000 GHz with the dip pulled up to 2.025 GHz, which is exactly the MWO plot. Still a usable match (0.18 % reflected), just not centred.",
      equations: [{ f: "b read −0.12 → exact −0.096 (25 % off)", live: () => "L = 33.16 nH → 41.4 nH" }, { f: "x read −1.75 → exact −1.794 (2.5 % off)", live: () => "C = 0.909 pF → 0.887 pF" }],
      note: "Verdicts, CW2 Q1: zL = 1.44 + j2 right · shunt L then series C right · C = 0.909 pF right (2.5 %) · L = 33.16 nH wrong (exact 41.4 nH) · \"confirms a match at 2 GHz\" partly: −27.4 dB at 2 GHz, dip at 2.025 GHz. The model reproduces the MWO plot's −27.8 dB dip.",
      unlock: "lvalues",
    },
    recall: { q: "An L-network's dip lands at 2.03 GHz instead of 2.00. The usual cause is…", options: ["a chart-reading error in one element value", "the 50 Ω line's length", "MWO's frequency step"], answer: 0 },
    solution: { L: 39.25e-9 },
  },
  {
    id: "Q2a", anchor: "Q2", mechanic: "tune", source: "CW2 Q2", title: "Where can the stub go?", focus: LINE,
    brief: "Q2 swaps the lumped parts for a short-circuited stub on a sliding tee. The short starts a quarter-wave (3.75 cm) out, where a shorted stub looks like an open circuit: electrically it isn't there yet. The puck shows the line's impedance at the tee.",
    readouts: ["s11", "d", "y", "z"],
    predict: { type: "choice", prompt: "The line is 15 cm long (one wavelength at 2 GHz). At how many places along it can a shunt stub match the antenna?", options: ["1", "2", "4", "Anywhere: the stub length does the work"], answer: 2 },
    goal: {
      text: "Park the tee where the line's conductance is exactly 1",
      instructions: "Drag the orange collar along the line (←/→). The puck spins clockwise around the yellow |Γ| circle. Stop when it lands on the green g = 1 circle.",
      check: (w) => Math.abs(M.inv(w.live.zc).re - 1) < 0.05,
      status: (w) => `d = ${w.S.d.toFixed(2)} cm · y = ${fmtZ(M.inv(w.live.zc))}`,
      hold: 1.0,
    },
    hint: "Point A is 3.5 cm from the antenna; point B is 5.6 cm.",
    reveal: {
      title: "Two per half-wavelength: four on 15 cm",
      body: "Moving d along the line rotates Γ by 2βd: one full turn every λ/2 = 7.5 cm. Each turn crosses the g = 1 circle twice, at A (3.51 cm, y = 1 + j1.71) and B (5.57 cm, y = 1 − j1.71). On a 15 cm line that pattern repeats, so 11.0 cm and 13.1 cm work too.",
      equations: [{ f: "Γ(d) = ΓL · e^(−j2βd)", live: (w) => `d = ${w.S.d.toFixed(2)} cm → ${(720 * w.S.d / 15).toFixed(0)}° of rotation` }, { f: "dA = 0.234λ = 3.51 cm · dB = 0.372λ = 5.57 cm" }],
      note: "Coursework: λ = 15 cm right; yL = 0.24 − j0.33 right; dA ≈ 3.5 cm (0.233λ) right; dB = 5.58 cm (0.373λ) right. \"Two points\" is what the question asked for; the line holds two more.",
      unlock: "rotate",
    },
    recall: { q: "Sliding a stub's position by λ/2 along the line…", options: ["brings back the same impedance", "inverts the impedance", "halves |Γ|"], answer: 0 },
    solution: { d: STUB_A.d * 100 },
  },
  {
    id: "Q2b", anchor: "Q2", mechanic: "tune", source: "CW2 Q2", title: "Trim the stub", focus: LINE,
    brief: "The tee is parked at point A, 3.51 cm from the antenna, where y = 1 + j1.71. The stub has to cancel the +j1.71 without touching the conductance.",
    readouts: ["s11", "l", "y", "power"],
    predict: { type: "choice", prompt: "The stub must add −j1.71 (inductive). Is the shorted stub shorter or longer than λ/4 = 3.75 cm?", options: ["Shorter: a short stub under λ/4 is inductive", "Longer: you need more line for more susceptance", "Exactly λ/4"], answer: 0 },
    goal: {
      text: "Get S11 below −25 dB at 2 GHz",
      instructions: "Drag the orange handle to slide the short along the stub (↑/↓). The puck moves along the green g = 1 circle. Bring it to the centre.",
      check: (w) => s11At2(w) < -25,
      status: (w) => `${dbTxt(s11At2(w))} at 2 GHz · ℓ = ${w.S.l.toFixed(2)} cm`,
      hold: 1.0,
    },
    hint: "About 1.3 cm.",
    reveal: {
      title: "1.26 cm of shorted line",
      body: "A shorted stub of length ℓ looks like y = −j·cot(βℓ): a short just behind the tee is a huge inductive susceptance, λ/4 is an open, and past λ/4 it turns capacitive. Cancelling +j1.71 needs cot(βℓ) = 1.71, so ℓ = 0.084λ = 1.26 cm. The antenna sees nothing different, but the line between the tee and the VNA now has VSWR 1: the curtain is flat from the tee to the generator and the standing wave is trapped between the tee and the antenna.",
      equations: [{ f: "y_stub = −j·cot(βℓ)", live: (w) => `ℓ = ${w.S.l.toFixed(2)} cm → −j${(1 / Math.tan(M.beta(F0) * w.S.l / 100)).toFixed(2)}` }, { f: "ℓA = 0.084λ = 1.26 cm · ℓB = 0.416λ = 6.23 cm" }],
      note: "Coursework: point A = 1 + j1.7 and LA ≈ 1.29 cm (0.086λ), right (within chart reading). LB = 6.21 cm (0.414λ), right. The coursework's MWO build of stub A gives −36.43 dB at 1.998 GHz; this model gives −36.43 dB.",
      unlock: "stub",
    },
    recall: { q: "A shorted stub exactly λ/4 long looks like…", options: ["an open circuit", "a short circuit", "a 50 Ω load"], answer: 0 },
    solution: { l: STUB_A.l * 100 },
  },
  {
    id: "Q2c", anchor: "Q2", mechanic: "predict", source: "CW2 Q2 · Graphs 2a, 2b", title: "Which stub is better?", focus: LEFT, bwLevel: true,
    brief: "Both of the coursework's stubs, exactly as built in MWO: A (3.5 cm, 1.29 cm) and B (5.58 cm, 6.21 cm). The report picks B because its marker reads −40.8 dB against A's −36.4 dB.",
    readouts: ["s11", "freq", "bw", "stubPick"],
    predict: { type: "choice", prompt: "Which stub keeps the antenna matched (S11 < −10 dB) over the wider band?", options: ["B: the deeper dip is the better match", "A: closer to the load, shorter stub", "Same: both are matched at 2 GHz"], answer: 1 },
    goal: {
      text: "Find a frequency 150 MHz from 2 GHz that is still matched",
      instructions: "Turn the VNA's orange knob (↑/↓, Shift for big steps) to move the marker. Slide the orange collars (←/→) to swap between stub B and stub A. You need S11 below −10 dB at least 150 MHz away from 2 GHz.",
      check: (w) => Math.abs(w.S.f - F0) >= 150e6 && w.live.s11 < -10,
      status: (w) => `stub ${w.S.stubPick} · ${(w.S.f / 1e9).toFixed(3)} GHz · ${dbTxt(w.live.s11)} · band ${(w.S.bw / 1e6).toFixed(0)} MHz`,
      hold: 0.8,
    },
    hint: "Stub B's band ends at 2.064 GHz. Swap to A and try 2.17 GHz.",
    reveal: {
      title: "A: 337 MHz against 148 MHz",
      body: "Both dips are excellent; their depth at one frequency only shows how well the lengths were rounded. What matters is how fast the match falls apart off 2 GHz. Stub A stays below −10 dB from 1.842 to 2.180 GHz (337 MHz); stub B only from 1.916 to 2.064 GHz (148 MHz). B has a longer stub and more mismatched line between it and the load, and every extra wavelength there changes faster with frequency.",
      equations: [{ f: "BW(−10 dB): A 337 MHz · B 148 MHz", live: (w) => `this stub: ${(w.S.bw / 1e6).toFixed(0)} MHz` }],
      note: "Coursework verdict, Q2: \"I would choose stub B as −40 dB is significantly lower than −36 dB\": wrong. The paragraph the report then quotes (keep the stub close to the load to improve bandwidth) is right, and it points to A.",
      unlock: "bw",
    },
    recall: { q: "Two stub matches both reach −36 dB or better at 2 GHz. Pick the one with…", options: ["the stub nearer the load", "the deeper dip", "the longer stub"], answer: 0 },
    solution: { stub: "A", f: 2.17e9 },
  },
  {
    id: "Q3", anchor: "Q3", mechanic: "tune", source: "CW2 Q3", title: "Swap the stub for a part", focus: LINE,
    brief: "Q3: no stubs allowed, but the replacement has to sit where stub A was, 3.5 cm from the antenna. The jig holds one shunt part on a trimmer. The faint VNA trace is stub A.",
    readouts: ["s11", "lumpL", "y", "power"],
    predict: { type: "choice", prompt: "Stub A is a 1.29 cm shorted stub, shorter than λ/4. Which lumped part replaces it?", options: ["A shunt inductor", "A shunt capacitor", "A series capacitor"], answer: 0 },
    goal: {
      text: "Get S11 below −30 dB at 2 GHz",
      instructions: "Turn the orange trimmer (↑/↓) to set the shunt inductor. The puck moves along the green g = 1 circle.",
      check: (w) => s11At2(w) < -30,
      status: (w) => `${dbTxt(s11At2(w))} at 2 GHz · L = ${(w.S.lump.L * 1e9).toFixed(2)} nH`,
      hold: 1.0,
    },
    hint: "Zsc = j50·tan(2π·1.29/15) = +j30 Ω. L = 30/ω.",
    reveal: {
      title: "2.39 nH does the stub's job, at one frequency",
      body: "At 2 GHz the 1.29 cm stub is +j30 Ω, and a 2.39 nH inductor is +j30 Ω too, so they match identically there. Away from 2 GHz they differ: the coil's reactance grows like ωL, the stub's like tan(βℓ). Compare the two traces: the coil's band is a little wider here (350 against 337 MHz).",
      equations: [{ f: "Zsc = jZ0·tan(βℓ) = j50·tan(2π·1.29/15)", live: () => "= +j30.0 Ω" }, { f: "L = X/ω", live: (w) => `= 30.0 / 1.257·10¹⁰ = 2.39 nH (yours ${(w.S.lump.L * 1e9).toFixed(2)} nH)` }],
      note: "Coursework Q3: +j30 Ω → shunt inductor 2.39 nH, right; −j30 Ω → shunt capacitor 2.65 pF for stub B, right (2.66 pF unrounded). MWO's −36.22 dB at 1.998 GHz and −36.54 dB at 2.003 GHz are reproduced to 0.01 dB.",
      unlock: "zsc",
    },
    recall: { q: "A shorted stub longer than λ/4 (but under λ/2) is replaced by a shunt…", options: ["capacitor", "inductor", "resistor"], answer: 0 },
    solution: { lump: 2.39e-9 },
  },
  {
    id: "Q4", anchor: "Q4", mechanic: "pilot", source: "CW2 Q4", title: "Γin at 1, 2 and 3 GHz", focus: VNAF,
    brief: "Q4 asks for Γin of the stub-A replacement (11.5 cm line, 2.39 nH, 3.5 cm line, antenna) at 1, 2 and 3 GHz, from a signal-flow graph. The coursework derives a formula but never evaluates it. Here the VNA evaluates it for you; the puck shows Γin itself.",
    readouts: ["s11", "freq", "gin", "gmag"],
    predict: { type: "number", prompt: "What is |Γin| at 3 GHz?", unit: "", min: 0, max: 1, step: 0.01, start: 0.3, answer: 0.785, tolerance: 0.1 },
    goal: {
      text: "Visit 1, 2 and 3 GHz",
      instructions: "Turn the VNA's orange knob (←/→, Shift for big steps). Hold the marker within 15 MHz of each frequency for a moment to log Γin.",
      check: (w) => [1, 2, 3].every((g) => w.S.visits[g]),
      status: (w) => [1, 2, 3].map((g) => `${g} GHz: ${w.S.visits[g] ? M.abs(w.S.visits[g].G).toFixed(3) : "…"}`).join(" · "),
      hold: 0.3,
    },
    hint: "The knob covers 0.5 to 3.5 GHz; Shift + ←/→ moves 50 MHz a step.",
    reveal: {
      title: "0.950, 0.016, 0.785",
      body: "Each 2-port wraps the next: Γ′ looking into the 3.5 cm line, then through the shunt coil, then through the 11.5 cm line, each time Γin = S11 + S12·S21·Γ′/(1 − S22·Γ′). At 2 GHz that gives 0.016 (−35.9 dB, the MWO marker). At 1 and 3 GHz the coil and the lines are all wrong for the load: 0.950 and 0.785.",
      equations: [{ f: "Γin = S11 + S12S21Γ′/(1 − S22Γ′), three times", live: (w) => `Γin = ${fmtC(w.live.G)} at ${(w.S.f / 1e9).toFixed(3)} GHz` }, { f: "1 GHz −0.656 − j0.687 · 2 GHz −0.006 + j0.015 · 3 GHz 0.569 + j0.541" }],
      note: "Coursework Q4: ΓL = 0.510 + 0.402j right; the shunt-inductor S-matrix right; βl = 0.4816 for 11.5 cm wrong (4.817 rad), and e^(−βl) is missing its j; the final Γin formula adds the loops term by term, which gives |Γin| = 0.256 at 2 GHz instead of 0.016, wrong; the three values were never computed.",
      unlock: "cascade",
    },
    recall: { q: "For a 2-port terminated in Γ′, Γin = …", options: ["S11 + S12S21Γ′/(1 − S22Γ′)", "S11 + S21Γ′", "S11·Γ′/(1 − S22)"], answer: 0 },
    solution: { visit: [1, 2, 3], f: 3e9 },
  },
  {
    id: "Boss", anchor: "Q2", mechanic: "boss", boss: true, source: "CW2 Q1–Q3", title: "Match Maker", focus: LEFT,
    brief: "Everything at once. The tee starts 12 cm out and the short at λ/4. Build a stub match from scratch that a real radio could live with: deep at 2 GHz AND wide.",
    readouts: ["s11", "d", "l", "bw", "power"],
    predict: { type: "choice", prompt: "Stub positions repeat every λ/2. Will the match at 11.0 cm be as good as the one at 3.5 cm?", options: ["Yes: same impedance, same match", "Same at 2 GHz, but narrower", "It won't match at all"], answer: 1 },
    goal: {
      text: "S11 < −20 dB at 2 GHz and a −10 dB band of 300 MHz",
      instructions: "Slide the collar (←/→) and the short (↑/↓). Watch the puck, the VNA trace and the band readout.",
      check: (w) => s11At2(w) < -20 && w.S.bw >= 300e6,
      status: (w) => `${dbTxt(s11At2(w))} at 2 GHz · band ${(w.S.bw / 1e6).toFixed(0)} MHz · d ${w.S.d.toFixed(2)} · ℓ ${w.S.l.toFixed(2)} cm`,
      hold: 1.5,
    },
    hint: "Only point A (3.5 cm, 1.26 cm) is wide enough: 332 MHz. 11.0 cm gives 121 MHz.",
    reveal: {
      title: "Close to the load, short stub, wide band",
      body: "All four positions match perfectly at 2 GHz, but the band shrinks with every extra length of mismatched line between the stub and the antenna: 332, 146, 121 and 84 MHz. Point A with a 1.26 cm stub is the only one over 300 MHz. That is the design rule behind Q2's last question.",
      equations: [{ f: "dA = 3.51 cm · ℓA = 1.26 cm", live: (w) => `yours: ${w.S.d.toFixed(2)} cm · ${w.S.l.toFixed(2)} cm → ${(w.S.bw / 1e6).toFixed(0)} MHz` }],
      note: "Bandwidths by position (exact designs): 3.51 cm 332 MHz · 5.57 cm 146 MHz · 11.01 cm 121 MHz · 13.07 cm 84 MHz. The antenna is modelled as the coursework's ZFREQ block (72 + j100 Ω at every frequency); a real antenna's own reactance would narrow every band further.",
    },
    solution: { d: STUB_A.d * 100, l: STUB_A.l * 100 },
  },
];

const readouts = [
  { key: "s11", label: "S11", unit: "dB · S11", big: true, get: (w) => w.live.s11, format: (v) => (v < -60 ? "<−60" : sgn0(v)) },
  { key: "freq", label: "f", unit: "GHz", get: (w) => w.S.f / 1e9, digits: 3 },
  { key: "probeV", label: "|V| probe", get: (w) => w.live.pv, digits: 3 },
  { key: "probeD", label: "probe d", unit: "cm", get: (w) => w.S.probe, digits: 2 },
  { key: "z", label: "z", get: (w) => 0, format: (v, w) => "" },
  { key: "y", label: "y", get: () => 0, format: () => "" },
  { key: "Lval", label: "shunt L", unit: "nH", get: (w) => w.S.lnet.L * 1e9, digits: 2 },
  { key: "Cval", label: "series C", unit: "pF", get: (w) => w.S.lnet.C * 1e12, digits: 3 },
  { key: "lumpL", label: "shunt L", unit: "nH", get: (w) => w.S.lump.L * 1e9, digits: 2 },
  { key: "d", label: "tee d", unit: "cm", get: (w) => w.S.d, digits: 2 },
  { key: "l", label: "stub ℓ", unit: "cm", get: (w) => w.S.l, digits: 2 },
  { key: "bw", label: "−10 dB band", unit: "MHz", get: (w) => (w.S.bw ?? 0) / 1e6, digits: 0 },
  { key: "stubPick", label: "stub", get: () => 0, format: () => "" },
  { key: "power", label: "radiated", unit: "%", get: (w) => (1 - M.abs(w.live.Gf0) ** 2) * 100, digits: 1 },
  { key: "gin", label: "Γin", get: () => 0, format: () => "" },
  { key: "gmag", label: "|Γin|", get: (w) => M.abs(w.live.G), digits: 3 },
];

let W = null;
for (const r of readouts) {
  if (r.key === "z") r.format = () => (W ? fmtZ(W.live.zc) : "");
  if (r.key === "y") r.format = () => (W ? fmtZ(M.inv(W.live.zc)) : "");
  if (r.key === "stubPick") r.format = () => (W ? W.S.stubPick : "");
  if (r.key === "gin") r.format = () => (W ? fmtC(W.live.G) : "");
}

playable({
  id: "match-maker",
  serial: SERIAL,
  title: "Match Maker",
  source: "WSC339 CW2 · Circuit design part 2",
  subtitle: "A coursework on matching a 72 + j100 Ω antenna to a 50 Ω line at 2 GHz, played on a bench with a slotted line, a stub tuner, a lumped-element jig, a VNA and a Smith chart whose puck follows the impedance. Every answer in the report was checked.",
  camera: CAMERA,
  verified,
  readouts,
  equations,
  levels,
  build: async (ctx) => (W = await build(ctx)),
});
