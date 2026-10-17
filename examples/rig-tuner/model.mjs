// Rig Tuner model: the lab's DC motor + flywheel (21WSB004 Coursework 2) and its three controllers.
// Pure functions, no DOM. The game, the truth gate and truth.mjs all import from here.
//
// Plant (the student's Simulink subsystem, DCmodel_v1.slx: gains K, 1/L, 1/J, D, R and three integrators):
//   L·di/dt = u − R·i − K·ω        J·dω/dt = K·i − D·ω − T_c·sgn(ω)        dθ/dt = ω
// T_c (Coulomb friction) is 0 in the coursework's linear design model; the "rig model" adds the T_c fitted
// from the measured data, plus the ±10 V amplifier limit the info sheet quotes.

export const SCRIPT = { K: 0.03, J: 4.75e-5, R: 2.7, L: 0.082e-3, D: 5.21e-6 }; // start_MSD_SIM.m
export const SHEET = { K: 0.03, J: 4.73e-5, R: 2.7, L: 0.082e-3, D: 5.21e-6 }; // info sheet p.2
export const GAINS = { Kpi: 0.13, tau_i: 0.1, G: 20, Kpa: 0.688, tau_pa: 0.005, k: 9 }; // the student's own
export const VMAX = 10; // info sheet 2.2: "maximum control voltage possible is ±10 volts"

// ---------------------------------------------------------------- plant constants
export function plantConstants(p = SCRIPT) {
  const { K, J, R, L, D } = p;
  const den = K * K + R * D;
  // characteristic polynomial of ω/u: L·J·s² + (L·D + R·J)·s + (R·D + K²)
  const a = L * J, b = L * D + R * J, c = den;
  const disc = b * b - 4 * a * c;
  const s1 = (-b + Math.sqrt(disc)) / (2 * a);
  const s2 = (-b - Math.sqrt(disc)) / (2 * a);
  return {
    gain: K / den, // rad/s per volt
    tauM: (J * R) / den, // mechanical time constant (L = 0)
    tauE: L / R, // electrical time constant
    tauSlow: -1 / s1, // exact slow pole of the 2nd-order model
    tauFast: -1 / s2,
    stall: K / R, // stall torque per volt
    wn: Math.sqrt(c / a),
    zeta: b / (2 * Math.sqrt(a * c)),
  };
}

// ---------------------------------------------------------------- simulator
// ctrl: { type: "open", V } | { type: "pi", Kpi, tau_i } (velocity) | { type: "nested", Kpi, tau_i, G } | { type: "pa", Kpa, tau_pa, k }
//       | { type: "hand", V } (manual voltage) — demand(t) is rad/s for "pi", rad for the position loops.
// opts: { p, Tc, vmax, dt, x0: { i, w, th }, h }
export function createSim({ p = SCRIPT, Tc = 0, vmax = Infinity, h = 2e-5, delay = 0, deadband = 0 } = {}) {
  const s = { p: { ...p }, Tc, vmax, h, delay, deadband, i: 0, w: 0, th: 0, z: 0, y: 0, u: 0, t: 0, Tload: 0, stuck: false };
  // transport delay between the controller's output and the motor terminals (a ring buffer of sub-steps)
  let buf = null, head = 0;
  const delayed = (u) => {
    if (!s.delay) return u;
    const n = Math.max(1, Math.round(s.delay / s.h));
    if (!buf || buf.length !== n) { buf = new Float64Array(n).fill(u); head = 0; }
    const out = buf[head];
    buf[head] = u;
    head = (head + 1) % n;
    return out;
  };
  function control(ctrl, ref) {
    const P = s.p;
    if (ctrl.type === "open" || ctrl.type === "hand") return ctrl.V;
    if (ctrl.type === "pi") {
      const e = ref - s.w;
      return { u: ctrl.Kpi * (e + s.z / ctrl.tau_i), e };
    }
    if (ctrl.type === "nested") {
      const e = ctrl.G * (ref - s.th) - s.w;
      return { u: ctrl.Kpi * (e + s.z / ctrl.tau_i), e };
    }
    if (ctrl.type === "pa") {
      const e = ref - s.th;
      return { u: ctrl.Kpa * (ctrl.k * e + (1 - ctrl.k) * s.y), e, pa: true };
    }
    return 0;
  }
  function step(dt, ctrl, ref) {
    const n = Math.max(1, Math.round(dt / s.h));
    const hh = dt / n;
    const P = s.p;
    const decay = Math.exp((-hh * P.R) / P.L);
    for (let k = 0; k < n; k++) {
      const c = control(ctrl, ref);
      let u = typeof c === "number" ? c : c.u;
      const raw = u;
      u = Math.max(-s.vmax, Math.min(s.vmax, u));
      // integrator states (with conditional anti-windup off: the coursework's Simulink has none)
      if (c && typeof c === "object") {
        if (c.pa) s.y += (hh * (c.e - s.y)) / ctrl.tau_pa;
        else s.z += hh * c.e;
      }
      s.u = u;
      s.uRaw = raw;
      let ua = delayed(u);
      // drive deadband: the amplifier/motor ignores the first `deadband` volts either side of zero
      if (s.deadband) ua = Math.sign(ua) * Math.max(0, Math.abs(ua) - s.deadband);
      s.ua = ua;
      // electrical: exact exponential update (L/R = 30 µs is stiff)
      const iss = (ua - P.K * s.w) / P.R;
      s.i = iss + (s.i - iss) * decay;
      // mechanical with Coulomb friction and sticking
      const Tm = P.K * s.i + s.Tload;
      if (s.w === 0 && Math.abs(Tm) <= s.Tc) {
        s.stuck = true;
      } else {
        s.stuck = false;
        const fr = s.w !== 0 ? Math.sign(s.w) * s.Tc : Math.sign(Tm) * s.Tc;
        const w1 = s.w + (hh * (Tm - P.D * s.w - fr)) / P.J;
        s.w = s.Tc > 0 && s.w !== 0 && Math.sign(w1) !== Math.sign(s.w) ? 0 : w1;
      }
      s.th += hh * s.w;
      s.t += hh;
    }
    return s;
  }
  function reset(x0 = {}) {
    buf = null;
    Object.assign(s, { i: 0, w: 0, th: 0, z: 0, y: 0, u: 0, t: 0, Tload: 0, stuck: false }, x0);
    return s;
  }
  return { state: s, step, reset };
}

// Pre-load a controller's internal state so the loop starts in its steady state at `ref0`
// (the rig was already sitting on the previous half of the square wave when it was recorded).
export function settleAt(sim, ctrl, ref0, seconds = 1.5) {
  for (let t = 0; t < seconds; t += 1e-3) sim.step(1e-3, ctrl, ref0);
  sim.state.t = 0;
  return sim.state;
}

// Run a response and sample it every `dt` seconds. demand(t) → ref. Returns { t, w, th, u }.
export function response({ ctrl, demand, T = 1, dt = 1e-3, p = SCRIPT, Tc = 0, vmax = Infinity, x0, pre, h, delay = 0, deadband = 0 }) {
  const sim = createSim({ p, Tc, vmax, h, delay, deadband });
  sim.reset(x0);
  if (pre != null) settleAt(sim, ctrl, pre);
  const out = { t: [], w: [], th: [], u: [], i: [] };
  const N = Math.round(T / dt);
  for (let k = 0; k <= N; k++) {
    const t = k * dt;
    if (k > 0) sim.step(dt, ctrl, demand(t - dt));
    out.t.push(t);
    out.w.push(sim.state.w);
    out.th.push(sim.state.th);
    out.u.push(sim.state.u);
    out.i.push(sim.state.i);
  }
  return out;
}

// ---------------------------------------------------------------- step metrics
// y: samples, t: times, y0 start value, y1 target (final demand). Rise = 10→90 % of the change,
// overshoot relative to the change, settling = last time outside a ±band of the change, ess = |target − final|.
export function stepMetrics(t, y, y0, y1, { band = 0.02, tail = 0.1, tFinal } = {}) {
  const d = y1 - y0;
  const n = y.length;
  const tEnd = tFinal ?? t[n - 1];
  const tailVals = y.filter((_, k) => t[k] >= tEnd - tail && t[k] <= tEnd);
  const final = tailVals.reduce((a, b) => a + b, 0) / tailVals.length;
  const frac = (v) => (v - y0) / d;
  let t10 = null, t90 = null, peak = -Infinity;
  for (let k = 0; k < n && t[k] <= tEnd; k++) {
    const f = frac(y[k]);
    if (t10 == null && f >= 0.1) t10 = t[k];
    if (t90 == null && f >= 0.9) t90 = t[k];
    peak = Math.max(peak, f);
  }
  let ts = 0;
  for (let k = 0; k < n && t[k] <= tEnd; k++) if (Math.abs(y[k] - final) > band * Math.abs(d)) ts = t[k];
  let t63 = null;
  for (let k = 0; k < n && t[k] <= tEnd; k++) if (t63 == null && frac(y[k]) >= 0.632) t63 = t[k];
  return {
    rise: t10 != null && t90 != null ? t90 - t10 : NaN,
    t63: t63 ?? NaN,
    overshoot: Math.max(0, 100 * (peak - frac(final))),
    overshootTarget: Math.max(0, 100 * (peak - 1)),
    settle: ts,
    final,
    ess: Math.abs(y1 - final),
  };
}

export function rms(a, b) {
  let s = 0;
  for (let k = 0; k < a.length; k++) s += (a[k] - b[k]) ** 2;
  return Math.sqrt(s / a.length);
}

// ---------------------------------------------------------------- frequency domain
const cx = (re, im = 0) => ({ re, im });
const mul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a, b) => { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const add = (a, b) => cx(a.re + b.re, a.im + b.im);
const abs = (a) => Math.hypot(a.re, a.im);

export function plantVel(p, w) { // ω/u at jw
  const s = cx(0, w);
  const den = add(mul(add(mul(cx(p.L), s), cx(p.R)), add(mul(cx(p.J), s), cx(p.D))), cx(p.K * p.K));
  return div(cx(p.K), den);
}
export function loopGain(kind, g, p, w) {
  const s = cx(0, w);
  const Gv = plantVel(p, w);
  if (kind === "pi") return mul(mul(cx(g.Kpi), div(add(mul(cx(g.tau_i), s), cx(1)), mul(cx(g.tau_i), s))), Gv);
  if (kind === "plantPos") return div(Gv, s);
  if (kind === "pa") {
    const C = mul(cx(g.Kpa), div(add(mul(cx(g.k * g.tau_pa), s), cx(1)), add(mul(cx(g.tau_pa), s), cx(1))));
    return mul(C, div(Gv, s));
  }
  if (kind === "nested") {
    // outer loop opened at the position error: L = G · T_inner(s) / s, with T_inner = C·Gv / (1 + C·Gv)
    const CGv = loopGain("pi", g, p, w);
    const Ti = div(CGv, add(cx(1), CGv));
    return mul(cx(g.G), div(Ti, s));
  }
  throw new Error(kind);
}
const phaseDeg = (z, prev) => {
  let ph = (Math.atan2(z.im, z.re) * 180) / Math.PI;
  if (prev != null) while (ph - prev > 180) ph -= 360;
  if (prev != null) while (prev - ph > 180) ph += 360;
  return ph;
};
// Sweep 0.01 … 1e6 rad/s with unwrapped phase; return crossover, PM, phase-crossover and GM (dB).
export function margins(kind, g, p = SCRIPT) {
  let prevPh = null, prevMag = null, prevW = null;
  let wc = null, pm = null, wp = null, gm = Infinity;
  for (let e = -2; e <= 6; e += 0.0005) {
    const w = 10 ** e;
    const L = loopGain(kind, g, p, w);
    const mag = abs(L);
    let ph = phaseDeg(L, prevPh);
    if (prevPh == null && ph > 0) ph -= 360;
    if (prevMag != null && prevMag >= 1 && mag < 1 && wc == null) {
      wc = w;
      pm = 180 + ph;
    }
    if (prevPh != null && prevPh > -180 && ph <= -180 && wp == null) {
      wp = w;
      gm = -20 * Math.log10(mag);
    }
    prevPh = ph; prevMag = mag; prevW = w;
  }
  return { wc, pm, wp, gm };
}
// closed-loop −3 dB bandwidth of y/r for a loop L (unity feedback)
export function bandwidth(kind, g, p = SCRIPT) {
  const T0 = (w) => { const L = loopGain(kind, g, p, w); return abs(div(L, add(cx(1), L))); };
  const ref = T0(1e-3);
  for (let e = -2; e <= 6; e += 0.0005) {
    const w = 10 ** e;
    if (T0(w) < ref / Math.SQRT2) return w;
  }
  return NaN;
}

// ---------------------------------------------------------------- solvers for the truth gate (lesson.json cases)
export function plant(given) {
  const c = plantConstants({ ...SCRIPT, ...given });
  const V = given.V ?? 5;
  return {
    gain: c.gain,
    wss: c.gain * V,
    tauM_ms: c.tauM * 1e3,
    tauE_us: c.tauE * 1e6,
    ideal: V / given.K, // the friction-free answer V/K
    zeta: c.zeta,
  };
}
export function piLoop(given) {
  const g = { Kpi: given.Kpi, tau_i: given.tau_i };
  const m = margins("pi", g);
  const r = response({ ctrl: { type: "pi", ...g }, demand: () => given.step, T: 2 });
  const k = stepMetrics(r.t, r.w, 0, given.step);
  return { pm: m.pm, gm: m.gm === Infinity ? 999 : m.gm, wc: m.wc, ess: k.ess, overshoot: k.overshoot, u0: given.Kpi * given.step };
}
export function paLoop(given) {
  const g = { Kpa: given.Kpa, tau_pa: given.tau_pa, k: given.k };
  const m = margins("pa", g);
  const phiMax = (Math.asin((g.k - 1) / (g.k + 1)) * 180) / Math.PI;
  const wMax = 1 / (g.tau_pa * Math.sqrt(g.k));
  const r = response({ ctrl: { type: "pa", ...g }, demand: () => given.step, T: 2 });
  const k = stepMetrics(r.t, r.th, 0, given.step);
  return { pm: m.pm, wc: m.wc, phiMax, wMax, hfGain: 20 * Math.log10(g.k), overshoot: k.overshoot, ess: k.ess, settle: k.settle, kick: g.Kpa * g.k * given.step };
}
export function nestedLoop(given) {
  const g = { Kpi: given.Kpi, tau_i: given.tau_i, G: given.G };
  const inner = bandwidth("pi", g);
  const outer = bandwidth("nested", g);
  const m = margins("nested", g);
  const r = response({ ctrl: { type: "nested", ...g }, demand: () => given.step, T: 2 });
  const k = stepMetrics(r.t, r.th, 0, given.step);
  return { innerBw: inner, outerBw: outer, ratio: inner / outer, pm: m.pm, overshoot: k.overshoot, ess: k.ess, settle: k.settle };
}
