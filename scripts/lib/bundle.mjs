import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, resolve, relative, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const VENDOR = join(ROOT, "kit/vendor");

export const ALIASES = {
  three: join(VENDOR, "three/build/three.module.js"),
  "three/addons/": join(VENDOR, "three/examples/jsm/"),
  rapier: join(VENDOR, "rapier/rapier.mjs"),
};

const IDENT = /^[A-Za-z_$][\w$]*$/;

// Rapier's compat build inlines its WASM as one base64 literal (~4.1 MB). Gzip the
// raw bytes at build time and inflate them with DecompressionStream at module load,
// so the single-file game stays offline with ~2.5 MB less to download and parse.
function packRapier(code) {
  const lit = /([\w$]+)\.toByteArray\("([A-Za-z0-9+/=]{100000,})"\)/g;
  const found = [...code.matchAll(lit)];
  if (found.length !== 1) throw new Error(`rapier: expected one inlined WASM literal, found ${found.length}; update packRapier in scripts/lib/bundle.mjs`);
  const gz = gzipSync(Buffer.from(found[0][2], "base64"), { level: 9 }).toString("base64");
  const inflate = `const __rapierWasm = await (async () => {
  const s = atob("${gz}"), b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
})();
`;
  return inflate + code.replace(found[0][0], () => "__rapierWasm");
}


function resolveSpec(spec, fromFile) {
  if (spec in ALIASES && !spec.endsWith("/")) return ALIASES[spec];
  for (const [prefix, target] of Object.entries(ALIASES)) {
    if (prefix.endsWith("/") && spec.startsWith(prefix)) return join(target, spec.slice(prefix.length));
  }
  if (spec.startsWith(".") || spec.startsWith("/")) return resolve(dirname(fromFile), spec);
  throw new Error(`cannot resolve "${spec}" from ${relative(ROOT, fromFile)}`);
}

function parseSpecifiers(list) {
  return list
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^([\w$]+)(?:\s+as\s+([\w$]+))?$/);
      if (!m) throw new Error(`unsupported specifier "${s}"`);
      return { imported: m[1], local: m[2] || m[1] };
    });
}

function transform(code, file) {
  if (file.endsWith(".json")) return { code: `const __default = ${code.trim()};`, deps: [], exportsOut: [{ exported: "default", local: "__default" }], reexports: [], starExports: [] };
  const deps = [];
  const exportsOut = [];
  const reexports = [];
  const starExports = [];
  const depOf = (spec) => {
    const target = resolveSpec(spec, file);
    deps.push(target);
    return target;
  };

  code = code.replace(/^export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/gm, (_, list, spec) => {
    const target = depOf(spec);
    for (const { imported, local } of parseSpecifiers(list)) reexports.push({ target, imported, exported: local });
    return "";
  });

  code = code.replace(/^export\s*\*\s*from\s*['"]([^'"]+)['"];?/gm, (_, spec) => {
    starExports.push(depOf(spec));
    return "";
  });

  code = code.replace(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm, (_, clause, spec) => {
    const target = depOf(spec);
    const ref = `__mod[${JSON.stringify(target)}]`;
    const out = [];
    let rest = clause.trim();
    const def = rest.match(/^([\w$]+)\s*(,|$)/);
    if (def && !rest.startsWith("{") && !rest.startsWith("*")) {
      out.push(`const ${def[1]} = ${ref}.default;`);
      rest = rest.slice(def[0].length).trim();
    }
    const ns = rest.match(/^\*\s+as\s+([\w$]+)$/);
    if (ns) out.push(`const ${ns[1]} = ${ref};`);
    const named = rest.match(/^\{([\s\S]*)\}$/);
    if (named) {
      const parts = parseSpecifiers(named[1]).map(({ imported, local }) => (imported === local ? local : `${imported}: ${local}`));
      if (parts.length) out.push(`const { ${parts.join(", ")} } = ${ref};`);
    }
    if (!ns && !named && rest) throw new Error(`unsupported import clause "${clause}" in ${relative(ROOT, file)}`);
    return out.join(" ");
  });

  code = code.replace(/^import\s+['"]([^'"]+)['"];?/gm, (_, spec) => {
    depOf(spec);
    return "";
  });

  code = code.replace(/^export\s+default\s+/m, () => {
    exportsOut.push({ exported: "default", local: "__default" });
    return "const __default = ";
  });

  code = code.replace(/^export\s+(async\s+function\*?|function\*?|class|const|let|var)\s+([\w$]+)/gm, (_, kind, name) => {
    exportsOut.push({ exported: name, local: name });
    return `${kind} ${name}`;
  });

  code = code.replace(/^export\s*\{([^}]*)\};?/gm, (_, list) => {
    for (const { imported, local } of parseSpecifiers(list)) exportsOut.push({ exported: local, local: imported });
    return "";
  });

  code = code.replace(/export\s*\{([^}]*)\};?\s*$/, (_, list) => {
    for (const { imported, local } of parseSpecifiers(list)) exportsOut.push({ exported: local, local: imported });
    return "";
  });

  if (/^\s*(import|export)\s/m.test(code)) {
    const line = code.split("\n").find((l) => /^\s*(import|export)\s/.test(l));
    throw new Error(`unhandled module syntax in ${relative(ROOT, file)}: ${line.trim().slice(0, 120)}`);
  }
  return { code, deps, exportsOut, reexports, starExports };
}

export function bundle(entry) {
  const mods = new Map();
  const order = [];
  const visit = (file, stack = []) => {
    if (mods.has(file)) return;
    if (stack.includes(file)) throw new Error(`circular import: ${[...stack, file].map((f) => relative(ROOT, f)).join(" → ")}`);
    const src = readFileSync(file, "utf8");
    const t = transform(file === ALIASES.rapier ? packRapier(src) : src, file);
    for (const d of t.deps) visit(d, [...stack, file]);
    mods.set(file, t);
    order.push(file);
  };
  visit(resolve(entry));

  const chunks = ["const __mod = Object.create(null);"];
  for (const file of order) {
    const t = mods.get(file);
    const fields = [];
    for (const s of t.starExports) fields.push(`...__mod[${JSON.stringify(s)}]`);
    for (const r of t.reexports) fields.push(`${keyOf(r.exported)}: __mod[${JSON.stringify(r.target)}][${JSON.stringify(r.imported)}]`);
    for (const e of t.exportsOut) fields.push(e.exported === e.local && IDENT.test(e.local) ? e.local : `${keyOf(e.exported)}: ${e.local}`);
    chunks.push(
      `/* ${relative(ROOT, file)} */\n__mod[${JSON.stringify(file)}] = await (async () => {\n${t.code}\nreturn { ${fields.join(", ")} };\n})();`
    );
  }
  return chunks.join("\n").replaceAll(ROOT + "/", "").replace(/<\/script/gi, "<\\/script");
}

function keyOf(name) {
  return IDENT.test(name) ? name : JSON.stringify(name);
}
