// Extract the measured rig responses from the lab folder into rig-data.json (run once; the game and the
// truth gate read the JSON so they never need the original drive).
//   node examples/rig-tuner/prep-data.mjs "/path/to/lab2"
// Sources: RigData.mat (open-loop speed, the coursework's provided data) and the student's LabVIEW
// exports (1 kHz; the coarse first column is LabVIEW's 0.1 s clock, so time is rebuilt from the sample
// index exactly as start_MSD_SIM.m does: t = 0:0.001:…).
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readMat } from "../../scripts/lib/mat.mjs";

const lab = process.argv[2];
if (!lab) { console.error("usage: node prep-data.mjs <lab folder>"); process.exit(2); }
const here = dirname(fileURLToPath(import.meta.url));
const r4 = (v) => Math.round(v * 1e4) / 1e4;

function labview(file) {
  const rows = readFileSync(join(lab, file), "latin1").split(/\r?\n/).map((l) => l.split("\t").map(Number)).filter((r) => r.length >= 4 && r[0] > 0 && Number.isFinite(r[1]) && Number.isFinite(r[3]));
  return { y: rows.map((r) => r[1]), demand: rows.map((r) => r[3]), model: rows[0].length >= 6 && Number.isFinite(rows[0][5]) ? rows.map((r) => r[5]) : null };
}
function edges(demand) {
  const out = [];
  for (let k = 1; k < demand.length; k++) if (demand[k] !== demand[k - 1]) out.push({ k, from: demand[k - 1], to: demand[k] });
  return out;
}
// one window per edge: `before` samples before the edge, `after` after (or up to the next edge)
function windows(d, before, after) {
  return edges(d.demand).map((e, i, all) => {
    const end = Math.min(d.y.length, e.k + after, all[i + 1]?.k ?? Infinity);
    const a = Math.max(0, e.k - before);
    return { from: e.from, to: e.to, t0: (a - e.k) / 1000, dt: 0.001, y: d.y.slice(a, end).map(r4), model: d.model ? d.model.slice(a, end).map(r4) : null };
  });
}

const mat = readMat(join(lab, "RigData.mat"));
const S = mat.vars.SpeedResponse;
const open = { source: "RigData.mat · SpeedResponse (provided with the coursework)", V: S.Vin[0], Vbefore: -S.Vin[0], t0: S.Time[0], dt: 0.001, y: S.Velocity.map(r4) };

const pi1 = labview("PI/PI controller data.tmp.txt");
const pi2 = labview("PI/PI_DATA_V2.tmp.txt");
const nested = labview("closed loop/closed loop.tmp.txt");
const pa = labview("PA/Data for PA.tmp.txt");

const data = {
  note: "Measured on the 21WSB004 DC motor rig. 1 kHz samples; t = 0 at the demand step. 'model' is LabVIEW's own modelled column when the export has one.",
  open,
  pi: { source: "PI/PI controller data.tmp.txt", runs: windows(pi1, 100, 1000) },
  pi2: { source: "PI/PI_DATA_V2.tmp.txt", runs: windows(pi2, 100, 1000) },
  nested: { source: "closed loop/closed loop.tmp.txt", runs: windows(nested, 100, 1000) },
  pa: { source: "PA/Data for PA.tmp.txt", runs: windows(pa, 300, 1100) },
};
writeFileSync(join(here, "rig-data.json"), JSON.stringify(data));
const n = (x) => x.runs.map((r) => `${r.from}→${r.to} (${r.y.length})`).join(", ");
console.log(`open-loop ${open.Vbefore}→${open.V} V, ${open.y.length} samples\npi ${n(data.pi)}\npi2 ${n(data.pi2)}\nnested ${n(data.nested)}\npa ${n(data.pa)}`);
