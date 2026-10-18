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
`bench(B, stage, { serial, subtitle, plate: [x, z] })` → the 14 × 8.4 bench, ruler, pegboard and brass serial plate (default front-left; move it with `plate` when a HUD panel covers that corner, e.g. the code panel). Bench top is y = 0; x ∈ [−7, 7], z ∈ [−4.2, 4.2].

### `parts/motorlab.mjs` (electromechanics)
`dcMotor`, `dyno` (flywheel, Prony brake arm, hanger, rpm gauge), `slottedWeights` (Rapier discs), `benchSupply` (orange knob, phosphor display), `toggleSwitch`, `rheostat`, `wire(B, stage, a, b, opts)` → `{ curve }`. See `examples/motor-bench/main.mjs`.

### `parts/memory.mjs` (memory, pointers, data structures)
`memoryWarehouse(B, stage, { regions, perShelf = 8, bytesPerCell = 4, pit, forkliftHome })` → `mem`.
- Default regions: `stack` (base 0x7FF7BFEFF0A0, x0 −6.2) and `heap` (base 0x600000C04000, x0 0.9), 3 shelves × 8 slots each, 4 bytes per slot, so one shelf = 32 bytes. Slot index → shelf `floor(i / 8)`, column `i % 8`. A crate must fit on one shelf.
- `mem.crate({ id, name, type, bytes | cells, value, region, index, padding: [cellOffsets], pointer, color })` → crate `{ address, meshes, place(region, index, animator, dur), setValue(v, state), setState("error" | "hot" | ""), rename(name, type), top(), plugPos(), remove() }`. Padding slots render as packing foam. Crates are created at run time (not merged), so create them per level and `remove()` them on reset.
- `mem.cable(fromCrate, toCrate | null, { grabbable })` → `{ retarget(crate | null), rebuild(), setVisible(v), remove(), tip, dragPoint }`. `null` runs the cable into the hazard pit at address 0x0. `grabbable` only paints the tip and plug orange; make it draggable with `grabCable`.
- `mem.grabCable(interaction, cable, { enabled, targets: () => crates, allowNull = true, onDrop(target), audio })`: drag the tip (or the plug, even while the cable is hidden) onto a crate or the pit; it snaps, retargets on release and springs back otherwise. Registrations can't be removed, so include an identity check in `enabled` if the cable is rebuilt.
- `mem.nearestTarget(point, exclude)` → crate, `"null"` (the pit) or `null`.
- `mem.forklift.drive(animator, point, liftY, dur)`, `.fall(animator, at, { depth = 1.4, tilt = 0.9 })`, `.home_(animator)`, `.reset()`: the dereference animation. Use a small `depth` (≈ 0.5) so the forklift stays visible nose-down in the pit.
- `mem.addrOf(region, index)`, `mem.cellPos(region, index)`, `mem.redraw()`, `mem.refreshCables()`.

### `parts/scope.mjs` (plots, measured data)
- `benchScope(B, stage, { pos, rotY, width, height, res })` → `{ draw(spec), redraw(), screen, probes(), anchor(), screenAnchor() }`: a bench oscilloscope with a big phosphor canvas screen (nothing on it is orange). Redraw it at ≤ 20 Hz from `world.step`, and only when something changed: a 1024 px canvas upload every frame is expensive on phones.
- `drawPlot(ctx, w, h, spec)` is the pure renderer (also usable for any canvas texture). `spec`: `x: [min, max]`, `y`, `xTicks`, `yTicks`, `unitX`, `yLabel`, `traces: [{ y, t0, dt | x, color, width, dash, dots, every, upto, label }]`, `hlines`, `vlines`, `bands: [{ x0, x1, y0, y1, color, hatch }]` (a spec window, hatched when violated), `cursor` (the beam dot), `readout: [text | { text, color }]`, `readoutAt` and `legendAt` (`"tl" | "tr" | "bl" | "br"`; put them in the corners the curve leaves empty), `font`. `SCOPE_COLORS` has the palette: model = phosphor line, measured data = ivory dots drawn last (so they sit on top), demand = signal-yellow dashed.

### `parts/servo.mjs` (control labs)
- `rotaryKnob(B, stage, { parent, pos, rot, radius, sweep })` → `{ grab, set(0…1), f, anchor() }`: an orange knob with a tick dial; grab meshes are kept out of dynamic merging (`userData.noMerge`), which you must do for any grabbable inside a `merge: true` group.
- `servoWheel(B, stage, { parent, x, axisY, radius, ringRadius, dialOffset })` → `{ setAngle(θ), setTarget(θ, on), pointerTip(θ), rim(a), encoder(), anchor() }`: a flywheel with a pointer over a fixed dial in radians (θ CCW seen from +x, 0 = up), a signal-yellow demand marker and an encoder can. Build it in the motor's frame (shaft = local +x). Keep `axisY ≥ ringRadius + 0.35` so the dial clears the bench (raise the motor on a plinth: `motor.wrap.position.y`).
- `frictionBrake(B, stage, { parent, x, axisY, radius, angle })` → `{ grab, set(0…1), padPoint(), anchor() }`: a felt pad on the rim with an orange thumbscrew (Coulomb friction as an object).
- `controllerBox(B, stage, { pos, rotY, width, knobs: [{ id, label }] })` → `{ knobs: { id: rotaryKnob }, display(lines), labels(labels), ports(), switchSpot(dx), anchor() }`: a controller with a phosphor display strip and orange gain knobs. `display([{ k, v, dim }])` draws key/value columns.
- To rotate a whole rig (e.g. a `dcMotor` so its shaft points at the camera), create the part, then `rigGroup.add(motor.wrap)`; static merging uses world matrices, so re-parenting before `build` returns is safe.

### `scripts/lib/mat.mjs`
`readMat(path)` → `{ header, vars }` reads MATLAB v5 MAT-files (numeric, char, struct, cell; compressed elements) with no dependencies. Use it in a data-prep script to turn lab `.mat` data into JSON the game and `truth.mjs` import.

## 5. Overlays, sound, interaction, physics, code

- `overlays.mjs`: `currentFlow(stage, curve)` → `.update(current, dt, gain)`; `torqueArrow(stage, parent)` → `.set(torque, scale)`; `heatGlow(material)` → `(tempC) => …`; `heatMotes(stage, center)`; `fieldLoops(stage, parent)`.
- `audio`: `detent() notch() thump() clack(v) commit() win() miss() star(i) unlockFx() motor(name, freq, level, brightness) hiss(level)`; `buzz(pattern)` for haptics.
- `interaction.register(meshes, { enabled: () => bool, onTap, onDragStart(e, ray, hit) → data | false, onDrag({ dx, dy, ray, data }), onDragEnd({ ray, data }) })`. Note: `ray` is a `THREE.Raycaster`; the geometric ray is `ray.ray` (`ray.ray.intersectPlane(...)`). The playtest bot calls `world.solve` and never drags, so test every grab with real pointer events.
- `physics.mjs`: `await createPhysics(stage)` → `{ RAPIER, world, fixedBox, fixedCylinder, dynamicCylinder, step }`. Only when the lesson needs real rigid bodies. It costs ~1.8 MB of HTML: the bundler gzips Rapier's inlined WASM (4.1 MB of base64 → 1.56 MB) and inflates it with `DecompressionStream` when the module loads (Chrome 80+, Safari 16.4+, Firefox 113+). Import `rapier` only through this file or the `rapier` alias, never a copied `rapier.mjs`, or the build falls back to the uncompressed 4.3 MB module.
- `anim.mjs`: `createAnimator()` → `{ tween(seconds, (k) => …), wait(s), update(dt), busy }`. Call `animator.update(dt)` from `world.step` so the bot's fixed-step ticks drive animations too.
- `code.mjs`: `createCodePanel(ctx.hud, { title, source, onRun, onStep, onReset })` → `{ setSource(src, title), setActive(line), mark(line, "error" | "ok" | "warn", note), clearMarks(), slot(line, { options, value, placeholder, onPick }), slotValue(line), setSlotValue(line, i), output(text | lines, kind), status(text, kind), buttons({ run, step, reset }), show(bool), collapse(bool) }`. Line numbers are 1-based. `setSource` clears slots, so re-add them after it; pass the current choice as `value` (`setSlotValue` fires `onPick`). `output` is the program's stdout under the code. On phones the panel sits under the readouts; `collapse(true)` shrinks it to one row with Run/Step/Reset, so collapse it in play when the scene matters and hide it in reveal.
- `parts/controls.mjs`: `slider(B, stage, { pos, rotY, length, ticks, marks: [{ at, text }], dynamic })` → `{ grab, set(k), k, fromRay(ray), anchor(), redraw() }`, a bench slider with an orange carriage (0…1). Pass `dynamic: true` to hide it between levels.

## 6. Truth

- `model.mjs`: pure solvers named by `lesson.json` `cases[].solver`, plus anything the game imports. No DOM.
- `truth.mjs` (optional, Node only): `export async function checks({ cpp, model, lesson })` returns rows `{ id, field, expected, got, ok }` or `{ id, skip }`. `cpp(source, { stdin, args, std })` compiles with clang++/g++ and runs it: `{ available, compiled, errors, errorCount, stdout, stderr, code, signal, crashed }`. Use it to check what the game claims about real code (sizes, addresses' stride, outputs, crashes, compile errors) against the real compiler.

## 7. Camera framing

- `camera.focus: { min: [x, y, z], max: [x, y, z] }` on the game and `focus` on each level declare the world-space box the student must see. The engine frames it into the screen area the HUD leaves clear (beside the card on desktop, above the bottom sheet on phones) with an off-centre projection, re-frames on resize and phase changes, and scales the fog to the distance. Never hand-tune per-device cameras.
- Games that open other panels can call `ctx.refocus(seconds)` after the layout changes.

## 8. Bot contract

- `world.solve(solution)` must reach the winning state **deterministically within simulated time** (instantly where possible). Never use `setTimeout` or wall-clock time; drive animations and live simulations from `world.step(dt)`.
- The bot also **probes every enabled grabbable** with real pointer events on every level (desktop and phone). A grabbable that is off-screen or does not respond fails the playtest.
- A level with `goal.manual` and no `goal.check` is finished by the bot after `solve()`.

## 9. Engine behaviours you get for free (2026-10-18)

- **Orange means grabbable, automatically.** Any mesh registered with `interaction.register` switches between the `accent` and `accentOff` materials as its `enabled()` changes, so disabled controls never stay orange. Registered meshes are also marked `userData.noMerge`, so a `merge: true` group never swallows a grab target.
- **`B.group({ merge: true })`** merges the static parts inside a moving group (rotors, flywheels, whole toggled assemblies) into one mesh per material. Set `mesh.userData.noMerge = true` on anything that must stay separate.
- **Per-device framing:** `level.phoneFocus` / `camera.phoneFocus` replace `focus` on portrait phones. `camera.avoidReadouts: true` keeps the subject below a full-width readout block on phones.
- **Dev counter:** the fps/draws/tris readout is hidden for players. Add `#perf` to the URL or press the backtick key to show it.
- **Readout formatters** receive the world: `format(value, world)`.
- **Doto decimals:** Doto draws "." like a "+". The HUD and every canvas `fillText` in a Doto font draw "." and "," in JetBrains Mono automatically; nothing to do in parts.
- **Badges by trust:** `verified.json` counts cases by `trust` (`official`, `derived`, `simulator`, `student`) and summarises `claims`. The map shows "N/N answers verified" only for official answers; otherwise "N results derived", plus reality checks and "your work: X/Y right".
- **Review hooks:** `window.__playable.startPlay(id)` puts a level in its play phase and settles 1.5 s of simulated time; `settle(seconds)` advances fixed-step time and snaps the camera. The playtest uses them to save `<view>-<id>-play.png` next to each reveal shot (`--no-play-shots` to skip, `--only=Q1,Q2` to run a subset).
