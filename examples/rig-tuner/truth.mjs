// Reality checks: the model against the REAL rig (RigData.mat and the student's LabVIEW runs, extracted
// to rig-data.json by prep-data.mjs), and every portfolio claim the game judges. Run by verify-model.mjs.
// Tolerances are stated in each row's `expected`; RMS misfits are reported as measured, never tuned away.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as M from "./model.mjs";
import { FIT, fitTools } from "./fit.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const D = JSON.parse(readFileSync(join(here, "rig-data.json"), "utf8"));
const f = (v, d = 3) => Number(v).toFixed(d);
const { openRun, rigRun, smooth, post, fitOpen } = fitTools(D);

export async function checks() {
  const rows = [];
  const row = (id, field, expected, got, ok) => rows.push({ id, field, expected, got, ok: !!ok });
  const within = (id, field, got, max, d = 2) => row(id, field, `≤ ${max}`, f(got, d), got <= max);
  const near = (id, field, got, target, tol, d = 3) => row(id, field, `${target} ± ${tol}`, f(got, d), Math.abs(got - target) <= tol);

  // ---------- the simulator against the closed form (linear, open loop from rest, 5 V)
  {
    const c = M.plantConstants(M.SCRIPT);
    const r = M.response({ ctrl: { type: "open", V: 5 }, demand: () => 0, T: 1 });
    const exact = r.t.map((t) => 5 * c.gain * (1 - (c.tauSlow * Math.exp(-t / c.tauSlow) - c.tauFast * Math.exp(-t / c.tauFast)) / (c.tauSlow - c.tauFast)));
    within("sim", "vs closed form", M.rms(r.w, exact), 0.01, 4);
  }

  // ---------- 1.2 open loop: model vs RigData.mat (a −5 V → +5 V reversal)
  {
    const o = D.open;
    row("1.2", "rig input", "−5 → +5 V", `${o.Vbefore} → ${o.V} V`, o.V === 5 && o.Vbefore === -5);
    const rigFinal = o.y.slice(-100).reduce((a, b) => a + b) / 100;
    const lin = openRun(0);
    near("1.2", "rig final rad/s", rigFinal, 158.6, 0.5, 1);
    near("1.2", "model final rad/s", lin.final, 163.8, 0.3, 1);
    within("1.2", "final gap %", (100 * (lin.final - rigFinal)) / rigFinal, 5, 2);
    const best = fitOpen();
    near("1.2", "fitted offset s", best.shift, FIT.shift, 0.001);
    near("1.2", "fitted Tc (grid)", best.Tc * 1e3, FIT.Tc * 1e3, 0.05, 2);
    within("1.2", "RMS linear", lin.rms, 5.0); // stated tolerance for "the design model is valid"
    near("1.2", "RMS linear", lin.rms, 4.52, 0.05);
    const fr = openRun(FIT.Tc);
    within("1.2", "RMS + friction", fr.rms, 1.5);
    near("1.2", "final + friction", fr.final, rigFinal, 0.5, 1);
    // noise floor of the rig's encoder speed: sd over the flat last 200 ms
    const tail = o.y.slice(-200);
    const mu = tail.reduce((a, b) => a + b) / tail.length;
    const sd = Math.sqrt(tail.reduce((a, b) => a + (b - mu) ** 2, 0) / tail.length);
    within("1.2", "noise sd", sd, 1.0);
    // L and J can't move the final speed; friction can
    const big = (p) => M.response({ ctrl: { type: "open", V: 5 }, demand: () => 0, T: 3, p: { ...M.SCRIPT, ...p } }).w.at(-1);
    near("1.2", "2×J final", big({ J: 2 * M.SCRIPT.J }), 164.1, 0.1, 1);
    near("1.2", "10×L final", big({ L: 10 * M.SCRIPT.L }), 164.1, 0.1, 1);
    // the student's overlay: 0 → 5 V from rest, shifted to the zero crossing (0.12 s)
    const k0 = o.y.findIndex((v) => v >= 0);
    near("1.2", "zero crossing s", k0 * o.dt, 0.12, 0.002);
    const r = M.response({ ctrl: { type: "open", V: 5 }, demand: () => 0, T: 1 });
    const seg = o.y.slice(k0);
    near("1.2", "student overlay RMS", M.rms(r.w.slice(0, seg.length), seg), 4.35, 0.05);
  }

  // ---------- 2.3 PI velocity loop (Kpi 0.13, τi 0.1) vs the rig run "PI controller data"
  {
    const g = { type: "pi", Kpi: M.GAINS.Kpi, tau_i: M.GAINS.tau_i };
    const runs = D.pi.runs.filter((r) => r.y.length >= 900);
    const up = runs.find((r) => r.to > r.from);
    const lin = rigRun(up, g, { vmax: Infinity });
    const sat = rigRun(up, g, { vmax: 10 });
    within("2.3", "RMS linear", lin.rms, 8);
    within("2.3", "RMS ±10 V", sat.rms, 3.5);
    row("2.3", "limit helps", "RMS falls", `${f(lin.rms, 2)} → ${f(sat.rms, 2)}`, sat.rms < lin.rms);
    near("2.3", "u demanded V", M.GAINS.Kpi * (up.to - up.from), 19.5, 0.01, 2);
    const y = post(up);
    const t = y.map((_, k) => k * up.dt);
    const peak = Math.max(...y);
    near("2.3", "OS of real step %", (100 * (peak - up.to)) / (up.to - up.from), 4.4, 0.2, 1);
    near("2.3", "OS of 75 (cropped) %", (100 * (peak - up.to)) / up.to, 8.9, 0.2, 1);
    const m = M.stepMetrics(t, smooth(y), up.from, up.to);
    within("2.3", "rig ess rad/s", m.ess, 0.1);
    within("2.3", "model ess rad/s", sat.metrics.ess, 0.01, 3);
    near("2.3", "rig rise s", m.rise, 0.046, 0.003);
    near("2.3", "model rise s", lin.metrics.rise, 0.060, 0.003);
    // the lab software's own "Modelled Motor Speed" column
    within("2.3", "vs LabVIEW model", M.rms(sat.y, post(up, "model")), 2.5);
  }

  // ---------- 3.3 PA position loop vs the rig run "Data for PA"
  {
    const g = { type: "pa", Kpa: M.GAINS.Kpa, tau_pa: M.GAINS.tau_pa, k: M.GAINS.k };
    const run = D.pa.runs[0];
    const y = post(run);
    const rigFinal = y.slice(-100).reduce((a, b) => a + b) / 100;
    const before = run.y[0];
    near("3.3", "rig parks at rad", rigFinal, 0.794, 0.005);
    near("3.3", "rig before step", before, -0.72, 0.005, 3);
    const lin = rigRun(run, g, { vmax: 10 });
    near("3.3", "linear model parks", lin.metrics.final, 1.0, 0.002);
    row("3.3", "model vs rig", "disagree (> 0.1 rad)", f(Math.abs(lin.metrics.final - rigFinal)), Math.abs(lin.metrics.final - rigFinal) > 0.1);
    near("3.3", "RMS linear rad", lin.rms, 0.277, 0.005);
    const band = (FIT.Tc * M.SCRIPT.R) / (M.SCRIPT.K * M.GAINS.Kpa);
    near("3.3", "dead zone ± rad", band, 0.222, 0.01);
    row("3.3", "miss in dead zone", `≤ ${f(band)}`, f(1 - rigFinal), 1 - rigFinal <= band);
    row("3.3", "earlier miss", `> ${f(band)} (stiction)`, f(before + 1), before + 1 > band);
    near("3.3", "stiction ≥ mNm", ((before + 1) * M.GAINS.Kpa * M.SCRIPT.K) / M.SCRIPT.R * 1e3, 2.14, 0.02, 2);
    const fr = rigRun(run, g, { vmax: 10, Tc: FIT.Tc });
    row("3.3", "friction model stalls", "≠ 1.000", f(fr.metrics.final), Math.abs(fr.metrics.final - 1) > 0.02);
    within("3.3", "vs LabVIEW model", M.rms(lin.y, post(run, "model")), 0.1, 3);
  }

  // ---------- 4.3 nested loop (G 20, PI 0.13/0.1) vs the rig run "closed loop"
  {
    const g = { type: "nested", Kpi: M.GAINS.Kpi, tau_i: M.GAINS.tau_i, G: M.GAINS.G };
    const run = D.nested.runs.find((r) => r.to > r.from);
    const lin = rigRun(run, g, { vmax: 10 });
    within("4.3", "RMS rad", lin.rms, 0.06, 3);
    const y = post(run);
    const t = y.map((_, k) => k * run.dt);
    const m = M.stepMetrics(t, smooth(y), run.from, run.to);
    near("4.3", "rig settles s", m.settle, 0.33, 0.01);
    near("4.3", "model settles s", lin.metrics.settle, 0.22, 0.01);
    within("4.3", "rig ess rad", m.ess, 0.005, 4);
    const peak = Math.max(...y);
    near("4.3", "OS of real step %", (100 * (peak - run.to)) / (run.to - run.from), 5.3, 0.2, 1);
    near("4.3", "OS of 1 rad (cropped)", 100 * (peak - run.to), 10.7, 0.2, 1);
    near("4.3", "model OS %", lin.metrics.overshoot, 9.3, 0.1, 1);
  }

  // ---------- level goals: the bot's solutions win, the starting states don't (on the game's rig model)
  {
    const rig = { vmax: M.VMAX, Tc: FIT.Tc };
    const piSpec = (Kpi, tau_i) => { const r = M.response({ ctrl: { type: "pi", Kpi, tau_i }, demand: () => 75, T: 1, pre: -75, x0: { w: -75 }, ...rig }); const m = M.stepMetrics(r.t, r.w, -75, 75); return M.margins("pi", { Kpi, tau_i }).pm >= 60 && m.overshoot <= 8 && m.settle <= 0.3 && m.ess <= 0.5; };
    row("2.2", "goal at 0.13/0.1", true, piSpec(0.13, 0.1), piSpec(0.13, 0.1));
    row("2.2", "goal at start 0.5/0.01", false, piSpec(0.5, 0.01), !piSpec(0.5, 0.01));
    const sat = M.response({ ctrl: { type: "pi", Kpi: 0.5, tau_i: 0.01 }, demand: () => 75, T: 1, pre: -75, x0: { w: -75 }, ...rig });
    near("2.2", "start OS with limit %", M.stepMetrics(sat.t, sat.w, -75, 75).overshoot, 60, 6, 1);
    near("pilot", "1 V cruise rad/s", (0.03 * 1 - 2.7 * FIT.Tc) / (0.03 ** 2 + 2.7 * 5.21e-6), 28, 1, 1);
    const nSpec = (G) => { const g = { Kpi: 0.13, tau_i: 0.1, G }; const r = M.response({ ctrl: { type: "nested", ...g }, demand: () => 1, T: 1, pre: -1, x0: { th: -1 }, ...rig }); const m = M.stepMetrics(r.t, r.th, -1, 1); return M.bandwidth("pi", g) / M.bandwidth("nested", g) >= 5 && m.rise <= 0.45 && m.overshoot <= 1; };
    row("4.2", "goal at G 5.5", true, nSpec(5.5), nSpec(5.5));
    row("4.2", "goal at G 20", false, nSpec(20), !nSpec(20));
    within("1.2", "goal RMS at 1.7", openRun(1.7e-3).rms, 1.5);
    row("1.2", "goal RMS at 0", "> 1.5", f(openRun(0).rms, 2), openRun(0).rms > 1.5);
  }

  // ---------- boss: the rig model (coursework model + friction + ±10 V); spec ess ≤ 0.02, OS ≤ 5 %, settle ≤ 0.3 s, PM ≥ 50°
  {
    const rig = { vmax: M.VMAX, Tc: FIT.Tc };
    const run = (c) => { const r = M.response({ ctrl: c, demand: () => 1, T: 1.2, ...rig }); const m = M.stepMetrics(r.t, r.th, 0, 1, { tail: 0.05 }); return { ...m, pm: M.margins(c.type, c).pm }; };
    const spec = (r) => r.ess <= 0.02 && r.overshoot <= 5 && r.settle <= 0.3 && r.pm >= 50;
    const cases = [["student PA", { type: "pa", Kpa: 0.688, tau_pa: 0.005, k: 9 }, false], ["student nested G20", { type: "nested", Kpi: 0.13, tau_i: 0.1, G: 20 }, false], ["nested G12", { type: "nested", Kpi: 0.13, tau_i: 0.1, G: 12 }, true], ["PA K_PA 4", { type: "pa", Kpa: 4, tau_pa: 0.005, k: 9 }, true]];
    for (const [name, c, want] of cases) { const r = run(c); row("boss", name, want, spec(r), spec(r) === want); }
  }

  // ---------- recall facts
  {
    near("recall", "τ_m / τ_e", M.plantConstants().tauM / M.plantConstants().tauE, 4620, 10, 0);
  }
  return rows;
}
