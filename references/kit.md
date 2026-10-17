# Kit API

Everything a game imports. Paths are relative to an example folder (`examples/<name>/main.mjs`), so imports look like `../../kit/core/...`. `three` and `rapier` resolve to the vendored copies; import `three` as `import * as THREE from "three"`.

## 1. A game file

```js
import { playable } from "../../kit/core/game.mjs";
import verified from "./verified.json";            // written by the truth gate

playable({
  id: "my-game", serial: "PLAYABLE-02", title: "Memory Warehouse",
  source: "Tutorial · Pointers and structures", subtitle: "One sentence for the map.",
  camera: { position: [x, y, z], target: [x, y, z], fov: 32, portraitFov: 46, maxDistance: 26 },
  verified, readouts, equations, levels,
  async build(ctx) { ...; return world; },
});
```

`build(ctx)` receives `{ stage, B, audio, interaction, THREE, h, overlay, hud }` and returns the **world** object. The engine calls these world members when present:

| Member | Called |
|---|---|
| `setLevel(level \| null)` | entering a level (or the map); reset ALL state here |
| `step(dt, dtReal, t, phase)` | every frame and every bot tick; advance sims/animations from `dt` only (never wall-clock timers) |
| `reveal(on)` | reveal starts/ends (cutaway, overlays) |
| `redraw()` | after fonts load and on demand; redraw canvas textures |
| `anchors()` | returns `[{ el, at: () => Vector3 }]` to pin DOM tags to 3D points |
| `onKey(event, phase)` | keyboard controls (every grab must have a key equivalent) |
| `solve(solution)` | the bot applies `level.solution` instantly |

## 2. Levels

```js
{
  id: "Q3", anchor: "Q3", mechanic: "tune" | "predict" | "fermi" | "break" | "build" | "pilot" | "trace" | "detective" | "boss",
  boss: false, source: "Tutorial 1.1 · Q3", title: "Hit the operating point",
  brief: "What the student is about to do and why.",
  setup: (world) => { ... },                      // configure the world for this level
  readouts: ["rpm", "V"], hide: ["eff"],          // keys from def.readouts; hidden ones show ?? until the reveal
  predict: { type: "number", prompt, unit, min, max, step, start, answer, tolerance } |
           { type: "choice", prompt, options: [...], answer: index },
  goal: { text, instructions, check: (w) => bool, status: (w) => string, hold: 1.5, manual: "Button label" },
  hint: "Costs a star.",
  reveal: { title, body, equations: [{ f: "V = K·ω + I·Rₐ", live: (w) => string }], unlock: "equation-id", note, tags: [{ text, at: (w) => Vector3 }] },
  recall: { q, options: [...], answer: index },
  solution: { ... },                              // what world.solve() needs to win instantly
}
```

`goal.manual` shows a button that finishes the level when pressed (for levels judged by a choice rather than a measured state); `check` may then be omitted. Readouts: `{ key, label, unit, big, get: (w) => number, digits, format: (v) => string }`. Equations (the Toolbox): `{ id, f, source, live: (w) => string }`.

## 3. Stage and builder

- `stage.mat(role, { clip })`: shared materials. Roles: `bench graphite housing clay ceramic steel brass copper rubber carbon magnet lamination insRed insDark hole ink accent accentDark`. `accent` (orange) is ONLY for grabbables.
- `stage.glow(hex, boost)`: HDR unlit material for physics overlays (blooms when boost pushes it over 1.15).
- `stage.setCut(on)`: toggles the cutaway plane for `clip: true` materials. `stage.timeScale` is set by the engine (0.25 in reveal).
- `B.group({ parent, pos, rot, dynamic })`, `B.part(geometry, role|material, { parent, pos, rot, dynamic, edges, thresh, clip, cast })`, `B.inst(geometry, role, matrices, { parent, colors })`. Everything not under a `dynamic` group is merged into one mesh per material after `build` returns, so anything that moves, hides or is created later must be `dynamic` or added straight to `stage.scene` with `userData.keep = true`.
- `geo.mjs`: `rbox(w,h,d,r)`, `lathe(profile)`, `chamferCyl(r,h,c)`, `toX(g)`, `toZ(g)`, `M4(x,y,z,rx,ry,rz,sx,sy,sz)`, `canvasTex(w,h,draw)` → `{ tex, redraw(...args) }` (draw receives `(ctx, w, h, ...args)`).

## 4. Parts

### `parts/bench.mjs`
`bench(B, stage, { serial, subtitle })` → the 14 × 8.4 bench, ruler, pegboard and brass serial plate. Bench top is y = 0; x ∈ [−7, 7], z ∈ [−4.2, 4.2].

### `parts/motorlab.mjs` (electromechanics)
`dcMotor`, `dyno` (flywheel, Prony brake arm, hanger, rpm gauge), `slottedWeights` (Rapier discs), `benchSupply` (orange knob, phosphor display), `toggleSwitch`, `rheostat`, `wire(B, stage, a, b, opts)` → `{ curve }`. See `examples/motor-bench/main.mjs`.

### `parts/memory.mjs` (memory, pointers, data structures)
`memoryWarehouse(B, stage, { regions, perShelf = 8, bytesPerCell = 4, pit, forkliftHome })` → `mem`.
- Default regions: `stack` (base 0x7FF7BFEFF0A0, x0 −6.2) and `heap` (base 0x600000C04000, x0 0.9), 3 shelves × 8 slots each, 4 bytes per slot, so one shelf = 32 bytes. Slot index → shelf `floor(i / 8)`, column `i % 8`. A crate must fit on one shelf.
- `mem.crate({ id, name, type, bytes | cells, value, region, index, padding: [cellOffsets], pointer, color })` → crate `{ address, place(region, index, animator, dur), setValue(v, state), setState("error" | "hot" | ""), top(), plugPos(), remove() }`. Padding slots render as packing foam.
- `mem.cable(fromCrate, toCrate | null, { grabbable })` → `{ retarget(crate | null), rebuild(), remove(), tip, dragPoint }`. `null` runs the cable into the hazard pit at address 0x0.
- `mem.nearestTarget(point, exclude)` → crate, `"null"` (the pit) or `null`.
- `mem.forklift.drive(animator, point, liftY)`, `.fall(animator, mem.pitTop)`, `.home_(animator)`, `.reset()`: the dereference animation.
- `mem.addrOf(region, index)`, `mem.cellPos(region, index)`, `mem.redraw()`, `mem.refreshCables()`.

## 5. Overlays, sound, interaction, physics, code

- `overlays.mjs`: `currentFlow(stage, curve)` → `.update(current, dt, gain)`; `torqueArrow(stage, parent)` → `.set(torque, scale)`; `heatGlow(material)` → `(tempC) => …`; `heatMotes(stage, center)`; `fieldLoops(stage, parent)`.
- `audio`: `detent() notch() thump() clack(v) commit() win() miss() star(i) unlockFx() motor(name, freq, level, brightness) hiss(level)`; `buzz(pattern)` for haptics.
- `interaction.register(meshes, { enabled: () => bool, onTap, onDragStart(e, ray, hit) → data | false, onDrag({ dx, dy, ray, data }), onDragEnd({ ray, data }) })`.
- `physics.mjs`: `await createPhysics(stage)` → `{ RAPIER, world, fixedBox, fixedCylinder, dynamicCylinder, step }`. Only when the lesson needs real rigid bodies.
- `anim.mjs`: `createAnimator()` → `{ tween(seconds, (k) => …), wait(s), update(dt), busy }`. Call `animator.update(dt)` from `world.step` so the bot's fixed-step ticks drive animations too.
- `code.mjs`: `createCodePanel(ctx.hud, { title, source, onRun, onStep, onReset })` → `{ setSource(src, title), setActive(line), mark(line, "error" | "ok" | "warn", note), clearMarks(), slot(line, { options, placeholder, onPick }), slotValue(line), setSlotValue(line, i), status(text, kind), buttons({ run, step, reset }), show(bool) }`. Line numbers are 1-based.

## 6. Truth

- `model.mjs`: pure solvers named by `lesson.json` `cases[].solver`, plus anything the game imports. No DOM.
- `truth.mjs` (optional, Node only): `export async function checks({ cpp, model, lesson })` returns rows `{ id, field, expected, got, ok }` or `{ id, skip }`. `cpp(source, { stdin, args, std })` compiles with clang++/g++ and runs it: `{ available, compiled, errors, errorCount, stdout, stderr, code, signal, crashed }`. Use it to check what the game claims about real code (sizes, addresses' stride, outputs, crashes, compile errors) against the real compiler.
