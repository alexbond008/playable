import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let compiler;
function findCompiler() {
  if (compiler !== undefined) return compiler;
  for (const c of [process.env.CXX, "clang++", "g++", "c++"].filter(Boolean)) {
    try {
      execFileSync(c, ["--version"], { stdio: "ignore" });
      return (compiler = c);
    } catch {}
  }
  return (compiler = null);
}

export function cpp(source, { std = "c++17", stdin = "", args = [], timeout = 5000, flags = [] } = {}) {
  const cxx = findCompiler();
  if (!cxx) return { available: false };
  const dir = mkdtempSync(join(tmpdir(), "playable-cpp-"));
  try {
    const src = join(dir, "main.cpp");
    const bin = join(dir, "main");
    writeFileSync(src, source);
    const c = spawnSync(cxx, [`-std=${std}`, "-O0", "-w", ...flags, src, "-o", bin], { encoding: "utf8", timeout: 30000 });
    const diagnostics = (c.stderr || "").split("\n").filter((l) => /error:/.test(l)).map((l) => l.replace(src, "main.cpp"));
    if (c.status !== 0) return { available: true, compiler: cxx, compiled: false, errors: diagnostics, errorCount: diagnostics.length };
    const r = spawnSync(bin, args, { input: stdin, encoding: "utf8", timeout });
    return { available: true, compiler: cxx, compiled: true, errors: [], errorCount: 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "", code: r.status, signal: r.signal, crashed: !!r.signal || (r.status ?? 0) >= 128 };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
