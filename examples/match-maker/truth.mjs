// Reality checks for Match Maker. There is no compiler to run here, so the checks are:
// 1. an INDEPENDENT solver (ABCD matrices, written separately from model.mjs's impedance walk) must agree with the
//    model on every network the game shows, across frequency;
// 2. the MWO results visible in the coursework's own screenshots (Q1 dip, Graph 2a/2b/3a/3b markers);
// 3. every claim in lesson.json is re-derived and its verdict re-checked;
// 4. the lab 1 post-lab answers.

const C = 299792458, Z0 = 50;
// tiny independent complex lib
const c = (re, im = 0) => [re, im];
const ad = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sb = (a, b) => [a[0] - b[0], a[1] - b[1]];
const ml = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const dv = (a, b) => { const d = b[0] ** 2 + b[1] ** 2; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const mag = (a) => Math.hypot(a[0], a[1]);
const mm = (A, B) => [[ad(ml(A[0][0], B[0][0]), ml(A[0][1], B[1][0])), ad(ml(A[0][0], B[0][1]), ml(A[0][1], B[1][1]))], [ad(ml(A[1][0], B[0][0]), ml(A[1][1], B[1][0])), ad(ml(A[1][0], B[0][1]), ml(A[1][1], B[1][1]))]];

function abcd(e, f) {
  const w = 2 * Math.PI * f, bl = (w / C) * (e.l ?? 0);
  const Zel = e.t.endsWith("L") ? c(0, w * e.L) : e.t.endsWith("C") ? c(0, -1 / (w * e.C)) : e.t === "stub" ? c(0, Z0 * Math.tan(bl)) : null;
  if (e.t === "line") return [[c(Math.cos(bl)), c(0, Z0 * Math.sin(bl))], [c(0, Math.sin(bl) / Z0), c(Math.cos(bl))]];
  if (e.t.startsWith("series")) return [[c(1), Zel], [c(0), c(1)]];
  return [[c(1), c(0)], [dv(c(1), Zel), c(1)]];
}
// net is listed load → generator; the ABCD chain runs generator → load
function s11(net, f) {
  let M = [[c(1), c(0)], [c(0), c(1)]];
  for (const e of [...net].reverse()) M = mm(M, abcd(e, f));
  const ZL = c(72, 100);
  const Zin = dv(ad(ml(M[0][0], ZL), M[0][1]), ad(ml(M[1][0], ZL), M[1][1]));
  return dv(sb(Zin, c(Z0)), ad(Zin, c(Z0)));
}
const dB = (g) => 20 * Math.log10(g);

export async function checks({ model: M, lesson }) {
  const rows = [];
  const row = (id, field, expected, got, ok) => rows.push({ id, field, expected, got, ok });
  const near = (id, field, expected, got, tol) => row(id, field, expected, typeof got === "number" ? +got.toFixed(4) : got, Math.abs(got - expected) <= tol);

  // ---------- 1. independent solver agrees with the model everywhere the game looks
  const nets = { ...M.CW, ...Object.fromEntries(M.lNetwork().map((s, i) => [`lnet${i}`, s.net])), ...Object.fromEntries(M.stubPositions().map((s, i) => [`stub@${(s.d * 100).toFixed(2)}`, M.stubNet(s.d, s.l)])) };
  for (const [name, net] of Object.entries(nets)) {
    let worst = 0;
    for (let f = 0.25e9; f <= 4e9; f += 0.05e9) {
      const a = M.s11(net, f), b = s11(net, f);
      worst = Math.max(worst, mag(sb([a.re, a.im], b)));
    }
    near("ABCD", `${name} max|ΔS11|`, 0, worst, 1e-9);
  }
  // the standing-wave curtain: |V| along a mismatched line is 1 ± |Γ| at its extremes
  {
    const lv = M.lineVoltage([{ t: "line", l: 0.15 }], 2e9, 600);
    const vs = lv.samples.map((s) => M.abs(s.v));
    near("wave", "max |V|", 1.649, Math.max(...vs), 0.002);
    near("wave", "min |V|", 0.351, Math.min(...vs), 0.002);
    const iMin = vs.indexOf(Math.min(...vs));
    near("wave", "first min from load (cm)", 4.55, lv.samples.findLast((s, i) => vs[i] < 0.352 && s.d < 0.075).d * 100, 0.05);
    const matched = M.lineVoltage(M.stubNet(...[M.stubDesigns()[0]].map((s) => [s.d, s.l])[0]), 2e9, 600);
    const gen = matched.samples.filter((s) => s.d > M.stubDesigns()[0].d + 0.001).map((s) => M.abs(s.v));
    near("wave", "flat |V| between stub and generator", 1, Math.max(...gen) - Math.min(...gen) + 1, 1e-6);
    void iMin;
  }

  // ---------- 2. the coursework's MWO screenshots
  const d1 = M.dip(M.CW.q1, 1.5e9, 2.5e9);
  near("MWO-Q1", "dip (dB), read off the plot ≈ −27.7", -27.7, d1.dB, 0.5);
  near("MWO-Q1", "dip frequency (GHz), plot ≈ 2.03", 2.03, d1.f / 1e9, 0.02);
  for (const [net, f, val] of [["q2a", 1.998, -36.43], ["q2b", 2.002, -40.83], ["q3a", 1.998, -36.22], ["q3b", 2.003, -36.54]]) near(`MWO-${net}`, `independent S11 @ ${f} GHz`, val, dB(mag(s11(M.CW[net], f * 1e9))), 0.006);

  // ---------- 3. every claim
  const v = Object.fromEntries(lesson.claims.map((k) => [k.id, k.verdict]));
  const ex = M.lNetwork()[1];
  near("Q1-z", "zL", 1.44, 72 / 50, 1e-9);
  row("Q1-topology", "series-first possible", false, M.seriesFirstPossible(), M.seriesFirstPossible() === false && v["Q1-topology"] === "right");
  near("Q1-b", "exact Δb (claim −0.12 → wrong)", -0.096, ex.b, 0.0005);
  row("Q1-b", "verdict", "wrong", v["Q1-b"], Math.abs((-0.12 - ex.b) / ex.b) > 0.2 && v["Q1-b"] === "wrong");
  row("Q1-x", "error < 3 %", true, +Math.abs((-1.75 - ex.x) / ex.x).toFixed(4), Math.abs((-1.75 - ex.x) / ex.x) < 0.03 && v["Q1-x"] === "right");
  const cwL = M.lnetFromReadings({ b: -0.12, x: -1.75 });
  near("Q1-C", "error vs exact (%)", 2.5, (cwL.C_pF / (ex.series.C * 1e12) - 1) * 100, 0.2);
  near("Q1-L", "error vs exact (%)", -20, (cwL.L_nH / (ex.shunt.L * 1e9) - 1) * 100, 0.3);
  near("Q1-MWO", "S11 @ 2.000 GHz", -27.4, M.s11dB(M.CW.q1, 2e9), 0.05);
  row("Q1-MWO", "exact design is a null", true, M.s11dB(ex.net, 2e9) < -100, M.s11dB(ex.net, 2e9) < -100);
  near("Q2-yL", "g", 0.237, M.inv(M.div(M.ZANT, M.cx(50))).re, 0.0005);
  near("Q2-yL", "b", -0.329, M.inv(M.div(M.ZANT, M.cx(50))).im, 0.0005);
  const [A, Bs] = M.stubDesigns();
  near("Q2-dA", "d (cm)", 3.5, A.d * 100, 0.05);
  near("Q2-lA", "ℓ (cm)", 1.29, A.l * 100, 0.05);
  near("Q2-dB", "d (cm)", 5.58, Bs.d * 100, 0.05);
  near("Q2-lB", "ℓ (cm)", 6.21, Bs.l * 100, 0.05);
  const pos = M.stubPositions();
  row("Q2-points", "positions on 15 cm", 4, pos.length, pos.length === 4 && v["Q2-points"] === "partly");
  const bwA = M.bandwidth(M.CW.q2a).bw, bwB = M.bandwidth(M.CW.q2b).bw;
  row("Q2-choice", "A wider than B", true, `${(bwA / 1e6).toFixed(0)} vs ${(bwB / 1e6).toFixed(0)} MHz`, bwA > 2 * bwB && v["Q2-choice"] === "wrong");
  row("Q2-choice", "both dips < −35 dB", true, `${M.dip(M.CW.q2a).dB.toFixed(1)} / ${M.dip(M.CW.q2b).dB.toFixed(1)}`, M.dip(M.CW.q2a).dB < -35 && M.dip(M.CW.q2b).dB < -35);
  const far = pos.map((s) => M.bandwidth(M.stubNet(s.d, s.l)).bw);
  row("Boss", "bandwidth falls with distance", true, far.map((b) => (b / 1e6).toFixed(0)).join(" > "), far.every((b, i) => i === 0 || b < far[i - 1]));
  near("Q3-type", "Zsc A (Ω)", 30.0, M.lumpedFromStub({ l_cm: 1.29 }).X, 0.05);
  near("Q3-type", "Zsc B (Ω)", -29.87, M.lumpedFromStub({ l_cm: 6.21 }).X, 0.05);
  near("Q4-GL", "re", 0.510, M.gammaOf(M.ZANT).re, 0.0005);
  near("Q4-GL", "im", 0.402, M.gammaOf(M.ZANT).im, 0.0005);
  const Sh = M.sShunt(M.cx(0, M.XL(2.39e-9, 2e9)));
  near("Q4-Sshunt", "S33 re", -0.410, Sh[0][0].re, 0.001);
  near("Q4-Sshunt", "S33 im", 0.492, Sh[0][0].im, 0.001);
  near("Q4-Sshunt", "S43 re", 0.590, Sh[1][0].re, 0.001);
  near("Q4-Sshunt", "S43 im", 0.492, Sh[1][0].im, 0.001);
  near("Q4-betal", "βl for 11.5 cm (rad)", 4.817, (2 * Math.PI / 0.15) * 0.115, 0.001);
  const cwF = M.abs(M.q4CourseworkFormula(2e9)), right = M.abs(M.q4GammaIn(2e9));
  near("Q4-formula", "coursework formula |Γin| @2 GHz", 0.256, cwF, 0.001);
  near("Q4-formula", "nested cascade |Γin| @2 GHz", 0.016, right, 0.0005);
  near("Q4-formula", "cascade = ABCD (dB)", dB(mag(s11(M.CW.q3a, 2e9))), dB(right), 0.01);
  for (const f of [1, 3]) near("Q4-values", `cascade = ABCD @${f} GHz`, mag(s11(M.CW.q3a, f * 1e9)), M.abs(M.q4GammaIn(f * 1e9)), 1e-9);

  // ---------- 4. lab 1 post-lab
  near("Lab1-gamma", "|Γ| from VSWR 1.45", 0.184, (1.45 - 1) / (1.45 + 1), 0.0005);
  near("Lab1-gamma", "Γ for 75 Ω", 0.2, M.gammaOf(M.cx(75)).re, 1e-9);
  near("Lab1-gamma", "RL (dB)", 14.7, -dB(0.184), 0.05);
  near("Lab1-gamma", "% reflected", 3.386, 0.184 ** 2 * 100, 0.001);
  near("Lab1-er", "εr with c = 3e8 (as the lab did)", 3.815, (3e8 / (1e9 * 0.1536)) ** 2, 0.0005);
  const zin = M.zLine(M.cx(75), 0.0743, C / 0.1536);
  near("Lab1-zin", "re", 74.04, zin.re, 0.01);
  near("Lab1-zin", "im", 6.27, zin.im, 0.01);
  return rows;
}
