import * as THREE from "three";
import { playable } from "../../kit/core/game.mjs";
import { bench } from "../../kit/core/parts/bench.mjs";
import { dcMotor, benchSupply, toggleSwitch, wire } from "../../kit/core/parts/motorlab.mjs";
import { benchScope, SCOPE_COLORS as SC } from "../../kit/core/parts/scope.mjs";
import { servoWheel, frictionBrake, controllerBox } from "../../kit/core/parts/servo.mjs";
import { currentFlow, torqueArrow } from "../../kit/core/overlays.mjs";
import { rbox } from "../../kit/core/geo.mjs";
import * as M from "./model.mjs";
import { FIT, fitTools } from "./fit.mjs";
import RIG from "./rig-data.json";
import verified from "./verified.json";

const SERIAL = "PLAYABLE-04";
const AXIS = 1.9; // shaft height: the motor sits on a plinth so the dial clears the bench
const f = (v, d = 1) => (Number.isFinite(v) ? (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d) : "—");
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const T = fitTools(RIG);
const P = M.SCRIPT;
const RIGM = { vmax: M.VMAX, Tc: FIT.Tc }; // the rig model: coursework model + ±10 V + measured friction

// rig runs used by the levels (t = 0 at the demand step)
const runOf = (key, up = true) => RIG[key].runs.find((r) => r.y.length >= 900 && (r.to > r.from) === up) ?? RIG[key].runs[0];
const RUN = { pi: runOf("pi"), nested: runOf("nested"), pa: RIG.pa.runs[0] };
const OPEN_RIG = T.rigOpen(); // aligned to the step (26 ms record offset removed)

// knob scales: value ↔ 0…1 (log for gains)
const lin = (a, b) => ({ to: (v) => (v - a) / (b - a), from: (k) => a + k * (b - a) });
const log = (a, b) => ({ to: (v) => Math.log(v / a) / Math.log(b / a), from: (k) => a * (b / a) ** k });
const SCALE = { V: lin(-6, 6), Tc: lin(0, 3.5e-3), Kpi: log(0.02, 1), tau_i: log(0.005, 0.5), G: log(1, 40), Kpa: log(0.2, 10) };
const STEP = { V: 0.5, Tc: 1e-4, Kpi: 0.01, tau_i: 0.005, G: 0.5, Kpa: 0.05 };
const LIMIT = { V: [-6, 6], Tc: [0, 3.5e-3], Kpi: [0.02, 1], tau_i: [0.005, 0.5], G: [1, 40], Kpa: [0.2, 10] };
let pilotMode = false;
const snap = (key, v) => { const s = key === "V" && pilotMode ? 0.1 : STEP[key]; const [a, b] = LIMIT[key]; return Math.max(a, Math.min(b, Math.round(v / s) * s)); };

// boss spec (on the rig model)
const SPEC = { ess: 0.02, os: 5, settle: 0.3, pm: 50 };

async function build({ stage, B, audio, interaction, h, overlay }) {
  const plate = bench(B, stage, { serial: SERIAL, subtitle: "Rig tuner · 21WSB004 · DC motor position control", plate: [-0.9, 3.3] });

  // ---------------------------------------------------------------- the rig: motor + flywheel + dial + brake
  const rig = B.group({ pos: [-3.5, 0, 0.0], rot: [0, -0.6, 0] });
  const motor = dcMotor(B, stage, { pos: [-0.7, 1.45, 0], shaftLength: 2.1 });
  rig.add(motor.wrap);
  motor.wrap.position.set(-0.7, 0.45, 0);
  B.part(rbox(2.9, 0.45, 1.9, 0.06), "graphite", { parent: rig, pos: [-0.7, 0.225, 0] });
  const wheel = servoWheel(B, stage, { parent: rig, x: 1.85, axisY: AXIS, radius: 1.0, ringRadius: 1.38, dialOffset: -0.32 });
  const brake = frictionBrake(B, stage, { parent: rig, x: 1.85, axisY: AXIS, radius: 1.0, angle: -1.85 });
  B.part(rbox(0.5, 0.06, 0.6, 0.02), "graphite", { parent: rig, pos: [1.85, 0.03, -1.2] });

  // ---------------------------------------------------------------- instruments
  const scope = benchScope(B, stage, { pos: [1.7, 0, -2.0], rotY: 0.38, width: 4.4, height: 2.75 });
  const psu = benchSupply(B, stage, { pos: [-5.2, 0, 2.55], rotY: 0.45 });
  const box = controllerBox(B, stage, { pos: [2.9, 0, 2.05], rotY: 0.32, width: 3.3, knobs: [{ id: "A", label: "Kp" }, { id: "B", label: "τi" }, { id: "C", label: "G" }] });
  stage.root.updateMatrixWorld(true);
  const swPos = box.switchSpot(2.3);
  const sw = toggleSwitch(B, stage, { pos: [swPos.x, 0, swPos.z] });
  stage.root.updateMatrixWorld(true);

  // ---------------------------------------------------------------- wiring
  const [p1, n1] = motor.terminals();
  const [ps, pn] = psu.posts();
  const [cIn, cOut] = box.ports();
  const [bnc] = scope.probes();
  const W = {
    drive: wire(B, stage, cOut, p1, { role: "insRed", lift: 1.0 }),
    ret: wire(B, stage, n1, cOut.clone().add(v3(-0.25, 0, 0)), { lift: 0.9 }),
    supply: wire(B, stage, ps, cIn, { role: "insRed", lift: 0.6 }),
    supplyN: wire(B, stage, pn, cIn.clone().add(v3(0.25, 0, 0)), { lift: 0.5 }),
    enc: wire(B, stage, wheel.encoder(), cIn.clone().add(v3(0.5, 0, 0)), { lift: 0.3, radius: 0.03 }),
    probe: wire(B, stage, bnc, cOut.clone().add(v3(0.3, 0.1, 0)), { lift: 0.4, radius: 0.03 }),
  };
  const flow = [currentFlow(stage, W.drive.curve), currentFlow(stage, W.ret.curve)];
  const arrow = torqueArrow(stage, B.group({ parent: rig, pos: [0.85, AXIS, 0] }), { radius: 0.5 });

  // ---------------------------------------------------------------- state
  const S = {
    lvl: null, kind: null, grabbed: false, reveal: false,
    V: -5, Tc: 0, Kpi: 0.13, tau_i: 0.1, G: 20, Kpa: 0.688, mode: "pa", loop: false,
    trace: null, sweep: 0, metrics: {}, margins: {}, rms: NaN, info: {},
    live: null, hist: [], enabled: {}, scopeAcc: 1, needDraw: true,
  };

  // ---------------------------------------------------------------- the simulations behind each level
  const pad = (pre, n, arr) => Array(n).fill(pre).concat(arr);
  function recompute() {
    const k = S.kind;
    S.needDraw = true;
    if (k === "open") {
      const pre = M.response({ ctrl: { type: "open", V: -5 }, demand: () => 0, T: 2, Tc: S.Tc });
      const w0 = pre.w.at(-1);
      const r = M.response({ ctrl: { type: "open", V: S.V }, demand: () => 0, T: 0.95, Tc: S.Tc, x0: { w: w0, i: (-5 - P.K * w0) / P.R } });
      S.trace = { t0: 0, dt: 0.001, y: r.w, th: r.th, i: r.i, u: r.u, T: 0.95 };
      const n = Math.min(r.w.length, OPEN_RIG.length);
      S.rms = S.V === 5 ? M.rms(r.w.slice(0, n), OPEN_RIG.slice(0, n)) : NaN;
      S.metrics = S.V !== -5 ? M.stepMetrics(r.t, r.w, w0, r.w.at(-1)) : {};
      S.info = { w0, final: r.w.at(-1) };
      return;
    }
    if (k === "pi") {
      const g = { type: "pi", Kpi: S.Kpi, tau_i: S.tau_i };
      const r = M.response({ ctrl: g, demand: () => 75, T: 1.0, pre: -75, x0: { w: -75 }, ...RIGM });
      S.trace = { t0: -0.1, dt: 0.001, y: pad(-75, 100, r.w), th: pad(r.th[0], 100, r.th), i: pad(r.i[0], 100, r.i), u: pad(r.u[0], 100, r.u), T: 1.0 };
      S.metrics = M.stepMetrics(r.t, r.w, -75, 75);
      S.margins = M.margins("pi", g);
      S.umax = Math.max(...r.u.map(Math.abs));
      S.satTime = r.u.filter((u) => Math.abs(u) >= M.VMAX - 1e-9).length * 0.001;
      const mine = Math.abs(S.Kpi - 0.13) < 1e-9 && Math.abs(S.tau_i - 0.1) < 1e-9;
      S.rms = mine ? M.rms(r.w.slice(0, 1000), T.post(RUN.pi).slice(0, 1000)) : NaN;
      return;
    }
    if (k === "nested") {
      const g = { type: "nested", Kpi: S.Kpi, tau_i: S.tau_i, G: S.G };
      const r = M.response({ ctrl: g, demand: () => 1, T: 1.0, pre: -1, x0: { th: -1 }, ...RIGM });
      S.trace = { t0: -0.1, dt: 0.001, y: pad(-1, 100, r.th), th: pad(-1, 100, r.th), i: pad(0, 100, r.i), u: pad(0, 100, r.u), T: 1.0 };
      S.metrics = M.stepMetrics(r.t, r.th, -1, 1);
      S.margins = M.margins("nested", g);
      S.bwIn = M.bandwidth("pi", g);
      S.bwOut = M.bandwidth("nested", g);
      S.rms = Math.abs(S.G - 20) < 1e-9 ? M.rms(r.th.slice(0, 1000), T.post(RUN.nested).slice(0, 1000)) : NaN;
      return;
    }
    if (k === "pa") {
      const g = { type: "pa", Kpa: S.Kpa, tau_pa: 0.005, k: 9 };
      const r = M.response({ ctrl: g, demand: () => 1, T: 1.0, x0: { th: -0.72, y: -0.28 }, vmax: M.VMAX, Tc: S.Tc });
      S.trace = { t0: -0.3, dt: 0.001, y: pad(-0.72, 300, r.th), th: pad(-0.72, 300, r.th), i: pad(0, 300, r.i), u: pad(0, 300, r.u), T: 1.0 };
      S.metrics = M.stepMetrics(r.t, r.th, -0.72, 1);
      S.dead = (S.Tc * P.R) / (P.K * S.Kpa);
      S.rms = M.rms(r.th.slice(0, 1000), T.post(RUN.pa).slice(0, 1000));
      return;
    }
    if (k === "boss") {
      const g = S.mode === "pa" ? { type: "pa", Kpa: S.Kpa, tau_pa: 0.005, k: 9 } : { type: "nested", Kpi: S.Kpi, tau_i: S.tau_i, G: S.G };
      const r = M.response({ ctrl: g, demand: () => 1, T: 1.2, ...RIGM });
      S.trace = { t0: -0.1, dt: 0.001, y: pad(0, 100, r.th), th: pad(0, 100, r.th), i: pad(0, 100, r.i), u: pad(0, 100, r.u), T: 1.2 };
      S.metrics = M.stepMetrics(r.t, r.th, 0, 1, { tail: 0.05 });
      S.margins = M.margins(g.type, g);
      S.dead = g.type === "pa" ? (FIT.Tc * P.R) / (P.K * S.Kpa) : 0;
      return;
    }
  }
  const bossOk = () => S.metrics.ess <= SPEC.ess && S.metrics.overshoot <= SPEC.os && S.metrics.settle <= SPEC.settle && S.margins.pm >= SPEC.pm;

  // ---------------------------------------------------------------- the scope picture for each level
  function scopeSpec() {
    const k = S.kind;
    const tr = S.trace;
    const cur = S.sweep + (tr?.t0 ?? 0);
    const model = (label = "model", color = SC.phosphor) => tr && { t0: tr.t0, dt: tr.dt, y: tr.y, color, width: 4, upto: cur, label };
    const rigDots = (run, label) => ({ t0: run.t0, dt: run.dt, y: run.y, color: SC.rig, dots: true, dotSize: 5, glow: 6, label });
    if (k === "open") {
      return {
        x: [0, 0.95], y: [-200, 300], xTicks: [0, 0.5, 0.9], yTicks: [-200, -100, 0, 100, 200], unitX: "s", yLabel: "SPEED rad/s",
        traces: [model(`model · ${f(S.V, 1)} V${S.Tc ? ` · Tc ${f(S.Tc * 1e3, 1)} mNm` : ""}`), { t0: 0, dt: 0.001, y: OPEN_RIG, color: SC.rig, dots: true, dotSize: 5, glow: 6, label: "rig · RigData.mat" }],
        cursor: cur,
        readout: [Number.isFinite(S.rms) ? { text: `RMS ${f(S.rms, 2)} rad/s`, color: S.rms <= 1.5 ? SC.phosphor : SC.demand } : { text: "turn the supply to +5 V", color: SC.demand }, S.info.final != null ? `model ends ${f(S.info.final, 1)}` : "", "rig ends 158.6"].filter(Boolean),
      };
    }
    if (k === "pi") {
      const os = 75 + 0.08 * 150;
      return {
        x: [-0.1, 1.0], y: [-100, 240], xTicks: [0, 0.3, 1.0], yTicks: [-75, 0, 75, 150], readoutAt: "tr", unitX: "s", yLabel: "SPEED rad/s",
        hlines: [{ y: 75, color: SC.demand, dash: [10, 8], label: "demand ±75" }, { y: os, color: SC.error, dash: [4, 6], width: 2 }],
        bands: [{ x0: 0.3, x1: 1.0, y0: 72, y1: 78, color: "rgba(60,255,143,.14)" }, ...(S.metrics.overshoot > 8 ? [{ x0: -0.1, x1: 1.0, y0: os, y1: 240, color: "rgba(213,94,0,.16)", hatch: "rgba(213,94,0,.5)" }] : [])],
        traces: [model(`model · Kp ${f(S.Kpi, 2)} τi ${f(S.tau_i, 3)}`), rigDots(RUN.pi, "rig · Kp 0.13 τi 0.1")],
        cursor: cur,
        readout: [{ text: `PM ${f(S.margins.pm, 0)}°`, color: S.margins.pm >= 60 ? SC.phosphor : SC.error }, { text: `OS ${f(S.metrics.overshoot, 1)} %`, color: S.metrics.overshoot <= 8 ? SC.phosphor : SC.error }, { text: `settle ${f(S.metrics.settle, 2)} s`, color: S.metrics.settle <= 0.3 ? SC.phosphor : SC.error }, { text: `u ≤ ±10 V · ${f(S.satTime * 1e3, 0)} ms at limit`, color: SC.text }],
      };
    }
    if (k === "nested") {
      return {
        x: [-0.1, 1.0], y: [-1.3, 1.9], xTicks: [0, 0.4, 1.0], yTicks: [-1, 0, 1], readoutAt: "br", legendAt: "tl", unitX: "s", yLabel: "POSITION rad",
        hlines: [{ y: 1, color: SC.demand, label: "demand ±1 rad" }],
        traces: [model(`model · G ${f(S.G, 1)}`), rigDots(RUN.nested, "rig · G 20")],
        cursor: cur,
        readout: [{ text: `outer ${f(S.bwIn / S.bwOut, 1)}× slower`, color: S.bwIn / S.bwOut >= 5 ? SC.phosphor : SC.error }, { text: `rise ${f(S.metrics.rise, 2)} s`, color: S.metrics.rise <= 0.45 ? SC.phosphor : SC.error }, { text: `OS ${f(S.metrics.overshoot, 1)} %`, color: S.metrics.overshoot <= 1 ? SC.phosphor : SC.error }],
      };
    }
    if (k === "pa") {
      const d = S.dead;
      return {
        x: [-0.3, 1.0], y: [-1.0, 1.9], xTicks: [0, 0.5, 1.0], yTicks: [-0.72, 0, 1], unitX: "s", yLabel: "POSITION rad",
        hlines: [{ y: 1, color: SC.demand, label: "demand 1 rad" }],
        bands: d > 0.005 ? [{ x0: 0, x1: 1.0, y0: 1 - d, y1: 1 + d, color: "rgba(213,94,0,.14)", hatch: "rgba(213,94,0,.45)" }] : [],
        traces: [model(`model · Tc ${f(S.Tc * 1e3, 1)} mNm`), rigDots(RUN.pa, "rig · PA (parks 0.79)")],
        cursor: cur,
        readoutAt: "br", readout: [{ text: d > 0.005 ? `dead zone ±${f(d, 2)}` : "no friction, no dead zone", color: d > 0.005 ? SC.error : SC.text }, `model ${f(S.metrics.final, 2)} · rig 0.79`],
        legendAt: "tl",
      };
    }
    if (k === "boss") {
      const m = S.metrics;
      return {
        x: [-0.1, 1.2], y: [-0.4, 1.9], xTicks: [0, 0.3, 1.2], yTicks: [0, 0.5, 1], readoutAt: "br", legendAt: "tl", unitX: "s", yLabel: "POSITION rad · rig model",
        hlines: [{ y: 1, color: SC.demand, label: "demand 1 rad" }],
        bands: [{ x0: SPEC.settle, x1: 1.2, y0: 0.98, y1: 1.02, color: "rgba(60,255,143,.16)" }, ...(S.dead > 0.005 ? [{ x0: 0, x1: 1.2, y0: 1 - S.dead, y1: 1 + S.dead, color: "rgba(213,94,0,.10)", hatch: "rgba(213,94,0,.35)" }] : [])],
        traces: [model(S.mode === "pa" ? `PA · K ${f(S.Kpa, 2)}` : `nested · Kp ${f(S.Kpi, 2)} τi ${f(S.tau_i, 3)} G ${f(S.G, 1)}`)],
        cursor: cur,
        readout: [{ text: `error ${f(m.ess, 3)} rad`, color: m.ess <= SPEC.ess ? SC.phosphor : SC.error }, { text: `OS ${f(m.overshoot, 1)} %`, color: m.overshoot <= SPEC.os ? SC.phosphor : SC.error }, { text: `settle ${f(m.settle, 2)} s`, color: m.settle <= SPEC.settle ? SC.phosphor : SC.error }, { text: `PM ${f(S.margins.pm, 0)}°`, color: S.margins.pm >= SPEC.pm ? SC.phosphor : SC.error }],
      };
    }
    if (k === "pilot") {
      const hs = S.hist;
      const t1 = hs.length ? hs[hs.length - 1][0] : 0;
      const t0 = Math.max(0, t1 - 5);
      return {
        x: [t0, t0 + 5], y: [-0.5, 2.0], xTicks: [t0, t0 + 5], yTicks: [0, 1, 2], unitX: "s", yLabel: "POSITION rad",
        hlines: [{ y: 1, color: SC.demand, label: "target 1 rad" }],
        bands: [{ y0: 0.95, y1: 1.05, color: "rgba(60,255,143,.16)" }],
        traces: [{ x: hs.map((p) => p[0]), y: hs.map((p) => p[1]), color: SC.phosphor, width: 5, label: S.loop ? "loop: nested G 20" : "you · supply knob" }],
        readout: [{ text: S.loop ? "LOOP ON" : `hand ${f(S.V, 2)} V`, color: S.loop ? SC.phosphor : SC.demand }, `ω ${f(S.live?.state.w ?? 0, 1)} rad/s`],
      };
    }
    return { x: [0, 1], y: [-1, 1], traces: [], readout: ["PLAYABLE-04"] };
  }

  // ---------------------------------------------------------------- controls
  const setVal = (key, v, quiet) => {
    const nv = snap(key, v);
    if (Math.abs(nv - S[key]) < 1e-12) return;
    S[key] = nv;
    if (!quiet) audio.detent();
    if (S.kind !== "pilot") { recompute(); S.sweep = 0; }
    syncControls();
  };
  // which knob drives which quantity in this level
  const knobKey = { A: () => (S.kind === "boss" && S.mode === "pa" ? "Kpa" : "Kpi"), B: () => "tau_i", C: () => "G" };
  function dragKnob(part, keyFn, enabledFn) {
    interaction.register(part.grab, {
      enabled: enabledFn,
      onDragStart: () => { S.grabbed = true; const key = keyFn(); return { key, k0: SCALE[key].to(S[key]) }; },
      onDrag: ({ dx, dy, data }) => setVal(data.key, SCALE[data.key].from(Math.max(0, Math.min(1, data.k0 + (dy + dx * 0.6) / 320)))),
    });
  }
  dragKnob(psu, () => "V", () => !!S.enabled.V);
  dragKnob(brake, () => "Tc", () => !!S.enabled.Tc);
  dragKnob(box.knobs.A, knobKey.A, () => !!S.enabled.A);
  dragKnob(box.knobs.B, knobKey.B, () => !!S.enabled.B);
  dragKnob(box.knobs.C, knobKey.C, () => !!S.enabled.C);
  interaction.register(sw.grab, { enabled: () => !!S.enabled.sw, onTap: () => { S.grabbed = true; toggle(); } });
  function toggle() {
    audio.thump();
    if (S.kind === "pilot") {
      S.loop = !S.loop;
      S.live.state.z = 0;
    } else if (S.kind === "boss") {
      S.mode = S.mode === "pa" ? "nested" : "pa";
      recompute();
      S.sweep = 0;
    }
    syncControls();
  }

  function syncControls() {
    psu.setKnob(SCALE.V.to(S.V));
    brake.set(SCALE.Tc.to(S.Tc));
    const a = knobKey.A();
    box.knobs.A.set(SCALE[a].to(S[a]));
    box.knobs.B.set(SCALE.tau_i.to(S.tau_i));
    box.knobs.C.set(SCALE.G.to(S.G));
    const pa = S.kind === "pa" || (S.kind === "boss" && S.mode === "pa");
    const lines = pa
      ? [{ k: "K_PA", v: f(S.Kpa, 2) }, { k: "k", v: "9", dim: true }, { k: "τ s", v: "0.005", dim: true }, { k: "MODE", v: "PA" }]
      : S.kind === "open" || S.kind === null
        ? [{ k: "DRIVE", v: "OPEN", dim: false }, { k: "Kp", v: "—", dim: true }, { k: "τi", v: "—", dim: true }, { k: "G", v: "—", dim: true }]
        : [{ k: "Kp", v: f(S.Kpi, 2) }, { k: "τi s", v: f(S.tau_i, 3) }, { k: "G", v: S.kind === "pi" ? "—" : f(S.G, 1), dim: S.kind === "pi" }, { k: "MODE", v: S.kind === "pi" ? "SPEED" : S.kind === "pilot" ? (S.loop ? "NESTED" : "HAND") : "NESTED" }];
    box.display(lines);
    box.labels(pa ? ["K_PA", "—", "—"] : ["Kp", "τi", "G"]);
  }

  // ---------------------------------------------------------------- level plumbing
  function setLevel(l) {
    S.lvl = l;
    S.kind = l?.kind ?? null;
    pilotMode = S.kind === "pilot";
    S.grabbed = false;
    S.reveal = false;
    Object.assign(S, { V: -5, Tc: 0, Kpi: 0.13, tau_i: 0.1, G: 20, Kpa: 0.688, mode: "pa", loop: false, sweep: 0, metrics: {}, margins: {}, rms: NaN, info: {}, hist: [], enabled: {}, dead: 0, trace: null, live: null, satTime: 0, bwIn: NaN, bwOut: NaN });
    wheel.setTarget(0, false);
    stage.setCut(false);
  }
  function configure(o) {
    Object.assign(S, o.state ?? {});
    for (const c of o.controls ?? []) S.enabled[c] = true;
    if (S.kind === "pilot") {
      S.live = M.createSim({ ...RIGM });
      S.live.reset({ th: 0 });
      S.liveT = 0;
      wheel.setTarget(1, true);
    } else {
      if (S.kind === "nested" || S.kind === "pa" || S.kind === "boss") wheel.setTarget(1, true);
      recompute();
    }
    S.hintText = o.hint;
    S.hintAt = o.hintAt;
    syncControls();
    S.needDraw = true;
  }

  const hint = h("div", { class: "tag grab" }, "");
  overlay.append(hint);
  let angle = 0;

  const world = {
    S, wheel, brake, box, psu, scope, sw,
    setLevel, configure,
    get rms() { return S.rms; },
    get m() { return S.metrics; },
    get th() { return S.kind === "pilot" ? S.live?.state.th ?? 0 : sampleAt("th"); },
    get w() { return S.kind === "pilot" ? S.live?.state.w ?? 0 : sampleAt("y"); },
    bossOk,
    solve(sol) {
      S.grabbed = true;
      for (const key of ["V", "Tc", "Kpi", "tau_i", "G", "Kpa"]) if (sol[key] != null) { S[key] = snap(key, sol[key]); }
      if (sol.mode) S.mode = sol.mode;
      if (sol.loop != null) { S.loop = sol.loop; if (S.live) S.live.state.z = 0; }
      if (S.kind !== "pilot") { recompute(); S.sweep = 0; }
      syncControls();
    },
    reveal(on) {
      S.reveal = on;
      stage.setCut(on && (S.kind === "open" || S.kind === "pi"));
      S.needDraw = true;
    },
    redraw() {
      plate.redrawPlate();
      wheel.redraw();
      box.redraw();
      motor.setNameplate(P.K, P.R, "RIG");
      S.needDraw = true;
    },
    anchors() {
      const show = S.lvl && !S.grabbed && S.hintText;
      hint.hidden = !show;
      if (!show) return [];
      hint.textContent = S.hintText;
      return [{ el: hint, at: () => S.hintAt(world) }];
    },
    onKey(e, phase) {
      if (phase !== "play" && phase !== "reveal") return;
      const k = e.key;
      const nudge = (key, dir) => { S.grabbed = true; setVal(key, S[key] + dir * (key === "V" && pilotMode ? 0.1 : STEP[key])); e.preventDefault(); };
      const up = k === "ArrowUp" ? 1 : k === "ArrowDown" ? -1 : 0;
      const side = k === "ArrowRight" ? 1 : k === "ArrowLeft" ? -1 : 0;
      if (up && S.enabled.V) return nudge("V", up);
      if (up && S.enabled.Tc) return nudge("Tc", up);
      if (up && S.enabled.A) return nudge(knobKey.A(), up);
      if (up && S.enabled.C && !S.enabled.A) return nudge("G", up);
      if (side && S.enabled.B) return nudge("tau_i", side);
      if ((k === "]" || k === "[") && S.enabled.C) return nudge("G", k === "]" ? 1 : -1);
      if (k.toLowerCase() === "l" && S.enabled.sw) { S.grabbed = true; toggle(); }
    },
    step(dt, dtReal, t, phase) {
      let w = 0, th = 0, I = 0;
      if (S.kind === "pilot" && S.live) {
        const ctrl = S.loop ? { type: "nested", Kpi: 0.13, tau_i: 0.1, G: 20 } : { type: "hand", V: S.V };
        S.live.step(dt, ctrl, 1);
        S.liveT += dt;
        const st = S.live.state;
        w = st.w; th = st.th; I = st.i;
        const last = S.hist[S.hist.length - 1];
        if (!last || S.liveT - last[0] >= 1 / 60) { S.hist.push([S.liveT, th]); if (S.hist.length > 400) S.hist.shift(); S.needDraw = true; }
        psu.display(f(st.ua ?? st.u, 2), "V", f(I, 2), "A", S.loop ? "LOOP" : "HAND", stage.look !== "paper");
      } else if (S.trace) {
        const tr = S.trace;
        const end = (tr.y.length - 1) * tr.dt;
        S.sweep += dt;
        if (S.sweep > end + 0.8) S.sweep = 0;
        S.needDraw = true;
        w = sampleAt("y"); th = sampleAt("th"); I = sampleAt("i");
        if (S.kind === "nested" || S.kind === "pa" || S.kind === "boss") w = (sampleAt("th", 0.002) - sampleAt("th", -0.002)) / 0.004;
        if ((world._d = (world._d ?? 0) + dtReal) > 0.1) { world._d = 0; psu.display(f(S.kind === "open" ? S.V : sampleAt("u"), 1), "V", f(I, 2), "A", S.kind === "open" ? "CV  ON" : "CTRL", stage.look !== "paper"); }
      }
      angle = th;
      wheel.setAngle(angle);
      motor.rotor.rotation.x = angle;
      sw.update(S.kind === "pilot" ? S.loop : S.mode === "nested", dtReal);
      const g = S.reveal ? 3 : 1;
      flow[0].update(I * 8, dt, g);
      flow[1].update(-I * 8, dt, g);
      arrow.set(P.K * I * 100, 3);
      audio.motor("m1", 30 + Math.abs(w) * 0.6, Math.min(0.18, Math.abs(w) / 600), 400 + Math.min(2000, Math.abs(I) * 500));
      S.scopeAcc += dtReal;
      if (S.needDraw && S.scopeAcc >= 1 / 20) { S.scopeAcc = 0; S.needDraw = false; scope.draw(scopeSpec()); }
    },
  };
  function sampleAt(key, off = 0) {
    const tr = S.trace;
    if (!tr) return 0;
    const arr = tr[key];
    const k = Math.max(0, Math.min(arr.length - 1, Math.round((S.sweep + off) / tr.dt)));
    return arr[k];
  }
  syncControls();
  scope.draw(scopeSpec());
  return world;
}

// ------------------------------------------------------------------ Toolbox
const tauOf = (p) => M.plantConstants(p).tauM;
const equations = [
  { id: "tau", f: "τ = J·R / (K² + R·D)", source: "1.2", live: () => `${f(tauOf(M.SCRIPT) * 1e3, 1)} ms (L/R is only ${f((M.SCRIPT.L / M.SCRIPT.R) * 1e6, 1)} µs)` },
  { id: "friction", f: "ω_ss = (K·V − R·T_c) / (K² + R·D)", source: "1.2", live: (w) => `T_c ${f(w.S.Tc * 1e3, 1)} mNm → ${f((0.03 * 5 - 2.7 * w.S.Tc) / (0.03 ** 2 + 2.7 * 5.21e-6), 1)} rad/s at 5 V` },
  { id: "pi", f: "C(s) = Kp·(1 + 1/(τi·s))", source: "2.2", live: (w) => `Kp ${f(w.S.Kpi, 2)} · τi ${f(w.S.tau_i, 3)} s` },
  { id: "integrate", f: "θ = ∫ ω dt", source: "3, 4", live: (w) => `θ ${f(w.th, 2)} rad · ω ${f(w.w, 1)} rad/s` },
  { id: "nested", f: "ω_demand = G·(θ_d − θ) · outer ≈ inner / 5", source: "4.2", live: (w) => (Number.isFinite(w.S.bwOut) ? `inner ${f(w.S.bwIn, 1)} · outer ${f(w.S.bwOut, 1)} rad/s` : "") },
  { id: "deadzone", f: "|e| < T_c·R / (K·K_PA)", source: "3.3", live: (w) => `±${f((FIT.Tc * 2.7) / (0.03 * w.S.Kpa), 3)} rad at K_PA ${f(w.S.Kpa, 2)}` },
];

// ------------------------------------------------------------------ Levels
// Phones are width-limited in portrait: the knob levels frame just the scope and the controller there.
// (level.focus is read on every refocus, so a getter can pick the box per screen.)
// (level.focus is read on every refocus, so a getter installed below picks the box per screen.)
const SCOPE_BOX = { min: [-0.7, 0.4, -2.3], max: [4.6, 3.3, 2.7] };
const levels = [
  {
    id: "1.2a", kind: "open", anchor: "1.2", mechanic: "predict", source: "Coursework 2 · 1.2", title: "Reverse the motor",
    focus: { min: [-6.4, 0, -2.6], max: [4.0, 3.4, 2.0] },
    brief: "This is the lab's rig: a 0.03 V·s/rad motor driving a flywheel, J = 4.75×10⁻⁵ kg·m². It is spinning backwards on −5 V. The scope shows what the real rig did when the supply flipped to +5 V (RigData.mat). Your model will draw on top of it.",
    setup: (w) => w.configure({ state: { V: -5 }, controls: ["V"], hint: "Turn the supply to +5 V", hintAt: (w) => w.psu.knobAnchor() }),
    readouts: ["w", "V", "tau", "rms"], hide: ["tau"],
    predict: { type: "choice", prompt: "The supply flips from −5 V to +5 V. How long until the speed has made 63 % of its change?", options: ["30 µs: the coil's L/R", "About 0.14 s", "About 1.4 s", "Instantly: it's an electric motor"], answer: 1 },
    goal: { text: "Flip the supply to +5 V and watch the model run against the rig", instructions: "Drag the orange supply knob up to +5.0 V (or press ↑). The green model trace redraws against the rig's measured dots.", check: (w) => w.S.V === 5, status: (w) => `${f(w.S.V, 1)} V${Number.isFinite(w.rms) ? ` · RMS ${f(w.rms, 2)} rad/s` : ""}`, hold: 1.0 },
    hint: "The coil is fast; the flywheel is slow. Which one has to change its speed?",
    solution: { V: 5 },
    reveal: {
      title: "τ = J·R / (K² + R·D)",
      body: "The speed changes with the flywheel's time constant: 4.75×10⁻⁵ × 2.7 / (0.03² + 2.7 × 5.21×10⁻⁶) = 0.140 s. The coil's L/R is 30 µs, 4600× faster, so the current is never the bottleneck. At +5 V the model settles at K·V/(K² + R·D) = 164.1 rad/s. The rig ends at 158.6, 3.3 % lower: 4.5 rad/s RMS between the two curves.",
      equations: [{ f: "τ = 4.75×10⁻⁵ × 2.7 / 9.14×10⁻⁴ = 0.140 s", live: (w) => `model t63 ${f(w.m.t63, 3)} s · rig 0.163 s (the record starts 26 ms early)` }, { f: "ω_ss = K·V / (K² + R·D) = 164.1 rad/s", live: (w) => `RMS model vs rig ${f(w.rms, 2)} rad/s` }],
      note: "Portfolio check (Output 1.2): RigData.mat is a −5 → +5 V reversal starting at −157.5 rad/s. The portfolio overlays a 0 → 5 V run from rest, shifted 0.12 s to the zero crossing. The shape matches (4.4 rad/s RMS), but it isn't the same test. Script J = 4.75×10⁻⁵ vs the sheet's 4.73×10⁻⁵ changes τ by 0.4 %.",
      unlock: "tau",
      tags: [{ text: "rig: 158.6 · model: 163.8 rad/s", at: (w) => w.scope.anchor() }],
    },
    recall: { q: "What sets how fast the lab motor's speed responds to a voltage step?", options: ["L/R of the armature", "J·R/(K² + R·D), the flywheel", "The supply's slew rate", "K alone"], answer: 1 },
  },
  {
    id: "1.2b", kind: "open", anchor: "1.2", mechanic: "tune", source: "Coursework 2 · 1.2", title: "The missing friction",
    focus: { min: [-4.4, 0, -2.6], max: [4.0, 3.6, 1.8] },
    brief: "Model and rig agree on the shape but not the ending: 163.8 vs 158.6 rad/s. A model is a claim about the rig. Find what it leaves out.",
    setup: (w) => w.configure({ state: { V: 5, Tc: 0 }, controls: ["Tc"], hint: "Screw the brake down", hintAt: (w) => w.brake.anchor() }),
    readouts: ["w", "Tc", "rms"],
    predict: { type: "choice", prompt: "The rig settles 5 rad/s slower than the model. Which change to the model could close that gap?", options: ["A heavier flywheel (bigger J)", "More coil inductance (bigger L)", "Friction the model leaves out", "Nothing: it's sensor noise"], answer: 2 },
    goal: { text: "Add friction until the model fits the rig: RMS ≤ 1.5 rad/s", instructions: "The orange thumbscrew presses a felt pad on the flywheel: Coulomb friction T_c in the model. Screw it down (drag up, or ↑) until the green curve sits on the dots.", check: (w) => w.rms <= 1.5, status: (w) => `T_c ${f(w.S.Tc * 1e3, 1)} mNm · RMS ${f(w.rms, 2)} rad/s`, hold: 1.0 },
    hint: "At steady state dω/dt = di/dt = 0: J and L drop out of the equations. What's left that could slow it?",
    solution: { Tc: 1.7e-3 },
    reveal: {
      title: "ω_ss = (K·V − R·T_c) / (K² + R·D)",
      body: "J and L can't move the final speed: at steady state dω/dt and di/dt are zero, so they drop out. A constant friction torque can. T_c = 1.7 mNm, fitted on this run alone, takes the misfit from 4.5 to 1.3 rad/s RMS, close to the encoder's 0.7 rad/s noise. To unstick the shaft the drive needs T_c·R/K = 0.15 V.",
      equations: [{ f: "ω_ss = (0.15 − 2.7·T_c) / 9.14×10⁻⁴", live: (w) => `T_c ${f(w.S.Tc * 1e3, 1)} mNm → RMS ${f(w.rms, 2)} rad/s` }, { f: "break-away voltage = T_c·R / K = 0.15 V" }],
      note: "Honesty check: the rig's record starts 26 ms before the motor responds. The closed-loop runs show no such delay, so it is in the recording, not the motor; the fit removes it. The coursework's linear model has no friction term beyond D·ω: that is the 3.3 % gap.",
      unlock: "friction",
      tags: [{ text: "T_c ≈ 1.7 mNm", at: (w) => w.brake.anchor() }],
    },
    recall: { q: "A motor settles slower than its model at steady state. Which parameter can't be the cause?", options: ["Friction", "The inertia J", "The torque constant K", "The resistance R"], answer: 1 },
  },
  {
    id: "2.2", kind: "pi", anchor: "2.2–2.3", mechanic: "tune", source: "Coursework 2 · 2.2–2.4", title: "Tune the speed loop",
    focus: { min: [-1.6, 0, -2.4], max: [4.6, 3.4, 2.8] }, phoneFocus: SCOPE_BOX,
    brief: "A PI controller now drives the motor at ±75 rad/s. The rig's dots are your own run with Kp 0.13, τi 0.1. The knobs start much hotter. The drive can only give ±10 V.",
    setup: (w) => w.configure({ state: { Kpi: 0.5, tau_i: 0.01, Tc: 1.7e-3 }, controls: ["A", "B"], hint: "Turn Kp and τi", hintAt: (w) => w.box.anchor() }),
    readouts: ["w", "Kpi", "taui", "pm"],
    predict: { type: "choice", prompt: "With Kp 0.5, τi 0.01 s, linear theory gives 58° of phase margin. On the rig (±10 V drive) the −75 → +75 rad/s step will…", options: ["Overshoot ~20 %, as the margin suggests", "Overshoot ~60 %: the integral winds up while the drive is pinned at 10 V", "Run away: it's unstable", "Stop short: a PI leaves a steady-state error"], answer: 1 },
    goal: { text: "Meet the spec: PM ≥ 60°, overshoot ≤ 8 %, settled (±2 %) by 0.3 s", instructions: "Left knob Kp (drag, or ↑↓), middle knob τi (drag, or ←→). Each change re-runs the model on the scope; the rig's dots stay where they are.", check: (w) => w.S.margins.pm >= 60 && w.m.overshoot <= 8 && w.m.settle <= 0.3 && w.m.ess <= 0.5, status: (w) => `PM ${f(w.S.margins.pm, 0)}° · OS ${f(w.m.overshoot, 1)} % · settle ${f(w.m.settle, 2)} s`, hold: 1.0 },
    hint: "Lower Kp until the drive spends less time pinned at 10 V; raise τi so the integral acts gently.",
    solution: { Kpi: 0.13, tau_i: 0.1 },
    reveal: {
      title: "C(s) = Kp·(1 + 1/(τi·s))",
      body: "Kp sets how hard the loop pushes; the integral keeps pushing until the error is exactly zero, so a PI loop has no steady-state error. Kp × 150 rad/s asks for 19.5 V, so the real drive saturates, which is why the rig overshoots more than a Simulink model without a limit. With the limit added, the model sits on the rig's dots to 2.7 rad/s RMS.",
      equations: [{ f: "C(s) = 0.13·(0.1s + 1) / 0.1s", live: (w) => `PM ${f(w.S.margins.pm, 1)}° at ${f(w.S.margins.wc, 1)} rad/s` }, { f: "u = Kp·e at the step = 19.5 V → clipped to 10 V", live: (w) => `${f(w.S.satTime * 1e3, 0)} ms at the limit` }],
      note: "Portfolio check (Output 2.3b): the model's 2.9 % overshoot is right. The steady-state errors (2.5 and 2 rad/s) are wrong: the model's is 0.00 and the rig's is under 0.1 rad/s. The ±1.5 rad/s wobble is encoder noise. The measured 9 % is 8.9 % of 75, but the rig stepped 150 rad/s (−75 → +75): 4.4 % of the real step. The plot's y-limits hid the bottom half.",
      unlock: "pi",
      tags: [{ text: "integral: zero steady-state error", at: (w) => w.box.anchor() }],
    },
    recall: { q: "Why does a PI speed loop have zero steady-state error to a step?", options: ["Kp is large", "The integral keeps growing while any error remains", "The motor has friction", "The phase margin is 60°"], answer: 1 },
  },
  {
    id: "pilot", kind: "pilot", anchor: "3, 4", mechanic: "pilot", source: "Coursework 2 · 3–4", title: "Hold it by hand",
    focus: { min: [-6.4, 0, -2.6], max: [5.6, 3.6, 3.0] },
    brief: "Now position. Park the pointer on the +1 rad mark yourself, using the supply knob as your throttle. Then flip the orange LOOP switch and let the nested controller do it.",
    setup: (w) => w.configure({ state: { V: 0 }, controls: ["V", "sw"], hint: "Supply knob = your throttle", hintAt: (w) => w.psu.knobAnchor() }),
    readouts: ["th", "w", "V"],
    predict: { type: "choice", prompt: "You hold the supply at a steady +1 V. What does the pointer do?", options: ["Moves to a fixed angle and stays there", "Keeps turning at about 28 rad/s", "Turns, slows down and stops by itself"], answer: 1 },
    goal: { text: "Park the pointer on +1 rad (±0.05) and hold it still", instructions: "Supply knob: drag or ↑↓ (0.1 V a click). The pointer integrates whatever speed you give it, so ease off before you arrive. Or flip the orange LOOP switch (tap, or L) to hand it to the controller.", check: (w) => Math.abs(w.th - 1) <= 0.05 && Math.abs(w.w) < 0.5, status: (w) => `θ ${f(w.th, 2)} rad · ω ${f(w.w, 1)} rad/s${w.S.loop ? " · loop on" : ""}`, hold: 1.0 },
    hint: "Give it a little voltage, then go back to 0 V just before the pointer reaches the yellow marker. Or use the switch.",
    solution: { loop: true },
    reveal: {
      title: "θ = ∫ ω dt",
      body: "A steady voltage gives a steady speed, so the angle keeps growing: position is the integral of speed. To stop on a mark you have to brake before you arrive. The nested loop does that every millisecond: the outer gain turns position error into a speed demand (G = 20 rad/s per rad), and your PI speed loop from task 2 delivers it.",
      equations: [{ f: "ω_demand = G·(θ_d − θ)", live: (w) => `θ ${f(w.th, 3)} rad · ω ${f(w.w, 2)} rad/s` }, { f: "V = Kp·(e + ∫e dt / τi)" }],
      unlock: "integrate",
      tags: [{ text: "target +1 rad", at: (w) => w.wheel.anchor() }],
    },
    recall: { q: "Why is position control harder by hand than speed control?", options: ["Position is the integral of speed: you must brake before arriving", "Encoders are noisy", "The motor is weaker at low speed", "It isn't"], answer: 0 },
  },
  {
    id: "3.3", kind: "pa", anchor: "3.2–3.4", mechanic: "break", source: "Coursework 2 · 3.2–3.4", title: "Why the PA stops short",
    focus: { min: [-4.4, 0, -2.6], max: [4.0, 3.6, 1.8] },
    brief: "Your phase-advance controller: K_PA 0.688, k 9, τ 0.005 s. The linear model parks it exactly on 1 rad. Your rig run parked at 0.79 rad (dots). Break the model's promise.",
    setup: (w) => w.configure({ state: { Tc: 0, Kpa: 0.688 }, controls: ["Tc"], hint: "Put the measured friction back", hintAt: (w) => w.brake.anchor() }),
    readouts: ["th", "Tc", "dead"],
    predict: { type: "choice", prompt: "The linear model says 1.000 rad; the rig parked at 0.79. Why?", options: ["The PA has low gain at low frequency (the portfolio's answer)", "Friction: 0.688 V/rad × 0.21 rad = 0.14 V can't unstick the motor", "The encoder slipped", "The model's inertia is wrong"], answer: 1 },
    goal: { text: "Give the model the friction you measured in 1.2 (≈ 1.7 mNm) and see the dead zone", instructions: "Screw the brake down (drag, or ↑). The hatched band on the scope is where the PA's push is too weak to beat friction: inside it, the shaft just stops.", check: (w) => w.S.Tc >= 1.5e-3 && w.S.Tc <= 2.0e-3, status: (w) => `T_c ${f(w.S.Tc * 1e3, 1)} mNm · dead zone ±${f(w.S.dead, 2)} rad`, hold: 1.0 },
    hint: "The value you found in level 2.",
    solution: { Tc: 1.7e-3 },
    reveal: {
      title: "|e| < T_c·R / (K·K_PA)",
      body: "Linear theory can't make this loop stop short: the plant integrates, so any gain drives the error to zero. Friction can. The PA's push is K_PA·e volts, and below 0.15 V the shaft stays put, so it stalls anywhere within ±0.22 rad of the target. The rig parked 0.21 rad short: inside the band. The model with friction parks at 1.08 instead, because it overshoots and sticks. Model and rig agree on the dead zone, not on the path.",
      equations: [{ f: "dead zone = ±T_c·R / (K·K_PA) = ±0.22 rad", live: (w) => `±${f(w.S.dead, 3)} rad at T_c ${f(w.S.Tc * 1e3, 1)} mNm` }],
      note: "Before the step the rig sat 0.28 rad short, outside the ±0.22 band: friction at rest (stiction, ≥ 2.1 mNm) is bigger than the 1.7 mNm measured while spinning. Portfolio check (3.3b): rise 0.11 s and overshoot 16 % are right; 2.17 s is the clock time (the step is at 1.63 s). From the step it settles in 0.56 s. The PA's lead peaks at 66.7 rad/s but the loop crosses at 12.7 rad/s, so it delivers 55° of phase margin, not 60°.",
      unlock: "deadzone",
      tags: [{ text: "dead zone ±0.22 rad", at: (w) => w.wheel.anchor() }],
    },
    recall: { q: "A proportional position loop on a motor with friction will…", options: ["Always reach the target exactly", "Stop anywhere inside a dead zone that shrinks as the gain rises", "Oscillate forever", "Need a bigger flywheel"], answer: 1 },
  },
  {
    id: "4.2", kind: "nested", anchor: "4.2–4.3", mechanic: "tune", source: "Coursework 2 · 4.2–4.4", title: "The outer loop",
    focus: { min: [-1.6, 0, -2.4], max: [4.6, 3.4, 2.8] }, phoneFocus: SCOPE_BOX,
    brief: "Your nested loop: PI speed loop inside (Kp 0.13, τi 0.1), position gain G outside. The rig's dots are your run with G = 20. The info sheet's rule: the outer loop should be about 5× slower than the inner one.",
    setup: (w) => w.configure({ state: { G: 20, Tc: 1.7e-3 }, controls: ["C"], hint: "Turn G", hintAt: (w) => w.box.anchor() }),
    readouts: ["th", "G", "ratio"],
    predict: { type: "choice", prompt: "With G = 20, how much slower is the outer loop than the inner speed loop?", options: ["5× slower (the rule)", "About 2× slower", "Barely slower: about 1.1×", "It's faster than the inner loop"], answer: 2 },
    goal: { text: "Meet the 5× rule without going sluggish: ratio ≥ 5, rise ≤ 0.45 s, overshoot ≤ 1 %", instructions: "Right knob G (drag, or [ and ]). The readout shows the outer bandwidth against the inner loop's 33.7 rad/s.", check: (w) => w.S.bwIn / w.S.bwOut >= 5 && w.m.rise <= 0.45 && w.m.overshoot <= 1, status: (w) => `G ${f(w.S.G, 1)} · ${f(w.S.bwIn / w.S.bwOut, 2)}× · rise ${f(w.m.rise, 2)} s`, hold: 1.0 },
    hint: "Somewhere between 4.5 and 5.5.",
    solution: { G: 5.5 },
    reveal: {
      title: "Outer bandwidth ≈ inner / 5",
      body: "At G = 5.5 the outer loop's bandwidth is 6.7 rad/s against the inner loop's 33.7: 5× slower, 82° of phase margin, no overshoot, but a 0.33 s rise. Your G = 20 gives 29.7 rad/s, only 1.1× slower: faster (0.07 s rise) with 9 % overshoot. The rig agreed with that model to 0.046 rad RMS. The rule trades speed for robustness; it isn't free.",
      equations: [{ f: "ω_demand = G·(θ_d − θ)", live: (w) => `inner ${f(w.S.bwIn, 1)} · outer ${f(w.S.bwOut, 1)} rad/s → ${f(w.S.bwIn / w.S.bwOut, 2)}×` }],
      note: "Portfolio check (Output 4.3b): 1.322 s is the clock time on the plot (the step is at 1.0 s). From the step, the model settles in 0.22 s and the rig in 0.33 s. The model's 9 % overshoot is right. The rig's 11 % is 10.7 % of 1 rad, but the run steps 2 rad (−1 → +1), so it is 5.3 %.",
      unlock: "nested",
      tags: [{ text: "rig agrees: 0.046 rad RMS at G 20", at: (w) => w.scope.anchor() }],
    },
    recall: { q: "The nested-loop rule of thumb puts the outer loop's bandwidth…", options: ["5× above the inner loop", "Equal to the inner loop", "About 5× below the inner loop", "At the motor's L/R"], answer: 2 },
  },
  {
    id: "boss", kind: "boss", boss: true, anchor: "1–4", mechanic: "boss", source: "Coursework 2 · all tasks", title: "Commission the rig",
    focus: { min: [-1.6, 0, -2.4], max: [5.4, 3.4, 2.8] }, phoneFocus: { min: [-0.7, 0.4, -2.3], max: [5.4, 3.3, 2.7] },
    brief: "Hand-over day. The rig model is the coursework's model plus everything the data taught you: the ±10 V drive and 1.7 mNm of friction. Make the shaft go 0 → 1 rad and park within 0.02 rad, overshoot ≤ 5 %, settled by 0.3 s, phase margin ≥ 50°.",
    setup: (w) => w.configure({ state: { mode: "pa", Kpa: 0.688, Kpi: 0.13, tau_i: 0.1, G: 20 }, controls: ["A", "B", "C", "sw"], hint: "Switch = PA ↔ nested", hintAt: (w) => w.sw.anchor() }),
    readouts: ["th", "ess", "pm"],
    predict: { type: "choice", prompt: "On this rig, which of your two designs meets all four specs as you submitted it?", options: ["The PA (K_PA 0.688)", "The nested loop (G 20)", "Neither: both need retuning"], answer: 2 },
    goal: { text: "Park within 0.02 rad · overshoot ≤ 5 % · settled by 0.3 s · PM ≥ 50°", instructions: "Orange switch (or L): PA ↔ NESTED. Knobs: Kp or K_PA (↑↓), τi (←→), G ([ ]). The scope runs the rig model each time you turn a knob.", check: (w) => w.bossOk(), status: (w) => `${w.S.mode === "pa" ? "PA" : "nested"} · error ${f(w.m.ess, 3)} rad · OS ${f(w.m.overshoot, 1)} % · settle ${f(w.m.settle, 2)} s · PM ${f(w.S.margins.pm, 0)}°`, hold: 1.0 },
    hint: "Integral action pushes through friction. Your nested loop just needs a gentler G.",
    solution: { mode: "nested", G: 12 },
    reveal: {
      title: "Integral action beats friction",
      body: "The nested loop's integrator keeps raising the voltage until the shaft breaks free, so it parks exactly. G ≈ 12 keeps it fast (0.23 s) without overshoot. The PA can pass too, but only by raising K_PA until its dead zone shrinks, and then the drive slams into 10 V on every step. You've rebuilt the coursework: model (1.2), friction (1.2), PI (2), nested loop (4), PA dead zone (3).",
      equations: [{ f: "e_ss = 0 with ∫e (nested) · |e| < T_c·R/(K·K_PA) without (PA)", live: (w) => `${w.S.mode === "pa" ? "PA" : "nested"}: parks ${f(w.m.final, 3)} rad` }],
    },
    recall: { q: "On a motor with friction, which removes the position error completely?", options: ["More proportional gain", "Phase advance", "Integral action", "A bigger flywheel"], answer: 2 },
  },
];

for (const l of levels) if (l.phoneFocus) { const wide = l.focus; Object.defineProperty(l, "focus", { get: () => (innerWidth < 760 ? l.phoneFocus : wide) }); }

const readouts = [
  { key: "w", label: "Speed", unit: "RAD/S", big: true, get: (w) => w.w, digits: 1 },
  { key: "th", label: "Position", unit: "RAD", big: true, get: (w) => w.th, digits: 3 },
  { key: "V", label: "Supply", unit: "V", get: (w) => w.S.V, digits: 2 },
  { key: "tau", label: "τ (t63)", unit: "s", get: (w) => w.m.t63 ?? NaN, format: (v) => f(v, 3) },
  { key: "rms", label: "Model vs rig", unit: "rad/s RMS", get: (w) => w.rms, format: (v) => (Number.isFinite(v) ? f(v, 2) : "—") },
  { key: "Tc", label: "Friction T_c", unit: "mNm", get: (w) => w.S.Tc * 1e3, digits: 1 },
  { key: "Kpi", label: "Kp", unit: "V·s/rad", get: (w) => w.S.Kpi, digits: 2 },
  { key: "taui", label: "τi", unit: "s", get: (w) => w.S.tau_i, digits: 3 },
  { key: "G", label: "G", unit: "1/s", get: (w) => w.S.G, digits: 1 },
  { key: "pm", label: "Phase margin", unit: "°", get: (w) => w.S.margins.pm ?? NaN, format: (v) => f(v, 0) },
  { key: "os", label: "Overshoot", unit: "%", get: (w) => w.m.overshoot ?? NaN, format: (v) => f(v, 1) },
  { key: "settle", label: "Settle ±2 %", unit: "s", get: (w) => w.m.settle ?? NaN, format: (v) => f(v, 2) },
  { key: "rise", label: "Rise 10–90", unit: "s", get: (w) => w.m.rise ?? NaN, format: (v) => f(v, 2) },
  { key: "ratio", label: "Inner ÷ outer", unit: "×", get: (w) => w.S.bwIn / w.S.bwOut, format: (v) => f(v, 2) },
  { key: "dead", label: "Dead zone", unit: "± rad", get: (w) => w.S.dead ?? 0, format: (v) => f(v, 2) },
  { key: "ess", label: "Parks off by", unit: "rad", get: (w) => w.m.ess ?? NaN, format: (v) => f(v, 3) },
];

playable({
  id: "rig-tuner",
  serial: SERIAL,
  title: "Rig Tuner",
  source: "21WSB004 Coursework 2 · Motor position control",
  subtitle: "A whole control lab on one bench: the DC motor rig, your controllers and your own measured data on a phosphor scope. Tune, predict, and find out where the model and the real rig disagree.",
  camera: { position: [6.6, 7.6, 13.6], target: [0.6, 1.3, 0], fov: 32, portraitFov: 50, maxDistance: 28, minAzimuth: -1.0, maxAzimuth: 1.0, avoidReadouts: true, focus: { min: [-6.4, 0, -3.2], max: [6.0, 3.8, 3.4] } },
  verified,
  readouts,
  equations,
  levels,
  build,
});
