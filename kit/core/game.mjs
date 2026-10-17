import * as THREE from "three";
import { createStage } from "./stage.mjs";
import { createBuilder } from "./geo.mjs";
import { createAudio } from "./audio.mjs";
import { createInteraction } from "./interact.mjs";
import { LOOKS, LOOK_ORDER } from "./looks.mjs";
import { HUD_CSS } from "./hud-css.mjs";

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
};

function storage(key) {
  return {
    load() {
      try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }
    },
    save(v) {
      try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
    },
  };
}

const DAY = 864e5;
const MECH = { tune: "Tune", predict: "Predict", fermi: "Fermi", break: "Break it", build: "Build", pilot: "Pilot", boss: "Boss" };

export async function playable(def) {
  const style = document.createElement("style");
  style.textContent = HUD_CSS;
  document.head.append(style);
  document.title = `${def.title} · Playable`;

  const stageEl = h("div", { id: "stage" });
  const hud = h("div", { id: "hud" });
  document.body.append(stageEl, hud);

  const stage = createStage(stageEl, def.camera);
  const B = createBuilder(stage);
  const audio = createAudio();
  const interaction = createInteraction(stage, audio);
  const overlay = h("div", { id: "wtags" });
  hud.append(overlay);
  const ctx = { stage, B, audio, interaction, THREE, h, overlay };
  const world = await def.build(ctx);
  const stats = B.finalize();
  world.redraw?.();

  const store = storage(`playable:${def.id}`);
  const progress = Object.assign({ stars: {}, unlocked: [], recall: {}, best: {} }, store.load());
  const save = () => store.save(progress);
  const totalStars = () => Object.values(progress.stars).reduce((a, b) => a + b, 0);

  const readoutEls = new Map();
  const brand = h("div", { class: "brand" }, h("b", {}, "PLAYABLE"), h("span", {}, `${def.serial} · ${def.title}`));
  const big = h("div", { class: "big" });
  const minis = h("div", { class: "minis" });
  const objective = h("div", { class: "objective", "aria-live": "polite" });
  const readouts = h("div", { id: "readouts" }, brand, big, minis, objective);

  const card = h("section", { id: "card", "aria-live": "polite" });
  const sheet = h("aside", { id: "panel" }, card);

  const lookBtns = LOOK_ORDER.map((k) => h("button", { class: "look", "data-look": k, title: `${LOOKS[k].label} look`, "aria-label": `${LOOKS[k].label} look`, onclick: () => { stage.setLook(k); audio.detent(); syncLook(); } }));
  const soundBtn = h("button", { class: "tool", onclick: () => { audio.unlock(); audio.setMuted(!audio.muted); syncSound(); } });
  const toolboxBtn = h("button", { class: "tool", onclick: () => toggleToolbox() }, "Toolbox");
  const mapBtn = h("button", { class: "tool", onclick: () => openMap() }, "Map");
  const tools = h("nav", { id: "tools" }, mapBtn, toolboxBtn, soundBtn, h("span", { class: "looks" }, lookBtns));
  const perf = h("div", { id: "perf" });
  const badge = h("div", { id: "badge", hidden: true });
  const toast = h("div", { id: "toast", hidden: true });
  const toolbox = h("div", { id: "toolbox", hidden: true });
  const modal = h("div", { id: "modal", hidden: true });
  const tags = h("div", { id: "tags" });
  hud.append(readouts, tags, sheet, tools, perf, badge, toast, toolbox, modal);

  const syncLook = () => lookBtns.forEach((b) => b.setAttribute("aria-pressed", b.dataset.look === stage.look));
  const syncSound = () => { soundBtn.textContent = !audio.ready || audio.muted ? "Sound on" : "Sound off"; soundBtn.classList.toggle("hot", !audio.ready || audio.muted); };
  syncSound();

  for (const r of def.readouts) {
    const num = h("em", {}, "—");
    const box = r.big
      ? h("div", { class: "bigbox" }, h("span", { class: "num" }, num), h("span", { class: "unit" }, r.unit))
      : h("div", {}, h("i", {}, r.label), num, r.unit ? ` ${r.unit}` : "");
    (r.big ? big : minis).append(box);
    readoutEls.set(r.key, { r, num, box });
  }

  let level = null;
  let phase = "map";
  let goalTimer = 0;
  let prediction = null;
  let hintUsed = false;
  let revealAnchors = [];

  function setReadouts() {
    for (const [key, { r, num, box }] of readoutEls) {
      const show = level ? (level.readouts ?? def.readouts.map((x) => x.key)).includes(key) : !!r.big;
      const hidden = level?.hide?.includes(key) && phase !== "reveal" && phase !== "stars";
      box.hidden = !show;
      if (show) num.textContent = hidden ? "??" : r.format ? r.format(r.get(world)) : r.get(world).toFixed(r.digits ?? 1);
    }
  }

  function showToast(text, ms = 2200) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => (toast.hidden = true), ms);
  }

  function renderToolbox() {
    toolbox.replaceChildren(
      h("div", { class: "tb-head" }, h("b", {}, "Toolbox"), h("span", {}, `${progress.unlocked.length} unlocked`), h("button", { class: "x", "aria-label": "Close toolbox", onclick: () => toggleToolbox(false) }, "×")),
      ...(progress.unlocked.length
        ? def.equations.filter((e) => progress.unlocked.includes(e.id)).map((e) => h("div", { class: "eqcard" }, h("div", { class: "f" }, e.f), h("div", { class: "live", "data-eq": e.id }, ""), h("div", { class: "src" }, e.source)))
        : [h("p", { class: "note" }, "Equations you discover unlock here. Later levels go faster when you use them.")])
    );
  }
  function toggleToolbox(force) {
    const open = force ?? toolbox.hidden;
    if (open) renderToolbox();
    toolbox.hidden = !open;
  }

  function levelState(l) {
    const done = progress.stars[l.id] != null;
    const locked = !!l.boss && !location.hash.includes("unlock") && !def.levels.filter((x) => !x.boss).every((x) => progress.stars[x.id] != null);
    return { done, locked };
  }

  function openMap() {
    phase = "map";
    stage.timeScale = 1;
    toggleToolbox(false);
    clearReveal();
    const due = Object.entries(progress.recall).filter(([, r]) => r.due <= Date.now() || location.hash === "#recall").map(([id]) => def.levels.find((l) => l.id === id)).filter((l) => l?.recall);
    const grid = h("div", { class: "grid" });
    def.levels.forEach((l, i) => {
      const st = levelState(l);
      const stars = progress.stars[l.id] ?? 0;
      grid.append(
        h("button", { class: `lvl${l.boss ? " boss" : ""}${st.done ? " done" : ""}`, disabled: st.locked, onclick: () => startLevel(l) },
          h("span", { class: "n" }, l.boss ? "BOSS" : String(i + 1).padStart(2, "0")),
          h("span", { class: "t" }, l.title),
          h("span", { class: "m" }, `${MECH[l.mechanic] ?? l.mechanic} · ${l.anchor}`),
          h("span", { class: "s", "aria-label": `${stars} of 3 stars` }, "★".repeat(stars) + "☆".repeat(3 - stars)),
          st.locked ? h("span", { class: "lock" }, "Finish every level to unlock") : null)
      );
    });
    const max = def.levels.length * 3;
    modal.replaceChildren(
      h("div", { class: "map" },
        h("header", {},
          h("div", {}, h("div", { class: "eyebrow" }, `${def.serial} · ${def.source}`), h("h1", {}, def.title), h("p", { class: "sub" }, def.subtitle)),
          h("div", { class: "meta" },
            h("div", { class: "starsum" }, h("b", {}, String(totalStars())), ` / ${max} ★`),
            def.verified ? h("div", { class: "verified", title: "Every answer on the sheet is reproduced by the simulation" }, `✓ ${def.verified.passed}/${def.verified.cases} answers verified`) : null)),
        due.length ? recallCard(due[0]) : null,
        grid,
        h("footer", {}, h("span", { class: "note" }, "Drag to orbit · orange parts are yours to grab · keys: M map, T toolbox, H hint, 1 2 3 looks"), h("span", { class: "looks" }, LOOK_ORDER.map((k) => h("button", { class: "look", "data-look": k, "aria-pressed": k === stage.look, "aria-label": `${LOOKS[k].label} look`, onclick: (e) => { stage.setLook(k); syncLook(); e.currentTarget.parentNode.querySelectorAll(".look").forEach((b) => b.setAttribute("aria-pressed", b.dataset.look === k)); } })))))
    );
    modal.hidden = false;
    sheet.hidden = true;
    objective.textContent = "";
    world.setLevel?.(null);
    setReadouts();
  }

  function recallCard(l) {
    const box = h("div", { class: "recall" }, h("div", { class: "eyebrow" }, `Quick recall · ${l.title}`), h("p", {}, l.recall.q));
    const opts = h("div", { class: "opts" });
    l.recall.options.forEach((o, i) =>
      opts.append(h("button", { class: "opt", onclick: () => {
        const ok = i === l.recall.answer;
        const r = progress.recall[l.id];
        r.n = ok ? (r.n || 1) * 3 : 1;
        r.due = Date.now() + r.n * DAY;
        save();
        ok ? audio.win() : audio.miss();
        box.replaceChildren(h("div", { class: "eyebrow" }, ok ? "Remembered ✓" : "Not quite"), h("p", {}, ok ? `Next check in ${r.n} day${r.n > 1 ? "s" : ""}.` : `Answer: ${l.recall.options[l.recall.answer]}. It comes back tomorrow.`));
      } }, o))
    );
    box.append(opts);
    return box;
  }

  function startLevel(l) {
    audio.unlock();
    syncSound();
    level = l;
    modal.hidden = true;
    sheet.hidden = false;
    hintUsed = false;
    prediction = null;
    goalTimer = 0;
    clearReveal();
    world.setLevel?.(l);
    l.setup?.(world);
    phase = "brief";
    renderCard();
    setReadouts();
  }

  function renderCard() {
    const l = level;
    const head = h("header", {}, h("div", { class: "eyebrow" }, `${l.boss ? "Boss" : MECH[l.mechanic] ?? l.mechanic} · ${l.source}`), h("h2", {}, l.title));
    objective.textContent = "";
    if (phase === "brief") {
      card.replaceChildren(head, h("p", {}, l.brief), h("div", { class: "actions" }, h("button", { class: "primary", onclick: () => { audio.commit(); phase = l.predict ? "predict" : "play"; renderCard(); } }, l.predict ? "Make a prediction" : "Start")));
    } else if (phase === "predict") {
      const p = l.predict;
      let value = p.type === "number" ? p.start ?? (p.min + p.max) / 2 : null;
      let conf = null;
      const commit = h("button", { class: "primary", disabled: true, onclick: () => {
        prediction = { value, conf };
        audio.commit();
        phase = "play";
        renderCard();
      } }, "Lock it in");
      const ready = () => (commit.disabled = value == null || conf == null);
      let input;
      if (p.type === "number") {
        const out = h("output", {}, `${fmt(value, p.step)} ${p.unit}`);
        const range = h("input", { type: "range", min: p.min, max: p.max, step: p.step, value, id: `pred-${l.id}`, "aria-label": p.prompt, oninput: (e) => { value = +e.target.value; out.textContent = `${fmt(value, p.step)} ${p.unit}`; audio.detent(); ready(); } });
        input = h("div", { class: "pred-num" }, out, range);
      } else {
        input = h("div", { class: "opts" }, p.options.map((o, i) => h("button", { class: "opt", "aria-pressed": false, onclick: (e) => { value = i; e.currentTarget.parentNode.querySelectorAll(".opt").forEach((b, j) => b.setAttribute("aria-pressed", j === i)); audio.detent(); ready(); } }, o)));
      }
      const confRow = h("div", { class: "conf" }, h("span", {}, "How sure are you?"), ["Guessing", "Fairly sure", "Certain"].map((c, i) => h("button", { class: "chip", "aria-pressed": false, onclick: (e) => { conf = i; e.currentTarget.parentNode.querySelectorAll(".chip").forEach((b, j) => b.setAttribute("aria-pressed", j === i)); audio.detent(); ready(); } }, c)));
      card.replaceChildren(head, h("p", { class: "q" }, p.prompt), input, confRow, h("div", { class: "actions" }, commit));
      ready();
    } else if (phase === "play") {
      objective.textContent = l.goal.text;
      card.replaceChildren(...[head, h("p", {}, l.goal.instructions ?? l.brief), prediction ? h("div", { class: "yourpred" }, "Your prediction: ", h("b", {}, predText(l, prediction.value))) : null, h("div", { class: "status", id: "goalstatus" }, ""), h("div", { class: "actions" }, l.hint ? h("button", { class: "ghost", onclick: (e) => { hintUsed = true; e.currentTarget.replaceWith(h("p", { class: "hint" }, l.hint)); audio.detent(); } }, "Hint (costs a star)") : null, l.goal.manual ? h("button", { class: "primary", onclick: () => finish() }, l.goal.manual) : null)].filter(Boolean));
    }
  }

  function predText(l, v) {
    const p = l.predict;
    return p.type === "number" ? `${fmt(v, p.step)} ${p.unit}` : p.options[v];
  }

  function predictionCorrect(l) {
    if (!l.predict || !prediction) return null;
    const p = l.predict;
    const ans = typeof p.answer === "function" ? p.answer(world) : p.answer;
    if (p.type === "number") return Math.abs(prediction.value - ans) <= Math.abs(ans) * (p.tolerance ?? 0.03);
    return prediction.value === ans;
  }

  function finish() {
    const l = level;
    phase = "reveal";
    audio.win();
    const correct = predictionCorrect(l);
    const stars = 1 + (correct === false ? 0 : 1) + (hintUsed ? 0 : 1);
    const prev = progress.stars[l.id] ?? 0;
    progress.stars[l.id] = Math.max(prev, stars);
    const newUnlock = l.reveal.unlock && !progress.unlocked.includes(l.reveal.unlock);
    if (newUnlock) progress.unlocked.push(l.reveal.unlock);
    if (l.recall) {
      const conf = prediction?.conf ?? 1;
      const n = correct === false && conf === 2 ? 0.5 : 1;
      progress.recall[l.id] = { n, due: Date.now() + n * DAY };
    }
    save();
    stage.timeScale = 0.25;
    badge.textContent = "REVEAL · SLOW ×0.25";
    badge.hidden = false;
    world.reveal?.(true);
    objective.textContent = "";

    const p = l.predict;
    const ans = p ? (typeof p.answer === "function" ? p.answer(world) : p.answer) : null;
    let verdict = null;
    if (p && prediction) {
      const conf = prediction.conf;
      const msg = correct
        ? conf === 0 ? "Right, even as a guess. Now you know why." : "Right, and you knew it."
        : conf === 2 ? "You were certain, and it went the other way. That surprise is what makes this one stick." : "Not this time. Look at why below.";
      verdict = h("div", { class: `verdict ${correct ? "ok" : "no"}` }, h("div", {}, h("span", {}, "You said "), h("b", {}, predText(l, prediction.value))), h("div", {}, h("span", {}, "Reality "), h("b", {}, p.type === "number" ? `${fmt(ans, p.step)} ${p.unit}` : p.options[ans])), h("p", {}, msg));
    }
    const eqs = l.reveal.equations.map((e) => h("div", { class: "eqline" }, h("div", { class: "f" }, e.f), e.live ? h("div", { class: "live", "data-live": "1" }, "") : null));
    const starRow = h("div", { class: "starrow", "aria-label": `${stars} of 3 stars` }, [0, 1, 2].map((i) => h("span", { class: i < stars ? "on" : "" }, "★")));
    stars && [0, 1, 2].slice(0, stars).forEach((i) => setTimeout(() => audio.star(i), 450 + i * 180));
    const idx = def.levels.indexOf(l);
    const next = def.levels[idx + 1];
    const nextOk = next && (!next.boss || def.levels.filter((x) => !x.boss).every((x) => progress.stars[x.id] != null));
    card.replaceChildren(...[
      h("header", {}, h("div", { class: "eyebrow" }, `Solved · ${l.source}`), h("h2", {}, l.reveal.title)),
      starRow,
      verdict,
      h("p", {}, l.reveal.body),
      ...eqs,
      l.reveal.note ? h("p", { class: "note" }, l.reveal.note) : null,
      newUnlock ? h("div", { class: "unlock" }, h("span", {}, "Power-up unlocked"), h("b", {}, def.equations.find((e) => e.id === l.reveal.unlock)?.f ?? l.reveal.unlock), h("small", {}, "Now live in your Toolbox")) : null,
      h("div", { class: "actions" }, h("button", { class: "ghost", onclick: () => startLevel(l) }, "Replay"), h("button", { class: "ghost", onclick: () => openMap() }, "Map"), nextOk ? h("button", { class: "primary", onclick: () => startLevel(next) }, `Next: ${next.title}`) : null),
    ].filter(Boolean));
    if (newUnlock) setTimeout(() => audio.unlockFx(), 1100);
    revealAnchors = (l.reveal.tags ?? []).map((t) => {
      const el = h("div", { class: "tag" }, t.text);
      tags.append(el);
      return { el, at: t.at };
    });
    revealEquations = eqs;
  }
  let revealEquations = [];

  function clearReveal() {
    badge.hidden = true;
    stage.timeScale = 1;
    world.reveal?.(false);
    tags.replaceChildren();
    revealAnchors = [];
    revealEquations = [];
  }

  function fmt(v, step = 0.1) {
    const d = step >= 1 ? 0 : Math.max(0, Math.ceil(-Math.log10(step)));
    return Number(v).toFixed(d);
  }

  const v = new THREE.Vector3();
  function placeTag(el, worldPos, clampTop = 0) {
    v.copy(worldPos).project(stage.camera);
    const r = stage.renderer.domElement.getBoundingClientRect();
    let x = ((v.x + 1) / 2) * r.width;
    let y = ((1 - v.y) / 2) * r.height;
    const w = el.offsetWidth / 2;
    x = Math.min(Math.max(x, w + 12), r.width - w - 12);
    y = Math.max(y, el.offsetHeight + 12 + clampTop);
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    el.hidden = v.z > 1;
  }

  addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, select, textarea")) return;
    const k = e.key.toLowerCase();
    if (k === "m") openMap();
    else if (k === "t") toggleToolbox();
    else if (["1", "2", "3"].includes(k)) { stage.setLook(LOOK_ORDER[+k - 1]); syncLook(); }
    else if (k === "h" && phase === "play") card.querySelector(".ghost")?.click();
    else world.onKey?.(e, phase);
  });

  let manual = false;
  stage.onFrame((dt, dtReal, t) => { if (!manual) tick(dt, dtReal, t); });
  function tick(dt, dtReal, t) {
    world.step?.(dt, dtReal, t, phase);
    if (phase === "play" && level?.goal?.check) {
      const ok = level.goal.check(world);
      goalTimer = ok ? goalTimer + dtReal : Math.max(0, goalTimer - dtReal * 2);
      const status = card.querySelector("#goalstatus");
      if (status) {
        const s = level.goal.status?.(world) ?? "";
        status.textContent = ok ? `${s} · holding ${Math.min(level.goal.hold ?? 1, goalTimer).toFixed(1)} s` : s;
        status.classList.toggle("ok", ok);
      }
      if (goalTimer >= (level.goal.hold ?? 1)) finish();
    }
    if (phase === "reveal" || phase === "stars") {
      const lines = card.querySelectorAll("[data-live]");
      level.reveal.equations.filter((e) => e.live).forEach((e, i) => { if (lines[i]) lines[i].textContent = e.live(world); });
      for (const a of revealAnchors) placeTag(a.el, a.at(world));
    }
    if (!toolbox.hidden) toolbox.querySelectorAll("[data-eq]").forEach((el) => { const e = def.equations.find((q) => q.id === el.dataset.eq); el.textContent = e.live ? e.live(world) : ""; });
    for (const a of world.anchors?.() ?? []) placeTag(a.el, a.at());
    setReadouts();
    perf.textContent = `${stage.perf.fps} fps · ${stage.perf.calls} draws · ${Math.round(stage.perf.tris / 1000)}k tris`;
  }

  async function autoplay(id, { simSeconds = 60 } = {}) {
    const l = def.levels.find((x) => x.id === id);
    startLevel(l);
    if (l.predict) {
      const ans = typeof l.predict.answer === "function" ? l.predict.answer(world) : l.predict.answer;
      prediction = { value: ans, conf: 1 };
    }
    phase = "play";
    renderCard();
    world.solve?.(l.solution ?? {});
    const t0 = performance.now();
    const step = 1 / 60;
    let simT = 0;
    manual = true;
    try {
      for (let i = 0; phase === "play" && simT < simSeconds; i++) {
        tick(step * stage.timeScale, step, simT);
        simT += step;
        if (i % 240 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      for (let i = 0; i < 90; i++) tick(step * stage.timeScale, step, simT + i * step);
    } finally {
      manual = false;
    }
    return { id, solved: phase === "reveal", simSeconds: +simT.toFixed(2), ms: Math.round(performance.now() - t0), stars: progress.stars[id] ?? 0 };
  }
  window.__playable = { stage, world, interaction, def, autoplay, openMap: () => openMap(), startLevel: (id) => startLevel(def.levels.find((l) => l.id === id)), finish: () => finish(), get phase() { return phase; } };
  stage.start();
  syncLook();
  world.redraw?.();
  document.fonts?.ready.then(() => world.redraw?.());
  openMap();
  return { stage, world, stats };
}
