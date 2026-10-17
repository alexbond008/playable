import { writeFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bundle } from "./lib/bundle.mjs";

const args = process.argv.slice(2);
const dir = resolve(args.find((a) => !a.startsWith("--")) || ".");
const fragment = args.includes("--fragment");
const name = basename(dir);
const here = fileURLToPath(new URL(".", import.meta.url));

if (existsSync(join(dir, "lesson.json"))) {
  try {
    execFileSync(process.execPath, [join(here, "verify-model.mjs"), dir], { stdio: "inherit" });
  } catch {
    console.error("\nbuild stopped: the truth gate failed. Fix the model, never the answer sheet.");
    process.exit(1);
  }
}

const t0 = Date.now();
const js = bundle(join(dir, "main.mjs"));
const fonts = "https://fonts.googleapis.com/css2?family=Doto:wght@700;900&family=IBM+Plex+Sans+Condensed:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap";
const head = `<title>${name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="generator" content="Playable">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fonts}">`;
const body = `<script type="module">\n${js}\n</script>`;
const html = fragment
  ? `${head}\n${body}\n`
  : `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
const out = join(dir, `${name}${fragment ? ".artifact" : ""}.html`);
writeFileSync(out, html);
console.log(`built ${out.replace(process.cwd() + "/", "")} · ${(statSync(out).size / 1e6).toFixed(2)} MB · ${Date.now() - t0} ms`);
