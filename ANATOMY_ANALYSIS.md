# Why Anatomy Is So Good — and What Playable Should Take From It

Studied 2026-10-17 from a full clone of https://github.com/wheresryan22/anatomy (commit e948829, Oct 15).

**Traction:** 14,900 stars and 1,137 forks in 9 days (created Oct 8). v1.1.0 shipped Oct 12; dozens of fixes since. X launch post: 16.8k likes / 2.3M views.

---

## The one-paragraph answer

Anatomy isn't great because Claude is good at drawing. It's great because the author **turned taste into a system an agent can't escape**: a precise concept ("the object is the explanation"), a hand-built kit so the agent composes instead of improvising, rules written from real rejections, and **automated audits that turn "looks wrong" into a failing exit code**. Then he wrapped it in exceptional packaging (gallery, install table for 5 agents, honest limits, community gallery with one-command publishing). Quality is enforced, not hoped for.

---

## 1. A sharp, ownable concept

- **"The object is the explanation."** Not diagrams — an invented physical machine whose working *is* the idea (cache key → pin-tumbler lock; one GPU context → gantry plotter visiting 16 wells). One sentence anyone can repeat.
- **Explicit failure modes** named up front: "too abstract" and "too flat and bland" — and the single fix for both.
- **A clear quality bar by reference**: "The test rig is the quality bar for the drawing. The Raptor is the bar for shader work."
- **Honest scope** (README "Limits"): not a chart library, draws machines not people, "slow on purpose", shaders need WebGL, 3D is beta with measured fps. Honesty builds trust and pre-empts bad reviews.

## 2. The agent composes; it never improvises

- **A kit does the hard craft** (`iso-kit`, `lathe.mjs`, `tube.mjs`, `gl.mjs`, `turn*.mjs`): camera, four-tone shading, parts recipes (knurl, coil, radial ticks, ruler strip, label plate), round parts on any axis, pipes with braids. The agent calls `slabOf`, `cylinder`, `knurl`, `coil` — quality is built in.
- **Zero dependencies.** Node built-ins only, nothing to `npm install`. Examples rebuild **byte-for-byte** on Node 20 and 22. Works everywhere, nothing to break.
- **A rigid workflow** in SKILL.md, in order: size it → truth first → invent the object → parts list (≥ 40 parts, grouped) → plan the world → build geometry once → paint order → frame it → make it live → verify like a critic. "Write the concept and the parts list before any geometry. Most of the quality is decided there."
- **Size tiers with time budgets** (Figure / Hero / Epic). Epic: "Do not start it" — propose a Hero instead. "Have a working page that opens in the browser within the first hour." Run `date` at each step; report when over budget.
- **Numbers as rules, not vibes**: bevels 0.4–1.6, grooves inset 3–5, screws 0.4–0.55 dots, ticks every 4–5 units with a major every 5th, figure fills 55–65% of the card, must read at 390 px.

## 3. Rules written in blood (institutional memory)

`references/craft.md` § Anti-patterns: every rule comes from a **real rejection, often with the owner's own words**:
- "Pipes through pipes… which makes no sense" (looked fine at 1×, broken at zoom)
- Textures that stop: "we'd rather fade them out at the end than an instant stop"
- Shader that "changed colour instantly… as if cut out"
- "Red ink smoke": a dark-theme glow darkened for paper
- "Stand-in shapes": a builder faked geometry to silence the audit → now the audit detects stand-ins (< 60% coverage fails)
- "The Raptor's hand-set keys looked right at 1× and had 323 depth-order problems. Measure, then look."

Each section of `webgl.md` § 7 is literally "Craft rules, each with the bug that taught it." The agent inherits every past mistake.

## 4. Verification turns taste into exit codes (the real moat)

- `kit/audit.mjs` (1,900 lines): proves nothing passes through anything **at rest, apart, and in every replayed frame**; every end sits on a mount; every overlap in true depth order; supports, folds, crowding, wobble, stand-ins. Exits non-zero.
- `scripts/lines.mjs`: every line must end on a stroke, dot or outline → `line ends: 0`, with failures ringed in a PNG.
- `capture.mjs` / `drive.mjs`: headless Chrome with WebGL — desktop, 390 px phone, hover, motion, slow-mo contact sheets that catch pops, `--no-webgl` fallback.
- `turn-check.mjs`: 3D fidelity, z-order, pixel pops, line ends at 24 angles, frame timing.
- **"Read every PNG you make."** 4× close-ups of every junction, in both themes. "The owner finds faults by zooming in, so you zoom in first."
- **CI rebuilds every example** and fails on any diff (`git diff --exit-code`). Kit changes must be opt-in and leave every example byte-identical.

## 5. Examples as the curriculum

- 8 complete examples, small → epic (dial indicator ~300 lines → Raptor ~270 solids → 3D hand). "Open the closest one before you start."
- Built pages committed — anyone can open them with no tooling.
- `references/walkthrough.md`: the test rig designed step by step (truth → object → 53-part list → camera → geometry → order → live → card). Teaches the *process*, not just the API.
- `evals/evals.json`: realistic prompts (blog post, Next.js docs, landing page SVG, Bunsen burner, espresso machine) with **expected outputs spelled out** — including "4× close-ups were made and looked at".

## 6. Packaging & distribution

- **README:** one-line pitch → gallery of 4 stunning images with one-line captions that sell a capability each ("hover to take it apart into 11 assemblies; an audit proves no pipe passes through anything") → install table for **5 agents × 3 methods** (skills CLI, git, zip) → usage with copy-paste prompts → "Three habits get the best figures" → how it works → limits.
- Agent-specific gotchas solved in advance (Codex sandbox blocking Chrome, `/reload-skills`, Node versions).
- Landing site (skills.wheresryan.sh/anatomy) with a numbered collection of figures.
- Professional repo hygiene: CHANGELOG (Keep a Changelog + semver), CONTRIBUTING with house rules, CoC, SECURITY, issue forms ("Request a figure"), CI.

## 7. The growth loop

- **Community gallery** (`anatomy-community`): "publish this figure to the Anatomy community gallery" → the agent asks for a title and GitHub name, **shows what it will send, waits for yes**, opens the PR. No git knowledge needed.
- Each published figure records **time taken and tokens used** (read from the Claude Code session log) — social proof and a flex.
- Gallery rebuilds figures in a sandbox pinned to the kit fingerprint.
- "If Anatomy drew something useful for you, a ⭐ helps other people find it."

## 8. Craft of the writing itself

- Plain, precise, numerical. Every claim checked ("Docs follow the same rule: never write a number or a feature you have not checked").
- **No comments in code** (house rule) — explanation lives in names and structure.
- Light theme designed first ("Light is the theme the skill designs for first, shaders included").

---

## What Playable takes (changes to our plan)

| # | Anatomy move | Playable version |
|---|---|---|
| 1 | "The object is the explanation" | Keep it **and** add our own line: **"the game is the lesson"** — every mechanic must *be* the concept (turning the knob *is* V = Kω + IR). Write it as SKILL.md's "one idea that matters". |
| 2 | Kit does the craft; agent composes | Already planned. Raise the bar: a **parts library with recipes** (motor, gear, spring, damper, PCB, scope, memory shelf…) + **mechanic templates** — the agent never writes raw three.js for common parts. |
| 3 | Zero deps, byte-identical builds | **Vendor** three.js r186 + Rapier into `kit/vendor/` (pinned, committed). Node built-ins only. Deterministic build; CI rebuilds examples and fails on diff. |
| 4 | Rigid ordered workflow + size tiers | Tiers by game size: **Quick** (1 concept, 1 level), **Lesson** (3–6 levels + boss), **Course** (whole lab folder) — with "playable page in the first N minutes, then deepen". |
| 5 | Anti-patterns from real rejections | Start `references/anti-patterns.md` **now**, seeded from the Style Lab: AgX turned orange salmon; bloom on every light surface; Paper blew out; equation card clipped; perf counter lied; 260 draw calls on phone budget 120. Every future rejection gets added with your words. |
| 6 | Audits → exit codes | Our audit suite: **truth gate** (all official answers reproduced) · **playtest bot** (every level winnable) · **colour audit** (only grabbables are orange; only overlays use semantic colours; CVD separation) · **label cap** (≤ 3 in play) · **perf budget** (draw calls/tris/fps on a phone profile) · **interpenetration** (three-mesh-bvh: no part through another, every wire ends on a terminal) · **no console errors** · **reduced-motion & each theme renders**. |
| 7 | "Read every PNG"; 4× close-ups | Same: screenshots of every level × 3 looks × phone/desktop + close-ups of every interactive part; agent must look before handing over. |
| 8 | Examples ladder + walkthrough | Ship examples small → big: **Ohm's law (tiny)** → **Motor Bench** → **Memory Warehouse** → **Match Maker** → **Rig Tuner (lab folder)**. Write `walkthrough.md` for Motor Bench. |
| 9 | evals.json with expected outputs | Evals = real artifacts (your Uni files + public ones) with expected outputs: "all N answers verified", "≥ 1 equation unlock reused", "phone ≥ 30 fps", "screenshots reviewed". |
| 10 | Install table for 5 agents, gotchas solved | Same table (Claude Code, Codex, Antigravity, OpenCode, MiniMax Code); pre-solve Codex sandbox + headless Chrome. |
| 11 | Honest Limits section | Write ours early: "teaches what's in your file, verified against its answers; not a replacement for doing the problems; 3D parts library covers EE/mech/control/embedded first". |
| 12 | Community gallery + publish script | **Playable Arcade**: "publish this game" → PR with the game, its `PLAYABLE-NN` number, subject tags, minutes and tokens used. Numbered collectibles + gallery = the growth loop. |
| 13 | Landing site with collection | Already planned (§9 of PLAN) — model the collection on Anatomy's numbered grid, but lead with a **live playable hero** (Anatomy leads with text). |
| 14 | Professional repo hygiene | CHANGELOG, semver, CONTRIBUTING with house rules, issue forms ("Request a game for my course"), CI from day one. |

## Where Playable must differ

- **Speed vs craft — resolved (2026-10-17).** Like Anatomy, we don't sacrifice quality for build speed. "Zero friction" is about *learning* from the finished game, not building it. The skill gives an honest ETA up front and reports against it. A strong pre-built kit still matters — for quality and consistency, not to cut corners.
- **Real 3D is our core, not a beta.** Anatomy's 3D mode is an SVG re-projection engine (13–15 fps on a phone with 380 parts). We use three.js + instancing + merged geometry with strict phone budgets — our perf audit is mandatory, not optional.
- **Games, sound, haptics, learning science.** Anatomy is calm and silent; it explains. Playable plays: predict → play → reveal → unlock, with sonified physics.
- **Dark-first identity with three looks.** Anatomy designs light first. We ship Bench (default) / Cyanotype / Paper, all audited.
- **Inputs are messy files, not prompts.** Our ingest + truth gate (answers in the source become test cases) has no Anatomy equivalent — it's our moat.

## Immediate actions

1. Create `references/anti-patterns.md` seeded with the Style Lab lessons.
2. Add an **Audit suite** section to PLAN.md (item 6 above) and vendored deps (item 3).
3. Re-cut the roadmap: Phase 1 includes the first audits (truth gate, perf budget, colour audit), not just the game.
4. Plan the examples ladder starting with a tiny Ohm's-law game as the "dial indicator" equivalent.
