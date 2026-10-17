// Match Maker model: complex RF maths for CW2 (WSC339). Pure functions, no DOM.
// Conventions follow the coursework's MWO set-up: ideal lossless TEM lines with Eeff = 1 (vp = c),
// Z0 = 50 Ω, and the antenna as a ZFREQ block, i.e. 72 + j100 Ω at EVERY frequency.

export const C0 = 299792458;
export const Z0 = 50;
export const F0 = 2e9;
export const ZANT = { re: 72, im: 100 };
export const LINE_M = 0.15; // the 15 cm line in Q2

// ---------- complex numbers ----------
export const cx = (re, im = 0) => ({ re, im });
export const add = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
export const sub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
export const mul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
export const div = (a, b) => { const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; };
export const inv = (a) => div(cx(1), a);
export const abs = (a) => Math.hypot(a.re, a.im);
export const arg = (a) => Math.atan2(a.im, a.re);
export const scale = (a, k) => ({ re: a.re * k, im: a.im * k });
export const expj = (t) => ({ re: Math.cos(t), im: Math.sin(t) });
export const conj = (a) => ({ re: a.re, im: -a.im });

// ---------- basics ----------
export const omega = (f) => 2 * Math.PI * f;
export const lambda = (f) => C0 / f;
export const beta = (f) => omega(f) / C0;
export const gammaOf = (Z, z0 = Z0) => div(sub(Z, cx(z0)), add(Z, cx(z0)));
export const zOfGamma = (G, z0 = Z0) => scale(div(add(cx(1), G), sub(cx(1), G)), z0);
export const vswrOf = (g) => (1 + g) / (1 - g);
export const dB = (g) => 20 * Math.log10(Math.max(1e-9, g));
export const zL = (f) => ZANT; // ZFREQ: frequency-independent, exactly as in the coursework's MWO schematics
export const XL = (L, f) => omega(f) * L;
export const XC = (C, f) => -1 / (omega(f) * C);

// Input impedance of a lossless line of length l terminated in Z.
export function zLine(Z, l, f, z0 = Z0) {
  const t = Math.tan(beta(f) * l);
  return scale(div(add(Z, cx(0, z0 * t)), add(cx(z0), mul(cx(0, t), Z))), z0);
}
export const zShortStub = (l, f, z0 = Z0) => cx(0, z0 * Math.tan(beta(f) * l));
export const par = (a, b) => inv(add(inv(a), inv(b)));

// ---------- networks ----------
// A network is a list of elements ordered from the LOAD towards the GENERATOR:
//   { t: "line", l }   { t: "shuntL", L }  { t: "shuntC", C }  { t: "seriesL", L }  { t: "seriesC", C }  { t: "stub", l }
export function elementZ(e, f) {
  if (e.t.endsWith("L")) return cx(0, XL(e.L, f));
  if (e.t.endsWith("C")) return cx(0, XC(e.C, f));
  if (e.t === "stub") return zShortStub(e.l, f);
  return null;
}
export function zIn(net, f, load = zL(f)) {
  let Z = load;
  for (const e of net) {
    if (e.t === "line") Z = zLine(Z, e.l, f);
    else if (e.t.startsWith("series")) Z = add(Z, elementZ(e, f));
    else Z = par(Z, elementZ(e, f)); // shunt L, shunt C, stub
  }
  return Z;
}
export const s11 = (net, f) => gammaOf(zIn(net, f));
export const s11dB = (net, f) => dB(abs(s11(net, f)));

// The trail of normalised impedances the Smith-chart puck follows as each element is added (load first).
export function trail(net, f, steps = 24) {
  const pts = [];
  let Z = zL(f);
  pts.push(div(Z, cx(Z0)));
  for (const e of net) {
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      let z;
      if (e.t === "line") z = zLine(Z, e.l * k, f);
      else if (e.t.startsWith("series")) z = add(Z, scale(elementZ(e, f), k));
      else z = inv(add(inv(Z), scale(inv(elementZ(e, f)), k)));
      pts.push(div(z, cx(Z0)));
    }
    Z = zIn([e], f, Z);
  }
  return pts;
}

// Voltage along the main line for the standing-wave display. Returns samples from the GENERATOR (x = 0)
// to the LOAD (x = total line length), normalised so the incident wave at the generator has amplitude 1.
export function lineVoltage(net, f, n = 160) {
  // walk from the load: (V, I) at the load with V = 1
  let V = cx(1), I = inv(zL(f));
  const segs = [];
  let x = 0;
  for (const e of net) {
    if (e.t === "line") { segs.push({ x0: x, l: e.l, V, I }); const b = beta(f) * e.l; const c = Math.cos(b), s = Math.sin(b);
      const V2 = add(scale(V, c), mul(cx(0, Z0 * s), I)); const I2 = add(scale(I, c), mul(cx(0, s / Z0), V)); V = V2; I = I2; x += e.l; }
    else if (e.t.startsWith("series")) V = add(V, mul(I, elementZ(e, f)));
    else I = add(I, div(V, elementZ(e, f)));
  }
  const total = x;
  const G = gammaOf(div(V, I));
  const Vplus = div(V, add(cx(1), G)); // V at generator = V+(1 + Γin)
  const out = [];
  for (let i = 0; i <= n; i++) {
    const d = total * (1 - i / n); // distance from the load
    let s = segs[0];
    for (const sg of segs) if (d >= sg.x0 - 1e-12) s = sg;
    const b = beta(f) * (d - s.x0);
    const v = add(scale(s.V, Math.cos(b)), mul(cx(0, Z0 * Math.sin(b)), s.I));
    out.push({ x: total - d, d, v: div(v, Vplus) });
  }
  return { total, samples: out, gamma: G };
}

// -10 dB (or any level) bandwidth around f0 by bisection on each side.
export function bandwidth(net, level = -10, f0 = F0) {
  if (s11dB(net, f0) > level) return { lo: f0, hi: f0, bw: 0 };
  const edge = (dir) => {
    let a = f0, step = 1e6;
    while (s11dB(net, a + dir * step) < level && step < 2e9) { a += dir * step; step *= 1.5; }
    let b = a + dir * step;
    for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (s11dB(net, m) < level) a = m; else b = m; }
    return a;
  };
  const lo = edge(-1), hi = edge(1);
  return { lo, hi, bw: hi - lo };
}
export function dip(net, lo = 1.5e9, hi = 2.5e9, n = 4001) {
  let best = { f: lo, dB: 0 };
  for (let i = 0; i <= n; i++) { const f = lo + ((hi - lo) * i) / n; const d = s11dB(net, f); if (d < best.dB) best = { f, dB: d }; }
  return best;
}

// ---------- exact designs ----------
// L-network for r > 1: shunt element at the load, series element towards the line. Two solutions.
export function lNetwork(f = F0, Z = zL(f)) {
  const y = inv(div(Z, cx(Z0)));
  const g = y.re;
  const bp = Math.sqrt(g - g * g); // the susceptance that lands on the r = 1 circle
  return [+1, -1].map((s) => {
    const b = s * bp - y.im; // shunt susceptance to add (normalised)
    const x = (s * bp) / g;   // series reactance to add (normalised): z after shunt is 1 - j·(b')/g
    const shunt = b > 0 ? { t: "shuntC", C: (b / Z0) / omega(f) } : { t: "shuntL", L: 1 / (omega(f) * (-b / Z0)) };
    const series = x > 0 ? { t: "seriesL", L: (x * Z0) / omega(f) } : { t: "seriesC", C: 1 / (omega(f) * (-x * Z0)) };
    return { b, x, shunt, series, net: [shunt, series] };
  });
}
// Series-first is impossible when r > 1: the constant-r circle never meets the g = 1 circle.
export const seriesFirstPossible = (Z = zL(F0)) => Z.re / Z0 <= 1;

// Shorted shunt stub: positions d (distance from the load) within one half-wavelength and the stub lengths.
export function stubDesigns(f = F0, Z = zL(f)) {
  const lam = lambda(f);
  const out = [];
  // scan d over half a wavelength for g = 1 crossings
  const N = 20000;
  const gAt = (d) => inv(div(zLine(Z, d, f), cx(Z0))).re - 1;
  for (let i = 0; i < N; i++) {
    let a = (i / N) * lam / 2, b = ((i + 1) / N) * lam / 2;
    if (gAt(a) * gAt(b) > 0) continue;
    for (let k = 0; k < 80; k++) { const m = (a + b) / 2; if (gAt(a) * gAt(m) <= 0) b = m; else a = m; }
    const d = (a + b) / 2;
    const y = inv(div(zLine(Z, d, f), cx(Z0)));
    // shorted stub admittance = -j·cot(βl) (normalised); need -cot(βl) = -y.im
    let bl = Math.atan2(1, y.im); // cot(bl) = y.im  →  bl in (0, π)
    const l = (bl / (2 * Math.PI)) * lam;
    out.push({ d, dLam: d / lam, y, b: y.im, l, lLam: l / lam });
  }
  return out;
}
export const stubNet = (d, l, total = LINE_M) => [{ t: "line", l: d }, { t: "stub", l }, { t: "line", l: total - d }];

// All the positions along the whole 15 cm line where a stub can work (period λ/2).
export function stubPositions(total = LINE_M, f = F0) {
  const lam = lambda(f);
  const base = stubDesigns(f);
  const out = [];
  for (let k = 0; k < 4; k++) for (const s of base) { const d = s.d + (k * lam) / 2; if (d < total) out.push({ ...s, d }); }
  return out.sort((a, b) => a.d - b.d);
}

// ---------- 2-port S-parameters (Q4) ----------
export function sLine(l, f) { const e = expj(-beta(f) * l); return [[cx(0), e], [e, cx(0)]]; }
export function sShunt(Z, z0 = Z0) {
  const den = add(scale(Z, 2), cx(z0));
  const s11 = div(cx(-z0), den), s21 = div(scale(Z, 2), den);
  return [[s11, s21], [s21, s11]];
}
// Correct nested cascade: Γ looking into port 1 of a 2-port terminated by Γt
export const gammaThrough = (S, Gt) => add(S[0][0], div(mul(mul(S[0][1], S[1][0]), Gt), sub(cx(1), mul(S[1][1], Gt))));
export function q4GammaIn(f, { l1 = 0.115, L = 2.39e-9, l2 = 0.035 } = {}) {
  const GL = gammaOf(zL(f));
  const G2 = gammaThrough(sLine(l2, f), GL);
  const G3 = gammaThrough(sShunt(cx(0, XL(L, f))), G2);
  return gammaThrough(sLine(l1, f), G3);
}
// The coursework's flow-graph formula, transcribed literally:
// Γin = S11 + S21·S12·[ S33/(1−S33·S22) + S43·S34·( S55/(1−S55·S44) + S65·S56·ΓL/(1−ΓL·S66) ) ]
export function q4CourseworkFormula(f, { l1 = 0.115, L = 2.39e-9, l2 = 0.035 } = {}) {
  const A = sLine(l1, f), Bm = sShunt(cx(0, XL(L, f))), Cm = sLine(l2, f);
  const GL = gammaOf(zL(f));
  const [S11, S12, S21, S22] = [A[0][0], A[0][1], A[1][0], A[1][1]];
  const [S33, S34, S43, S44] = [Bm[0][0], Bm[0][1], Bm[1][0], Bm[1][1]];
  const [S55, S56, S65, S66] = [Cm[0][0], Cm[0][1], Cm[1][0], Cm[1][1]];
  const inner = add(div(S55, sub(cx(1), mul(S55, S44))), div(mul(mul(S65, S56), GL), sub(cx(1), mul(GL, S66))));
  const mid = add(div(S33, sub(cx(1), mul(S33, S22))), mul(mul(S43, S34), inner));
  return add(S11, mul(mul(S21, S12), mid));
}

// ---------- coursework networks (as built in MWO) ----------
export const CW = {
  q1: [{ t: "shuntL", L: 33.16e-9 }, { t: "seriesC", C: 0.909e-12 }],
  q2a: stubNet(0.035, 0.0129),
  q2b: stubNet(0.0558, 0.0621),
  q3a: [{ t: "line", l: 0.035 }, { t: "shuntL", L: 2.39e-9 }, { t: "line", l: 0.115 }],
  q3b: [{ t: "line", l: 0.0558 }, { t: "shuntC", C: 2.65e-12 }, { t: "line", l: 0.0942 }],
};

// ---------- solvers for lesson.json cases ----------
export function mismatch({ R, X }) {
  const G = gammaOf(cx(R, X));
  const g = abs(G);
  return { re: G.re, im: G.im, mag: g, vswr: vswrOf(g), reflectedPct: g * g * 100, rl: -dB(g) };
}
export function lnet({ which }) {
  const s = lNetwork()[which];
  const v = s.shunt.L ? { shunt_nH: s.shunt.L * 1e9 } : { shunt_pF: s.shunt.C * 1e12 };
  const w = s.series.L ? { series_nH: s.series.L * 1e9 } : { series_pF: s.series.C * 1e12 };
  return { b: s.b, x: s.x, ...v, ...w, s11: s11dB(s.net, F0) };
}
export function lnetFromReadings({ b, x }) {
  // the coursework's formulas: C = −1/(2πf·x·Z0), L = −Z0/(2πf·b)
  return { C_pF: (-1 / (omega(F0) * x * Z0)) * 1e12, L_nH: (-Z0 / (omega(F0) * b)) * 1e9 };
}
export function stub({ which }) {
  const s = stubDesigns()[which];
  return { d_cm: s.d * 100, dLam: s.dLam, b: s.b, l_cm: s.l * 100, lLam: s.lLam };
}
export function mwo({ net, f_GHz }) { return { s11_dB: s11dB(CW[net], f_GHz * 1e9) }; }
export function lumpedFromStub({ l_cm }) {
  const X = Z0 * Math.tan(beta(F0) * l_cm / 100);
  return X > 0 ? { X, L_nH: (X / omega(F0)) * 1e9 } : { X, C_pF: (1 / (omega(F0) * -X)) * 1e12 };
}
export function q4({ f_GHz }) {
  const G = q4GammaIn(f_GHz * 1e9);
  return { mag: abs(G), re: G.re, im: G.im };
}
export function bw({ net }) {
  const b = bandwidth(CW[net]);
  return { bw_MHz: b.bw / 1e6 };
}
export function wavelength({ f_GHz }) { return { lambda_cm: lambda(f_GHz * 1e9) * 100 }; }
