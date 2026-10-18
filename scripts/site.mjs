import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { badgeText } from "../kit/core/badge.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "docs");
const covers = join(root, "site", "covers");
// Absolute base for social cards (og:image must be absolute). Override with SITE_URL for forks.
const siteUrl = (process.env.SITE_URL || "https://alexbond008.github.io/playable/").replace(/\/?$/, "/");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "games"), { recursive: true });
mkdirSync(join(out, "img"), { recursive: true });
mkdirSync(covers, { recursive: true });

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

const collection = existsSync(join(root, "site", "collection.json")) ? JSON.parse(readFileSync(join(root, "site", "collection.json"), "utf8")) : {};
const blurbs = collection.blurbs || {};
const cards = [];
for (const ex of examples) {
  copyFileSync(join(ex.dir, `${ex.d}.html`), join(out, "games", `${ex.d}.html`));
  // Covers are committed under site/covers so CI (no shots/, no sips) can build the site.
  // Regenerate from the latest playtest shot when one exists locally.
  const committed = [".jpg", ".png"].map((x) => join(covers, ex.d + x)).find(existsSync);
  const fresh = ex.cover ? image(join(ex.dir, "shots", ex.cover), join(covers, `${ex.d}.jpg`)) : null;
  const src = fresh || committed;
  if (src) copyFileSync(src, join(out, "img", src.split("/").pop()));
  ex.img = src ? `img/${src.split("/").pop()}` : "";
  const badge = ex.verified ? badgeText(ex.verified).replace(/^✓ /, "") : "";
  const blurb = blurbs[ex.d] || (ex.lesson.source?.title || "").split(/[,(—–]/)[0].trim();
  const num = ex.lesson.serial.replace(/^\D+/, "");
  const href = `games/${ex.d}.html`;
  cards.push(`      <figure class="spec rv">
        <span class="pl">${esc(ex.lesson.serial)}</span>
        <a class="shot" href="${href}" tabindex="-1" aria-hidden="true">${ex.img ? `<img src="${ex.img}" width="1400" height="875" alt="" loading="lazy">` : ""}</a>
        <figcaption>
          <span class="big" aria-hidden="true">${esc(num)}</span>
          <h3><a href="${href}">${esc(ex.lesson.title)}</a></h3>
          <p class="from">${esc(blurb)}</p>
          ${badge ? `<p class="badge"><span class="ok">✓</span> ${esc(badge)}</p>` : ""}
        </figcaption>
      </figure>`);
}
// Games announced in site/collection.json but not built yet show as "in the workshop".
const built = new Set(examples.map((e) => e.lesson.serial));
const workshop = (collection.workshop || []).filter((w) => !built.has(w.serial));
for (const w of workshop) {
  cards.push(`      <figure class="spec wip rv">
        <div class="wip-box">
          <span class="big" aria-hidden="true">${esc(w.serial.replace(/^\D+/, ""))}</span>
          <div>
            <p class="label" style="margin-bottom:6px">${esc(w.serial)}</p>
            <h3>${esc(w.title)}</h3>
            <p>${esc(w.blurb)}</p>
          </div>
          <span class="stamp">In the workshop</span>
        </div>
        <figcaption class="sr-only">Being built now; no link yet.</figcaption>
      </figure>`);
}
const words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
const total = examples.length + workshop.length;
const totalWord = words[total] || String(total);
const playWord = (words[examples.length] || String(examples.length)).toLowerCase();

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
  SITE_URL: siteUrl,
  SPEC_HEAD: `${totalWord} specimen${total === 1 ? "" : "s"}, all from real coursework.`,
  SPEC_PLAY: workshop.length ? `The first ${playWord} play in your browser right now.` : `All ${playWord} play in your browser right now.`,
};
for (const [k, v] of Object.entries(fill)) html = html.replaceAll(`{{${k}}}`, k === "GALLERY" || k === "TRUTH_SAMPLE" ? v : esc(v));
if (hero?.img) copyFileSync(join(out, hero.img), join(out, "img", "og.jpg"));
for (const f of existsSync(join(root, "site", "assets")) ? readdirSync(join(root, "site", "assets")) : []) {
  mkdirSync(join(out, "assets"), { recursive: true });
  copyFileSync(join(root, "site", "assets", f), join(out, "assets", f));
}
writeFileSync(join(out, "index.html"), html);
writeFileSync(join(out, ".nojekyll"), "");
console.log(`site → docs/ · ${examples.length} game(s): ${examples.map((e) => e.lesson.serial).join(", ")}`);
