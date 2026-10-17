import { playable } from "../../kit/core/game.mjs";
import { bench } from "../../kit/core/parts/bench.mjs";
import { memoryWarehouse } from "../../kit/core/parts/memory.mjs";
import { createCodePanel } from "../../kit/core/code.mjs";
import { createAnimator } from "../../kit/core/anim.mjs";

const SRC = `#include <iostream>
using namespace std;

int main ()
{
  uint32_t* p = 0;
  uint32_t i = 11;

  *p = 12;

  cout << *p << endl;
  return 0;
}`;

playable({
  id: "smoke-memory", serial: "PLAYABLE-00", title: "Smoke", source: "kit smoke test", subtitle: "Memory warehouse parts", 
  camera: { position: [2, 7.5, 13], target: [-0.6, 1.1, 0] },
  readouts: [], equations: [],
  levels: [{ id: "S1", anchor: "S1", mechanic: "tune", source: "smoke", title: "Smoke", brief: "smoke", goal: { text: "none", check: () => false }, reveal: { title: "x", body: "x", equations: [] } }],
  async build({ stage, B, hud }) {
    bench(B, stage, { serial: "PLAYABLE-00", subtitle: "memory smoke" });
    const mem = memoryWarehouse(B, stage, {});
    const anim = createAnimator();
    const i = mem.crate({ name: "i", type: "uint32_t", bytes: 4, value: 11, region: "stack", index: 2 });
    const p = mem.crate({ name: "p", type: "uint32_t*", bytes: 8, value: "nullptr", region: "stack", index: 4, pointer: true });
    const house = mem.crate({ name: "NewRoad[0]", type: "House · 32 B", bytes: 32, value: "1 · LE11 3TU", region: "heap", index: 0, padding: [1] });
    const cable = mem.cable(p, null, { grabbable: true });
    const code = createCodePanel(hud, { title: "tutorial-q1.cpp", source: SRC });
    code.setActive(9); code.mark(9, "error", "segfault: *p with p == nullptr");
    window.__smoke = { mem, anim, cable, i, p, house, code };
    return {
      step(dt) { anim.update(dt); },
      redraw() { mem.redraw(); },
    };
  },
});
