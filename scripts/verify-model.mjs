import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

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

const truthFile = join(dir, "truth.mjs");
let truthRows = 0;
if (existsSync(truthFile)) {
  const { cpp } = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "lib/cpp.mjs")).href);
  const truth = await import(pathToFileURL(truthFile).href);
  const out = await truth.checks({ cpp, model, lesson });
  for (const r of out) {
    if (r.skip) { console.log(`skipped ${r.id}: ${r.skip}`); continue; }
    rows.push({ id: r.id, field: r.field, expected: String(r.expected), got: String(r.got), ok: !!r.ok, trust: r.trust ?? "reality" });
    truthRows++;
    if (!r.ok) failed++;
  }
}

const w = (s, n) => String(s).padEnd(n);
console.log(`${w("case", 8)}${w("field", 16)}${w("expected", 22)}${w("got", 22)}result`);
for (const r of rows) console.log(`${w(r.id, 8)}${w(r.field, 16)}${w(r.expected, 22)}${w(r.got, 22)}${r.ok ? "ok" : "FAIL"}${r.trust === "reality" ? "  (checked against reality)" : ""}`);

const cases = lesson.cases.length;
const passedCases = lesson.cases.filter((c) => rows.filter((r) => r.id === c.id).every((r) => r.ok)).length;
const byTrust = {};
for (const c of lesson.cases) {
  const t = c.trust || "official";
  byTrust[t] = (byTrust[t] || 0) + 1;
  if (t === "official" && rows.filter((r) => r.id === c.id).every((r) => r.ok)) byTrust.officialPassed = (byTrust.officialPassed || 0) + 1;
}
const claims = lesson.claims || [];
const VERDICTS = new Set(["right", "wrong", "partly", "missing"]);
for (const c of claims) {
  if (!VERDICTS.has(c.verdict) || !String(c.why || "").trim()) {
    console.log(`claim ${c.id}: needs a verdict (right | wrong | partly | missing) and a why`);
    failed++;
  }
}
const claimSummary = claims.length ? { total: claims.length, right: claims.filter((c) => c.verdict === "right").length, wrong: claims.filter((c) => c.verdict === "wrong").length, partly: claims.filter((c) => c.verdict === "partly").length } : null;
writeFileSync(join(dir, "verified.json"), JSON.stringify({ cases, passed: passedCases, fields: rows.length, realityChecks: truthRows, failedFields: failed, byTrust, ...(claimSummary ? { claims: claimSummary } : {}) }, null, 2) + "\n");
console.log(failed ? `\ntruth gate FAILED: ${failed} field(s) disagree with the answer sheet` : `\ntruth gate passed: ${passedCases}/${cases} answers reproduced${truthRows ? `, ${truthRows} reality checks` : ""}`);
process.exit(failed ? 1 : 0);
