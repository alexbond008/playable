// Reality checks: compile and run the tutorial's own code with the real compiler
// and compare every claim the game makes. Run by scripts/verify-model.mjs.
import {
  q1Source, q2Source, SRC_Q2_STUDENT, Q2_BODIES, Q2_BODY_LINE, Q2_INPUT, runQ2,
  q3Source, runQ3, Q3_LINES, Q3_SOLUTION, q4Program, Q4_EXPRS, houseLayout,
  PLATFORM, POSTCODES, BOSS_DECLS, bossRun, stringStorage, layout, HOUSE, TENANT,
} from "./model.mjs";

const ASAN = { flags: ["-g", "-fsanitize=address"] };
const errLines = (r) => [...new Set(r.errors.map((e) => +(e.match(/main\.cpp:(\d+):/) || [])[1]).filter(Boolean))];
const asanKind = (r) => (r.stderr.match(/AddressSanitizer: ([a-z-]+)/) || [])[1] || "none";
const asanLine = (r) => +((r.stderr.match(/in main .*main\.cpp:(\d+)/) || [])[1] || 0);

// Appended (never prepended, so line numbers stay true): count heap blocks still alive at exit.
const COUNTER = `
#include <cstdio>
#include <cstdlib>
static long __live = 0, __blocks = 0;
void* operator new(std::size_t n) { ++__live; ++__blocks; return std::malloc(n); }
void* operator new[](std::size_t n) { ++__live; ++__blocks; return std::malloc(n); }
void operator delete(void* p) noexcept { if (p) --__live; std::free(p); }
void operator delete[](void* p) noexcept { if (p) --__live; std::free(p); }
void operator delete(void* p, std::size_t) noexcept { if (p) --__live; std::free(p); }
void operator delete[](void* p, std::size_t) noexcept { if (p) --__live; std::free(p); }
struct __Report { ~__Report() { std::fprintf(stderr, "LIVE %ld BLOCKS %ld\\n", __live, __blocks); } } __report;
`;
const live = (r) => +((r.stderr.match(/LIVE (-?\d+)/) || [])[1] ?? NaN);

export async function checks({ cpp }) {
  const probe = cpp("int main(){return 0;}");
  if (!probe.available) return [{ id: "all", skip: "no C++ compiler found (clang++ or g++)" }];
  const rows = [];
  const row = (id, field, expected, got) => rows.push({ id, field, expected, got, ok: String(expected) === String(got) });

  // ---------- Q1: which line crashes, and does the fix work?
  {
    const plain = cpp(q1Source(false));
    row("Q1", "compiles", true, plain.compiled);
    row("Q1", "crashes", true, plain.crashed);
    row("Q1", "signal", "SIGSEGV", plain.signal);
    const asan = cpp(q1Source(false), ASAN);
    row("Q1", "crash line", 9, asanLine(asan));
    row("Q1", "crash address", "0x000000000000", (asan.stderr.match(/SEGV on unknown address (0x[0-9a-f]+)/) || [])[1]);
    const nullOnly = cpp(q1Source(false).split("\n").filter((_, i) => i + 1 !== 9 && i + 1 !== 11).join("\n"));
    row("Q1", "p = 0 alone ok", false, nullOnly.crashed);
    const fixed = cpp(q1Source(true));
    row("Q1", "fixed output", "12", fixed.stdout.trim());
  }

  // ---------- Q2: every body the slot offers, with input 3 4 5
  {
    const stdin = Q2_INPUT.join(" ");
    Q2_BODIES.forEach((body, i) => {
      const model = runQ2({ body: i });
      const r = cpp(q2Source(body), { stdin });
      if (!model.compiled) {
        row("Q2", `body ${i} compiles`, false, r.compiled);
        row("Q2", `body ${i} error line`, Q2_BODY_LINE, errLines(r)[0]);
      } else row("Q2", `body ${i} prints`, model.output, r.stdout.trim());
    });
    const num2 = cpp(q2Source(Q2_BODIES[1]).replace('"The answer is " << Num3', '"Num2 " << Num2'), { stdin });
    row("Q2", "b writes Num2", "Num2 12", num2.stdout.trim());
    const student = cpp(SRC_Q2_STUDENT);
    row("Q2", "student compiles", false, student.compiled);
    row("Q2", "student: num1", true, student.errors.some((e) => /num1/.test(e)));
    row("Q2", "student: cin", true, student.errors.some((e) => /'cin'/.test(e)));
  }

  // ---------- Q3: the allocation program
  {
    const orig = cpp(q3Source());
    row("Q3", "compiles", false, orig.compiled);
    row("Q3", "error lines", `${Q3_LINES.again},${Q3_LINES.print}`, errLines(orig).join(","));
    const one = cpp(`#include <iostream>\nint main(){ uint32_t *p = new uint32_t(6); std::cout << *p << std::endl; }`);
    row("Q3", "new uint32_t(6)", "6", one.stdout.trim());
    const oob = cpp(q3Source({ ...Q3_SOLUTION, alloc: 0 }), ASAN);
    row("Q3", "pHeap[3] on (6)", "heap-buffer-overflow", asanKind(oob));
    row("Q3", "overflow line", 8, asanLine(oob));
    row("Q3", "bytes past end", "8 after 4-byte", (oob.stderr.match(/located (\d+) bytes after (\d+)-byte region/) || []).slice(1).join(" after ") + "-byte");
    const fixed = cpp(q3Source(Q3_SOLUTION), ASAN);
    row("Q3", "fixed output", runQ3(Q3_SOLUTION).output, fixed.stdout.trim());
    row("Q3", "fixed asan", "none", asanKind(fixed));
    for (const pick of [Q3_SOLUTION, { ...Q3_SOLUTION, free: 0 }, { ...Q3_SOLUTION, again: 1 }, { ...Q3_SOLUTION, again: 1, free: 0 }]) {
      const r = cpp(q3Source(pick) + COUNTER);
      row("Q3", `leaked ${pick.again}${pick.free}`, runQ3(pick).leaked, live(r));
    }
  }

  // ---------- Q4: the student's completed program
  {
    const r = cpp(q4Program());
    const out = r.stdout;
    row("Q4", "Alice", "Alice Wonderland", (out.match(/Alice's name: (.*)/) || [])[1]);
    row("Q4", "Alice->Number", "1", (out.match(/where Alice lives: (\d+)/) || [])[1]);
    const sizes = [...out.matchAll(/used by the House: (\d+)/g)].map((m) => +m[1]);
    row("Q4b", "sizeof printed", "32,32,32", sizes.join(","));
    const addrs = [...out.matchAll(/address in memory: (0x[0-9a-f]+)/g)].map((m) => parseInt(m[1], 16));
    row("Q4b", "address stride", `${houseLayout().stride},${houseLayout().stride}`, `${addrs[1] - addrs[0]},${addrs[2] - addrs[1]}`);
    Q4_EXPRS.forEach((e, i) => { if (i !== 1) row("Q4", `${e} compiles`, false, cpp(q4Program(e)).compiled); });
  }

  // ---------- Q4b/Q4c: layout and string storage on this platform
  {
    const r = cpp(`#include <iostream>
#include <string>
#include <cstddef>
using namespace std;
struct House { uint32_t Number; string PostCode; };
struct Tenant { string Name; House *Lives; };
int main(){
  cout << sizeof(string) << " " << alignof(string) << " " << sizeof(House) << " " << offsetof(House, PostCode) << " " << sizeof(Tenant) << endl;
  House h[2];
  for (int n : {22, 23}) { h[0].PostCode = string(n, 'x'); const char* d = h[0].PostCode.data(); cout << ((d >= (const char*)&h[0] && d < (const char*)&h[1]) ? "in " : "out "); }
  h[0].PostCode = "${POSTCODES[2]}";
  const char* d = h[0].PostCode.data();
  cout << ((d >= (const char*)&h[0] && d < (const char*)&h[1]) ? "in " : "out ") << h[0].PostCode.size() << endl;
}`);
    const [sz, al, house, off, tenant, in22, in23, inLong, len] = r.stdout.trim().split(/\s+/);
    const H = layout(HOUSE);
    row("Q4b", "sizeof(string)", PLATFORM.sizes.string, +sz);
    row("Q4b", "alignof(string)", PLATFORM.aligns.string, +al);
    row("Q4b", "sizeof(House)", H.size, +house);
    row("Q4b", "PostCode offset", H.fields.find((f) => f.name === "PostCode").offset, +off);
    row("Q4", "sizeof(Tenant)", layout(TENANT).size, +tenant);
    row("Q4c", "22 chars inline", stringStorage(22).inline ? "in" : "out", in22);
    row("Q4c", "23 chars inline", stringStorage(23).inline ? "in" : "out", in23);
    row("Q4c", "postcode 3 inline", stringStorage(+len).inline ? "in" : "out", inLong);
    row("Q4c", "postcode 3 bytes", POSTCODES[2] && new TextEncoder().encode(POSTCODES[2]).length, +len);
  }

  // ---------- Q4d (boss): string vs char[N]
  {
    BOSS_DECLS.forEach((decl, i) => {
      const m = bossRun(i);
      const prog = (assign) => `#include <iostream>
#include <string>
#include <cstring>
using namespace std;
struct House { uint32_t Number; ${decl} };
int main(){
  cout << sizeof(House) << endl;
  House *NewRoad = new House[3];
  ${POSTCODES.map((s, k) => `NewRoad[${k}].Number = ${k + 1};\n  ${assign(k, s)}`).join("\n  ")}
  delete[] NewRoad;
  return 0;
}`;
      if (i === 0) {
        const r = cpp(prog((k, s) => `NewRoad[${k}].PostCode = "${s}";`) + COUNTER);
        row("Q4d", "string sizeof", m.size, +r.stdout.trim());
        const blocks = +((r.stderr.match(/BLOCKS (\d+)/) || [])[1] ?? NaN);
        row("Q4d", "string heap blocks", 1 + m.extraHeapBlocks, blocks);
        return;
      }
      const assignEq = cpp(prog((k, s) => `NewRoad[${k}].PostCode = "${s}";`));
      row("Q4d", `${decl} with =`, false, assignEq.compiled);
      const r = cpp(prog((k, s) => `strcpy(NewRoad[${k}].PostCode, "${s}");`), ASAN);
      row("Q4d", `${decl} sizeof`, m.size, +(r.stdout.trim() || NaN));
      row("Q4d", `${decl} overflow`, m.ok ? "none" : "heap-buffer-overflow", asanKind(r));
    });
  }

  // ---------- recall questions that state facts
  {
    const r = cpp(`#include <iostream>\nstruct S { char c; double d; };\nint main(){ std::cout << sizeof(S) << std::endl; }`);
    row("recall", "sizeof{char,double}", 16, +r.stdout.trim());
    const o = cpp(`#include <cstring>\n#include <cstdio>\nint main(){ char code[8]; strcpy(code, "LE11 3TU"); printf("%s", code); }`, ASAN);
    row("recall", "char[8] ← LE11 3TU", "stack-buffer-overflow", asanKind(o));
    const n = cpp(`#include <iostream>\nint main(){ int *p = new int(10); std::cout << *p << std::endl; }`);
    row("recall", "new int(10)", "10", n.stdout.trim());
  }

  return rows;
}
