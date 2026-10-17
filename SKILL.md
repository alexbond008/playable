---
name: playable
description: Turn STEM course material (a lecture PDF, tutorial sheet, problem set, coursework docx, slides, code, or a whole lab folder) into a 3D learning game the student plays in the browser. Each concept becomes a level on a working physical machine with real physics, sound and haptics; the student predicts, plays, then the equation unlocks as a power-up. Every number is checked against the source's own answers before anything is built. Use whenever someone wants to learn, revise or teach engineering, physics, maths or computing material interactively, wants their notes, tutorial or lab "turned into a game", or asks to make a PDF/lecture/lab interactive, even if they never say "game".
license: MIT
compatibility: Written for Claude Code; follows the open Agent Skills format so Codex, Antigravity and OpenCode load it too. Needs Node.js 20.10+ and Chrome or Chromium for the playtest.
metadata:
  opencode/slash: "true"
---

# Playable

Playable turns the material a student actually learns from into a game they want to play. Zero friction applies to *learning*: the finished game is one offline HTML file that opens itself. Building it takes as long as quality demands, and the user always gets an ETA first.

`examples/motor-bench/` is the reference: Tutorial 1.1 (brushed DC motors, 8 questions with answers) became PLAYABLE-01, eight levels and a boss on a 3D motor test bench. Open it before you start.

## The one idea that matters

**The game is the lesson.** Every level's mechanic *is* the concept: turning the supply knob *is* V = Kω + IR; hanging weights on the Prony-brake arm *is* the load torque. If a mechanic could be removed without losing the physics, it is decoration. Cut it.

Three promises, in priority order:
1. **It's true.** Every number comes from the source and is reproduced by the model before any visuals exist.
2. **It teaches.** Predict → play → reveal → the equation unlocks → recall later.
3. **It feels incredible.** Physical, sonified, haptic, 60 fps, works on a phone.

## Workflow

Work in this order. Don't write scene code before step 4.

1. **Ingest and size it.** Run `node scripts/ingest.mjs <files or folders> --out=examples/<name>/source-pack`. It extracts text from docx/pptx/xlsx/Simulink/code/notebooks/data, pulls embedded images into `media/`, skips caches, and ranks what to read first in `inventory.json`. Read PDFs yourself with your file reader (the script only counts their pages). List what you found: concepts, equations, worked answers, code, data sets. Pick a tier and tell the user the ETA in one line:
   - **Quick**: one concept, one level.
   - **Lesson**: 3–8 levels plus a boss (a tutorial sheet, one lecture).
   - **Course**: a whole lab folder or module; propose a Lesson first and list what the full version adds.
   Run `date` at the start and at each step; report when a step runs past twice its share.
2. **Write `lesson.json`.** Concepts with anchors (`Q3`, `slide 12`), likely misconceptions, and `cases`: every official answer as `given → expect`, with the answer's own decimals. Mark trust: `official` answers are test cases; `student` work is a claim to check.
3. **Write `model.mjs` and pass the truth gate.** Pure functions, one solver per case, plus the live simulator the game will run. `node scripts/verify-model.mjs <dir>` must print `truth gate passed`. If an official answer fails, fix the model, never the answer. If the answer sheet makes an assumption (Q7's ideal no-load speed), follow it and say so in the level's `note`.
   - **Check against reality too.** When the source has code, data or anything a machine can run, add `truth.mjs`: compile and run the source's own code with `cpp()` and compare every claim the game makes (sizes, layouts, outputs, which line crashes, which lines fail to compile). Platform-dependent facts (e.g. `sizeof(std::string)`) are stated with their platform in the game.
   - **Student answers are claims.** When the source contains a student's own answers, check them; the game says which ones are right, and why the others are not.
4. **Design the levels.** One concept per level; a boss that combines at least three. For each level choose a mechanic (`tune`, `predict`, `fermi`, `break`, `build`, `pilot`, `boss`), write a prediction that targets a real misconception, a goal the student reaches with their hands, a reveal with live equations, the power-up it unlocks, a recall question, and a `solution` the bot can apply.
5. **Compose the world from the kit.** Read `references/kit.md` first. Use `kit/core/parts/*` and never hand-roll what the kit has; if the lesson needs a part the kit lacks, build it in the kit (a new `parts/*.mjs` with the same craft), not inline in the game. Orange (`accent`) only on what the student can grab. Physics quantities only as overlays (`currentFlow`, `torqueArrow`, `heatGlow`, `fieldLoops`). Static parts are merged automatically; anything that moves or toggles lives in a `dynamic` group.
6. **Build.** `node scripts/build.mjs <dir>` (runs the truth gate first) writes `<name>.html`. Add `--fragment` for a Claude artifact.
7. **Playtest like a critic.** `node scripts/playtest.mjs <dir>` plays every level headless at desktop and phone size with fixed-step physics, fails on any unsolved level or console error, checks draw-call budgets, and writes screenshots of every reveal and every look. Read every PNG. Fix, rebuild, repeat until it passes.
8. **Hand over.** One paragraph: what the game covers, `✓ N/N answers verified`, anything in the source that disagreed with the model.

## Code, memory and other non-physical topics

The object is still the explanation. Memory is a warehouse (`parts/memory.mjs`): slots with real addresses, variables as crates sized by their bytes, padding as foam, pointers as cables, `nullptr` as a hazard pit at 0x0, and a forklift that performs every dereference. Show the source in the code panel (`code.mjs`), step it line by line with the active line highlighted, and make every effect of a line happen physically in the warehouse. Use code-panel slots for fill-in or fix-the-line tasks. Mechanics that fit code: `trace` (predict what the next line does), `detective` (find the line that breaks), `build` (complete the code from choices).

## Learning design (non-negotiable)

- **Predict before play**, with confidence (Guessing / Fairly sure / Certain). Confident and wrong gets the hypercorrection message and an earlier recall.
- **Discover, then formalise.** The equation is revealed after the student has felt it, cited to the source, with live numbers substituted.
- **Power-ups.** Each reveal unlocks its equation into the Toolbox, live, so later levels go faster when the student uses it.
- **Stars**: solved · prediction right · no hint.
- **Spaced recall**: one question per level comes back after 1, 3, 9 days.
- **Play vs reveal**: during play only the manipulated quantity and its effect are coloured; the reveal slows time ×0.25, opens the cutaway and adds labels (≤ 3).

## Art direction

Read `ART_DIRECTION.md` and `references/anti-patterns.md` before designing. Three looks ship in every game (Bench default, Cyanotype, Paper). Orange `#FF5A1F` means "grab me" and nothing else. Semantic colours (Okabe-Ito) are for physics overlays only. Readouts in Doto; the `PLAYABLE-NN` serial plate sits on the bench.

## Budgets

| | Desktop | Phone |
|---|---|---|
| Draw calls | ≤ 400 | ≤ 120 |
| Frame rate | 60 fps | ≥ 30 fps |
| Console errors | 0 | 0 |

## Files

| Path | What it is |
|---|---|
| `kit/core/game.mjs` | Engine: map, level loop, predictions, stars, toolbox, recall, saving, autoplay bot hook |
| `kit/core/stage.mjs` | Renderer, looks, material roles, post, quality governor |
| `kit/core/geo.mjs` | Geometry helpers and the builder with static merging |
| `kit/core/parts/` | The parts library (`bench`, `motorlab`: motors, dyno + Prony brake + slotted weights, supply, switch, rheostat, wires) |
| `kit/core/overlays.mjs` | Current flow, torque arrows, heat glow and motes, field loops |
| `kit/core/physics.mjs` | Rapier wrapper |
| `kit/core/audio.mjs`, `interact.mjs` | Sonification, haptics, direct manipulation |
| `kit/vendor/` | Pinned three.js r186 and Rapier 0.21 (no install, no network) |
| `scripts/verify-model.mjs` | The truth gate |
| `scripts/build.mjs` | Single-file build (zero-dependency bundler) |
| `scripts/playtest.mjs` | Headless playtest bot and screenshots |

## Status

Phase 1 of the plan (`PLAN.md`): the engine, kit, truth gate, bundler, playtest bot and the Motor Bench example are working. Ingest scripts for docx/pptx/Simulink and parts packs beyond electromechanics come next.
