import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, basename, extname, relative } from "node:path";
import { inflateRawSync } from "node:zlib";

const args = process.argv.slice(2);
const outArg = args.find((a) => a.startsWith("--out="));
const inputs = args.filter((a) => !a.startsWith("--")).map((p) => resolve(p));
if (!inputs.length) {
  console.error("usage: node scripts/ingest.mjs <file-or-folder> [...more] [--out=source-pack]");
  process.exit(2);
}
const missing = inputs.filter((p) => !existsSync(p));
if (missing.length) {
  for (const m of missing) console.error(`ingest: not found: ${m}`);
  if (missing.some((m) => m.startsWith("/Volumes/"))) console.error("The path is on an external drive. Is it plugged in and mounted? (macOS: diskutil list, then diskutil mount readOnly <disk>)");
  process.exit(2);
}
const out = resolve(outArg ? outArg.slice(6) : "source-pack");
mkdirSync(join(out, "text"), { recursive: true });
mkdirSync(join(out, "media"), { recursive: true });

const SKIP_DIRS = new Set(["slprj", ".git", "node_modules", "__pycache__", ".ipynb_checkpoints", ".vscode", ".idea"]);
const SKIP_FILES = /^(\.DS_Store|Thumbs\.db|desktop\.ini|~\$.*|.*\.(slxc|asv|bak|tmp|obj|o|d|ipch|pdb|tlog|lnk|r20\d\da))$/i;
const TEXT = new Set([".txt", ".md", ".csv", ".tsv", ".m", ".py", ".c", ".h", ".cpp", ".hpp", ".cc", ".ino", ".js", ".ts", ".java", ".vhd", ".vhdl", ".v", ".sv", ".a51", ".asm", ".s", ".json", ".yml", ".yaml", ".tex", ".cir", ".sp", ".net", ".ipynb", ".lst"]);
const IMAGE = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".svg", ".webp", ".tif", ".tiff", ".heic"]);

function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not a zip archive");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.set(name, () => {
      const lnl = buf.readUInt16LE(local + 26);
      const lel = buf.readUInt16LE(local + 28);
      const start = local + 30 + lnl + lel;
      const raw = buf.subarray(start, start + csize);
      return method === 0 ? raw : inflateRawSync(raw);
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");

function texts(x) {
  return [...x.matchAll(/<m:t[^>]*>([^<]*)<\/m:t>|<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => decode(m[1] ?? m[2])).join("");
}
function part(x, tag) {
  const m = x.match(new RegExp(`<m:${tag}>([\\s\\S]*)</m:${tag}>`));
  return m ? texts(m[1]) : "";
}
function flattenMath(xml) {
  const rules = [
    [/<m:f>((?:(?!<m:f>)[\s\S])*?)<\/m:f>/, (x) => `(${part(x, "num")})/(${part(x, "den")})`],
    [/<m:sSup>((?:(?!<m:sSup>)[\s\S])*?)<\/m:sSup>/, (x) => `${part(x, "e")}^(${part(x, "sup")})`],
    [/<m:sSub>((?:(?!<m:sSub>)[\s\S])*?)<\/m:sSub>/, (x) => `${part(x, "e")}_${part(x, "sub")}`],
    [/<m:rad>((?:(?!<m:rad>)[\s\S])*?)<\/m:rad>/, (x) => `√(${part(x, "e")})`],
    [/<m:d>((?:(?!<m:d>)[\s\S])*?)<\/m:d>/, (x) => `(${texts(x)})`],
  ];
  for (let pass = 0; pass < 40; pass++) {
    let changed = false;
    for (const [re, fn] of rules) {
      xml = xml.replace(re, (whole, inner) => { changed = true; return `<m:t>${fn(inner).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</m:t>`; });
    }
    if (!changed) break;
  }
  return xml;
}

function docxText(xml) {
  xml = flattenMath(xml);
  const paras = [];
  for (const p of xml.split(/<\/w:p>/)) {
    let line = "";
    const re = /<w:t[^>]*>([^<]*)<\/w:t>|<m:t[^>]*>([^<]*)<\/m:t>|<w:tab\/>|<w:br\/>|<w:drawing>|<\/w:tc>/g;
    let m;
    while ((m = re.exec(p))) {
      if (m[1] != null) line += decode(m[1]);
      else if (m[2] != null) line += decode(m[2]);
      else if (m[0] === "<w:tab/>") line += "\t";
      else if (m[0] === "<w:br/>") line += "\n";
      else if (m[0] === "<w:drawing>") line += " [figure] ";
      else if (m[0] === "</w:tc>") line += " | ";
    }
    if (line.trim()) paras.push(line.trimEnd());
  }
  return paras.join("\n");
}

function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  if (buf.length > 10 && buf.toString("latin1", 0, 3) === "GIF") return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  return null;
}

function docxImagePlacement(z) {
  const placement = new Map();
  if (!z.has("word/_rels/document.xml.rels")) return placement;
  const rels = new Map([...z.get("word/_rels/document.xml.rels")().toString("utf8").matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], basename(m[2])]));
  const xml = z.get("word/document.xml")().toString("utf8");
  let heading = "";
  let lastText = "";
  let order = 0;
  for (const p of xml.split(/<\/w:p>/)) {
    const style = p.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "";
    const text = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => decode(m[1])).join("").trim();
    if (text && (/^(Heading|Title)/i.test(style) || /^Q\s*\d|^Question\s*\d|^Step\s*\d/i.test(text))) heading = text.slice(0, 90);
    for (const m of p.matchAll(/r:embed="([^"]+)"/g)) {
      const name = rels.get(m[1]);
      if (name && !placement.has(name)) placement.set(name, { order: ++order, heading, context: (text || lastText).slice(0, 120) });
    }
    if (text) lastText = text;
  }
  return placement;
}

function slidesText(entries) {
  const slides = [...entries.keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
  return slides.map((n, i) => {
    const xml = entries.get(n)().toString("utf8");
    const paras = xml.split(/<\/a:p>/).map((p) => [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decode(m[1])).join("")).filter((t) => t.trim());
    const notesName = `ppt/notesSlides/notesSlide${i + 1}.xml`;
    const notes = entries.has(notesName) ? [...entries.get(notesName)().toString("utf8").matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decode(m[1])).join(" ") : "";
    return `## Slide ${i + 1}\n${paras.join("\n")}${notes.trim() ? `\n[notes] ${notes.trim()}` : ""}`;
  }).join("\n\n");
}

function xlsxText(entries) {
  const shared = entries.has("xl/sharedStrings.xml") ? [...entries.get("xl/sharedStrings.xml")().toString("utf8").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => decode(t[1])).join("")) : [];
  const sheets = [...entries.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort();
  const parts = [];
  for (const n of sheets) {
    const xml = entries.get(n)().toString("utf8");
    const rows = [];
    for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [...r[1].matchAll(/<c [^>]*?(t="(\w+)")?[^>]*>(?:[\s\S]*?<v>([^<]*)<\/v>)?[\s\S]*?<\/c>/g)].map((c) => (c[2] === "s" ? shared[+c[3]] ?? "" : c[3] ?? ""));
      rows.push(cells.join(","));
      if (rows.length >= 400) break;
    }
    parts.push(`## ${basename(n, ".xml")} (${rows.length} rows shown)\n${rows.join("\n")}`);
  }
  return parts.join("\n\n");
}

function simulinkText(entries) {
  const systems = [...entries.keys()].filter((n) => /^simulink\/systems\/system_[^/]+\.xml$/.test(n)).sort();
  const out = [];
  for (const n of systems) {
    const xml = entries.get(n)().toString("utf8");
    const blocks = [];
    for (const b of xml.matchAll(/<Block BlockType="(\w+)" Name="([^"]*)" SID="(\d+)">([\s\S]*?)<\/Block>/g)) {
      const params = [...b[4].matchAll(/<P Name="(Gain|Numerator|Denominator|Inputs|After|Before|Time|Value|VariableName|SampleTime|UpperLimit|LowerLimit|InitialCondition|P|I|D|N)">([^<]*)<\/P>/g)].filter((p) => !(p[1] === "SampleTime" && p[2] === "0")).map((p) => `${p[1]}=${decode(p[2])}`);
      blocks.push(`${b[1]} "${decode(b[2])}"${params.length ? " " + params.join(" ") : ""}`);
    }
    const lines = [...xml.matchAll(/<Line>([\s\S]*?)<\/Line>/g)].map((l) => {
      const src = l[1].match(/<P Name="Src">([^<]*)</)?.[1];
      const dsts = [...l[1].matchAll(/<P Name="Dst">([^<]*)</g)].map((d) => d[1]);
      return src ? `${src} → ${dsts.join(", ")}` : null;
    }).filter(Boolean);
    out.push(`## ${basename(n, ".xml")}\nblocks:\n${blocks.map((b) => "  " + b).join("\n")}\nconnections (SID#port):\n${lines.map((l) => "  " + l).join("\n")}`);
  }
  return out.join("\n\n");
}

function pdfInfo(buf) {
  const s = buf.toString("latin1");
  const counts = [...s.matchAll(/\/Type\s*\/Pages[\s\S]{0,200}?\/Count\s+(\d+)/g)].map((m) => +m[1]);
  const pages = counts.length ? Math.max(...counts) : (s.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
  const title = s.match(/\/Title\s*\(([^)]*)\)/)?.[1];
  return { pages, title: title || null };
}

function ipynbText(raw) {
  try {
    const nb = JSON.parse(raw);
    return nb.cells.map((c) => `## ${c.cell_type}\n${[].concat(c.source).join("")}`).join("\n\n");
  } catch {
    return raw;
  }
}

function walk(p, list = []) {
  const st = statSync(p);
  if (st.isDirectory()) {
    if (SKIP_DIRS.has(basename(p))) return list;
    for (const name of readdirSync(p).sort()) walk(join(p, name), list);
  } else if (!SKIP_FILES.test(basename(p))) list.push(p);
  return list;
}

const RELEVANT = /(tutorial|lab|coursework|cw\d|assignment|info|sheet|brief|lecture|notes|report|portfolio|question|exam|problem|worksheet|handout|spec)/i;
function score(f) {
  let s = 0;
  if ([".pdf", ".docx", ".pptx"].includes(f.ext)) s += 3;
  if (RELEVANT.test(f.name)) s += 3;
  if (/answer|solution|complete|marked/i.test(f.name)) s += 1;
  if ([".m", ".py", ".c", ".cpp", ".ino", ".slx", ".ipynb"].includes(f.ext)) s += 2;
  if ([".csv", ".xlsx", ".txt", ".mat"].includes(f.ext)) s += 1;
  if (f.kind === "image") s -= 1;
  return s;
}

const roots = inputs;
const files = roots.flatMap((r) => walk(r));
const used = new Set();
const safeName = (rel) => {
  let n = rel.replace(/[^\w.-]+/g, "_").replace(/^_+/, "");
  while (used.has(n)) n = "_" + n;
  used.add(n);
  return n;
};
const inventory = [];
for (const file of files) {
  const root = roots.find((r) => file.startsWith(r)) || file;
  const rel = relative(statSync(root).isDirectory() ? root : resolve(root, ".."), file) || basename(file);
  const ext = extname(file).toLowerCase();
  const f = { path: rel, name: basename(file), ext, size: statSync(file).size, kind: "other" };
  try {
    let text = null;
    if (ext === ".docx" || ext === ".pptx" || ext === ".xlsx" || ext === ".slx") {
      const z = readZip(readFileSync(file));
      if (ext === ".docx") { f.kind = "document"; text = docxText(z.get("word/document.xml")().toString("utf8")); }
      if (ext === ".pptx") { f.kind = "slides"; text = slidesText(z); f.slides = (text.match(/^## Slide/gm) || []).length; }
      if (ext === ".xlsx") { f.kind = "spreadsheet"; text = xlsxText(z); }
      if (ext === ".slx") { f.kind = "simulink"; text = simulinkText(z); f.blocks = (text.match(/^ {2}\w+ "/gm) || []).length; }
      const media = [...z.keys()].filter((n) => /\/media\/[^/]+\.(png|jpe?g|gif|emf|wmf|svg)$/i.test(n));
      const placement = ext === ".docx" ? docxImagePlacement(z) : new Map();
      if (media.length) {
        f.images = [];
        let skipped = 0;
        for (const m of media) {
          const data = z.get(m)();
          const size = imageSize(data);
          if (size && (size.w < 48 || size.h < 32)) { skipped++; continue; }
          const target = safeName(`${rel}__${basename(m)}`);
          writeFileSync(join(out, "media", target), data);
          const where = placement.get(basename(m));
          f.images.push({ file: `media/${target}`, ...(size ?? {}), ...(where ?? {}) });
        }
        f.images.sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9));
        if (skipped) f.imagesSkipped = `${skipped} tiny images (equation or drawing fragments) skipped`;
      }
    } else if (ext === ".pdf") {
      f.kind = "pdf";
      Object.assign(f, pdfInfo(readFileSync(file)));
      f.read = "Read this PDF directly with your file reader (text and page images); this script only counts pages.";
    } else if (TEXT.has(ext)) {
      f.kind = /\.(csv|tsv)$/.test(ext) || /^[\d\s.,eE+-]+$/m.test(readFileSync(file, "utf8").slice(0, 2000)) ? "data" : "code-or-text";
      const raw = readFileSync(file, "utf8");
      text = ext === ".ipynb" ? ipynbText(raw) : raw;
      if (f.kind === "data") {
        const lines = raw.split(/\r?\n/).filter((l) => l.trim());
        f.rows = lines.length;
        text = lines.slice(0, 60).join("\n") + (lines.length > 60 ? `\n… (${lines.length - 60} more rows; read the original for the full series)` : "");
      }
    } else if (IMAGE.has(ext)) {
      f.kind = "image";
    } else if (ext === ".mat") {
      f.kind = "matlab-data";
      const head = readFileSync(file).subarray(0, 116).toString("latin1");
      f.header = head.replace(/\0/g, "").trim();
      f.read = "MAT-file: load it with MATLAB/Octave or scipy.io.loadmat if you need the arrays; variable names often match the lab's .m scripts.";
    }
    if (text != null) {
      f.words = (text.match(/\S+/g) || []).length;
      f.text = `text/${safeName(rel)}.txt`;
      writeFileSync(join(out, f.text), text);
    }
  } catch (e) {
    f.error = e.message;
  }
  f.score = score(f);
  inventory.push(f);
}

inventory.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
writeFileSync(join(out, "inventory.json"), JSON.stringify({ inputs: roots.map((r) => basename(r)), files: inventory }, null, 2) + "\n");

const kinds = inventory.reduce((m, f) => ((m[f.kind] = (m[f.kind] || 0) + 1), m), {});
console.log(`ingested ${inventory.length} file(s) → ${relative(process.cwd(), out) || out}/`);
console.log(`kinds: ${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
console.log("\nread first:");
for (const f of inventory.slice(0, 8)) console.log(`  ${String(f.score).padStart(2)}  ${f.path}${f.pages ? ` (${f.pages} pages)` : ""}${f.slides ? ` (${f.slides} slides)` : ""}${f.words ? ` (${f.words} words)` : ""}${f.blocks ? ` (${f.blocks} blocks)` : ""}${f.images ? ` +${f.images.length} images${f.imagesSkipped ? ` (${f.imagesSkipped.split(" ")[0]} tiny skipped)` : ""}` : ""}${f.error ? ` ERROR ${f.error}` : ""}`);
