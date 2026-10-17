// Model-vs-rig tools shared by the game and truth.mjs. Pure: pass the rig data in.
import * as M from "./model.mjs";

// The two facts the rig data adds to the coursework model (found by fitOpen below, checked by truth.mjs):
//   shift: RigData.mat's record starts 26 ms before the motor responds (the closed-loop runs show no such
//          delay, so it is in the recording, not the motor);
//   Tc:    Coulomb friction 1.7 mNm, fitted on the open-loop run only.
export const FIT = { shift: 0.026, Tc: 1.7e-3 };

export function fitTools(D) {
  const o = D.open;
  const smooth = (y, n = 5) => y.map((_, k) => { let s = 0, c = 0; for (let j = Math.max(0, k - n); j <= Math.min(y.length - 1, k + n); j++) { s += y[j]; c++; } return s / c; });
  const post = (run, field = "y") => run[field].slice(Math.round(-run.t0 / run.dt));
  // model of the open-loop reversal: start in the model's own −5 V steady state, step to +5 V
  function openModel(Tc = 0, p = M.SCRIPT, T = 1) {
    const pre = M.response({ ctrl: { type: "open", V: -o.V }, demand: () => 0, T: 2, p, Tc });
    const w0 = pre.w.at(-1);
    return M.response({ ctrl: { type: "open", V: o.V }, demand: () => 0, T, p, Tc, x0: { w: w0, i: (-o.V - p.K * w0) / p.R } });
  }
  // rig samples aligned to the step (drop the first `shift`)
  const rigOpen = () => o.y.slice(Math.round(FIT.shift / o.dt));
  function openRun(Tc = 0, p = M.SCRIPT) {
    const rig = rigOpen();
    const r = openModel(Tc, p, (rig.length - 1) * o.dt);
    return { t: r.t, w: r.w, rig, rms: M.rms(r.w, rig), final: r.w.at(-1) };
  }
  function fitOpen() {
    let best = null;
    for (let s = 0; s <= 0.04; s += 0.002) for (let Tc = 0; Tc <= 3e-3; Tc += 1e-4) {
      const rig = o.y.slice(Math.round(s / o.dt));
      const r = openModel(Tc, M.SCRIPT, (rig.length - 1) * o.dt);
      const e = M.rms(r.w, rig);
      if (!best || e < best.rms) best = { shift: s, Tc, rms: e };
    }
    return best;
  }
  // a closed-loop rig run: the model starts settled on the run's first demand, then steps
  function rigRun(run, ctrl, v = {}) {
    const y = post(run);
    const pos = ctrl.type !== "pi";
    const r = M.response({ ctrl, demand: () => run.to, T: (y.length - 1) * run.dt, pre: run.from, x0: pos ? { th: run.from } : { w: run.from }, ...v });
    const ym = pos ? r.th : r.w;
    return { t: r.t, y: ym, u: r.u, rig: y, rms: M.rms(ym, y), metrics: M.stepMetrics(r.t, ym, run.from, run.to) };
  }
  return { smooth, post, openModel, openRun, rigRun, fitOpen, rigOpen };
}
