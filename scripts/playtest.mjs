import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const dir = resolve(args.find((a) => !a.startsWith("--")) || ".");
const name = basename(dir);
const page = join(dir, `${name}.html`);
const shots = join(dir, "shots");
const only = (args.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
const BUDGET = { desktopDraws: 400, phoneDraws: 120 };

const CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].filter(Boolean);
const chromePath = CANDIDATES.find((p) => existsSync(p));
if (!chromePath) {
  console.error("playtest: no Chrome or Chromium found. Set CHROME_PATH.");
  process.exit(2);
}
if (!existsSync(page)) {
  console.error(`playtest: ${page} not found. Run scripts/build.mjs first.`);
  process.exit(2);
}

const profile = mkdtempSync(join(tmpdir(), "playable-chrome-"));
const flags = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--mute-audio"];
if (process.platform === "linux") flags.push("--no-sandbox");
const chrome = spawn(chromePath, [...flags, "about:blank"], { stdio: "ignore" });

async function waitFor(fn, ms = 15000, step = 100, what = "condition") {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, step));
  }
}

let ws, seq = 0;
const pending = new Map();
const console_ = [];
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
async function evaluate(expression, awaitPromise = true) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function shot(file) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(file, Buffer.from(r.data, "base64"));
}
async function viewport(w, h, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
}

const results = [];
let failed = 0;
try {
  const portFile = join(profile, "DevToolsActivePort");
  const [port] = (await waitFor(() => existsSync(portFile) && readFileSync(portFile, "utf8").trim(), 20000, 100, "Chrome to start")).split("\n");
  const targets = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((t) => t.type === "page"));
  ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
    } else if (m.method === "Runtime.exceptionThrown") console_.push(`exception: ${m.params.exceptionDetails.exception?.description?.split("\n")[0] || m.params.exceptionDetails.text}`);
    else if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "assert")) console_.push(`console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(" ")}`);
  });
  await send("Runtime.enable");
  await send("Page.enable");
  mkdirSync(shots, { recursive: true });

  for (const [label, w, h, mobile] of [["desktop", 1440, 900, false], ["phone", 390, 844, true]]) {
    await viewport(w, h, mobile);
    // a fresh document per view: navigating to the same URL + hash is a same-document navigation and would not reload
    await send("Page.navigate", { url: "about:blank" });
    await send("Page.navigate", { url: pathToFileURL(page).href + "#unlock" });
    await waitFor(() => evaluate("!!window.__playable", false), 60000, 250, "the game to boot");
    await evaluate("localStorage.clear(), 1", false);
    const ids = await evaluate("window.__playable.def.levels.map(l => l.id)", false);
    for (const id of ids.filter((x) => !only.length || only.includes(x))) {
      if (!args.includes("--no-play-shots")) {
        await evaluate(`window.__playable.startPlay(${JSON.stringify(id)})`);
        await shot(join(shots, `${label}-${id}-play.png`));
      }
      const r = await evaluate(`window.__playable.autoplay(${JSON.stringify(id)}, { simSeconds: 60 })`);
      await new Promise((res) => setTimeout(res, 1200));
      // count this level's draws exactly: one render with fresh counters (the rolling perf sample lags on slow headless frames)
      const perf = await evaluate("(() => { const s = window.__playable.stage; s.renderer.info.reset(); s.composer.render(); const i = s.renderer.info.render; return { calls: i.calls, tris: i.triangles }; })()", false);
      const draws = perf.calls;
      const budget = mobile ? BUDGET.phoneDraws : BUDGET.desktopDraws;
      const badControls = (r.controls || []).filter((c) => !c.ok);
      const row = { view: label, id, controls: (r.controls || []).length, badControls, solved: r.solved, ms: r.ms, sim: r.simSeconds, stars: r.stars, draws, tris: perf.tris, overBudget: draws > budget };
      results.push(row);
      if (!r.solved) failed++;
      if (badControls.length) { failed++; console_.push(`${label} ${id}: ${badControls.map((c) => c.why).join(", ")}`); }
      await shot(join(shots, `${label}-${id}.png`));
    }
    for (const look of ["bench", "cyanotype", "paper"]) {
      await evaluate(`window.__playable.stage.setLook(${JSON.stringify(look)}), 1`, false);
      await new Promise((res) => setTimeout(res, 600));
      await shot(join(shots, `${label}-look-${look}.png`));
    }
    await evaluate(`window.__playable.stage.setLook("bench"), window.__playable.openMap(), 1`, false);
    await new Promise((res) => setTimeout(res, 600));
    await shot(join(shots, `${label}-map.png`));
  }
} catch (e) {
  console.error(`playtest error: ${e.message}`);
  failed++;
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
  setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500);
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad("view", 9)}${pad("level", 7)}${pad("grabs", 7)}${pad("solved", 8)}${pad("sim time", 10)}${pad("stars", 7)}${pad("draws", 8)}tris`);
for (const r of results) console.log(`${pad(r.view, 9)}${pad(r.id, 7)}${pad(r.badControls.length ? `${r.controls - r.badControls.length}/${r.controls}!` : `${r.controls}/${r.controls}`, 7)}${pad(r.solved ? "yes" : "NO", 8)}${pad(r.sim + " s", 10)}${pad(r.stars, 7)}${pad(r.draws + (r.overBudget ? "!" : ""), 8)}${Math.round(r.tris / 1000)}k`);
const errors = [...new Set(console_)];
if (errors.length) {
  console.log(`\nconsole errors (${errors.length}):`);
  for (const e of errors) console.log(`  ${e}`);
  failed += errors.length;
}
const over = results.filter((r) => r.overBudget);
if (over.length) console.log(`\nwarning: ${over.length} view(s) over the draw-call budget (desktop ${BUDGET.desktopDraws}, phone ${BUDGET.phoneDraws})`);
console.log(`\nscreenshots: ${shots.replace(process.cwd() + "/", "")}/`);
console.log(failed ? `playtest FAILED (${failed})` : `playtest passed: ${results.filter((r) => r.solved).length}/${results.length} level runs solved, 0 console errors`);
process.exit(failed ? 1 : 0);
