// Memory Warehouse: the truth model. Pure functions, no DOM.
// Everything the game claims about the tutorial's C++ is computed here and
// checked against the real compiler in truth.mjs.

// The platform the facts were measured on (stated in the game wherever a fact depends on it).
export const PLATFORM = {
  name: "64-bit Apple clang / libc++ (arm64)",
  short: "64-bit libc++",
  sizes: { uint32_t: 4, char: 1, pointer: 8, string: 24 },
  aligns: { uint32_t: 4, char: 1, pointer: 8, string: 8 },
  ssoCapacity: 22, // longest string libc++ keeps inside the object (libstdc++: 15)
};

// Illustrative base addresses (the strides and offsets are real, the bases are not).
export const STACK_BASE = 0x7ff7bfeff0a0;
export const HEAP_BASE = 0x600000c04000;
export const hex = (n) => "0x" + n.toString(16).toUpperCase();

// ---------------------------------------------------------------- sources
// Line numbers count from #include, the way the student's answer box counts them.

export const SRC_Q1 = `#include <iostream>
using namespace std;

int main ()
{
  uint32_t* p = 0;
  uint32_t i = 11;

  *p = 12;

  cout << *p << endl;

  return 0;
}`;
export const Q1_FIX_LINE = 8;
export const Q1_FIX = "  p = &i;";
export const q1Source = (fixed) => {
  const lines = SRC_Q1.split("\n");
  if (fixed) lines[Q1_FIX_LINE - 1] = Q1_FIX;
  return lines.join("\n");
};

export const SRC_Q2 = `#include <iostream>

void AddNumbers(uint32_t, uint32_t &, uint32_t *);

int main()
{
  uint32_t Num1, Num2, Num3;
  std::cin >> Num1 >> Num2 >> Num3;
  AddNumbers(Num1, Num2, &Num3);
  std::cout << "The answer is " << Num3 << std::endl;
  return 0;
}

void AddNumbers(uint32_t a, uint32_t &b, uint32_t *c)
{
  @BODY@
}`;
export const Q2_BODY_LINE = 16;
export const Q2_BODIES = ["a = a + b + *c;", "b = a + b + *c;", "c = a + b + *c;", "*c = a + b + *c;"];
export const Q2_INPUT = [3, 4, 5];
export const q2Source = (body) => SRC_Q2.replace("@BODY@", body ?? "// add the numbers and store the answer in c");

// The student's answer boxes, pasted into the sheet's skeleton (which has no `using namespace std;`).
export const SRC_Q2_STUDENT = `#include <iostream>
void AddNumbers(uint32_t, uint32_t &, uint32_t *);
int main()
{
  uint32_t Num1, Num2, Num3;
  cin >> num1;
  cin >> num2;
  cin >> num3;
  AddNumbers(Num1, Num2, &Num3);
  cout << " The answer is " << Num3<< endl;
  return 0;
}
void AddNumbers(uint32_t a, uint32_t &b, uint32_t *c)
{
  *c = a + b + *c;
}`;

export const Q3_LINES = { alloc: 7, again: 10, print: 11, free: 12 };
export const Q3_OPTIONS = {
  alloc: ["  uint32_t *pHeap = new uint32_t(6);", "  uint32_t *pHeap = new uint32_t[6];"],
  again: ["  uint32_t *pHeap = new uint32_t(4);", "  pHeap = new uint32_t[4];", "  // (line removed)"],
  print: ["  cout << *pHeap[3] << endl;", "  cout << pHeap[3] << endl;"],
  free: ["", "  delete[] pHeap;"],
};
export function q3Source(pick = {}) {
  const p = { alloc: 0, again: 0, print: 0, free: 0, ...pick };
  return `#include <iostream>
#include <new>
using namespace std;

int main()
{
${Q3_OPTIONS.alloc[p.alloc]}
  pHeap[3] = 7;

${Q3_OPTIONS.again[p.again]}
${Q3_OPTIONS.print[p.print]}
${Q3_OPTIONS.free[p.free]}
  return 0;
}`;
}

export const POSTCODES = ["LE11 3TU", "LE11 3TU", "I don’t know what it is"];
export const utf8Len = (s) => new TextEncoder().encode(s).length;

export const SRC_Q4 = `#include <iostream>
#include <new>
using namespace std;

struct House
{
  uint32_t Number; string PostCode;
};

struct Tenant
{
  string Name; House *Lives;
};

enum{NumPeople = 3, NumHouses = 3};

int main()
{
  Tenant Alice, Bill, Cherry;
  House *NewRoad = new House[NumHouses];
  if (NewRoad == 0)
    exit(1);
  NewRoad[0].Number = 1;
  NewRoad[0].PostCode = "LE11 3TU";
  NewRoad[1].Number = 2;
  NewRoad[1].PostCode = "LE11 3TU";
  NewRoad[2].Number = 3;
  NewRoad[2].PostCode = "I don’t know what it is";

  Alice.Name = "Alice Wonderland";
  Alice.Lives = &NewRoad[0];
  Bill.Name = "Bill Mee";
  Bill.Lives = &NewRoad[1];
  Cherry.Name = "Cherry Tree";
  Cherry.Lives = &NewRoad[2];

  cout << "Alice's name: " << Alice.Name << endl;
  cout << "House number where Alice lives: " << @EXPR@ << endl;

  for (int i = 0; i < NumHouses; ++i) {
    cout << "House " << i + 1 << ":" << endl;
    cout << "(1) Number of bytes used by the House: " << sizeof(House) << endl;
    cout << "(2) Start address in memory: " << &NewRoad[i] << endl;
  }
  return 0;
}`;
export const Q4_EXPRS = ["Alice.Lives.Number", "Alice.Lives->Number", "*Alice.Lives.Number", "Alice->Lives->Number"];
export const q4Program = (expr = Q4_EXPRS[1]) => SRC_Q4.replace("@EXPR@", expr);

// The excerpt the game shows for Q4 (the wiring and the first display line).
export const SRC_Q4_EXCERPT = `// NewRoad[0..2] are already on the heap
Alice.Name = "Alice Wonderland";
Alice.Lives = &NewRoad[0];
Bill.Name = "Bill Mee";
Bill.Lives = &NewRoad[1];
Cherry.Name = "Cherry Tree";
Cherry.Lives = &NewRoad[2];

cout << "Alice's name: " << Alice.Name << endl;
cout << "House number where Alice lives: "
     << @EXPR@ << endl;`;
export const Q4_EXPR_LINE = 11;
export const Q4_WIRE_LINES = { Alice: 3, Bill: 5, Cherry: 7 };

// ---------------------------------------------------------------- layout
// The C/C++ struct layout rule: each member starts at the next multiple of its
// alignment; the struct's size rounds up to its largest alignment.
export function layout(fields) {
  let off = 0, align = 1;
  const out = [];
  for (const f of fields) {
    const size = f.size ?? PLATFORM.sizes[f.type];
    const a = f.align ?? PLATFORM.aligns[f.type] ?? 1;
    const start = Math.ceil(off / a) * a;
    if (start > off) out.push({ name: "(padding)", offset: off, size: start - off, padding: true });
    out.push({ name: f.name, type: f.type, offset: start, size });
    off = start + size;
    align = Math.max(align, a);
  }
  const size = Math.ceil(off / align) * align;
  if (size > off) out.push({ name: "(padding)", offset: off, size: size - off, padding: true });
  return { size, align, fields: out, padding: out.filter((f) => f.padding).reduce((s, f) => s + f.size, 0) };
}
export const HOUSE = [{ name: "Number", type: "uint32_t" }, { name: "PostCode", type: "string" }];
export const houseWithChars = (n) => [{ name: "Number", type: "uint32_t" }, { name: "PostCode", type: "char", size: n, align: 1 }];
export const TENANT = [{ name: "Name", type: "string" }, { name: "Lives", type: "pointer" }];

// ---------------------------------------------------------------- the machines
// Q1: the null-pointer program. `fixed` = the student's `p = &i;` inserted on line 8.
export function runQ1({ fixed = false } = {}) {
  const mem = { p: 0, i: 11 };
  const trace = [{ line: 6, op: "set", target: "p", value: 0 }, { line: 7, op: "set", target: "i", value: 11 }];
  if (fixed) { mem.p = "&i"; trace.push({ line: 8, op: "point", target: "p", to: "i" }); }
  if (mem.p === 0) { trace.push({ line: 9, op: "crash", via: "p" }); return { crashed: true, crashLine: 9, output: "", trace, signal: "SIGSEGV" }; }
  mem.i = 12;
  trace.push({ line: 9, op: "store", via: "p", target: "i", value: 12 });
  trace.push({ line: 11, op: "print", via: "p", target: "i", value: mem.i });
  return { crashed: false, crashLine: 0, output: String(mem.i), i: mem.i, trace };
}

// Q2: the three calling conventions. body = index into Q2_BODIES.
export function runQ2({ body, input = Q2_INPUT } = {}) {
  const [n1, n2, n3] = input;
  const caller = { Num1: n1, Num2: n2, Num3: n3 };
  if (body == null) return { compiled: true, output: `The answer is ${n3}`, caller, answer: n3 };
  if (body === 2) return { compiled: false, errorLine: Q2_BODY_LINE, error: "assigning to 'uint32_t *' from incompatible type 'uint32_t'", caller };
  const sum = n1 + n2 + n3;
  const frame = { a: n1, c: "&Num3" };
  if (body === 0) frame.a = sum;            // writes the copy; main never sees it
  if (body === 1) caller.Num2 = sum;        // b is another name for Num2
  if (body === 3) caller.Num3 = sum;        // *c is Num3
  return { compiled: true, output: `The answer is ${caller.Num3}`, caller, frame, answer: caller.Num3, sum };
}

// Q3: the allocation program, line choices from Q3_OPTIONS.
export function runQ3(pick = {}) {
  const p = { alloc: 0, again: 0, print: 0, free: 0, ...pick };
  const errors = [];
  if (p.again === 0) errors.push({ line: Q3_LINES.again, text: "redefinition of 'pHeap'" });
  if (p.print === 0) errors.push({ line: Q3_LINES.print, text: "indirection requires pointer operand ('uint32_t' invalid)" });
  const elements = p.alloc === 0 ? 1 : 6;
  const firstValue = p.alloc === 0 ? 6 : null; // new uint32_t(6): one element, value 6; new uint32_t[6]: six, uninitialised
  if (errors.length) return { compiled: false, errors, errorCount: errors.length, elements, firstValue };
  const outOfBounds = 3 >= elements; // pHeap[3] on a one-element block
  const blocks = [elements];
  let live = 1;
  let printed = "7";
  if (p.again === 1) { blocks.push(4); live = 2; printed = "?"; } // new block: pHeap[3] is uninitialised
  if (p.free === 1) live -= 1;
  const leaked = live; // blocks never freed
  const clean = !outOfBounds && leaked === 0 && printed === "7";
  return { compiled: true, errors: [], errorCount: 0, elements, firstValue, outOfBounds, blocks, leaked, output: outOfBounds ? "(undefined: wrote past the block)" : printed, clean };
}
export const Q3_SOLUTION = { alloc: 1, again: 2, print: 1, free: 1 };

// Q4: wiring and the -> expression.
export function runQ4({ wires = {}, expr = 1 } = {}) {
  const ok = wires.Alice === 0 && wires.Bill === 1 && wires.Cherry === 2;
  const compiles = expr === 1;
  const out = [`Alice's name: Alice Wonderland`];
  if (compiles && wires.Alice != null) out.push(`House number where Alice lives: ${wires.Alice + 1}`);
  return { compiles, wired: ok, output: out, number: wires.Alice != null ? wires.Alice + 1 : null };
}

// Q4b: House layout and the address stride.
export function houseLayout() {
  const L = layout(HOUSE);
  const pc = L.fields.find((f) => f.name === "PostCode");
  return { size: L.size, offset: pc.offset, padding: L.padding, stride: L.size, naive: PLATFORM.sizes.uint32_t + PLATFORM.sizes.string, tenant: layout(TENANT).size };
}

// Q4c: where a std::string keeps its characters (libc++ short-string optimisation).
export function stringStorage(len) {
  const inline = len <= PLATFORM.ssoCapacity;
  return { inline, sizeofHouse: layout(HOUSE).size, heapBytes: inline ? 0 : len + 1 };
}

// Boss: PostCode as std::string or char[N].
export const BOSS_DECLS = ["string PostCode;", "char PostCode[4];", "char PostCode[12];", "char PostCode[28];"];
export const BOSS_N = [null, 4, 12, 28];
export function bossRun(choice) {
  const N = BOSS_N[choice];
  const need = POSTCODES.map((s) => utf8Len(s) + 1);
  if (N == null) {
    const L = layout(HOUSE);
    const extra = POSTCODES.filter((s) => utf8Len(s) > PLATFORM.ssoCapacity).length;
    return { size: L.size, stride: L.size, need, fits: need.map(() => true), overflow: [0, 0, 0], extraHeapBlocks: extra, ok: extra === 0, arrayBytes: 3 * L.size };
  }
  const L = layout(houseWithChars(N));
  const fits = need.map((n) => n <= N);
  return { size: L.size, stride: L.size, need, fits, overflow: need.map((n) => Math.max(0, n - N)), extraHeapBlocks: 0, ok: fits.every(Boolean), arrayBytes: 3 * L.size };
}

// ---------------------------------------------------------------- truth-gate solvers (lesson.json cases)
export const q1 = () => { const a = runQ1(), b = runQ1({ fixed: true }); return { crashLine: a.crashLine, fixedOutput: +b.output }; };
export const q2 = ({ input }) => ({ correct: runQ2({ body: 3, input }).answer, byValue: runQ2({ body: 0, input }).answer, byRefNum2: runQ2({ body: 1, input }).caller.Num2 });
export const q3 = () => { const r = runQ3(); return { errorCount: r.errorCount, elements: r.elements, firstValue: r.firstValue, fixedOutput: +runQ3(Q3_SOLUTION).output }; };
export const q4 = () => ({ number: runQ4({ wires: { Alice: 0, Bill: 1, Cherry: 2 } }).number, sizeofTenant: houseLayout().tenant });
export const q4b = () => { const h = houseLayout(); return { sizeofHouse: h.size, offsetPostCode: h.offset, padding: h.padding, stride: h.stride }; };
export const q4c = () => ({ ssoMax: PLATFORM.ssoCapacity, len3: utf8Len(POSTCODES[2]), sizeofHouseLong: stringStorage(25).sizeofHouse });
export const q4d = () => ({ size4: bossRun(1).size, size12: bossRun(2).size, size28: bossRun(3).size, need3: bossRun(3).need[2] });
