// Frame-exact capture for the README hero GIF: storyboard intro, real Motor Bench Q3 footage, outro.
// Usage: put page.jpg (a render of the source PDF page; not committed) next to story.html, then
//   node site/hero-src/capture.mjs examples/motor-bench/motor-bench.html
// and encode frames/ with ffmpeg (palettegen stats_mode=diff, 960 px, 15 fps).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const game = process.argv[2];
const FPS = 15;
const W = 1280, H = 800;
const frames = join(here, "frames");
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames);

const profile = mkdtempSync(join(tmpdir(), "gif-chrome-"));
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--mute-audio", "--allow-file-access-from-files", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 30000) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error("timeout"); await sleep(150); } }

let ws, seq = 0; const pending = new Map();
const send = (method, params = {}) => { const id = ++seq; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej })); };
async function ev(expression) { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
let n = 0;
async function grab(times = 1) { const r = await send("Page.captureScreenshot", { format: "png" }); const buf = Buffer.from(r.data, "base64"); for (let i = 0; i < times; i++) writeFileSync(join(frames, `f${String(n++).padStart(4, "0")}.png`), buf); }

try {
  const portFile = join(profile, "DevToolsActivePort");
  const [port] = (await waitFor(() => existsSync(portFile) && readFileSync(portFile, "utf8").trim())).split("\n");
  const t = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((x) => x.type === "page"));
  ws = new WebSocket(t[0].webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  // 1. intro storyboard
  await send("Page.navigate", { url: pathToFileURL(join(here, "story.html")).href });
  await waitFor(() => ev("document.fonts.status === 'loaded' && !!window.setT"));
  await sleep(600);
  const introN = Math.round(6.2 * FPS);
  for (let i = 0; i < introN; i++) { await ev(`setT("intro", ${i / FPS})`); await grab(); }
  const introEnd = n;

  // 2. the real game
  await send("Page.navigate", { url: "about:blank" });
  await send("Page.navigate", { url: pathToFileURL(game).href + "#unlock" });
  await waitFor(() => ev("!!window.__playable"), 90000);
  await ev("localStorage.clear(), 1");
  await ev("document.fonts.ready.then(() => 1)");
  await sleep(1500);
  const P = "window.__playable";
  const render = `(${P}.stage.composer.render(), 1)`;
  // brief card
  await ev(`${P}.startLevel("Q3"), 1`);
  await ev(`${P}.settle(1)`); await ev(render);
  await grab(Math.round(1.6 * FPS));
  // play: hang the load, then a cursor drags the supply knob
  await ev(`${P}.startPlay("Q3")`);
  const knob = await ev(`(() => { const r = document.querySelector('.hint, #hint, [class*=hint]'); const all = [...document.querySelectorAll('div')].filter(d => d.textContent.trim().startsWith('Hang 3 Nm') && d.getBoundingClientRect().width < 500); const el = all[all.length-1]; if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2 + 8, y: b.bottom + 26 }; })()`);
  console.log("knob", knob);
  await ev(`(() => { const c = document.createElement('div'); c.id = 'gifcursor'; c.innerHTML = '<div class=ring></div><svg width="26" height="30" viewBox="0 0 26 30"><path d="M2 2 L2 24 L8 18.5 L12.5 28 L16.5 26.2 L12 17 L20 17 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>'; c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;pointer-events:none;will-change:transform'; const s = document.createElement('style'); s.textContent = '#gifcursor svg{position:absolute;left:-2px;top:-2px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.6))} #gifcursor .ring{position:absolute;left:-22px;top:-22px;width:44px;height:44px;border-radius:50%;border:3px solid #FF5A1F;opacity:0;transform:scale(.6);transition:none}'; document.head.append(s); document.body.append(c); return 1; })()`);
  const cur = (x, y, press) => ev(`(() => { const c = document.getElementById('gifcursor'); c.style.transform = 'translate(${x}px,${y}px)'; const r = c.querySelector('.ring'); r.style.opacity = ${press ? 0.95 : 0}; r.style.transform = 'scale(${press ? 1 : 0.6})'; return 1; })()`);
  const kx = knob?.x ?? 900, ky = knob?.y ?? 560;
  await ev(`${P}.world.solve({ load: 3 }), 1`);
  const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : 1 - Math.pow(1 - x, 3));
  const sx = W - 120, sy = H - 80;
  let f = 0;
  const step = async () => { await ev(`${P}.settle(${1 / FPS})`); await ev(render); await grab(); f++; };
  // cursor travels to the knob while the discs settle (1.2 s)
  for (let i = 0; i < 18; i++) { const k = ease(i / 17); await cur(sx + (kx - sx) * k, sy + (ky - sy) * k, false); await step(); }
  // drag the knob 20 → 43.5 V over 2.4 s; cursor moves up as it drags
  const V0 = 20, V1 = 43.5, dragN = 36;
  for (let i = 0; i <= dragN; i++) {
    const k = ease(i / dragN);
    const v = Math.round((V0 + (V1 - V0) * k) * 2) / 2;
    await ev(`${P}.world.solve({ knob: ${v} }), 1`);
    await cur(kx + 6 * k, ky - 46 * k, true);
    await step();
  }
  // let go; hold until the level is solved, then watch the reveal
  await cur(kx + 14, ky - 52, false);
  for (let i = 0; i < 6 * FPS && (await ev(`${P}.phase`)) === "play"; i++) await step();
  console.log("phase", await ev(`${P}.phase`), "frames", f);
  await ev("document.getElementById('gifcursor').remove(), 1");
  for (let i = 0; i < 3.4 * FPS; i++) await step();
  const gameEnd = n;

  // 3. outro
  await send("Page.navigate", { url: pathToFileURL(join(here, "story.html")).href });
  await waitFor(() => ev("document.fonts.status === 'loaded' && !!window.setT"));
  await sleep(400);
  for (let i = 0; i < Math.round(2.8 * FPS); i++) { await ev(`setT("outro", ${i / FPS})`); await grab(); }
  console.log(JSON.stringify({ introEnd, gameEnd, total: n }));
} finally {
  ws?.close(); chrome.kill(); await sleep(300); rmSync(profile, { recursive: true, force: true });
}
