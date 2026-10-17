import * as THREE from "three";
import { playable } from "../../kit/core/game.mjs";
import { bench } from "../../kit/core/parts/bench.mjs";
import { memoryWarehouse } from "../../kit/core/parts/memory.mjs";
import { slider } from "../../kit/core/parts/controls.mjs";
import { createCodePanel } from "../../kit/core/code.mjs";
import { createAnimator } from "../../kit/core/anim.mjs";
import { detentValue } from "../../kit/core/interact.mjs";
import * as M from "./model.mjs";
import verified from "./verified.json";

const SERIAL = "PLAYABLE-02";
const CAMERA = { position: [1.9, 7.4, 15.4], target: [1.15, 1.25, -1.0], fov: 32, portraitFov: 50, maxDistance: 26, minAzimuth: -0.9, maxAzimuth: 0.9, focus: { min: [-4.8, 0, -2.1], max: [4.8, 4.2, 2.9] } };
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const sh = (a) => (a ? "…" + a.toString(16).toUpperCase().slice(-4) : "0x0");
const C = { int: 0xc9b48a, ptr: 0x9aa4ae, str: 0xc2b38f, house: 0xc9b48a, chars: 0xe2d8bf, accent: 0xff5a1f };
const LONG_TEXT = "LE11 3TU Loughborough Leics UK"; // 30 ASCII bytes for the Q4c slider
const textOf = (n) => LONG_TEXT.slice(0, n);

async function build({ stage, B, audio, interaction, h, overlay, hud, refocus }) {
  const plate = bench(B, stage, { serial: SERIAL, subtitle: "Memory warehouse · WSC318 · pointers & structs", plate: [2.9, 2.85] });
  const mem = memoryWarehouse(B, stage, {
    regions: [
      { id: "stack", label: "STACK", base: M.STACK_BASE, shelves: 4, x0: -4.6, z: -1.6 },
      { id: "heap", label: "HEAP", base: M.HEAP_BASE, shelves: 4, x0: 0.6, z: -1.6 },
    ],
    pit: [0, 0, 1.5],
    forkliftHome: [0, 0, 0.2],
  });
  const fork = mem.forklift;
  const anim = createAnimator();
  const len = slider(B, stage, { pos: [2.6, 0, 1.1], length: 3.6, ticks: 30, dynamic: true, label: "", marks: [{ at: 0, text: "0" }, { at: 1, text: "30 B" }] });
  len.group.visible = false;
  const code = createCodePanel(hud, { title: "main.cpp", onRun: () => execute("run"), onStep: () => execute("step"), onReset: () => resetProgram(true) });
  code.show(false);

  // ------------------------------------------------------------------ state
  const S = { lvl: null, L: null, choice: {}, out: [], steps: null, pc: 0, running: false, done: false, phase: "map", grabbed: false, v: {} };
  const crates = {};
  const cables = {};
  let token = 0;

  function clearWorld() {
    token++;
    anim.clear();
    for (const c of [...mem.cables]) c.remove();
    for (const c of [...mem.crates.values()]) c.remove();
    for (const k of Object.keys(crates)) delete crates[k];
    for (const k of Object.keys(cables)) delete cables[k];
    fork.reset();
    fork.group.visible = true;
    S.out = [];
    S.steps = null;
    S.pc = 0;
    S.running = false;
    S.done = false;
    S.v = {};
    code.output("");
    code.status("");
    code.clearMarks();
  }
  const crate = (key, spec) => (crates[key] = mem.crate({ id: key, ...spec }));
  const cable = (key, from, to, opts) => (cables[key] = mem.cable(from, to, opts));
  const print = (line) => { S.out.push(line); code.output(S.out); };
  const flash = (text) => {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(flash.t);
    flash.t = setTimeout(() => (el.hidden = true), 2800);
    audio.miss();
  };

  // ------------------------------------------------------------------ forklift effects (fast = instant, for the bot)
  function fx(fast) {
    const liftFor = (c) => c.group.position.y + 0.04;
    return {
      fast,
      async visit(c) {
        if (!c) return;
        if (fast) { fork.group.position.set(c.group.position.x, 0, c.group.position.z + 0.9); fork.carriage.position.y = liftFor(c); return; }
        await fork.drive(anim, c.group.position, liftFor(c), 0.9);
      },
      async to(point, y = 0.3) {
        if (fast) { fork.group.position.set(point.x, 0, point.z + 0.9); fork.carriage.position.y = y; return; }
        await fork.drive(anim, point, y, 0.9);
      },
      async crash() {
        if (fast) { fork.group.position.set(mem.pitTop.x, -0.5, mem.pitTop.z); fork.body.rotation.set(1.0, 0, 0.45); audio.thump(); return; }
        await fork.drive(anim, mem.pitTop.clone().add(v3(0, 0, -1.75)), 0.3, 0.8);
        await fork.fall(anim, mem.pitTop.clone().add(v3(0, 0, -0.2)), { depth: 0.5, tilt: 1.0 });
        audio.thump();
        audio.buzz?.([40, 30, 80]);
      },
      async home() { if (fast) { fork.reset(); return; } await fork.home_(anim); },
      async wait(s) { if (!fast) await anim.wait(s); },
      async move(c, region, index) { await c.place(region, index, fast ? null : anim, 0.7); mem.refreshCables(); },
      async tween(dur, fn) { if (fast) { fn(1); return; } await anim.tween(dur, fn); },
    };
  }

  // ------------------------------------------------------------------ the program runner
  async function execute(mode, fast = false) {
    if (S.running || !S.L) return;
    S.grabbed = true;
    if (S.done) resetProgram();
    if (!S.steps) {
      code.clearMarks();
      S.L.marks?.();
      const errs = S.L.compile?.() ?? [];
      if (errs.length) {
        for (const e of errs) code.mark(e.line, "error", e.text);
        code.status(`clang: ${errs.length} error${errs.length > 1 ? "s" : ""}, nothing runs`, "error");
        code.output("(no program: it did not compile)", "error");
        S.v.compileErrors = errs.length;
        audio.miss();
        return;
      }
      S.steps = S.L.program();
      S.pc = 0;
      code.status("running", "");
      audio.commit();
    }
    S.running = true;
    if (phone() && !fast) code.collapse(true);
    const my = token;
    const F = fx(fast);
    try {
      while (S.pc < S.steps.length) {
        const st = S.steps[S.pc++];
        code.setActive(st.line);
        const r = await st.run(F);
        if (my !== token) return;
        if (r === "stop") { S.pc = S.steps.length; break; }
        if (mode === "step") break;
      }
    } finally {
      if (my === token) S.running = false;
    }
    if (S.pc >= S.steps.length) {
      S.done = true;
      code.setActive(null);
      S.L.end?.(F);
    }
  }
  function resetProgram(user) {
    if (!S.L) return;
    clearWorld();
    S.L.fresh();
    if (user) audio.detent();
  }

  // ------------------------------------------------------------------ shared builders
  function houseCrate(key, i, { index = i * 8, value, pointer = false, name } = {}) {
    return crate(key, { name: name ?? `NewRoad[${i}]`, type: "House · 32 B", cells: 8, padding: [1], value: value ?? `${i + 1} · ${M.POSTCODES[i]}`, region: "heap", index, pointer, color: C.house });
  }
  const wireMarks = () => {
    for (const [who, line] of Object.entries(M.Q4_WIRE_LINES)) {
      const t = S.choice.wires[who];
      const want = { Alice: 0, Bill: 1, Cherry: 2 }[who];
      if (t == null) code.mark(line, "warn", "drag the cable");
      else code.mark(line, t === want ? "ok" : "error", t === want ? `→ ${sh(mem.addrOf("heap", t * 8))}` : `cable on NewRoad[${t}]`);
    }
  };

  // ------------------------------------------------------------------ levels
  const LV = {
    // ---------------- Q1: the null pit
    Q1: {
      replay: () => (S.choice.fixed ? [crates.p, crates.i] : [crates.p]),
      fresh() {
        code.setSource(M.q1Source(S.choice.fixed), "q1.cpp");
        const p = crate("p", { name: "p", type: "uint32_t* · 8 B", bytes: 8, value: "?", region: "stack", index: 24, pointer: true, color: C.ptr });
        const i = crate("i", { name: "i", type: "uint32_t · 4 B", bytes: 4, value: "?", region: "stack", index: 27, color: C.int });
        cable("p", p, S.choice.fixed ? i : null, { grabbable: true });
        LV.Q1.marks();
      },
      marks() { if (S.choice.fixed) code.mark(M.Q1_FIX_LINE, "ok", "inserted: p holds i's address"); },
      program: () => [
        { line: 6, run: async (F) => { crates.p.setValue("0x0"); cables.p.retarget(null); await F.wait(0.35); } },
        { line: 7, run: async (F) => { crates.i.setValue(11); await F.wait(0.35); } },
        ...(S.choice.fixed ? [{ line: 8, run: async (F) => { cables.p.retarget(crates.i); crates.p.setValue(sh(crates.i.address)); audio.clack(0.3); await F.wait(0.35); } }] : []),
        { line: 9, run: async (F) => {
          await F.visit(crates.p);
          if (!S.choice.fixed) {
            S.v.deref = "SEGV";
            await F.crash();
            code.mark(9, "error", "SIGSEGV: write to address 0x0");
            code.status("Segmentation fault (core dumped)", "error");
            code.output("Segmentation fault: 11", "error");
            S.v.crashed = true;
            return "stop";
          }
          await F.visit(crates.i);
          crates.i.setValue(12);
          S.v.deref = 12;
          audio.clack(0.4);
        } },
        { line: 11, run: async (F) => { await F.visit(crates.i); print(String(crates.i.value)); } },
        { line: 13, run: async (F) => { await F.home(); code.status("exit code 0", "ok"); } },
      ],
      solve(sol) { if (sol.fixed) LV.Q1.setFixed(true); },
      setFixed(on) { S.choice.fixed = on; resetProgram(); },
      onDrop(t) { LV.Q1.setFixed(t === crates.i); if (t === crates.i) audio.unlockFx?.(); },
      key(k) { if (k === "c") { LV.Q1.setFixed(!S.choice.fixed); return true; } },
    },

    // ---------------- Q2: three ways to pass
    Q2: {
      replay: () => [crates.Num3],
      fresh() {
        code.setSource(M.q2Source(), "q2.cpp");
        code.slot(M.Q2_BODY_LINE, { options: M.Q2_BODIES, value: S.choice.body, placeholder: "choose the line that stores the answer…", onPick: (v) => { S.choice.body = v; S.grabbed = true; resetProgram(); } });
        for (const [k, idx] of [["Num1", 24], ["Num2", 25], ["Num3", 26]]) crate(k, { name: k, type: "uint32_t", bytes: 4, value: "?", region: "stack", index: idx, color: C.int });
      },
      compile() { if (S.choice.body == null) return [{ line: M.Q2_BODY_LINE, text: "pick a line first" }]; const r = M.runQ2({ body: S.choice.body }); return r.compiled ? [] : [{ line: r.errorLine, text: r.error }]; },
      program: () => {
        const r = M.runQ2({ body: S.choice.body });
        const [n1, n2, n3] = M.Q2_INPUT;
        return [
          { line: 7, run: async (F) => { await F.wait(0.2); } },
          { line: 8, run: async (F) => { print(`(stdin) ${n1} ${n2} ${n3}`); for (const [k, v] of [["Num1", n1], ["Num2", n2], ["Num3", n3]]) { await F.visit(crates[k]); crates[k].setValue(v); audio.clack(0.2); } } },
          { line: 9, run: async (F) => {
            S.v.frame = true;
            const a = crate("a", { name: "a", type: "copy of Num1", bytes: 4, value: n1, region: "stack", index: 24, color: C.int });
            a.group.position.copy(crates.Num1.group.position);
            await F.move(a, "stack", 16);
            crate("c", { name: "c", type: "uint32_t* · 8 B", bytes: 8, value: sh(crates.Num3.address), region: "stack", index: 18, pointer: true, color: C.ptr });
            cable("c", crates.c, crates.Num3);
            crates.Num2.rename("Num2 = b", "uint32_t · also called b");
            await F.wait(0.4);
          } },
          { line: M.Q2_BODY_LINE, run: async (F) => {
            const body = S.choice.body;
            await F.visit(crates.a);
            await F.visit(crates.Num2);
            await F.visit(crates.c);
            await F.visit(crates.Num3);
            if (body === 0) { await F.visit(crates.a); crates.a.setValue(r.sum, "hot"); }
            if (body === 1) { await F.visit(crates.Num2); crates.Num2.setValue(r.sum, "hot"); }
            if (body === 3) { await F.visit(crates.Num3); crates.Num3.setValue(r.sum, "hot"); }
            audio.clack(0.4);
            await F.wait(0.3);
          } },
          { line: 17, run: async (F) => {
            await F.tween(0.5, (k) => { for (const key of ["a", "c"]) crates[key].group.position.y = mem.shelfY(2) + k * 0.8; if (k > 0.98) cables.c?.setVisible(false); mem.refreshCables(); });
            cables.c?.remove(); delete cables.c;
            crates.a.remove(); crates.c.remove(); delete crates.a; delete crates.c;
            crates.Num2.rename("Num2", "uint32_t");
            for (const k of ["Num1", "Num2", "Num3"]) crates[k].setState("");
            S.v.frame = false;
            await F.wait(0.2);
          } },
          { line: 10, run: async (F) => { await F.visit(crates.Num3); print(`The answer is ${crates.Num3.value}`); S.v.num3 = crates.Num3.value; } },
          { line: 11, run: async (F) => { await F.home(); code.status("exit code 0", "ok"); } },
        ];
      },
      solve(sol) { S.choice.body = sol.body; resetProgram(); },
    },

    // ---------------- Q3: one crate, not six
    Q3: {
      replay: () => [crates.pHeap],
      fresh() {
        code.setSource(M.q3Source(S.choice.q3), "q3.cpp");
        const label = { alloc: "allocate", again: "line 10", print: "line 11", free: "line 12" };
        for (const k of ["alloc", "again", "print", "free"]) {
          code.slot(M.Q3_LINES[k], { options: M.Q3_OPTIONS[k].map((o) => o.trim() || "(blank line)"), value: S.choice.q3[k], placeholder: label[k], onPick: (v) => { if (v == null) return; S.choice.q3[k] = v; S.grabbed = true; resetProgram(); } });
        }
        crate("pHeap", { name: "pHeap", type: "uint32_t* · 8 B", bytes: 8, value: "?", region: "stack", index: 24, pointer: true, color: C.ptr });
        S.v.heapBytes = 0;
      },
      compile() { const r = M.runQ3(S.choice.q3); return r.errors; },
      program: () => {
        const q = S.choice.q3;
        const r = M.runQ3(q);
        const block = (prefix, n, at, init) => {
          const list = [];
          for (let k = 0; k < n; k++) list.push(crate(`${prefix}${k}`, { name: n === 1 ? "*pHeap" : `pHeap[${k}]`, type: "uint32_t", bytes: 4, value: init ?? "?", region: "heap", index: at + k, color: C.int }));
          return list;
        };
        return [
          { line: 7, run: async (F) => {
            const list = q.alloc === 0 ? block("h", 1, 0, 6) : block("h", 6, 0);
            S.v.heapBytes = list.length * 4;
            for (const c of list) { const y = c.group.position.y; c.group.position.y = y + 1.2; await F.tween(0.18, (k) => (c.group.position.y = y + 1.2 * (1 - k))); audio.clack(0.15); }
            crates.pHeap.setValue(sh(list[0].address));
            cable("pHeap", crates.pHeap, list[0]);
            await F.wait(0.3);
          } },
          { line: 8, run: async (F) => {
            await F.visit(crates.pHeap);
            const target = crates.h3;
            if (!target) {
              const ghost = crate("oob", { name: "pHeap[3]", type: "not yours", bytes: 4, value: 7, region: "heap", index: 3, color: 0x6b2a12 });
              await F.to(ghost.group.position, ghost.group.position.y + 0.04);
              ghost.setState("error");
              S.v.oob = true;
              code.mark(8, "error", "heap-buffer-overflow: 8 bytes past a 4-byte block");
              code.status("AddressSanitizer: heap-buffer-overflow (main.cpp:8)", "error");
              code.output("==ERROR: AddressSanitizer: heap-buffer-overflow\nWRITE of size 4 … in main main.cpp:8", "error");
              audio.thump();
              return "stop";
            }
            await F.visit(target);
            target.setValue(7);
            audio.clack(0.4);
          } },
          { line: 10, run: async (F) => {
            if (q.again !== 1) return;
            const list = block("g", 4, 8);
            S.v.heapBytes += 16;
            for (const c of list) { const y = c.group.position.y; c.group.position.y = y + 1.2; await F.tween(0.15, (k) => (c.group.position.y = y + 1.2 * (1 - k))); }
            cables.pHeap.retarget(list[0]);
            crates.pHeap.setValue(sh(list[0].address));
            for (let k = 0; k < 6; k++) crates[`h${k}`]?.setState("hot");
            crates.h0?.rename("pHeap[0]", "LEAKED: no pointer");
            await F.wait(0.3);
          } },
          { line: 11, run: async (F) => {
            const t = q.again === 1 ? crates.g3 : crates.h3;
            await F.visit(crates.pHeap);
            await F.visit(t);
            print(String(t.value));
          } },
          { line: 12, run: async (F) => {
            if (q.free !== 1) return;
            const prefix = q.again === 1 ? "g" : "h";
            const list = Object.keys(crates).filter((k) => new RegExp(`^${prefix}\\d$`).test(k)).map((k) => crates[k]);
            await F.tween(0.5, (k) => list.forEach((c) => c.group.scale.setScalar(1 - k * 0.98)));
            list.forEach((c) => { c.remove(); delete crates[Object.keys(crates).find((key) => crates[key] === c)]; });
            cables.pHeap?.remove(); delete cables.pHeap;
            crates.pHeap.setValue("dangling", "hot");
            S.v.heapBytes -= list.length * 4;
            audio.clack(0.3);
          } },
          { line: 13, run: async (F) => {
            await F.home();
            const leaked = Object.keys(crates).filter((k) => /^[hg]\d$/.test(k)).length;
            S.v.leakedBlocks = r.leaked;
            S.v.clean = r.clean;
            if (leaked) { code.status(`exit 0, but ${r.leaked} block${r.leaked > 1 ? "s" : ""} never freed (leak)`, "error"); for (const k of Object.keys(crates)) if (/^[hg]\d$/.test(k)) crates[k].setState("hot"); }
            else code.status(r.clean ? "exit code 0 · no leaks · in bounds" : "exit code 0", r.clean ? "ok" : "");
          } },
        ];
      },
      solve(sol) { S.choice.q3 = { ...sol.q3 }; resetProgram(); },
    },

    // ---------------- Q4: follow the cable
    Q4: {
      replay: () => [crates["Alice.Lives"], crates.H0],
      fresh() {
        code.setSource(M.SRC_Q4_EXCERPT.replace("@EXPR@", "@"), "q4.cpp · main()");
        code.slot(M.Q4_EXPR_LINE, { options: M.Q4_EXPRS.map((e) => `     << ${e} << endl;`), value: S.choice.expr, placeholder: "     << ??? << endl;", onPick: (v) => { if (v == null) return; S.choice.expr = v; S.grabbed = true; resetProgram(); } });
        const people = [["Alice", "Alice Wonderland"], ["Bill", "Bill Mee"], ["Cherry", "Cherry Tree"]];
        people.forEach(([who], s) => {
          crate(`${who}.Name`, { name: `${who}.Name`, type: "string · 24 B", bytes: 24, value: "", region: "stack", index: (3 - s) * 8, color: C.str });
          crate(`${who}.Lives`, { name: `${who}.Lives`, type: "House* · 8 B", bytes: 8, value: "?", region: "stack", index: (3 - s) * 8 + 6, pointer: true, color: C.ptr });
        });
        crate("NewRoad", { name: "NewRoad", type: "House* · 8 B", bytes: 8, value: sh(M.HEAP_BASE), region: "stack", index: 0, pointer: true, color: C.ptr });
        for (let i = 0; i < 3; i++) houseCrate(`H${i}`, i);
        cable("NewRoad", crates.NewRoad, crates.H0);
        for (const [who] of people) {
          const t = S.choice.wires[who];
          const c = cable(who, crates[`${who}.Lives`], t == null ? null : crates[`H${t}`], { grabbable: true });
          if (t == null) c.setVisible(false); else crates[`${who}.Lives`].setValue(sh(crates[`H${t}`].address));
          mem.grabCable(interaction, c, { enabled: () => S.L === LV.Q4 && canGrab() && cables[who] === c, targets: () => [crates.H0, crates.H1, crates.H2].filter(Boolean), allowNull: false, audio, onDrop: (h) => LV.Q4.wire(who, [crates.H0, crates.H1, crates.H2].indexOf(h)) });
        }
        wireMarks();
      },
      marks: wireMarks,
      wire(who, i) {
        S.grabbed = true;
        S.choice.wires[who] = i;
        resetProgram();
      },
      compile() {
        const e = [];
        if (S.choice.expr == null) e.push({ line: M.Q4_EXPR_LINE, text: "pick the expression" });
        else if (S.choice.expr !== 1) e.push({ line: M.Q4_EXPR_LINE, text: S.choice.expr === 3 ? "Alice is a Tenant, not a pointer: use ." : "Lives is a pointer: '.' can't reach Number" });
        return e;
      },
      program: () => {
        const names = { Alice: "Alice Wonderland", Bill: "Bill Mee", Cherry: "Cherry Tree" };
        const steps = [];
        for (const [who, line] of Object.entries(M.Q4_WIRE_LINES)) {
          steps.push({ line: line - 1, run: async (F) => { await F.visit(crates[`${who}.Name`]); crates[`${who}.Name`].setValue(names[who]); audio.clack(0.2); } });
          steps.push({ line, run: async (F) => {
            const t = S.choice.wires[who];
            const want = { Alice: 0, Bill: 1, Cherry: 2 }[who];
            if (t !== want) {
              code.mark(line, "error", t == null ? `${who}.Lives was never wired` : `your cable says &NewRoad[${t}]`);
              code.status(`line ${line}: wire ${who}.Lives to NewRoad[${want}] first`, "error");
              audio.miss();
              return "stop";
            }
            await F.visit(crates[`${who}.Lives`]);
          } });
        }
        steps.push({ line: 9, run: async (F) => { await F.visit(crates["Alice.Name"]); print(`Alice's name: ${crates["Alice.Name"].value}`); } });
        steps.push({ line: 11, run: async (F) => {
          await F.visit(crates["Alice.Lives"]);
          const h = crates[`H${S.choice.wires.Alice}`];
          await F.visit(h);
          S.v.number = S.choice.wires.Alice + 1;
          print(`House number where Alice lives: ${S.v.number}`);
          audio.clack(0.4);
        } });
        steps.push({ line: 11, run: async (F) => { await F.home(); code.status("exit code 0", "ok"); } });
        return steps;
      },
      solve(sol) { S.choice.wires = { ...sol.wires }; S.choice.expr = sol.expr; resetProgram(); },
      key(k) {
        const who = { a: "Alice", b: "Bill", c: "Cherry" }[k];
        if (!who) return;
        const t = S.choice.wires[who];
        LV.Q4.wire(who, t == null ? 0 : (t + 1) % 3);
        return true;
      },
    },

    // ---------------- Q4b: pack a House
    Q4b: {
      replay: () => [crates.H0, crates.H1, crates.H2],
      fresh() {
        code.setSource(`struct House
{
  uint32_t Number;   // 4 bytes, alignof 4
  string PostCode;   // ${M.PLATFORM.sizes.string} bytes, alignof ${M.PLATFORM.aligns.string}
};

for (int i = 0; i < NumHouses; ++i) {
  cout << sizeof(House) << endl;
  cout << &NewRoad[i] << endl;
}`, "q4b.cpp");
        crate("NewRoad", { name: "NewRoad", type: "House* · 8 B", bytes: 8, value: sh(M.HEAP_BASE), region: "stack", index: 24, pointer: true, color: C.ptr });
        if (S.choice.packed) { LV.Q4b.houses(); return; }
        crate("Number", { name: "Number", type: "uint32_t", bytes: 4, value: 1, region: "heap", index: 0, color: C.int });
        crate("PostCode", { name: "PostCode", type: "string · 24 B · align 8", bytes: 24, value: "LE11 3TU", region: "heap", index: 10, color: C.accent });
        cable("NewRoad", crates.NewRoad, crates.Number);
        S.v.offset = null;
        S.v.dragIndex = 10;
      },
      houses() {
        for (let i = 0; i < 3; i++) houseCrate(`H${i}`, i);
        cable("NewRoad", crates.NewRoad, crates.H0);
        S.v.offset = 8;
      },
      tryDrop(index) {
        const off = index * 4;
        const c = crates.PostCode;
        if (index === 2) {
          c.place("heap", 2);
          S.choice.packed = true;
          audio.clack(0.5);
          resetProgram();
          execute("run");
          return;
        }
        if (index === 1) flash("Offset 4 is not a multiple of 8. A std::string must start on an 8-byte boundary.");
        else if (index < 8) flash(`Offset ${off} leaves no room: a House is one shelf, 32 bytes at most here.`);
        else flash("NewRoad[0] starts at the first heap slot: put PostCode on that shelf.");
        c.place("heap", 10, anim, 0.4);
        S.v.dragIndex = 10;
      },
      program: () => {
        const steps = [];
        for (let i = 0; i < 3; i++) {
          steps.push({ line: 8, run: async (F) => { await F.visit(crates[`H${i}`]); print(`${M.houseLayout().size}`); S.v.sizeofShown = true; } });
          steps.push({ line: 9, run: async (F) => { print(M.hex(crates[`H${i}`].address)); S.v.lastAddr = crates[`H${i}`].address; audio.clack(0.2); await F.wait(0.15); } });
        }
        steps.push({ line: 10, run: async (F) => { await F.home(); S.v.loopDone = true; code.status("addresses step by 0x20 = 32 bytes", "ok"); } });
        return steps;
      },
      solve() { S.choice.packed = true; resetProgram(); },
      key(k) {
        if (S.choice.packed || !crates.PostCode) return;
        if (k === "arrowleft" || k === "arrowright") {
          const opts = [10, 1, 2];
          const i = opts.indexOf(S.v.dragIndex);
          S.v.dragIndex = opts[(i + (k === "arrowright" ? 1 : opts.length - 1)) % opts.length];
          crates.PostCode.place("heap", S.v.dragIndex);
          audio.detent();
          return true;
        }
        if (k === "enter" || k === " ") { LV.Q4b.tryDrop(S.v.dragIndex); return true; }
      },
    },

    // ---------------- Q4c: where the letters live
    Q4c: {
      replay: () => (crates.chars ? [crates.H2, crates.chars] : [crates.H2]),
      fresh() {
        len.group.visible = true;
        const n = S.choice.len;
        len.set(n / 30);
        const shown = textOf(n);
        code.setSource(`struct House { uint32_t Number; string PostCode; };

NewRoad[2].PostCode = "${shown}";   // ${n} bytes
cout << sizeof(House) << endl;
cout << NewRoad[2].PostCode.size() << endl;`, "q4c.cpp");
        crate("NewRoad", { name: "NewRoad", type: "House* · 8 B", bytes: 8, value: sh(M.HEAP_BASE), region: "stack", index: 24, pointer: true, color: C.ptr });
        houseCrate("H0", 0);
        houseCrate("H1", 1);
        const st = M.stringStorage(n);
        const h2 = houseCrate("H2", 2, { value: st.inline ? `3 · ${shown || "(empty)"}` : "3 · ptr → heap", pointer: !st.inline });
        cable("NewRoad", crates.NewRoad, crates.H0);
        if (!st.inline) {
          const cells = Math.ceil((n + 1) / 4);
          crate("chars", { name: "PostCode chars", type: `${n + 1} B on the heap`, cells, value: shown, region: "heap", index: 24, color: C.chars });
          cable("chars", h2, crates.chars);
        }
        S.v.inline = st.inline;
        S.v.len = n;
        code.mark(3, st.inline ? "ok" : "warn", st.inline ? "inside the House" : "separate heap block");
      },
      program: () => [
        { line: 3, run: async (F) => { await F.visit(crates.H2); } },
        { line: 4, run: async () => { print("32"); } },
        { line: 5, run: async (F) => { if (crates.chars) { await F.visit(crates.H2); await F.visit(crates.chars); } print(String(S.choice.len)); await F.home(); code.status("exit code 0", "ok"); } },
      ],
      setLen(n, quiet) {
        n = detentValue(n, 1, 0, 30);
        if (n === S.choice.len) return;
        const was = M.stringStorage(S.choice.len).inline;
        S.choice.len = n;
        S.grabbed = true;
        resetProgram();
        if (!quiet) { audio.detent(); if (was !== M.stringStorage(n).inline) audio.thump(); }
      },
      solve(sol) { LV.Q4c.setLen(sol.len, true); },
      key(k) {
        if (k === "arrowleft" || k === "arrowdown") { LV.Q4c.setLen(S.choice.len - 1); return true; }
        if (k === "arrowright" || k === "arrowup") { LV.Q4c.setLen(S.choice.len + 1); return true; }
      },
    },

    // ---------------- Q4d (boss): string vs char[N] on a microcontroller
    Q4d: {
      replay: () => [crates.H0, crates.H1, crates.H2],
      fresh() {
        const d = S.choice.decl;
        const isStr = d == null || d === 0;
        const assign = (i) => (isStr ? `NewRoad[${i}].PostCode = "${M.POSTCODES[i]}";` : `strcpy(NewRoad[${i}].PostCode, "${M.POSTCODES[i]}");`);
        code.setSource(`struct House
{
  uint32_t Number;
  @
};

House *NewRoad = new House[NumHouses];
${assign(0)}
${assign(1)}
${assign(2)}
cout << sizeof(House) << endl;`, "q4d.cpp · firmware");
        code.slot(4, { options: M.BOSS_DECLS.map((x) => `  ${x}`), value: d, placeholder: "  choose PostCode's type…", onPick: (v) => { if (v == null) return; S.choice.decl = v; S.grabbed = true; resetProgram(); } });
        crate("NewRoad", { name: "NewRoad", type: "House* · 8 B", bytes: 8, value: sh(M.HEAP_BASE), region: "stack", index: 24, pointer: true, color: C.ptr });
        const r = M.bossRun(d ?? 0);
        const cells = r.size / 4;
        for (let i = 0; i < 3; i++) {
          crate(`H${i}`, { name: `NewRoad[${i}]`, type: `House · ${r.size} B`, cells, padding: isStr ? [1] : [], value: `${i + 1} · ?`, region: "heap", index: i * cells, pointer: isStr && i === 2, color: C.house });
        }
        cable("NewRoad", crates.NewRoad, crates.H0);
        S.v.boss = r;
        S.v.sizeof = r.size;
        S.v.blocks = 1;
        S.v.overflow = 0;
      },
      compile() { return S.choice.decl == null ? [{ line: 4, text: "choose a type for PostCode" }] : []; },
      program: () => {
        const r = M.bossRun(S.choice.decl);
        const cells = r.size / 4;
        const steps = [{ line: 7, run: async (F) => { await F.visit(crates.H0); await F.wait(0.2); } }];
        M.POSTCODES.forEach((pc, i) => {
          steps.push({ line: 8 + i, run: async (F) => {
            const h = crates[`H${i}`];
            await F.visit(h);
            if (S.choice.decl === 0) {
              if (M.utf8Len(pc) > M.PLATFORM.ssoCapacity) {
                const need = M.utf8Len(pc) + 1;
                const c = crate("chars", { name: "PostCode chars", type: `${need} B · new block`, cells: Math.ceil(need / 4), value: pc, region: "heap", index: 24, color: C.chars });
                cable("chars", h, c);
                h.setValue(`${i + 1} · ptr → heap`);
                S.v.blocks = 2;
                code.mark(8 + i, "warn", "hidden heap allocation");
              } else h.setValue(`${i + 1} · ${pc}`);
              return;
            }
            if (r.fits[i]) { h.setValue(`${i + 1} · ${pc}`); code.mark(8 + i, "ok", `${r.need[i]} B into char[${M.BOSS_N[S.choice.decl]}]`); return; }
            h.setValue(`${i + 1} · ${pc}`, "error");
            S.v.overflow += r.overflow[i];
            code.mark(8 + i, "error", `${r.need[i]} B into char[${M.BOSS_N[S.choice.decl]}]: ${r.overflow[i]} B overflow`);
            if (i === 2) {
              const at = 3 * cells;
              const room = mem.perShelf - (at % mem.perShelf);
              const spill = Math.max(1, Math.min(room, Math.ceil((r.overflow[i] + (r.size - 4 - M.BOSS_N[S.choice.decl])) / 4)));
              const c = crate("spill", { name: "past the end", type: "not yours", cells: spill, value: `+${r.overflow[i]} B`, region: "heap", index: at, color: 0x6b2a12 });
              c.setState("error");
            }
            audio.thump();
          } });
        });
        steps.push({ line: 11, run: async (F) => {
          print(String(r.size));
          await F.home();
          S.v.ran = true;
          if (S.choice.decl === 0) code.status("works, but needed a 2nd heap block at run time", "error");
          else if (!r.ok) { code.status("AddressSanitizer: heap-buffer-overflow", "error"); code.output(`${r.size}\n==ERROR: AddressSanitizer: heap-buffer-overflow`, "error"); }
          else code.status(`fits: ${r.arrayBytes} B, one allocation, no overflow`, "ok");
        } });
        return steps;
      },
      solve(sol) { S.choice.decl = sol.decl; resetProgram(); },
    },
  };

  const phone = () => matchMedia("(max-width: 760px)").matches;
  const canGrab = () => !S.running && (S.phase === "play" || S.phase === "reveal");

  // ------------------------------------------------------------------ direct manipulation
  // Q1: p's cable (registered once; the cable object is rebuilt per run, so register its parts lazily)
  let q1Reg = null;
  function registerQ1() {
    if (q1Reg === cables.p) return;
    q1Reg = cables.p;
    mem.grabCable(interaction, cables.p, { enabled: () => S.L === LV.Q1 && canGrab() && q1Reg === cables.p, targets: () => [crates.i].filter(Boolean), audio, onDrop: (t) => LV.Q1.onDrop(t) });
  }
  // Q4b: drag the orange PostCode crate along the shelves
  const shelfPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 1.6 - 0.3);
  const hit = new THREE.Vector3();
  let dragReg = null;
  function registerPostCode() {
    const c = crates.PostCode;
    if (!c || dragReg === c) return;
    dragReg = c;
    interaction.register(c.meshes, {
      enabled: () => S.L === LV.Q4b && canGrab() && dragReg === crates.PostCode && !S.choice.packed,
      onDragStart: (e, rc) => {
        S.grabbed = true;
        // keep the grab offset: the crate moves relative to where it was picked up
        const at = rc.ray.intersectPlane(shelfPlane, hit) ? hit.clone() : c.group.position.clone();
        return { dx: at.x - c.group.position.x, dy: at.y - c.group.position.y };
      },
      onDrag: ({ ray, data }) => {
        if (!ray.ray.intersectPlane(shelfPlane, hit)) return;
        hit.x -= data.dx;
        hit.y -= data.dy;
        const r = mem.regions.get("heap");
        const col = Math.round((hit.x - r.x0) / mem.cellW - 3);
        const shelf = Math.max(0, Math.min(3, Math.round((hit.y - 0.32) / 0.78)));
        const idx = shelf * 8 + Math.max(0, Math.min(2, col));
        if (idx !== S.v.dragIndex) { S.v.dragIndex = idx; c.place("heap", idx); audio.detent(); }
      },
      onDragEnd: () => LV.Q4b.tryDrop(S.v.dragIndex),
    });
  }
  interaction.register(len.grab, {
    enabled: () => S.L === LV.Q4c && canGrab(),
    onDragStart: () => { S.grabbed = true; return {}; },
    onDrag: ({ ray }) => { const k = len.fromRay(ray); if (k != null) LV.Q4c.setLen(Math.round(k * 30)); },
  });

  // ------------------------------------------------------------------ HUD hint
  const hint = h("div", { class: "tag grab" }, "");
  overlay.append(hint);
  const frameTags = [h("div", { class: "tag" }, "main() frame"), h("div", { class: "tag" }, "AddNumbers() frame")];
  frameTags.forEach((t) => overlay.append(t));

  const frame = () => refocus();

  function setLevel(l) {
    S.lvl = l;
    S.L = l ? LV[l.id] : null;
    S.phase = null;
    S.grabbed = false;
    S.choice = { fixed: false, body: null, q3: { alloc: 0, again: 0, print: 0, free: 0 }, wires: {}, expr: null, packed: false, len: 8, decl: null };
    len.group.visible = false;
    clearWorld();
    code.show(!!l);
    code.collapse(false);
    frame(l);
    hint.hidden = true;
    if (!l) return;
    S.L.fresh();
  }

  const world = {
    S, mem, code, crates, cables, len,
    setLevel,
    get choice() { return S.choice; },
    reveal(on) {
      if (!on || !S.L?.replay) return;
      // replay the level's key dereference at the reveal's ×0.25
      const my = token;
      const F = fx(false);
      (async () => {
        await anim.wait(0.3);
        for (const c of S.L.replay()) { if (my !== token || !c) return; await F.visit(c); }
        if (my === token) await F.home();
      })();
    },
    redraw() {
      plate.redrawPlate();
      mem.redraw();
      len.redraw();
    },
    anchors() {
      const out = [];
      const show = S.lvl && !S.grabbed && S.phase === "play" && S.lvl.hintText;
      hint.hidden = !show;
      if (show) {
        hint.textContent = S.lvl.hintText;
        const at = S.lvl.hintAt?.(world);
        if (at) out.push({ el: hint, at: () => at });
        else hint.hidden = true;
      }
      const frames = S.lvl?.id === "Q2" && crates.Num1;
      frameTags[0].hidden = !frames;
      frameTags[1].hidden = !(frames && S.v.frame);
      if (frames) out.push({ el: frameTags[0], at: () => mem.cellPos("stack", 24).add(v3(-0.1, 0.62, 0.3)) });
      if (frames && S.v.frame) out.push({ el: frameTags[1], at: () => mem.cellPos("stack", 16).add(v3(-0.1, 0.62, 0.3)) });
      return out;
    },
    onKey(e, phase) {
      if (phase !== "play" && phase !== "reveal") return;
      if (e.target.closest?.("select, button")) return;
      const k = e.key.toLowerCase();
      if (k === "r" || (k === "enter" && S.L !== LV.Q4b)) { execute("run"); e.preventDefault(); return; }
      if (k === "s") { execute("step"); return; }
      if (k === "backspace") { resetProgram(true); return; }
      if (!S.running && S.L?.key?.(k)) { S.grabbed = true; e.preventDefault(); }
    },
    step(dt, dtReal, t, phase) {
      if (phase !== S.phase && phone() && S.lvl) {
        frame(S.lvl, phase);
        code.show(phase !== "reveal");
        code.collapse(phase === "play" && !S.lvl.phoneCodeOpen);
      }
      S.phase = phase;
      anim.update(dt);
      if (S.L === LV.Q1 && cables.p) registerQ1();
      if (S.L === LV.Q4b && crates.PostCode) registerPostCode();
      const beacon = fork.beacon;
      if (beacon) beacon.visible = S.running ? Math.sin(t * 12) > -0.2 : true;
    },
    solve(sol) {
      S.grabbed = true;
      S.L.solve(sol);
      execute("run", true);
    },
  };
  return world;
}

// ------------------------------------------------------------------ Toolbox
const equations = [
  { id: "deref", f: "*p  →  the value at the address in p", source: "Q1", live: (w) => (w.crates.p ? `p = ${w.crates.p.value}` : "") },
  { id: "pass", f: "f(T a) copy · f(T& b) alias · f(T* c) address", source: "Q2", live: () => "" },
  { id: "new", f: "new T(v) → one T = v · new T[n] → n Ts · delete[]", source: "Q3", live: () => "" },
  { id: "arrow", f: "p->m  ≡  (*p).m", source: "Q4", live: () => "" },
  { id: "layout", f: "offset → next multiple of alignof · &a[i] = a + i × sizeof(T)", source: "Q4b", live: () => "House: 4 + 4 pad + 24 = 32 B · NewRoad[2] at +0x40" },
  { id: "sso", f: "sizeof(string) fixed · > 22 chars → heap (libc++)", source: "Q4c", live: () => "" },
  { id: "chars", f: "char[N] holds N − 1 characters + '\\0'", source: "Q4d", live: () => "" },
];

// ------------------------------------------------------------------ Levels
const at = (key, dy = 0.75) => (w) => w.crates[key]?.group.position.clone().add(new THREE.Vector3(0, dy, 0.2));
const levels = [
  {
    id: "Q1", focus: { min: [-4.8, 0, -2.1], max: [0.8, 3.8, 2.9] }, anchor: "Q1", mechanic: "detective", source: "Tutorial · Q1", title: "The null pit",
    brief: "p is a pointer: a crate that holds an address, drawn as a cable. Every *p sends the forklift down that cable. This program crashes. Find the line, then fix it.",
    hintText: "Drag the orange cable", hintAt: (w) => w.cables.p?.tip.position.clone().add(new THREE.Vector3(0, 0.2, 0)),
    setup: () => {},
    readouts: ["starp", "pval", "ival"],
    predict: { type: "choice", prompt: "Which line kills this program?", options: ["Line 6: uint32_t* p = 0;", "Line 9: *p = 12;", "Line 11: cout << *p", "None. It prints 12."], answer: 1 },
    goal: {
      text: "Make the program print 12",
      instructions: "Press Run (or R) and watch the forklift follow p. Then drag the orange end of p's cable out of the pit and onto i (key C) and run it again.",
      check: (w) => w.S.done && w.choice.fixed && w.S.out.join() === "12",
      status: (w) => (w.S.v.crashed ? "crashed at line 9" : w.S.done ? `printed ${w.S.out.join(" ")}` : w.choice.fixed ? "p = &i inserted on line 8" : "p points into the pit"),
      hold: 0.6,
    },
    hint: "p = 0 is fine: it just stores the address 0x0. The crash comes when the forklift drives to 0x0. Give p a real address.",
    reveal: {
      title: "*p means: go to the address in p",
      body: "uint32_t* p = 0; is legal: it stores the address 0x0 (nullptr) and nothing happens. Line 9, *p = 12, sends the forklift to address 0x0, which no program may touch, and the OS kills the process (SIGSEGV). Adding p = &i; on line 8 gives p the address of i, so *p = 12 writes 12 into i and line 11 prints 12.",
      equations: [{ f: "p = &i;  →  p holds i's address", live: (w) => `p = ${w.crates.p?.value ?? "?"}, i = ${w.crates.i?.value ?? "?"}` }, { f: "*p = 12;  →  write 12 at that address" }],
      note: "Answer box check: \"line 9\" is right (counting from #include, as the box does) and \"before line 9 add p = &i\" is right; it needs a semicolon. Checked with clang + AddressSanitizer: SEGV on address 0x000000000000 at main.cpp:9.",
      unlock: "deref",
      tags: [{ text: "0x0 · nullptr", at: (w) => w.mem.pitTop.clone().add(new THREE.Vector3(0, 0.3, 0)) }],
    },
    recall: { q: "int* q = nullptr; on its own…", options: ["is fine until something dereferences q", "crashes immediately", "does not compile"], answer: 0 },
    solution: { fixed: true },
  },
  {
    id: "Q2", focus: { min: [-4.8, 0, -2.1], max: [-0.4, 4.2, 0.2] }, phoneCodeOpen: true, anchor: "Q2", mechanic: "build", source: "Tutorial · Q2", title: "Three ways in",
    brief: "AddNumbers gets Num1 by value (a), Num2 by reference (b) and Num3 by address (c). Its job: add the three and hand the answer back in Num3. Input is 3 4 5.",
    hintText: "Choose line 16 in the code", hintAt: () => null,
    setup: () => {},
    readouts: ["num3", "num1", "num2"],
    predict: { type: "choice", prompt: "If line 16 is a = a + b + *c; what does main print?", options: ["The answer is 12", "The answer is 5", "It doesn't compile"], answer: 1 },
    goal: {
      text: "Make main print \"The answer is 12\"",
      instructions: "Pick the body of AddNumbers on line 16, then Run. Try the wrong ones too: watch which crate the forklift writes into, and what happens to it at the closing brace.",
      check: (w) => w.S.done && w.S.out.includes("The answer is 12"),
      status: (w) => (w.S.done ? w.S.out[w.S.out.length - 1] : w.choice.body == null ? "line 16 is empty" : `line 16: ${["a", "b", "c", "*c"][w.choice.body]} = …`),
      hold: 0.6,
    },
    hint: "Only one parameter is the address of Num3. Write through it with *.",
    reveal: {
      title: "Copy, alias, address",
      body: "a is a fresh crate in AddNumbers' frame holding a copy of Num1; writing it changes nothing in main, and it vanishes at the closing brace. b is not a crate at all: it is a second name painted on Num2. c holds Num3's address, so *c = a + b + *c drives down the cable and writes 12 into Num3.",
      equations: [{ f: "*c = a + b + *c;", live: (w) => `Num3 = ${w.crates.Num3?.value ?? "?"}` }, { f: "a: copy · b: same crate as Num2 · c: Num3's address" }],
      note: "Answer box check: AddNumbers(Num1, Num2, &Num3) and the display line are right. The cin lines use num1, but the variable is Num1 (C++ is case-sensitive), and the sheet's skeleton has no using namespace std;, so clang rejects cin, cout and endl without std::.",
      unlock: "pass",
    },
    recall: { q: "void f(int x) { x = 99; } leaves the caller's variable…", options: ["Unchanged", "Set to 99", "Undefined"], answer: 0 },
    solution: { body: 3 },
  },
  {
    id: "Q3", focus: { min: [-4.8, 0, -2.1], max: [4.8, 4.2, 2.9] }, phoneCodeOpen: true, anchor: "Q3", mechanic: "detective", source: "Tutorial · Q3", title: "One crate, not six",
    brief: "This program is meant to make room for some numbers on the heap, store 7 in element 3 and print it. Press Run first: does it even compile?",
    hintText: "Press Run, then fix the orange lines", hintAt: () => null,
    setup: () => {},
    readouts: ["heapBytes", "phval", "leaks"],
    predict: { type: "choice", prompt: "uint32_t *pHeap = new uint32_t(6); gives pHeap…", options: ["six uint32_t slots", "one uint32_t holding 6", "six slots, all 0", "a 6-byte block"], answer: 1 },
    goal: {
      text: "Compile, print 7, stay in bounds, free the memory",
      instructions: "Run it as written first. Then fix it with the four orange lines and Run again. The forklift will show you each problem: a write past the end, a block nobody points at.",
      check: (w) => w.S.done && w.S.v.clean === true,
      status: (w) => (w.S.v.compileErrors && !w.S.steps ? `${w.S.v.compileErrors} compile errors` : w.S.v.oob ? "wrote past the end of the block" : w.S.done ? (w.S.v.clean ? "clean run" : w.S.v.leakedBlocks ? "leaked memory" : "ran") : "not run yet"),
      hold: 0.6,
    },
    hint: "( ) gives one element its value; [ ] gives you a number of elements. A pointer can only be declared once, and pHeap[3] is already a uint32_t.",
    reveal: {
      title: "( ) is a value, [ ] is a count",
      body: "new uint32_t(6) is ONE uint32_t initialised to 6, so pHeap[3] = 7 writes to bytes 12–15 of a 4-byte block, 8 bytes past its end (AddressSanitizer: heap-buffer-overflow at line 8). new uint32_t[6] makes six. Line 10 declared pHeap a second time, and *pHeap[3] put * in front of a uint32_t: two compile errors. Whatever you new[] you delete[].",
      equations: [{ f: "new uint32_t(6)  →  1 element = 6" }, { f: "new uint32_t[6]  →  6 elements · delete[] pHeap" }],
      note: "Answer box check: \"the program will not compile\" is right (clang: redefinition of 'pHeap' on line 10, indirection requires pointer operand on line 11). The problems box was left empty: these four are the answer.",
      unlock: "new",
    },
    recall: { q: "new int(10) allocates…", options: ["one int holding 10", "ten ints", "10 bytes"], answer: 0 },
    solution: { q3: M.Q3_SOLUTION },
  },
  {
    id: "Q4", focus: { min: [-4.8, 0, -2.1], max: [4.8, 4.2, 0.4] }, anchor: "Q4", mechanic: "build", source: "Tutorial · Q4", title: "Follow the cable",
    brief: "Alice, Bill and Cherry are Tenants on the stack: a name and a House* called Lives. The three Houses are on the heap. You do lines 3, 5 and 7 by hand, then pick how line 11 reaches Alice's house number.",
    hintText: "Drag an orange plug onto a House", hintAt: (w) => w.crates["Alice.Lives"]?.plugPos().add(new THREE.Vector3(0, 0.25, 0)),
    setup: () => {},
    readouts: ["number", "alives", "newroad"],
    predict: { type: "choice", prompt: "After line 3, Alice.Lives holds…", options: ["a copy of her House", "the address of NewRoad[0]", "the number 1", "nothing until it is printed"], answer: 1 },
    goal: {
      text: "Wire all three tenants, then print Alice's house number",
      instructions: "Drag each orange plug onto the House its line names (keys A, B, C). Choose line 11, then Run. The forklift reads Alice.Lives, follows the cable and reads Number.",
      check: (w) => w.S.done && w.S.v.number === 1,
      status: (w) => `${Object.keys(w.choice.wires).length}/3 wired${w.S.done ? ` · printed ${w.S.v.number}` : ""}`,
      hold: 0.6,
    },
    hint: "Lives is a pointer, so use -> to reach a member of the House it points at. Alice herself is not a pointer.",
    reveal: {
      title: "A pointer to a struct: follow it with ->",
      body: "Alice.Lives is 8 bytes holding the address of NewRoad[0], not a copy of the House. Alice.Lives->Number means: go to that address, then read the Number field, the same as (*Alice.Lives).Number. A '.' after a pointer, or a '->' after a plain struct, does not compile.",
      equations: [{ f: "Alice.Lives->Number  ≡  (*Alice.Lives).Number", live: (w) => `Alice.Lives = ${w.crates["Alice.Lives"]?.value ?? "?"}` }],
      note: "Answer box check: the student's Alice.Lives->Number, sizeof(House) and &NewRoad[i] code compiles and is right. sizeof(Tenant) here is 32 B: a 24 B string and an 8 B pointer.",
      unlock: "arrow",
      tags: [{ text: "Alice.Lives", at: at("Alice.Lives") }, { text: "NewRoad[0]", at: at("H0") }],
    },
    recall: { q: "h is a House*. Which reads its Number?", options: ["h.Number", "h->Number", "*h.Number", "&h.Number"], answer: 1 },
    solution: { wires: { Alice: 0, Bill: 1, Cherry: 2 }, expr: 1 },
  },
  {
    id: "Q4b", focus: { min: [-2.0, 0, -2.1], max: [4.8, 4.2, 0.4] }, anchor: "Q4b", mechanic: "build", source: "Tutorial · Q4b", title: "Foam",
    brief: `A House is a uint32_t Number (4 bytes) and a std::string PostCode (24 bytes on ${M.PLATFORM.short}). Number is already on the shelf. Pack PostCode into NewRoad[0].`,
    hintText: "Drag the orange PostCode crate", hintAt: at("PostCode", 0.8),
    setup: () => {},
    readouts: ["sizeof", "offset", "stride"], hide: ["sizeof"],
    predict: { type: "number", prompt: "sizeof(House) is… (4-byte uint32_t + 24-byte string)", unit: "bytes", min: 0, max: 64, step: 1, start: 28, answer: 32, tolerance: 0 },
    goal: {
      text: "Pack PostCode into NewRoad[0]",
      instructions: "Drag the orange crate onto the first heap shelf, next to Number (or arrows + Enter). The compiler has rules about where it may start.",
      check: (w) => w.S.v.loopDone === true,
      status: (w) => (w.choice.packed ? (w.S.v.loopDone ? "printed 3 sizes and 3 addresses" : "printing…") : "PostCode not packed"),
      hold: 0.6,
    },
    hint: "A std::string's alignment is 8: it must start at an offset that is a multiple of 8.",
    reveal: {
      title: "Padding: 4 + 4 + 24 = 32",
      body: "A std::string must start on an 8-byte boundary, so it can't sit at offset 4. The compiler leaves 4 empty bytes (the foam) and puts PostCode at offset 8: sizeof(House) is 32, not 28. In an array the next House starts straight after, so the loop prints addresses 0x20 apart.",
      equations: [{ f: "sizeof(House) = 4 + 4 (pad) + 24 = 32" }, { f: "&NewRoad[i] = NewRoad + i × 32", live: (w) => (w.S.v.lastAddr ? `last printed ${M.hex(w.S.v.lastAddr)}` : "") }],
      note: `Measured with ${M.PLATFORM.name}: sizeof(std::string) = 24, alignof = 8, offsetof(House, PostCode) = 8, real addresses 0x20 apart. On GCC's libstdc++ (not measured here) a string is 32 bytes and a House 40. The warehouse's base addresses are illustrative; the offsets and strides are real.`,
      unlock: "layout",
      tags: [{ text: "4 B padding", at: (w) => w.mem.cellPos("heap", 1).add(new THREE.Vector3(0, 0.75, 0.2)) }],
    },
    recall: { q: "struct S { char c; double d; }; on a 64-bit PC, sizeof(S) is…", options: ["9", "12", "16", "8"], answer: 2 },
    solution: { packed: true },
  },
  {
    id: "Q4c", focus: { min: [0.4, 0, -2.1], max: [4.8, 4.2, 0.6] }, anchor: "Q4c", mechanic: "tune", source: "Tutorial · Q4b–c", title: "Where the letters live",
    brief: "The sheet's third postcode, \"I don’t know what it is\", is 25 bytes. A House is 32. So where do the letters go? Slide the length of NewRoad[2].PostCode and watch.",
    hintText: "Drag the orange slider", hintAt: (w) => w.len.anchor(),
    setup: () => {},
    readouts: ["len", "sizeofMini", "inside"],
    predict: { type: "choice", prompt: "Give NewRoad[2] a 25-byte postcode. sizeof(House) becomes…", options: ["32", "36", "53", "56"], answer: 0 },
    goal: {
      text: "Find the longest postcode that still lives inside the House",
      instructions: "Drag the orange slider (or arrow keys). Watch the House crate and the heap shelf behind it. Stop on the longest length that stays inside.",
      check: (w) => w.S.v.len === M.PLATFORM.ssoCapacity,
      status: (w) => `${w.S.v.len} bytes · ${w.S.v.inline ? "inside the House" : "in a separate heap block"}`,
      hold: 1.0,
    },
    hint: "Go past 20 slowly. Watch for the moment a cable appears.",
    reveal: {
      title: "A string is a fixed-size handle",
      body: "A std::string is always 24 bytes here, whatever it holds. Short text (up to 22 bytes in libc++) is stored inside those 24 bytes. Longer text moves to its own heap block and the string keeps a pointer to it. So sizeof(House) stays 32, and the sheet's 25-byte postcode costs a second heap allocation.",
      equations: [{ f: "sizeof(House) = 32 for any text", live: (w) => `${w.S.v.len} B → ${w.S.v.inline ? "inside" : "heap block"}` }],
      note: "Short-string capacity is a library detail: 22 bytes in libc++ (clang, macOS), measured here (22 characters stay inside the House, 23 move out). GCC's libstdc++ and MSVC keep 15 (not measured here).",
      unlock: "sso",
    },
    recall: { q: "A struct holds a std::string. Storing a much longer string in it makes sizeof(struct)…", options: ["larger", "unchanged", "smaller"], answer: 1 },
    solution: { len: 22 },
  },
  {
    id: "Q4d", focus: { min: [0.4, 0, -2.1], max: [4.8, 4.2, 0.6] }, phoneCodeOpen: true, anchor: "Q4c–d", mechanic: "boss", boss: true, source: "Tutorial · Q4c–d", title: "Ship it to the microcontroller",
    brief: "The firmware rule: one heap allocation at start-up and nothing after, and every postcode must fit with its '\\0'. Choose PostCode's type, run it, and judge the student's answer to Q4d.",
    hintText: "Choose line 4's type", hintAt: () => null,
    setup: () => {},
    readouts: ["sizeof", "blocks", "overflow"],
    predict: { type: "choice", prompt: "The student wrote: char arrays \"guarantee a fixed size and therefore avoid overflow\". That is…", options: ["Right: fixed size means no overflow", "Half right: fixed size yes, but overflow is exactly their risk", "Wrong: char arrays grow like strings"], answer: 1 },
    goal: {
      text: "One allocation, no overflow, all three postcodes stored",
      instructions: "Pick PostCode's type on line 4, Run, and watch the heap. Try each one: a string, and char arrays of 4, 12 and 28.",
      check: (w) => w.S.done && w.S.v.ran && w.choice.decl === 3,
      status: (w) => (w.S.done ? (w.choice.decl === 0 ? "a hidden 2nd heap block" : w.S.v.overflow ? `${w.S.v.overflow} B overflow` : "clean") : w.choice.decl == null ? "choose a type" : `sizeof(House) = ${w.S.v.sizeof}`),
      hold: 0.8,
    },
    hint: "The longest postcode is 25 bytes plus '\\0'. Pick the smallest array that holds 26.",
    reveal: {
      title: "Fixed size is the win; overflow is the price",
      body: "char PostCode[28] keeps the text inside each House: 32 bytes, one allocation, a size that never changes. That predictability is why firmware likes char arrays. But they don't avoid overflow, they are where it happens: strcpy into char[4] or char[12] runs past the end. std::string can't overflow; its cost is the hidden heap block for long text, which can fail or fragment a small heap.",
      equations: [{ f: "char[N] holds N − 1 characters + '\\0'", live: (w) => `sizeof(House) = ${w.S.v.sizeof} B` }, { f: "string: 32 B + heap block when > 22 chars" }],
      note: "Answer box check (Q4d): \"dynamic, abstracts allocation, simpler\" is right; \"memory is limited, char arrays guarantee a fixed size\" is right; \"and therefore avoid overflow\" is wrong. All four types were compiled and run with clang + AddressSanitizer.",
      unlock: "chars",
    },
    recall: { q: "char code[8]; strcpy(code, \"LE11 3TU\"); …", options: ["fits exactly", "overflows by one byte (the '\\0')", "doesn't compile"], answer: 1 },
    solution: { decl: 3 },
  },
];

const readouts = [
  { key: "starp", label: "*p", unit: "*p", big: true, get: (w) => w.S.v.deref ?? "—", format: (v) => String(v) },
  { key: "num3", label: "Num3", unit: "Num3", big: true, get: (w) => w.crates.Num3?.value ?? "—", format: (v) => String(v) },
  { key: "heapBytes", label: "heap", unit: "BYTES ON THE HEAP", big: true, get: (w) => w.S.v.heapBytes ?? 0, format: (v) => String(v) },
  { key: "number", label: "Number", unit: "ALICE.LIVES->NUMBER", big: true, get: (w) => w.S.v.number ?? "—", format: (v) => String(v) },
  { key: "sizeof", label: "sizeof", unit: "sizeof(House) · BYTES", big: true, get: (w) => (w.S.lvl?.id === "Q4b" ? (w.choice.packed ? 32 : "—") : w.S.v.sizeof ?? 32), format: (v) => String(v) },
  { key: "sizeofMini", label: "sizeof(House)", unit: "B", get: () => 32, format: String },
  { key: "len", label: "length", unit: "BYTES OF TEXT", big: true, get: (w) => w.S.v.len ?? 0, format: (v) => String(v) },
  { key: "pval", label: "p holds", get: (w) => w.crates.p?.value ?? "?", format: String },
  { key: "ival", label: "i", get: (w) => w.crates.i?.value ?? "?", format: (v) => String(v) },
  { key: "num1", label: "Num1", get: (w) => w.crates.Num1?.value ?? "?", format: (v) => String(v) },
  { key: "num2", label: "Num2", get: (w) => w.crates.Num2?.value ?? "?", format: (v) => String(v) },
  { key: "phval", label: "pHeap", get: (w) => w.crates.pHeap?.value ?? "?", format: String },
  { key: "leaks", label: "leaked", unit: "blocks", get: (w) => w.S.v.leakedBlocks ?? 0, format: String },
  { key: "alives", label: "Alice.Lives", get: (w) => w.crates["Alice.Lives"]?.value ?? "?", format: String },
  { key: "newroad", label: "NewRoad", get: () => M.hex(M.HEAP_BASE), format: String },
  { key: "offset", label: "PostCode at", unit: "B", get: (w) => (w.choice.packed ? 8 : "?"), format: String },
  { key: "stride", label: "stride", unit: "B", get: (w) => (w.choice.packed ? 32 : "?"), format: String },
  { key: "inside", label: "letters", get: (w) => (w.S.v.inline ? "inside" : "heap"), format: String },
  { key: "blocks", label: "heap blocks", get: (w) => w.S.v.blocks ?? 1, format: String },
  { key: "overflow", label: "overflow", unit: "B", get: (w) => w.S.v.overflow ?? 0, format: String },
];

playable({
  id: "memory-warehouse",
  serial: SERIAL,
  title: "Memory Warehouse",
  source: "WSC318 Tutorial · Pointers and structures",
  subtitle: "A C++ tutorial on pointers, heap allocation and structs, played in a warehouse where every byte has an address, every pointer is a cable and a forklift does every dereference. Every claim was compiled and run with clang.",
  camera: CAMERA,
  verified,
  readouts,
  equations,
  levels,
  build,
});
