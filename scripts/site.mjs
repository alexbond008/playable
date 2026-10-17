import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { badgeText } from "../kit/core/badge.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "docs");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "games"), { recursive: true });
mkdirSync(join(out, "img"), { recursive: true });

function image(src, dest, width = 1400) {
  try {
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "78", "--resampleWidth", String(width), src, "--out", dest], { stdio: "ignore" });
  } catch {
    copyFileSync(src, dest.replace(/\.jpg$/, ".png"));
    return dest.replace(/\.jpg$/, ".png");
  }
  return dest;
}

const examples = readdirSync(join(root, "examples"))
  .filter((d) => !d.startsWith("_") && existsSync(join(root, "examples", d, "lesson.json")) && existsSync(join(root, "examples", d, `${d}.html`)))
  .map((d) => {
    const dir = join(root, "examples", d);
    const lesson = JSON.parse(readFileSync(join(dir, "lesson.json"), "utf8"));
    const verified = existsSync(join(dir, "verified.json")) ? JSON.parse(readFileSync(join(dir, "verified.json"), "utf8")) : null;
    const shots = existsSync(join(dir, "shots")) ? readdirSync(join(dir, "shots")) : [];
    const cover = lesson.cover && shots.includes(lesson.cover) ? lesson.cover : shots.find((s) => /^desktop-Q\d/.test(s)) || shots.find((s) => s.startsWith("desktop")) || null;
    return { d, dir, lesson, verified, cover };
  })
  .sort((a, b) => a.lesson.serial.localeCompare(b.lesson.serial));

const cards = [];
for (const ex of examples) {
  copyFileSync(join(ex.dir, `${ex.d}.html`), join(out, "games", `${ex.d}.html`));
  const img = ex.cover ? image(join(ex.dir, "shots", ex.cover), join(out, "img", `${ex.d}.jpg`)) : null;
  ex.img = img ? `img/${img.split("/").pop()}` : "";
  const v = ex.verified;
  const badge = v ? badgeText(v).replace(/^✓ /, "") : "";
  const source = (ex.lesson.source?.title || "").split(/[,(—–]/)[0].trim();
  cards.push(`<a class="card" href="games/${ex.d}.html">
      <div class="shot">${ex.img ? `<img src="${ex.img}" alt="${esc(ex.lesson.title)}, a reveal moment" loading="lazy">` : ""}</div>
      <div class="meta">
        <span class="serial">${esc(ex.lesson.serial)}</span>
        <h3>${esc(ex.lesson.title)}</h3>
        <span class="src">${esc(source)}</span>
        <div class="chips">${badge ? `<span class="chip ok">✓ ${esc(badge)}</span>` : ""}${(ex.lesson.subject || []).slice(0, 3).map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div>
      </div>
    </a>`);
}

const hero = examples[0];
const truthSample = `case  field  answer  model   result
Q3    V      43.4    43.388  <span class="ok">ok</span>
Q3    eta    96.5    96.543  <span class="ok">ok</span>
Q7    n      2975    2975.22 <span class="ok">ok</span>
Q8    T1     3.33    3.3286  <span class="ok">ok</span>
<span class="ok">truth gate passed: 8/8</span>`;

let html = readFileSync(join(root, "site", "template.html"), "utf8");
const fill = {
  GALLERY: cards.join("\n"),
  HERO_IMG: hero?.img ?? "",
  HERO_ALT: hero ? `${hero.lesson.title}, a 3D game built from ${hero.lesson.source?.title}` : "",
  HERO_TITLE: hero?.lesson.title ?? "",
  HERO_SERIAL: hero?.lesson.serial ?? "",
  HERO_SOURCE: (hero?.lesson.source?.title || "").split(/[—–(]/)[0].trim(),
  HERO_GAME: hero ? `games/${hero.d}.html` : "",
  TRUTH_SAMPLE: truthSample,
};
for (const [k, v] of Object.entries(fill)) html = html.replaceAll(`{{${k}}}`, k === "GALLERY" || k === "TRUTH_SAMPLE" ? v : esc(v));
if (hero?.img) copyFileSync(join(out, hero.img), join(out, "img", "og.jpg"));
writeFileSync(join(out, "index.html"), html);
writeFileSync(join(out, ".nojekyll"), "");
console.log(`site → docs/ · ${examples.length} game(s): ${examples.map((e) => e.lesson.serial).join(", ")}`);
