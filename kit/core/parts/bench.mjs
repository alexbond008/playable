import * as THREE from "three";
import { rbox, chamferCyl, M4, canvasTex } from "../geo.mjs";

export function bench(B, stage, { width = 14, depth = 8.4, serial = "PLAYABLE-00", subtitle = "", plate: platePos = null } = {}) {
  const W = width, D = depth;
  B.part(rbox(W, 0.6, D, 0.12, 4), "bench", { pos: [0, -0.3, 0] });
  for (const z of [-D / 2 + 0.3, D / 2 - 0.3]) B.part(rbox(W - 0.4, 0.22, 0.3, 0.05), "graphite", { pos: [0, -0.72, z] });
  for (const x of [-W / 2 + 0.6, W / 2 - 0.6]) for (const z of [-D / 2 + 0.6, D / 2 - 0.6]) B.part(chamferCyl(0.22, 0.28, 0.05, 24), "rubber", { pos: [x, -0.86, z] });

  B.part(rbox(W - 2, 0.03, 0.5, 0.01), "graphite", { pos: [0, 0.015, D / 2 - 0.45] });
  const ticks = [];
  const n = Math.floor((W - 2.2) / 0.125);
  for (let i = 0; i <= n; i++) {
    const L = i % 8 === 0 ? 0.3 : i % 4 === 0 ? 0.2 : 0.12;
    ticks.push(M4(-(W - 2.2) / 2 + i * 0.125, 0.035, D / 2 - 0.67 + L / 2, 0, 0, 0, 1, 1, L / 0.3));
  }
  B.inst(new THREE.BoxGeometry(0.018, 0.01, 0.3), "ink", ticks, { cast: false });

  const screws = [];
  for (const x of [-W / 2 + 0.4, W / 2 - 0.4]) for (const z of [-D / 2 + 0.35, D / 2 - 0.35]) screws.push(M4(x, 0.01, z));
  B.inst(chamferCyl(0.12, 0.05, 0.02, 20), "steel", screws);
  B.inst(new THREE.BoxGeometry(0.2, 0.02, 0.03), "hole", screws.map((m) => m.clone().multiply(M4(0, 0.03, 0))));

  B.part(rbox(W, 5.2, 0.2, 0.06), "graphite", { pos: [0, 2.3, -D / 2 - 0.15] });
  const holes = [];
  for (let i = 0; i < Math.floor(W / 0.5) - 1; i++) for (let j = 0; j < 9; j++) holes.push(M4(-W / 2 + 0.5 + i * 0.5, 0.2 + j * 0.5, -D / 2 - 0.04, Math.PI / 2, 0, 0));
  B.inst(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10), "hole", holes, { cast: false });

  const plate = canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = "#c99a4b";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(60,40,10,.6)";
    g.lineWidth = 6;
    g.strokeRect(14, 14, w - 28, h - 28);
    g.fillStyle = "#3b2a12";
    g.textBaseline = "middle";
    g.font = '900 112px Doto, "JetBrains Mono", monospace';
    g.fillText(serial, 48, 108);
    g.font = '500 32px "JetBrains Mono", monospace';
    g.fillText(subtitle.toUpperCase(), 52, 200);
    for (const x of [34, w - 34]) for (const y of [34, h - 34]) { g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); }
  });
  B.part(rbox(2.4, 0.05, 0.6, 0.02), new THREE.MeshStandardMaterial({ map: plate.tex, roughness: 0.4, metalness: 0.7 }), { pos: platePos ? [platePos[0], 0.03, platePos[1]] : [-W / 2 + 2, 0.03, D / 2 - 1.25] });

  const shadowTex = canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    gr.addColorStop(0, "rgba(0,0,0,.55)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }).tex;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.9, D * 2.1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.05;
  floor.userData.keep = true;
  stage.scene.add(floor);
  stage.onLook((name) => { floor.material.opacity = name === "paper" ? 0.6 : 1; });

  return { redrawPlate: plate.redraw, top: 0 };
}
