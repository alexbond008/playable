import * as THREE from "three";
import { playable } from "../../kit/core/game.mjs";
import { createPhysics } from "../../kit/core/physics.mjs";
import { bench } from "../../kit/core/parts/bench.mjs";
import { dcMotor, dyno, slottedWeights, benchSupply, toggleSwitch, rheostat, wire } from "../../kit/core/parts/motorlab.mjs";
import { currentFlow, torqueArrow, heatGlow, heatMotes } from "../../kit/core/overlays.mjs";
import { detentValue } from "../../kit/core/interact.mjs";
import { createMotorSim, rad, rpm, q7 } from "./model.mjs";
import verified from "./verified.json";

const SERIAL = "PLAYABLE-01";
const HANGER = { x: 0, z: 2.9, panY: 0.42, armY: 1.45 };
const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");

async function build({ stage, B, audio, interaction, h, overlay }) {
  const physics = await createPhysics(stage);
  const plate = bench(B, stage, { serial: SERIAL, subtitle: "Motor bench · Tutorial 1.1 · DC machines" });

  const m1 = dcMotor(B, stage, { pos: [-3.2, 1.45, 0], shaftLength: 3.5 });
  const m2 = dcMotor(B, stage, { pos: [3.2, 1.45, 0], facing: -1, shaftLength: 3.5, toggle: true });
  const dy = dyno(B, stage, { x: 0, axisY: 1.45, armLength: 1.6 });
  const psu = benchSupply(B, stage, { pos: [3.9, 0, -2.5], rotY: -0.3 });
  const sw = toggleSwitch(B, stage, { pos: [-2.2, 0, 2.85] });
  const rh = rheostat(B, stage, { pos: [3.7, 0, 2.7], range: [0.5, 8] });
  stage.root.updateMatrixWorld(true);

  const [p1, n1] = m1.terminals();
  const [ps, pn] = psu.posts();
  const [sa, sb] = sw.contacts();
  const [ra, rb] = rh.terminals();
  const twinWires = B.group({ dynamic: true });
  const [p2, n2] = m2.terminals();
  const W = {
    supPos: wire(B, stage, ps, p1, { role: "insRed" }),
    supNeg: wire(B, stage, n1, pn),
    brkA: wire(B, stage, p1, sa, { role: "insRed", lift: 0.6 }),
    brkB: wire(B, stage, sb, ra, { lift: 0.5 }),
    brkC: wire(B, stage, rb, n1, { lift: 0.8 }),
    twPos: wire(B, stage, ps, p2, { role: "insRed", lift: 1.2, parent: twinWires }),
    twNeg: wire(B, stage, n2, pn, { lift: 1.1, parent: twinWires }),
  };
  const flow = Object.fromEntries(Object.entries(W).map(([k, w]) => [k, currentFlow(stage, w.curve)]));

  const weights = slottedWeights(B, stage, physics, { rackPos: [-4.7, 0, 2.7], hanger: HANGER });
  for (const [size, pos] of [
    [[2.9, 1.9, 1.7], [3.9, 0.95, -2.5]], [[2.6, 2.6, 2.4], [-3.2, 1.3, 0]], [[1.1, 0.5, 0.8], [-2.2, 0.25, 2.85]],
    [[2.9, 1.2, 0.8], [3.7, 0.6, 2.7]], [[2.0, 2.7, 1.2], [0, 1.35, 0]], [[0.4, 0.4, 1.2], [0, 1.45, 1.9]],
  ]) physics.fixedBox(size, pos);
  const m2Collider = physics.fixedBox([2.6, 2.6, 2.4], [3.2, 1.3, 0]);

  const arrow1 = torqueArrow(stage, B.group({ pos: [-1.55, 1.45, 0] }));
  const arrow2 = torqueArrow(stage, B.group({ pos: [1.55, 1.45, 0] }));
  const glow = heatGlow(rh.heatMaterial);
  const motes = heatMotes(stage, rh.center(), [1.0, 0.25]);

  const sim = createMotorSim();
  const s = sim.state;
  let lvl = null;
  let reveal = 0;
  let angle = 0;
  let knobMax = 60;
  let knobStep = 0.5;
  let grabbed = false;
  const enabled = { knob: false, weights: false, brake: false, rheostat: false };

  const knobValue = () => (s.drive === "current" ? s.Iset : s.V);
  function setKnob(v, quiet) {
    const nv = detentValue(v, knobStep, 0, knobMax);
    if (nv === knobValue()) return;
    if (s.drive === "current") s.Iset = nv; else if (s.drive !== "brake") s.V = nv; else s.Vset = nv;
    if (!quiet) audio.detent();
  }
  function setRb(r, quiet) {
    const nv = detentValue(r, 0.02, rh.range[0], rh.range[1]);
    if (Math.abs(nv - s.Rb) < 1e-9) return;
    s.Rb = nv;
    rh.setR(nv);
    if (!quiet) audio.detent();
  }
  function setBrake(on) {
    if (on === (s.drive === "brake")) return;
    if (on) sim.brake(true);
    else {
      sim.brake(false);
      s.tempC = Math.min(s.tempC, 400);
    }
    audio.thump();
    if (on && s.brakeI0 > 40) world.flash(`⚠ ${Math.round(s.brakeI0)} A through the resistor`);
  }

  interaction.register(psu.grab, {
    enabled: () => enabled.knob,
    onDragStart: () => { grabbed = true; return knobValue(); },
    onDrag: ({ dx, dy, data }) => setKnob(data + (dy + dx * 0.6) * (knobMax / 500)),
  });
  interaction.register(rh.grab, {
    enabled: () => enabled.rheostat,
    onDragStart: () => { grabbed = true; return s.Rb; },
    onDrag: ({ dx, dy, data }) => setRb(data + (dx + dy * 0.3) * 0.012),
  });
  interaction.register(sw.grab, { enabled: () => enabled.brake, onTap: () => { grabbed = true; setBrake(s.drive !== "brake"); } });
  weights.draggable(interaction, audio);

  const hint = h("div", { class: "tag grab" }, "");
  overlay.append(hint);
  const vy = new Map();

  function setLevel(l) {
    lvl = l;
    grabbed = false;
    hint.hidden = !l;
    reveal = 0;
    Object.assign(s, { K: 0.2, R: 0.1, J: 0.02, Fc: 0, V: 0, Iset: 0, Rb: 2.52, load: 0, drive: "voltage", dyno: "free", holdRpm: 0, twin: null, tempC: 25, brakeT0: 0, brakeI0: 0, brakeHeat: 0, stopTime: null, omega0: 0 });
    for (const k of Object.keys(enabled)) enabled[k] = false;
    weights.reset();
    m2.wrap.visible = twinWires.visible = false;
    m2Collider.setEnabled(false);
    knobMax = 60;
    knobStep = 0.5;
    rh.setR(s.Rb);
    if (!l) return;
    m1.setNameplate(s.K, s.R, "M1");
  }

  const world = {
    sim, s, weights, physics,
    get load() { return Math.round(weights.load() * 10) / 10; },
    get rpm() { return rpm(s.omega); },
    setLevel,
    m1, m2, psu, rh, sw, dy,
    configure(o) {
      Object.assign(s, o.sim ?? {});
      for (const c of o.controls ?? []) enabled[c] = true;
      weights.setDraggable(enabled.weights);
      knobMax = o.knobMax ?? 60;
      knobStep = o.knobStep ?? 0.5;
      if (o.load != null) weights.place(o.load);
      rh.setR(s.Rb);
      m1.setNameplate(s.K, s.R, "M1");
      if (o.twin) {
        s.twin = o.twin;
        m2.wrap.visible = twinWires.visible = true;
        m2Collider.setEnabled(true);
        m2.setNameplate(o.twin.K, o.twin.R, "M2");
      }
      if (o.settle) for (let i = 0; i < 4000; i++) sim.step(0.002);
      world.hintText = o.hint ?? null;
    },
    solve(sol) {
      grabbed = true;
      if (sol.load != null) weights.place(sol.load);
      if (sol.knob != null) setKnob(sol.knob, true);
      if (sol.rheostat != null) setRb(sol.rheostat, true);
      if (sol.brake) setBrake(true);
    },
    flash(text) {
      const el = document.getElementById("toast");
      if (!el) return;
      el.textContent = text;
      el.hidden = false;
      clearTimeout(world._t);
      world._t = setTimeout(() => (el.hidden = true), 2600);
      audio.miss();
    },
    reveal(on) {
      reveal = on ? 1 : 0;
      stage.setCut(on);
    },
    redraw() {
      plate.redrawPlate();
      m1.setNameplate(s.K, s.R, "M1");
      if (s.twin) m2.setNameplate(s.twin.K, s.twin.R, "M2");
    },
    anchors() {
      if (!lvl || grabbed || !world.hintText) { hint.hidden = true; return []; }
      hint.hidden = false;
      hint.textContent = world.hintText;
      const at = enabled.knob ? psu.knobAnchor : enabled.rheostat ? rh.anchor : enabled.brake ? sw.anchor : () => new THREE.Vector3(-4.7, 1.0, 2.7);
      return [{ el: hint, at }];
    },
    onKey(e, phase) {
      if (phase !== "play" && phase !== "reveal") return;
      const k = e.key;
      if (enabled.knob && (k === "ArrowUp" || k === "ArrowDown")) { setKnob(knobValue() + (k === "ArrowUp" ? knobStep : -knobStep)); grabbed = true; e.preventDefault(); }
      if (enabled.rheostat && (k === "ArrowLeft" || k === "ArrowRight")) { setRb(s.Rb + (k === "ArrowRight" ? 0.02 : -0.02)); grabbed = true; e.preventDefault(); }
      if (enabled.brake && k.toLowerCase() === "b") { setBrake(s.drive !== "brake"); grabbed = true; }
      if (enabled.weights && (k === "+" || k === "=")) { weights.addOne(1); grabbed = true; }
      if (enabled.weights && k === "]") { weights.addOne(0.2); grabbed = true; }
      if (enabled.weights && (k === "-" || k === "[")) { weights.removeOne(); grabbed = true; }
    },
    step(dt, dtReal, t) {
      physics.step(dtReal);
      weights.settle(dtReal);
      for (const d of weights.discs) {
        const v = d.body.linvel().y;
        const prev = vy.get(d) ?? 0;
        if (prev < -0.9 && v > -0.2) audio.clack(Math.min(0.5, -prev * 0.12));
        vy.set(d, v);
      }
      if (lvl && !lvl.manualLoad) s.load = weights.load();
      sim.step(dt);
      angle += (s.omega * dt) / 30;
      m1.rotor.rotation.x = angle;
      m2.rotor.rotation.x = -angle;
      dy.spin.rotation.x = angle;
      dy.setRpm(rpm(s.omega));
      psu.setKnob(knobValue() / knobMax);
      sw.update(s.drive === "brake", dtReal);
      const brk = s.drive === "brake";
      const g = reveal ? 3 : 1;
      flow.supPos.update(brk ? 0 : s.I, dt, g);
      flow.supNeg.update(brk ? 0 : s.I, dt, g);
      flow.brkA.update(brk ? -s.I : 0, dt, g);
      flow.brkB.update(brk ? -s.I : 0, dt, g);
      flow.brkC.update(brk ? -s.I : 0, dt, g);
      flow.twPos.update(s.twin ? s.I2 : 0, dt, g);
      flow.twNeg.update(s.twin ? s.I2 : 0, dt, g);
      arrow1.set(s.T, s.twin ? 3 : 4);
      arrow2.set(s.twin ? -s.T2 : 0, 3);
      m1.field.set(reveal);
      glow(s.tempC);
      motes(s.tempC, dtReal, t);
      if (dtReal > 0 && (world._dt = (world._dt ?? 0) + dtReal) > 0.1) {
        world._dt = 0;
        const cc = s.drive === "current";
        psu.display(f(brk ? 0 : s.V, 1), "V", f(brk ? 0 : Math.max(0, s.I), 1), "A", brk ? "OUTPUT OFF" : cc ? "CC  ON" : "CV  ON", stage.look !== "paper");
      }
      const omegaN = Math.abs(s.omega) / 330;
      audio.motor("m1", 30 + Math.abs(s.omega) * 0.42, Math.min(0.22, omegaN * 0.25), 500 + Math.min(2500, Math.abs(s.I) * 90));
      audio.hiss(Math.min(0.12, (s.brakePower || 0) / 6000));
    },
  };
  return world;
}

const equations = [
  { id: "omega", f: "ω = 2π·n / 60", source: "Q1", live: (w) => `${f(w.rpm, 0)} rpm → ${f(w.s.omega, 1)} rad/s` },
  { id: "power", f: "P = T·ω", source: "Q1", live: (w) => `${f(w.s.T, 2)} Nm × ${f(w.s.omega, 1)} rad/s = ${f(w.s.T * w.s.omega, 0)} W` },
  { id: "torque", f: "T = K·I", source: "Q2", live: (w) => `${f(w.s.K, 3)} × ${f(w.s.I, 2)} A = ${f(w.s.K * w.s.I, 2)} Nm` },
  { id: "voltage", f: "V = K·ω + I·Rₐ", source: "Q3", live: (w) => `${f(w.s.K, 3)}×${f(w.s.omega, 1)} + ${f(w.s.I, 2)}×${f(w.s.R, 3)} = ${f(w.s.K * w.s.omega + w.s.I * w.s.R, 2)} V` },
  { id: "droop", f: "ω = V/K − Rₐ·T / K²", source: "Q4", live: (w) => `${f(w.s.V / w.s.K, 1)} − ${f((w.s.R * w.s.T) / w.s.K ** 2, 1)} = ${f(w.s.V / w.s.K - (w.s.R * w.s.T) / w.s.K ** 2, 1)} rad/s` },
  { id: "brake", f: "I = E / (Rₐ + R_b)", source: "Q5", live: (w) => `R_b = ${f(w.s.Rb, 2)} Ω · initial ${f(w.s.brakeI0, 1)} A, ${f(w.s.brakeT0, 2)} Nm` },
  { id: "kinetic", f: "E_k = ½·J·ω²", source: "Q6", live: (w) => `½ × ${w.s.J} × ${f(w.s.omega, 1)}² = ${f(0.5 * w.s.J * w.s.omega ** 2, 1)} J` },
  { id: "friction", f: "K·I = T_L + F_c·ω", source: "Q7", live: (w) => `${f(w.s.K * w.s.I, 3)} = ${f(w.s.load, 2)} + ${f(w.s.Fc * w.s.omega, 3)} Nm` },
  { id: "sharing", f: "Tᵢ = Kᵢ·(V − Kᵢω) / Rᵢ", source: "Q8", live: (w) => (w.s.twin ? `T₁ ${f(w.s.T, 2)} Nm · T₂ ${f(w.s.T2, 2)} Nm` : "two motors needed") },
];

const levels = [
  {
    id: "Q1", solution: { load: 4 }, anchor: "Q1", mechanic: "fermi", source: "Tutorial 1.1 · Q1", title: "Speed in two languages",
    brief: "The dyno holds this motor at exactly 2500 rpm. Engineers do their maths in rad/s, so first: what is 2500 rpm in rad/s?",
    setup: (w) => w.configure({ sim: { drive: "auto", dyno: "hold", holdRpm: 2500 }, controls: ["weights"], settle: true, hint: "Drag weights onto the hanger" }),
    readouts: ["rpm", "omega", "T", "load", "P"], hide: ["omega", "P"],
    predict: { type: "number", prompt: "2500 rpm is how many rad/s?", unit: "rad/s", min: 0, max: 1000, step: 1, start: 500, answer: 261.8, tolerance: 0.02 },
    goal: { text: "Hang 4 Nm on the brake arm while the dyno holds 2500 rpm", instructions: "Drag four of the big 1 Nm weights from the rack onto the hanger (or press + four times). The motor has to supply that torque.", check: (w) => w.load === 4, status: (w) => `${f(w.load)} Nm hanging`, hold: 1.2 },
    hint: "Each big disc is 1 Nm on this arm. Four of them.",
    reveal: {
      title: "ω = 2π·n / 60",
      body: "One revolution is 2π radians and a minute is 60 seconds, so 2500 rpm is 261.8 rad/s. With 4 Nm on the shaft the motor is delivering P = T·ω: about 1047 W, the answer sheet's number.",
      equations: [{ f: "ω = 2π × 2500 / 60 = 261.8 rad/s", live: (w) => `live: ${f(w.s.omega, 1)} rad/s` }, { f: "P = T·ω", live: (w) => `${f(w.s.T, 2)} Nm × ${f(w.s.omega, 1)} rad/s = ${f(w.s.T * w.s.omega, 0)} W` }],
      unlock: "omega",
    },
    recall: { q: "A shaft turns at 3000 rpm. In rad/s that is about…", options: ["50", "314", "18 850", "3000"], answer: 1 },
  },
  {
    id: "Q2", solution: { knob: 10 }, anchor: "Q2", mechanic: "tune", source: "Tutorial 1.1 · Q2", title: "Torque from current",
    brief: "A bigger machine: K = 1.5 V·s/rad. The supply is in current mode and the dyno holds 3000 rpm. You set the current.",
    setup: (w) => w.configure({ sim: { K: 1.5, R: 0.5, drive: "current", dyno: "hold", holdRpm: 3000, Iset: 2 }, controls: ["knob"], knobMax: 20, knobStep: 0.5, settle: true, hint: "Drag the orange knob · sets current" }),
    readouts: ["rpm", "I", "T", "E"], hide: ["T"],
    predict: { type: "choice", prompt: "At 10 A, how much torque will this motor make?", options: ["1.5 Nm", "6.7 Nm", "15 Nm", "150 Nm"], answer: 2 },
    goal: { text: "Set the supply to 10 A", instructions: "Turn the orange knob until the supply reads 10.0 A. Watch the torque arrow on the shaft grow.", check: (w) => Math.abs(w.s.Iset - 10) < 0.01, status: (w) => `${f(w.s.Iset)} A`, hold: 1.2 },
    hint: "Torque is current times the machine constant.",
    reveal: {
      title: "T = K·I and E = K·ω",
      body: "Torque is K times current: 1.5 × 10 = 15 Nm. The same K turns speed into back-EMF: 1.5 × 314.2 rad/s = 471 V. In SI units K_T and K_E are the same number, because electrical power in (E·I) equals mechanical power out (T·ω).",
      equations: [{ f: "T = K·I = 1.5 × 10 = 15 Nm", live: (w) => `live: ${f(w.s.T, 2)} Nm` }, { f: "E = K·ω = 1.5 × 314.2 = 471 V", live: (w) => `live: ${f(w.s.E, 0)} V` }, { f: "E·I = T·ω", live: (w) => `${f(w.s.E * w.s.I, 0)} W = ${f(w.s.T * w.s.omega, 0)} W` }],
      unlock: "torque",
    },
    recall: { q: "K_T and K_E in SI units are…", options: ["Unrelated", "Equal", "Reciprocals", "Equal only at no load"], answer: 1 },
  },
  {
    id: "Q3", solution: { load: 3, knob: 43.5 }, anchor: "Q3", mechanic: "tune", source: "Tutorial 1.1 · Q3", title: "Hit the operating point",
    brief: "K = 0.2, Rₐ = 0.1 Ω. Hang 3 Nm, then find the supply voltage that spins the motor at exactly 2000 rpm.",
    setup: (w) => w.configure({ sim: { K: 0.2, R: 0.1, V: 20 }, controls: ["knob", "weights"], hint: "Hang 3 Nm, then turn the knob" }),
    readouts: ["rpm", "V", "I", "T", "load", "eff"], hide: ["eff"],
    predict: { type: "number", prompt: "What supply voltage gives 2000 rpm with 3 Nm on the shaft?", unit: "V", min: 0, max: 60, step: 0.5, start: 30, answer: 43.4, tolerance: 0.03 },
    goal: { text: "3.0 Nm hanging and 2000 ± 20 rpm", check: (w) => w.load === 3 && Math.abs(w.rpm - 2000) <= 20, status: (w) => `${f(w.rpm, 0)} rpm · ${f(w.load)} Nm`, hold: 1.5 },
    hint: "First find the current the load needs (T = K·I), then add the I·R drop to the back-EMF.",
    reveal: {
      title: "V = K·ω + I·Rₐ",
      body: "3 Nm needs I = T/K = 15 A. At 2000 rpm (209.4 rad/s) the back-EMF is 0.2 × 209.4 = 41.9 V, and the armature drops 15 × 0.1 = 1.5 V. Supply: 43.4 V. Efficiency = Tω / VI = 628 / 651 = 96.5 %.",
      equations: [{ f: "V = K·ω + I·Rₐ", live: (w) => `${f(w.s.V, 1)} = 0.2×${f(w.s.omega, 1)} + ${f(w.s.I, 1)}×0.1` }, { f: "η = T·ω / (V·I)", live: (w) => `${f((100 * w.s.T * w.s.omega) / Math.max(1e-6, w.s.V * w.s.I), 1)} %` }],
      unlock: "voltage",
      tags: [{ text: "back-EMF E = Kω", at: (w) => w.m1.anchor() }],
    },
    recall: { q: "To make a loaded motor go faster at the same load you raise…", options: ["The armature resistance", "The supply voltage", "The load", "K_T only"], answer: 1 },
  },
  {
    id: "Q4", solution: { load: 4 }, anchor: "Q4", mechanic: "predict", source: "Tutorial 1.1 · Q4", title: "Speed droop",
    brief: "No load: 2500 rpm. With 2 Nm hanging it has drooped to 2450 rpm. What happens when you double the load?",
    setup: (w) => w.configure({ sim: { K: 0.2, R: 0.10472, V: 52.36 }, controls: ["weights"], load: 2, settle: true, hint: "Add 2 more big weights" }),
    readouts: ["rpm", "load", "T", "I"],
    predict: { type: "choice", prompt: "Double the load to 4 Nm. The new speed is…", options: ["2400 rpm", "2425 rpm", "2350 rpm", "1225 rpm"], answer: 0 },
    goal: { text: "Hang 4 Nm in total", instructions: "Add two more big weights (or press + twice) and wait for the speed to settle.", check: (w) => w.load === 4 && Math.abs(w.rpm - 2400) < 5, status: (w) => `${f(w.rpm, 0)} rpm · ${f(w.load)} Nm`, hold: 1.2 },
    reveal: {
      title: "Speed falls in a straight line",
      body: "ω = V/K − Rₐ·T/K². Every newton-metre costs the same speed, so 2 Nm cost 50 rpm and 4 Nm cost 100 rpm: 2400 rpm. Doubling the load doubles the drop, not the speed.",
      equations: [{ f: "ω = V/K − Rₐ·T / K²", live: (w) => `${f(rpm(w.s.V / w.s.K), 0)} rpm − ${f(rpm((w.s.R * w.s.T) / w.s.K ** 2), 0)} rpm = ${f(w.rpm, 0)} rpm` }],
      unlock: "droop",
    },
    recall: { q: "A motor drops 30 rpm at 1 Nm. At 3 Nm it drops…", options: ["30 rpm", "60 rpm", "90 rpm", "270 rpm"], answer: 2 },
  },
  {
    id: "Q5", solution: { rheostat: 2.52, brake: true }, anchor: "Q5 *", mechanic: "break", source: "Tutorial 1.1 · Q5 (exam level)", title: "Brake it",
    brief: "The Q3 motor runs at 2500 rpm. Flip the switch and the armature dumps into the rheostat. Pick the resistance that gives an initial braking torque of exactly 4 Nm.",
    setup: (w) => w.configure({ sim: { K: 0.2, R: 0.1, V: 52.36, Rb: 6 }, controls: ["rheostat", "brake"], settle: true, hint: "Slide the rheostat, then flip the switch" }),
    readouts: ["rpm", "Rb", "Ib", "Tb"],
    predict: { type: "number", prompt: "Which brake resistance gives 4 Nm the instant you brake?", unit: "Ω", min: 0.5, max: 8, step: 0.02, start: 4, answer: 2.52, tolerance: 0.04 },
    goal: { text: "Initial braking torque 4.0 ± 0.1 Nm", instructions: "Set R_b with the orange slider, then flip the orange switch. Flip it back to spin up again. Try a very small R_b too, and watch the resistor.", check: (w) => w.s.drive === "brake" && Math.abs(w.s.brakeT0 - 4) <= 0.1, status: (w) => (w.s.brakeT0 ? `last brake: ${f(w.s.brakeT0, 2)} Nm at ${f(w.s.Rb, 2)} Ω` : `R_b ${f(w.s.Rb, 2)} Ω`), hold: 0.5 },
    hint: "4 Nm needs I = T/K = 20 A. The back-EMF at 2500 rpm is 52.4 V. R_total = E/I.",
    reveal: {
      title: "I = E / (Rₐ + R_b)",
      body: "At 2500 rpm E = 52.4 V. 4 Nm needs 20 A, so the loop needs 52.4 / 20 = 2.62 Ω in total. Take away Rₐ = 0.1 Ω: R_b = 2.52 Ω. A smaller resistor brakes harder but pushes far more current, and the energy has to go somewhere.",
      equations: [{ f: "R_b = K·E / T − Rₐ", live: (w) => `initial: ${f(w.s.brakeI0, 1)} A, ${f(w.s.brakeT0, 2)} Nm at ${f(w.s.Rb, 2)} Ω` }],
      unlock: "brake",
      tags: [{ text: "energy → heat", at: (w) => w.rh.anchor() }],
    },
    recall: { q: "Halving the brake resistor (Rₐ small) makes the initial braking torque…", options: ["Half", "The same", "About double", "Four times"], answer: 2 },
  },
  {
    id: "Q6", solution: { brake: true }, anchor: "Q6 *", mechanic: "fermi", source: "Tutorial 1.1 · Q6 (exam level)", title: "Where does the energy go?",
    brief: "This rotor has J = 21 000 g·cm² and spins at 3000 rpm. The brake stops it in 0.5 s. Every joule ends up in the resistor.",
    setup: (w) => w.configure({ sim: { K: 0.128, R: 0.02, J: 0.0021, V: 40.21, Rb: 1.0 }, controls: ["brake"], settle: true, hint: "Flip the switch to brake" }),
    readouts: ["rpm", "heat", "tstop"],
    manualLoad: true,
    predict: { type: "number", prompt: "Average power in the brake resistor over those 0.5 s?", unit: "W", min: 0, max: 1000, step: 1, start: 300, answer: 207, tolerance: 0.05 },
    goal: { text: "Brake the rotor to a stop", instructions: "Flip the orange switch and watch the energy meter fill as the rotor stops.", check: (w) => w.s.drive === "brake" && w.s.stopTime != null, status: (w) => (w.s.drive === "brake" ? `${f(w.s.brakeHeat, 1)} J in the resistor` : "spinning at 3000 rpm"), hold: 0.6 },
    hint: "Find the stored energy ½Jω² (J in kg·m²), then divide by the time.",
    reveal: {
      title: "E_k = ½·J·ω²",
      body: "21 000 g·cm² is 0.0021 kg·m². At 314.2 rad/s the rotor stores ½ × 0.0021 × 314.2² = 103.6 J. Dumped in 0.5 s, that averages 207 W.",
      equations: [{ f: "½ × 0.0021 × 314.2² = 103.6 J", live: (w) => `measured: ${f(w.s.brakeHeat, 1)} J` }, { f: "P = E / t = 103.6 / 0.5 = 207 W" }],
      unlock: "kinetic",
    },
    recall: { q: "Double the speed of a flywheel and its stored energy…", options: ["Doubles", "Quadruples", "Halves", "Stays the same"], answer: 1 },
  },
  {
    id: "Q7", solution: { load: 3.2 }, anchor: "Q7 *", mechanic: "tune", source: "Tutorial 1.1 · Q7 (exam level)", title: "Friction is real",
    brief: "A stiffer machine on 100 V: K = 0.318, Rₐ = 0.08 Ω, with friction F_c = 1.5 × 10⁻³ N·m·s/rad. Load it with 3.2 Nm.",
    setup: (w) => w.configure({ sim: { K: 0.318, R: 0.08, V: 100, Fc: 0.0015, J: 0.03 }, controls: ["weights"], knobMax: 120, settle: true, hint: "Three big + one small weight" }),
    readouts: ["rpm", "load", "I", "T"],
    predict: { type: "choice", prompt: "With 3.2 Nm on it, how far does the speed drop from no load?", options: ["about 0.1 %", "about 1 %", "about 10 %", "about 25 %"], answer: 1 },
    goal: { text: "Hang exactly 3.2 Nm", instructions: "Three big 1 Nm discs plus one small 0.2 Nm disc (or + three times and ] once).", check: (w) => Math.abs(w.load - 3.2) < 0.01 && Math.abs(w.rpm - q7({ K: 0.318, R: 0.08, V: 100, Fc: 0.0015, TL: 3.2 }).n) < 2, status: (w) => `${f(w.rpm, 0)} rpm · ${f(w.load)} Nm`, hold: 1.5 },
    reveal: {
      title: "K·I = T_L + F_c·ω",
      body: "The motor now has to cover the load and friction. Solving the two equations together: 2975 rpm loaded. The answer sheet's no-load speed of 3003 rpm is the ideal V/K, so the drop is 0.9 %. A big K and small Rₐ make a stiff motor.",
      equations: [{ f: "K·I = T_L + F_c·ω", live: (w) => `${f(w.s.K * w.s.I, 3)} Nm = ${f(w.s.load, 2)} + ${f(w.s.Fc * w.s.omega, 3)}` }, { f: "drop = (3003 − 2975) / 3003 = 0.9 %" }],
      note: "Truth check: with friction included at no load too, the motor would idle at 2999 rpm. The answer sheet uses the ideal V/K = 3003 rpm.",
      unlock: "friction",
    },
    recall: { q: "Friction makes the steady-state current…", options: ["Smaller", "Larger", "Zero", "Unchanged"], answer: 1 },
  },
  {
    id: "Q8", solution: { load: 5 }, anchor: "Q8 *", mechanic: "boss", boss: true, source: "Tutorial 1.1 · Q8 (exam level)", title: "Twin motors",
    brief: "Two motors share one shaft and one 200 V supply. M1: K 0.61, R 4.2 Ω. M2: K 0.63, R 4.1 Ω. Total load 5 Nm, friction 0.0033.",
    setup: (w) => w.configure({ sim: { K: 0.61, R: 4.2, V: 200, Fc: 0.0033, J: 0.06 }, twin: { K: 0.63, R: 4.1 }, controls: ["weights"], knobMax: 220, settle: true, hint: "Hang 5 Nm" }),
    readouts: ["rpm", "load", "T", "T2", "I", "I2"], hide: ["T", "T2"],
    predict: { type: "choice", prompt: "Which motor carries more of the 5 Nm?", options: ["M1 (smaller K, bigger R)", "M2 (bigger K, smaller R)", "They share it equally"], answer: 0 },
    goal: { text: "Hang 5 Nm and let the shaft settle", instructions: "Five big weights. Watch the two torque arrows, one at each end of the dyno.", check: (w) => Math.abs(w.load - 5) < 0.01 && Math.abs(w.rpm - 2772.2) < 6, status: (w) => `${f(w.rpm, 0)} rpm · ${f(w.load)} Nm`, hold: 1.5 },
    reveal: {
      title: "Load sharing",
      body: "Both motors turn at the same 290 rad/s, but M2's bigger K makes more back-EMF, which leaves it less voltage across its resistance and so less current. M1 carries 3.33 Nm, M2 2.63 Nm: ±12 % of the mean. Reasonable sharing, and the opposite of most first guesses.",
      equations: [{ f: "Tᵢ = Kᵢ·(V − Kᵢ·ω) / Rᵢ", live: (w) => `T₁ ${f(w.s.T, 2)} Nm · T₂ ${f(w.s.T2, 2)} Nm` }, { f: "spread = ±12 % of the mean" }],
      unlock: "sharing",
    },
    recall: { q: "In parallel motors on one shaft, the one with the larger back-EMF constant takes…", options: ["More current", "Less current", "The same current"], answer: 1 },
  },
];

const readouts = [
  { key: "rpm", label: "Speed", unit: "RPM", big: true, get: (w) => w.rpm, digits: 0 },
  { key: "omega", label: "ω", unit: "rad/s", get: (w) => w.s.omega, digits: 1 },
  { key: "V", label: "Supply", unit: "V", get: (w) => (w.s.drive === "brake" ? 0 : w.s.V), digits: 1 },
  { key: "I", label: "Current", unit: "A", get: (w) => w.s.I, digits: 1 },
  { key: "I2", label: "I₂", unit: "A", get: (w) => w.s.I2 ?? 0, digits: 2 },
  { key: "T", label: "Torque", unit: "Nm", get: (w) => w.s.T, digits: 2 },
  { key: "T2", label: "T₂", unit: "Nm", get: (w) => w.s.T2 ?? 0, digits: 2 },
  { key: "E", label: "Back-EMF", unit: "V", get: (w) => w.s.E, digits: 0 },
  { key: "load", label: "Hanging", unit: "Nm", get: (w) => w.load, digits: 1 },
  { key: "P", label: "Power", unit: "W", get: (w) => w.s.T * w.s.omega, digits: 0 },
  { key: "eff", label: "η", unit: "%", get: (w) => (w.s.V * w.s.I > 1 ? (100 * w.s.T * w.s.omega) / (w.s.V * w.s.I) : 0), digits: 1 },
  { key: "Rb", label: "R_b", unit: "Ω", get: (w) => w.s.Rb, digits: 2 },
  { key: "Ib", label: "Brake I₀", unit: "A", get: (w) => w.s.brakeI0 ?? 0, digits: 1 },
  { key: "Tb", label: "Brake T₀", unit: "Nm", get: (w) => w.s.brakeT0 ?? 0, digits: 2 },
  { key: "heat", label: "Heat", unit: "J", get: (w) => w.s.brakeHeat ?? 0, digits: 1 },
  { key: "tstop", label: "Stop time", unit: "s", get: (w) => w.s.stopTime ?? 0, digits: 2 },
];

playable({
  id: "motor-bench",
  serial: SERIAL,
  title: "Motor Bench",
  source: "Tutorial 1.1 · Brushed DC motors",
  subtitle: "Eight questions from a real DC-machines tutorial sheet, each one a level you play on a working motor test bench. Predict first, then find out.",
  camera: { position: [7.2, 7.4, 13.2], target: [0.9, 1.0, 0.6], maxDistance: 26, minAzimuth: -1.3, maxAzimuth: 1.3, focus: { min: [-6.2, 0, -3.4], max: [5.6, 2.8, 3.3] } },
  verified,
  readouts,
  equations,
  levels,
  build,
});
