# Playable — Art Direction

Synthesis of 5 parallel research tracks (2026-10-17): game precedent · technical illustration · three.js feasibility · learning science · brand & virality. Status: **proposal — validate with a style-lab prototype before locking.**

---

## TL;DR — "The Bench"

> Dark graphite workbench. Matte, bevelled, clay-like hardware with Anatomy-level part density. The only saturated things on screen are **what you control** (one orange accent) and **the physics you're learning** (colour-blind-safe semantic overlays). Readouts in dot-matrix. Every game is a numbered collectible: **PLAYABLE-NN**.

All five tracks converged independently on the same core: **neutral world, saturated state.** Games research (Poly Bridge, Turing Complete), illustration research (Ciechanowski's "only parts transferring power are highlighted"), learning science (signalling + coherence principles), and brand research (Teenage Engineering's one-hot-colour) all say the same thing. That's the signature.

---

## 1. Why this, and why it's different from Anatomy

| | Anatomy | Playable |
|---|---|---|
| Mood | Calm, editorial, quiet | Tactile, workshop, alive |
| Theme | Light-first, paper | Dark-first, graphite bench |
| Camera | Isometric, fixed | Perspective diorama, clamped orbit |
| Output | Figure to look at | Game to play |
| Senses | Visual | Visual + sound + haptics |
| Shared DNA | Object is the explanation · many small precise parts · numbers come from the model | (same — credit Anatomy openly) |

Recognisable at thumbnail size: **dark scene + one orange control + glowing physics + dot-matrix number + serial plate.**

---

## 2. The three perceptual layers (the detail paradox solved)

Learning research warns that rich detail can hurt ("seductive details", Harp & Mayer 1998). The fix — supported by the coherence & signalling principles (Mayer) — is to sort everything into layers:

| Layer | What | Treatment |
|---|---|---|
| **1. World & detail** | Bench, housings, screws, fins, windings, PCB traces — Anatomy-level density | Neutral, desaturated, low contrast, matte. Rich at 4× zoom, quiet at 1×. Never animated unless it's the concept. |
| **2. Physics (semantic)** | Current, voltage, force, heat, field, signal, error | The ONLY saturated/glowing pixels. Overlays (particles, field lines, arrows, glow), never repaint the object's material. |
| **3. Play & chrome** | Controls you touch, HUD, rewards | Orange accent on handles/knobs; warm, rounded UI (emotional design, Um et al. 2012). Juice lives here — not on the physics. |

Rule: **at most one animated layer-2 element competing for attention at a time** during play.

---

## 3. Palette

### World (layer 1)
| Token | Hex | Use |
|---|---|---|
| bench | `#0E0F10` | Background / bench top |
| graphite | `#1C1D20` | Bench details, pegboard |
| housing | `#3A3D44` | Dark parts |
| clay | `#C9CCD1` | Light parts (solder-silver clay) |
| label | `#F2EBDD` | Engraved/printed labels, paper tags |
| brass | `#C99A4B` | Small metal accents (terminals, bushings) — sparingly |

### Control accent (layer 3)
| Token | Hex | Use |
|---|---|---|
| **signal orange** | `#FF5A1F` | ONLY on things the player can grab: knobs, levers, sliders, handles. It's the logo too. |

### Physics semantics (layer 2) — Okabe-Ito base, colour-blind safe, always paired with shape/motion
| Quantity | Hex | Encoding (never colour alone) |
|---|---|---|
| Current | `#56B4E9` | Moving particles along wires + direction chevrons |
| Voltage / potential | `#0072B2` | Gradient on conductors / height field, +/− glyphs |
| Force / torque | `#009E73` | Arrows, length ∝ magnitude; curved arrow for torque |
| Heat / energy loss | `#E69F00` → white | Emissive incandescent ramp + shimmer (emissive channel, never matte) |
| Magnetic field | `#CC79A7` | Thin closed dashed lines with arrowheads |
| Signal / data | `#F0E442` | Discrete square packets, mono labels |
| Error / violation | `#D55E00` | Hatch pattern + ⚠ glyph, separate UI layer |
| Live readout | `#3CFF8F` | Dot-matrix numbers only (phosphor green) |

⚠️ **Known conflict to test:** signal orange (control) vs heat (`#E69F00`) vs error (`#D55E00`) sit near each other, especially for deuteranopia. Mitigation: they live on different channels — orange = matte albedo on grabbable handles; heat = emissive glow + shimmer; error = hatch + glyph. Validate with a CVD simulator in the style lab; fallback: shift control accent to a non-semantic hue.

---

## 4. Materials, light, geometry ("procedural that looks expensive")

- **Shading:** `MeshStandardMaterial`, roughness 0.6–0.85, metalness ≈ 0 (brass/pins: 0.6–0.9). Clay feel, not toon.
- **Environment:** `PMREMGenerator.fromScene(new RoomEnvironment())` — no HDR files. Tone map AgX (soft) or ACES.
- **Light:** one warm key (directional, 1 shadow map, 1024 on phones) + cool rim + hemisphere fill.
- **AO:** baked per-vertex AO in the parts library (computed at build), N8AO on desktop only.
- **Contact shadows:** blurred ortho shadow plane under the diorama.
- **Edges:** merged `EdgesGeometry` (~30° threshold) in a darker shade of each part → crisp CAD/Anatomy feel. Inverted-hull outline only on hovered/grabbed parts.
- **Bevels everywhere:** `RoundedBoxGeometry` (2–4% radius), chamfer rings on cylinders. #1 tell of "expensive".
- **Density via instancing:** screws, fins, gear teeth, pins, ticks, memory cells → `InstancedMesh`.
- **Detail LOD:** overview = silhouette + 5–8 assemblies; zoom fades in screws, windings, teeth.

---

## 5. Camera & composition

- **Diorama:** each level is a floating bench slab (Captain Toad / Monument Valley composition), perspective FOV ≈ 30–35°, three-quarter default.
- **Clamped orbit** + snap-back; never let a learner get lost. Fixed horizon (vestibular safety).
- Concept-dependent dimension: 3D for spatial things (motors, fields, mechanisms); 2.5D lock for graphs, block diagrams, memory layouts, Smith chart — with a "flatten" toggle.

---

## 6. Signature moves (the brand)

1. **The orange knob.** Every level is solved by turning/dragging an orange control. It's also the logo.
2. **Dot-matrix readouts.** Big numbers (rpm, V, A, error) in a dot-matrix display font (e.g. *Doto*, free) — always in the same HUD position.
3. **Serial plate `PLAYABLE-NN`** engraved on the bench, *inside* the frame (crop-proof watermark), numbered like a collectible series.
4. **The Morph (concreteness fading as a transition).** The reveal moment morphs the real 3D object ⇄ its schematic/blueprint line drawing with the equation attached. Learning research (Fyfe et al. 2014, concreteness fading) + virality research (the "inflate" hook) point to the same move. Also used as the intro: the PDF's diagram inflates into the 3D machine.
5. **Sound pack.** One family across all games: soft mechanical clicks, relay "chunk", rising synth tick with the controlled value, sonified physics (motor pitch ∝ speed).
6. **Haptics.** Detent ticks on knobs, thump on impact, buzz on overload (Android; audio+visual carries it on iOS).

### Typography
- UI: **IBM Plex Sans Condensed** (instrument-label feel; Space Grotesk dropped as too generic) · Readouts/code: **JetBrains Mono** · Big numbers & wordmark: **Doto** (dot-matrix) — all free/OFL. (Inline as base64 subsets to stay offline.)
- Rendering learnings from Style Lab v1: use **NeutralToneMapping** (AgX turned the orange salmon-pink); bloom threshold > 1 with HDR-boosted semantic colours only (otherwise every light surface glows); per-theme exposure + bloom threshold (Paper needs exp 0.82, threshold 1.6). Style Lab: https://claude.ai/artifact/Xf2nEvvs4hp3UvPVWWeTXo · source `playable/style-lab/index.html`.

---

## 7. Play vs Reveal (the style changes with the learning moment)

| | Play | Reveal |
|---|---|---|
| Scene | Stable, low-contrast detail | Dims; relevant parts recolour with semantics |
| Colour | Only the manipulated variable + its effect | Full semantic overlay on the concept |
| Time | Real-time, learner-controlled | Slow-mo / replay with trails & ghost frames (Tversky: animation transience) |
| Text | Live numbers only | Equation attaches to the part in 3D, source citation inline |
| Juice | None on physics (sonification only) | Allowed: equation-unlock power-up, stars |
| Transition | — | **The Morph** (object ⇄ schematic) |

Also: **timeline scrubber** (Opus Magnum) — pause, rewind, step — available in every sim.

---

## 8. Themes — LOCKED 2026-10-17: all three ship in every game, user-switchable

Every generated game includes a look switcher (and keys 1/2/3). Same parts library; themes are pure token swaps (scene colours, edge colour/opacity, env/key/hemi intensity, exposure, bloom strength/threshold, CSS tokens). The orange control accent and the semantic physics colours stay identical across all three.

- **Bench** (default, dark) — above.
- **Cyanotype** — deep blueprint blue `#0B2A4A`, ivory parts, white ink edges, hatched cut faces. Great for "schematic" levels and print/light contexts.
- **Paper** (light) — warm off-white `#ECE8E0`, for classrooms/projectors and accessibility.

Remember the viewer's choice per device (localStorage, wrapped in try/catch); default Bench.

---

## 9. Tech stack (rendering & physics)

| Piece | Choice | Notes |
|---|---|---|
| Renderer | three@0.186.1 WebGLRenderer (pinned) | WebGPU/TSL later — API churn, bigger bundle |
| Physics | **@dimforge/rapier3d-compat@0.21.0** | Revolute/prismatic joints + motors, clean JS API. wasm gzipped → base64 → `DecompressionStream` ≈ 1.4 MB |
| Analytical sims | Our own (ODE/RK4, circuit MNA, RF math, discrete/memory) | Motors/gears/linkages driven analytically; Rapier only for collisions, free bodies, ragdoll fun. **Don't build gear trains from physics joints.** |
| AO | Baked vertex AO (three-mesh-bvh@0.9.16 at build); n8ao@2.0.1 desktop only | |
| Post | ≤ 3 passes on phones: scene (MSAA) + half-res bloom (emissive threshold) + output | |
| Labels | DOM/CSS2D overlays anchored to parts | Not WebGL text |
| Bundle | esbuild → single inlined HTML | Budget ≈ 2.3–2.8 MB |

**Budgets (phone / desktop):** draw calls ≤ 120 / 400 · triangles ≤ 300k / 1.5M · physics bodies ≤ 150 / 500 · pixel ratio cap 1.5 / 2 · auto quality governor (drop DPR → AO → bloom if frame > 20 ms for 2 s).

---

## 10. Avoid (pitfalls all tracks flagged)

- Photoreal PBR + heavy post (fails on phones, blurs small parts)
- Hand-painted textures (can't be generated procedurally)
- Pixel/low-res & voxel looks (destroy fine detail; voxels ruin coils/gears/arcs)
- Pure neon-on-black (eye fatigue, hides geometry)
- Colour-only encoding (~8% of men colour-blind)
- Free camera (beginners get lost)
- Inverted-hull outlines on dense detail (black mush) — fade by size/distance
- Juice on the physics (distracts — keep it on rewards)
- Overlay-heavy HUD — cap ≈ 3 simultaneous labels
- Copying Linear/Vercel minimalism or Y2K chrome (generic / dates fast)

---

## 11. Next step: Style Lab

Before building the engine, build **one scene — the DC motor on a dyno bench — rendered in a switchable style lab**:
- Bench (dark) · Cyanotype · Paper themes
- Play vs Reveal states, incl. a first pass of The Morph
- Semantic overlays (current particles, torque arrow, heat glow on brake resistor)
- Orange knob with detents + sound + haptics
- CVD simulation toggle to test the palette
- Phone + desktop perf readout

Output: one HTML to play on your phone → pick/adjust the look → lock this doc → start Phase 1 (Motor Bench vertical slice).

---

## Sources (selected)
- Anatomy — https://github.com/wheresryan22/anatomy · https://skills.wheresryan.sh/anatomy
- Ciechanowski, Mechanical Watch — https://ciechanow.ski/mechanical-watch/
- PhET implicit scaffolding — https://arxiv.org/pdf/1306.6544
- Um, Plass et al. 2012, Emotional design — doi:10.1037/a0026609
- Fyfe et al. 2014, Concreteness fading — doi:10.1007/s10648-014-9249-3
- Harp & Mayer 1998, Seductive details — doi:10.1037/0022-0663.90.3.414
- Tversky et al. 2002, Animation: can it facilitate? — doi:10.1006/ijhc.2002.1017
- Okabe & Ito, colour-universal design — https://jfly.uni-koeln.de/color/
- three.js WebGPURenderer — https://threejs.org/manual/en/webgpurenderer
- Balatro / Teenage Engineering design breakdowns — https://blakecrosley.com/guides/design/balatro · https://blakecrosley.com/de/guides/design/teenage-engineering
