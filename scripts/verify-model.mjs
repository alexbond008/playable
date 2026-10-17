import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const dir = resolve(process.argv[2] || ".");
const lesson = JSON.parse(readFileSync(join(dir, "lesson.json"), "utf8"));
const model = await import(pathToFileURL(join(dir, "model.mjs")).href);

const decimals = (s) => (s.includes(".") ? s.split(".")[1].length : 0);
const rows = [];
let failed = 0;

for (const c of lesson.cases) {
  const solve = model[c.solver];
  if (typeof solve !== "function") {
    rows.push({ id: c.id, field: "—", expected: "—", got: `no solver "${c.solver}"`, ok: false });
    failed++;
    continue;
  }
  const out = solve(c.given);
  for (const [field, expected] of Object.entries(c.expect)) {
    const d = decimals(expected);
    const got = out[field];
    const ok = typeof got === "number" && Number.isFinite(got) && Math.abs(Number(got.toFixed(d)) - Number(expected)) <= 10 ** -d + 1e-9;
    if (!ok) failed++;
    rows.push({ id: c.id, field, expected, got: typeof got === "number" ? got.toFixed(d + 2) : String(got), ok, trust: c.trust });
  }
}

const w = (s, n) => String(s).padEnd(n);
console.log(`${w("case", 6)}${w("field", 8)}${w("answer sheet", 14)}${w("model", 14)}result`);
for (const r of rows) console.log(`${w(r.id, 6)}${w(r.field, 8)}${w(r.expected, 14)}${w(r.got, 14)}${r.ok ? "ok" : "FAIL"}`);

const cases = lesson.cases.length;
const passedCases = lesson.cases.filter((c) => rows.filter((r) => r.id === c.id).every((r) => r.ok)).length;
writeFileSync(join(dir, "verified.json"), JSON.stringify({ cases, passed: passedCases, fields: rows.length, failedFields: failed }, null, 2) + "\n");
console.log(failed ? `\ntruth gate FAILED: ${failed} field(s) disagree with the answer sheet` : `\ntruth gate passed: ${passedCases}/${cases} answers reproduced`);
process.exit(failed ? 1 : 0);
