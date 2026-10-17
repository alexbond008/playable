# Playable — Build Plan

> **Drop in any academic artifact. Get a game that teaches it.**
> An agent skill (Claude Code, Codex, Antigravity, OpenCode) that turns STEM course material — a PDF, a docx, slides, code, or a whole lab folder — into a beautiful, haptic, verified, playable learning game. One command. Zero friction.

Status: planning · Started 2026-10-17 · Owner: Aleks Gornik

---

## 0. North star

**The demo that makes it go viral:** a student drags their real tutorial sheet into Claude Code, types `/playable tutorial.pdf`, and ~5 minutes later is spinning a 3D DC motor on a dyno bench, *predicting* what happens when the load doubles, hearing the motor pitch drop, and watching the tutorial's own answer ("2400 rpm") light up as ✓ verified.

**Three promises (everything is judged against these):**

1. **It's true.** Every number, equation and answer is traced to the source and checked by running the model. The game never teaches something wrong.
2. **It teaches.** Learning science is the mechanism, not decoration: predict → play → discover → the equation unlocks → retrieve later.
3. **It feels incredible.** Physical, haptic, sonified, 60 fps, works on a phone. People screen-record it because it's fun.

**Zero friction means zero friction to *learn*, not to build.** Once the game exists, learning from it is effortless: one offline HTML file that opens itself, no accounts, no server, no setup. Building it may take as long as quality demands — **we never trade quality for build speed.** The skill always tells the user up front what it found and an **ETA** for the build (and reports progress against it), then builds without needless questions.

---

## 1. What the input looks like (grounded in real samples)

| Input type | Real sample | What the skill must extract |
|---|---|---|
| Problem set with answers | `ElecScieB/Andy/Tutorial 1.1.pdf` (DC motors, 8 Qs, answers given) | Givens, unknowns, equations, **answers as test cases**, difficulty (* = exam level) |
| Code / concept tutorial | `embedded/tutorials/Tutorial - Pointers and Structures.pdf` (C++ pointers, heap, structs) | Code listings, bugs, memory model, misconceptions — **no physics** |
| Coursework / report (docx) | `microwaves/CW2.docx` (Smith-chart L-network + stub matching, 112 images) | Method steps, student's values (**may be wrong**), figures, target spec |
| Lab folder | `Control/lab2/` (`.slx` Simulink, `.m` params K J R L D + PI gains, measured rig data `.txt/.xlsx/.mat`, report) | Plant model, parameters, **real measured data**, the lab's tasks |
| Also expected | Lecture slides (pptx/pdf), textbook chapters, papers, Jupyter notebooks, datasheets, scanned handwritten notes | — |

**Key insight:** sources carry different *trust levels*. Official answers = test cases. Student work = claims to check. The model re-derives everything; disagreements become a feature ("Your coursework says C = 0.909 pF — we get X. Here's why.").

---

## 2. What the output is

One self-contained `playable-<topic>.html` (opens offline, shareable, < ~3 MB):

- **World map** — the artifact as a map; each core concept/question is a level; final **boss** = exam-style synthesis problem.
- **Levels** — each one a short (2–5 min) loop around a live simulation of a real object.
- **Progress** — stars, XP, mastery per concept, saved locally; **spaced recall** questions resurface on later visits.
- **Source panel** — every equation/number links back to "Tutorial 1.1, Q3, p.1".
- **"✓ Verified" badge** — "All 8 worked answers reproduced by the simulation."
- Small "Made with Playable" mark → GitHub (growth loop).

### What the 4 samples would become (the showcase gallery)

| Sample | Game | Signature moment |
|---|---|---|
| DC motor tutorial | **Motor Bench** — 3D brushed DC motor on a dyno with tacho, ammeter, supply, brake resistor | Predict the speed when load doubles → hear the pitch drop → 2400 rpm ✓. Boss: two coupled motors load-sharing (Q8). Brake resistor glows red as it dumps energy (Q5–6). |
| C++ pointers | **Memory Warehouse** — RAM as shelves with address plates; pointers are cables plugged into boxes; heap = loading dock | `*p = 12` with `p = 0`: the forklift drives to address 0 and crashes (segfault). Fix it by plugging the cable into `i`. `sizeof(House)` revealed by physically packing boxes (padding visible). |
| Smith chart CW | **Match Maker** — interactive Smith chart + 3D antenna on a transmission line | Drag along constant-R/G circles adding a shunt L and series C; standing wave on the line flattens, S11 dips at 2 GHz, antenna starts radiating. **Checks the student's own values.** |
| Control lab folder | **Rig Tuner** — the actual DC motor rig in 3D, params from `start_MSD_SIM.m` | Tune Kp/τi until your sim overlays the **real measured rig data**. "Pilot" level: control the motor by hand, then watch your PI controller beat you. |

---

## 3. Learning design (the mechanism)

Every level is built from evidence-based moves. Each mechanic below is tagged so the skill can't ship a level that's just a toy.

| Principle | How it shows up | Evidence base |
|---|---|---|
| **Prediction / generation** | Every level opens with *commit a guess* before touching anything | Prediction-error & generation effect |
| **Confidence → hypercorrection** | Confidence slider on predictions; confident-but-wrong gets a special reveal | Hypercorrection effect |
| **Productive failure → equation as power-up** | Play first, discover the relationship, *then* the equation unlocks and later levels need it | Productive failure / discovery-then-instruction |
| **Worked-example fading** | Problem sets: Q1 fully guided → middle steps faded → solo | Worked-example effect, fading |
| **Immediate, specific feedback** | The sim *shows* why you were wrong (not just ✗) | Feedback timing |
| **Retrieval practice** | Boss + recall cards use concepts from earlier levels, no hints | Testing effect |
| **Spacing** | Recall questions resurface next session (localStorage timestamps) | Spacing effect |
| **Interleaving** | Boss mixes concept types | Interleaving |
| **Dual coding** | Equation + live object + sound for the same quantity | Dual coding |
| **Transfer** | Final "twist" maps to another domain (mass-spring ↔ RLC) | Analogical transfer |
| **Misconception targeting** | Skill lists likely misconceptions per concept; predictions are designed to surface them | Conceptual change |

### Level mechanic catalog (the skill picks one per concept)

| Mechanic | For | Example |
|---|---|---|
| **Tune** | Relationships between quantities | Set V so the motor makes 3 Nm at 2000 rpm |
| **Build** | Design with constraints/tradeoffs | L-network that matches 72+j100 Ω at 2 GHz |
| **Pilot** | Dynamics & control | Hold motor position by hand, then tune PI to beat you |
| **Break It** | Limits, failure, safety margins | Resistive braking until the resistor overheats |
| **Trace** | Code, algorithms, state machines | Step through pointer code; watch memory change |
| **Detective** | Diagnosis, debugging | Which line crashes? Which component failed? |
| **Chain** | Derivations & method steps | Order the Smith-chart steps / derivation lines |
| **Fermi** | Estimation & units | 2500 rpm in rad/s — slider guess, closer = more points |

Fallback: any concept with no good simulation still gets Chain / Fermi / Detective / recall — so *every* STEM artifact produces a game, even if not every level is a 3D sim.

---

## 4. Architecture

The single most important decision: **Claude does not write a game from scratch each time.** It writes *content* (a lesson model, level specs, small pure model functions, scene composition) against a **hand-built, world-class engine kit**. This is exactly why Anatomy is reliable — kit + skill + verification — aimed at play instead of illustration.

```
artifact(s) ──► 1 INGEST ──► source-pack/      (text w/ anchors, images, data, inventory)
                                │
                                ▼
                 2 UNDERSTAND ─► lesson.json   (concepts, equations+units, test cases,
                                │               misconceptions, prerequisites, anchors)
                                ▼
                 3 MODEL ──────► model.mjs     (pure functions) ──► TRUTH GATE:
                                │               must reproduce every test case
                                ▼
                 4 DESIGN ─────► game.json     (world map, levels, mechanics, predictions,
                                │               object/scene choice, unlock graph)
                                ▼
                 5 BUILD ──────► playable-<topic>.html   (engine kit + content, inlined)
                                │
                                ▼
                 6 PLAYTEST ───► bot plays every level in headless Chrome; screenshots,
                                 console errors, FPS, phone viewport, a11y; fix & repeat
```

### 4.1 Ingest (`scripts/ingest.mjs`, Node 20+, zero dependencies)
- **PDF:** the agent reads pages natively (text + vision); script records page anchors.
- **docx / pptx / xlsx:** zip + XML parsing with Node's built-in `zlib` (no deps); extract text, tables, equations (OMML), embedded images.
- **Code / notebooks / `.m` / `.py`:** read as text; extract parameters and functions.
- **Simulink `.slx`:** zip of XML → block diagram (blocks, gains, connections) → plant/controller structure.
- **Data (`.csv/.txt/.xlsx`):** parse into series — becomes the "real data" overlay.
- **`.mat`:** v5 parser for simple numeric arrays (best effort); optional Python fallback if available.
- **Folders:** inventory + rank files by relevance (reports & info sheets first, temp/cache files ignored).
- **Scans / handwriting:** vision via the agent.

### 4.2 `lesson.json` schema (the contract between understanding and building)
- `concepts[]` — id, title, summary, prerequisites, misconceptions, source anchors
- `equations[]` — symbolic form, variables with **units**, validity conditions, anchor
- `cases[]` — givens → expected outputs (with tolerance), trust level (`official` / `student` / `derived`), anchor
- `data[]` — measured series (e.g. rig step response) with units
- `domain` — tags used to pick sim engine & scene parts

### 4.3 Truth gate (non-negotiable)
- `model.mjs` exports pure functions; `scripts/verify-model.mjs` runs every `case` → must pass within tolerance (units checked).
- Official answer fails → fix the model (never the answer). Student answer disagrees → keep the model, surface a "check your work" card.
- The verification count is shown in the game ("✓ 8/8 answers reproduced").
- Example: Tutorial 1.1 Q3 — I = T/k = 15 A; E = kω = 0.2 × 209.4 = 41.9 V; V = E + IR = 43.4 V ✓; η = Tω / VI = 628 / 651 = 96.5 % ✓.

### 4.4 Engine kit (hand-built once, the moat)

**Shell & game systems**
- State machine for the level loop (mission → predict → play → reveal → score), world map, unlock graph, stars/XP/mastery, save/restore, spaced recall queue, settings (sound/motion/haptics/theme), reduced-motion & keyboard support.

**Feel ("juice")**
- **Sonification** (WebAudio, synthesized — no audio files): pitch ∝ motor speed / oscillator frequency, resonance hum, thermal hiss, crash.
- **Haptics:** Web Vibration API (Android Chrome; *not* iOS Safari — degrade to audio+visual), Gamepad rumble where available.
- Spring-physics controls (detents, snap, resistance near limits), particles (current flow, sparks, smoke), phosphor-glow traces, screen shake, slow-mo on key moments.

**Rendering**
- **3D:** three.js (vendored, pinned, inlined) for physical objects. House style inspired by Anatomy's "instrument on a bench": heavy base, real parts, four-tone shading, calm motion.
- **2D:** canvas/SVG for scopes, plots, Bode, Smith chart, memory diagrams, code panes.
- **Parts library** (the visual vocabulary): motors (stator, armature, brushes, commutator), shafts, gears, springs, dampers, beams, masses, wires with flowing current, R/L/C/sources, PCB, meters (analog dial, digital readout, tacho), scope, signal generator, transmission line + antenna, memory shelves/boxes/cables, CPU/register blocks.

**Simulation engines**
- ODE solver (RK4, fixed-step + substeps) — mechanics, motors, control
- Lumped circuit solver (MNA: DC, transient, AC/phasor)
- Complex & RF math (impedance, admittance, Γ, Smith chart transforms, transmission lines)
- Signals (step/impulse response, FFT, Bode)
- 2D mechanics (rigid bodies, beams/statics basics)
- **Discrete/CS engine** (memory model: stack, heap, pointers, struct layout & padding; simple interpreter for small C/C++ snippets' memory effects)

**Mechanic templates** — one reusable implementation per mechanic in §3 (Tune, Build, Pilot, Break It, Trace, Detective, Chain, Fermi), parameterized by `game.json`.

### 4.5 Build (`scripts/build.mjs`)
- Merge engine kit + `game.json` + `model.mjs` + scene modules → single HTML with everything inlined (three.js, fonts as system stack, no network).
- Deterministic; re-runnable; `--quick` (2D-first, fewer levels) and default (full 3D) modes.

### 4.6 Playtest (`scripts/playtest.mjs`, headless Chrome)
- A bot solves every level using `cases` (proves each level is winnable).
- Captures desktop + 390 px phone screenshots of every phase; agent must look at them.
- Zero console errors; FPS ≥ 55 on desktop; load < 2 s; file size budget.
- Checks: every level has a prediction, a reveal, a source anchor; every equation unlock is used later.

---

## 5. The skill itself

```
playable/
├── SKILL.md                 workflow, rules, quality bar (what the agent reads)
├── kit/                     engine: shell, juice, render, parts, sims, mechanics
├── scripts/                 ingest, verify-model, build, playtest, capture
├── references/              learning-design.md, mechanics.md, scenes.md, sims.md,
│                            ingest.md, verify.md, style.md
├── examples/                4–6 complete games (source + built HTML)
├── evals/evals.json         test artifacts + what a good game must contain
├── assets/                  README GIFs, social preview
└── .github/                 CI (runs model checks + playtest on examples)
```

**SKILL.md workflow (draft)**
1. **Ingest** → inventory; tell the user in one line what was found ("8 questions with answers, DC motors, ~6 levels, ~5 min").
2. **Understand** → `lesson.json`; list concepts, test cases, misconceptions.
3. **Model + truth gate** → all official cases pass before any visuals.
4. **Design** → choose mechanic + object per concept ("the object is the explanation"); write predictions that target misconceptions; plan the unlock graph and boss.
5. **Build** → compose scenes from the parts library; never hand-roll what the kit has.
6. **Playtest like a critic** → bot run, screenshots, fix until clean.
7. **Hand over** → open the HTML; one-paragraph summary; note any student-answer discrepancies.

**Compatibility:** open Agent Skills format (`name`, `description`, `license`, `compatibility` frontmatter) → Claude Code, Codex, Antigravity, OpenCode. Node 20+ only; Chrome for playtest (optional — skip with a warning). Install: `npx skills add <user>/playable` and a Claude Code plugin marketplace entry (aim for the Anthropic plugin directory, like vibe-wise).

**Build contract:** after ingest, state what was found and an ETA by size tier — **Quick** (one concept, one level), **Lesson** (3–6 levels + boss), **Course** (whole lab folder / module). Run `date` at each step and report when a step runs past twice its share. No clarifying questions unless the input is genuinely ambiguous (e.g. a folder with 3 unrelated courses). Flags: `--levels N`, `--exam` (boss-heavy), `--no-3d`, `--lang`.

---

## 6. Quality bar & evals

| Dimension | Pass criteria |
|---|---|
| **Correct** | 100 % official cases reproduced; units consistent; every number has an anchor |
| **Teaches** | Every level has predict + reveal; ≥ 1 equation unlock reused later; boss uses ≥ 3 concepts; recall queue populated |
| **Feels** | 60 fps desktop / ≥ 30 fps mid phone; zero console errors; sound + haptics + reduced-motion work; phone layout clean |
| **Honest ETA** | ETA stated before building; progress reported against it; quality bar never lowered to hit it |
| **Delight** | Human rating on each eval game: "would I screen-record this?" |

**Eval set:** the 4 private samples (local only) + public openly-licensed materials (e.g. MIT OCW problem sets, OpenStax chapters — check each license) covering: circuits, motors, control, RF, statics/beams, thermo, signals, C/pointers, algorithms, calculus.

---

## 7. Legal & privacy

- **Showcase source material:** the gallery and examples are built from Aleks's own university work (decision 2026-10-17). Show the transformed games and his own solutions; prefer not to re-host original handout PDFs verbatim.
- Other examples are our own content or openly licensed with attribution.
- Everything runs locally; the generated HTML contains the user's material — warn before sharing outputs built from someone else's slides.
- License: MIT.

---

## 8. Roadmap

### Phase 0 — Foundations (days 1–2)
- Repo skeleton, SKILL.md frontmatter, license, CI stub
- `lesson.json` + `game.json` schemas
- Tech decisions locked (three.js version, module layout, inliner)
- **Exit:** empty game shell builds to one HTML and opens

### Phase 1 — Vertical slice: Motor Bench (week 1)
- Hand-build the full experience for Tutorial 1.1 end to end (ingest → lesson → model → truth gate → 3 levels + boss → playtest)
- Build the first engine pieces for real: shell, juice/audio/haptics, 3D motor + bench parts, ODE engine, Tune/Fermi/Break It mechanics
- **Exit:** you play it on your phone and it's *fun*; 8/8 answers verified. **Go/no-go on the concept.**

### Phase 2 — Generalize (week 2)
- Turn the slice into kit + skill: agent generates content, kit renders it
- Second domain that is **not physics**: Memory Warehouse (C++ pointers) → Trace + Detective mechanics, discrete engine
- `verify-model`, `playtest` bot
- **Exit:** both samples generated by the skill (not hand-built) at slice quality

### Phase 3 — Breadth & polish (week 3)
- Match Maker (docx, Smith chart, RF math, student-answer checking)
- Rig Tuner (lab folder, `.slx`/`.m`/data ingest, real-data overlay, Pilot mechanic)
- Mobile polish, accessibility, `--quick` mode, perf budget
- **Exit:** all 4 samples pass evals

### Phase 4 — Launch (week 4)
- 4–6 public examples (own/openly-licensed content), README with hero GIF (PDF → game in one shot), gallery page, social preview
- Eval suite in CI
- Launch sequence (see §9)

---

## 9. Making it go viral on GitHub

1. **README hero GIF:** left = boring PDF, right = the game it became, in one 8-second loop. Then one-line install. Then the gallery.
2. **A live gallery page** (GitHub Pages) where anyone can play the example games instantly — no install needed to be impressed.
3. **The YouTube video** (*I Turned My Lectures Into a Video Game*) + a 30-second vertical cut for Shorts/TikTok/Reels.
4. **X thread** on launch day with the demo video natively uploaded (not a link); tag the Claude Code / Anthropic devrel folks; reply-guy the Anatomy author's audience (credit Anatomy as inspiration — goodwill + reach).
5. **Show HN**, r/EngineeringStudents, r/ECE, r/learnprogramming, r/ClaudeAI — each with a domain-specific game example.
6. **Built-in growth loop:** every generated game has a tasteful "Made with Playable" link; students share games with classmates before exams.
7. **Submit** to the Anthropic plugin directory and agentskills.io listings.
8. **Timing:** launch before end-of-semester exams (late Nov / early Dec) — peak "I need to study this PDF" demand.

Success metrics: 1k stars week 1, 5k month 1; video ≥ 100k; ≥ 50 community-shared games.

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Teaches something wrong | Truth gate on official cases; anchors on every number; student answers flagged, not trusted |
| Generation too slow / expensive | Engine pre-built; agent writes content only; `--quick` mode; reuse parts library |
| 3D quality inconsistent | Curated parts library + house style + playtest screenshots reviewed by the agent; 2D fallback |
| Too narrow (only physics) | Discrete/CS engine + text-first mechanics (Chain, Fermi, Detective) so any STEM artifact works |
| Breaks across agents (Codex/Antigravity) | Node-only scripts, no agent-specific tools required; test in each before launch |
| Messy lab folders | Inventory + relevance ranking; ignore caches/temp; ask only if multiple unrelated topics |
| Scanned / handwritten PDFs | Agent vision; lower-confidence anchors marked |
| iOS has no vibration | Audio + visual "haptic" design carries the feel everywhere |
| Third-party material | Showcase uses Aleks's own work; generated games stay on the user's machine unless they choose to share |

---

## 10b. Lessons from Anatomy (see ANATOMY_ANALYSIS.md)

- **Vendored, pinned deps** (three r186, Rapier) in `kit/vendor/`; Node built-ins only; deterministic builds; CI rebuilds every example and fails on any diff.
- **Audit suite → exit codes:** truth gate · playtest bot · colour audit (only grabbables orange, semantic colours only on overlays, CVD separation) · label cap (≤ 3 in play) · phone perf budget · interpenetration & wire-terminal check (three-mesh-bvh) · zero console errors · every look + reduced motion render.
- **Anti-patterns log** in `references/anti-patterns.md`, grown from every rejection.
- **Size tiers:** Quick / Lesson / Course, with a playable page early and deepening after.
- **Examples ladder:** Ohm's law (tiny) → Motor Bench → Memory Warehouse → Match Maker → Rig Tuner; `walkthrough.md` for Motor Bench.
- **Playable Arcade** community gallery with a publish script (asks first, opens a PR, records minutes + tokens) — the growth loop.

## 11. Open decisions

1. **Repo location & name** — `github.com/<you>/playable`? (check name availability on GitHub/npm)
2. **First vertical slice** — Motor Bench (recommended: has answers → instant truth gate, great 3D object, great sound) vs Rig Tuner (real data, most impressive, more ingest work)
3. **Visual direction** — Anatomy-like isometric "instrument on a bench" vs full perspective 3D game look (recommend: perspective 3D with Anatomy's material/detail discipline)
4. **Scope of v1 launch** — engineering-first (EE, mech, control, embedded) then broaden to physics/maths/CS
