import * as THREE from "three";
import { rbox, lathe, chamferCyl, toX, toZ, M4, canvasTex } from "../geo.mjs";
import { SEMANTIC } from "../looks.mjs";

// Servo / control-lab parts: a position flywheel with a graduated dial, a friction brake with an orange
// thumbscrew, a generic orange rotary knob, and a controller box carrying knobs and a phosphor display.
// Build them in a parent whose local +x is the motor shaft (the frame dcMotor uses), so a whole rig can be
// rotated to face the camera by rotating one group.

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ rotary knob (orange, grabbable)
// Lies in the parent's XY plane facing +z unless `rot` says otherwise. set(f) takes 0…1 over `sweep` radians.
export function rotaryKnob(B, stage, { parent, pos = [0, 0, 0], rot = [0, 0, 0], radius = 0.26, sweep = 4.6, ticks = 11, dial = true } = {}) {
  const base = B.group({ parent, pos, rot });
  const knob = B.group({ parent: base, dynamic: true, merge: true });
  const body = B.part(toZ(lathe([[0, 0], [radius, 0], [radius * 1.04, radius * 0.12], [radius * 0.94, radius * 0.86], [radius * 0.76, radius * 1.02], [0, radius * 1.02]], 40)), "accent", { parent: knob, thresh: 20 });
  body.userData.noMerge = true; // grabbed meshes must stay in the scene graph (merging would detach them)
  B.part(new THREE.BoxGeometry(radius * 0.14, radius * 0.62, radius * 0.06), "ink", { parent: knob, pos: [0, radius * 0.48, radius * 1.03], edges: false, cast: false });
  if (dial) {
    const tm = [];
    for (let k = 0; k < ticks; k++) {
      const a = -sweep / 2 + (sweep * k) / (ticks - 1);
      tm.push(M4(-Math.sin(a) * radius * 1.45, Math.cos(a) * radius * 1.45, 0.005, 0, 0, a, 1, k % 5 === 0 ? 1.5 : 1, 1));
    }
    B.inst(new THREE.BoxGeometry(0.022, radius * 0.32, 0.012), "ink", tm, { parent: base, cast: false });
  }
  let f = 0.5;
  const set = (v) => { f = Math.max(0, Math.min(1, v)); knob.rotation.z = sweep / 2 - sweep * f; };
  set(0.5);
  return {
    group: base, knob, grab: [body], set,
    get f() { return f; },
    anchor: () => base.localToWorld(v3(0, radius * 2.3, radius)),
  };
}

// ------------------------------------------------------------------ flywheel with a position dial
// In the parent frame (axis +x). `x` is where the disc sits on the shaft. θ is CCW seen from +x, 0 = up.
export function servoWheel(B, stage, { parent, x = 2.3, axisY = 1.45, radius = 1.0, ringRadius = 1.42, labels = true, dialOffset = -0.3 } = {}) {
  const spin = B.group({ parent, pos: [x, axisY, 0], dynamic: true, merge: true });
  // flywheel: a thick rim, thin web, hub
  const prof = [[0.16, -0.1], [radius * 0.82, -0.08], [radius * 0.86, -0.17], [radius, -0.17], [radius + 0.02, -0.14], [radius + 0.02, 0.14], [radius, 0.17], [radius * 0.86, 0.17], [radius * 0.82, 0.08], [0.3, 0.08], [0.28, 0.2], [0.16, 0.2]];
  B.part(toX(lathe(prof, 80)), "clay", { parent: spin, thresh: 25 });
  const holes = [];
  for (let k = 0; k < 5; k++) {
    const a = (k * Math.PI * 2) / 5 + Math.PI / 5;
    holes.push(M4(0.085, Math.cos(a) * radius * 0.55, Math.sin(a) * radius * 0.55, 0, 0, -Math.PI / 2));
  }
  B.inst(new THREE.CylinderGeometry(radius * 0.17, radius * 0.17, 0.02, 28), "hole", holes, { parent: spin, cast: false });
  // the pointer: a long ink needle from the hub to past the rim, with a bright tip
  B.part(new THREE.BoxGeometry(0.03, ringRadius - 0.06, 0.07).translate(0, (ringRadius - 0.06) / 2, 0), "ink", { parent: spin, pos: [0.2, 0, 0], edges: false });
  B.part(new THREE.ConeGeometry(0.07, 0.2, 3).translate(0, ringRadius - 0.02, 0), "ink", { parent: spin, pos: [0.2, 0, 0], edges: false });
  B.part(toX(chamferCyl(0.2, 0.12, 0.03, 32)), "steel", { parent: spin, pos: [0.22, 0, 0] });

  // the dial: a fixed graduated ring on a stand, just behind the disc (dialOffset < 0) or in front of it
  const dialX = x + dialOffset;
  const tex = canvasTex(1024, 1024, (g, w, h, look = "bench") => {
    g.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const R = (r) => (r / (ringRadius + 0.3)) * (w / 2);
    g.fillStyle = look === "paper" ? "#2a2c30" : "#1a1c1f";
    g.beginPath(); g.arc(cx, cy, R(ringRadius + 0.3), 0, 7); g.arc(cx, cy, R(ringRadius - 0.24), 0, 7, true); g.fill();
    const ink = "#ece7dc";
    g.strokeStyle = g.fillStyle = ink;
    g.textAlign = "center"; g.textBaseline = "middle";
    // θ CCW from up: canvas point (cx − r·sinθ, cy − r·cosθ)
    for (let k = -30; k <= 30; k++) {
      const th = k / 10;
      if (Math.abs(th) > Math.PI) continue;
      const major = k % 5 === 0;
      const r0 = R(ringRadius - 0.2), r1 = R(ringRadius - (major ? 0.02 : 0.1));
      g.lineWidth = major ? 6 : 3;
      g.beginPath(); g.moveTo(cx - r0 * Math.sin(th), cy - r0 * Math.cos(th)); g.lineTo(cx - r1 * Math.sin(th), cy - r1 * Math.cos(th)); g.stroke();
    }
    if (labels) {
      g.font = '700 46px "JetBrains Mono", monospace';
      for (const th of [-3, -2, -1, 0, 1, 2, 3]) {
        const r = R(ringRadius + 0.14);
        g.fillText(th === 0 ? "0" : `${th > 0 ? "+" : "−"}${Math.abs(th)}`, cx - r * Math.sin(th), cy - r * Math.cos(th));
      }
      g.font = '500 30px "JetBrains Mono", monospace';
      g.fillText("rad", cx, cy + R(ringRadius + 0.14));
    }
  });
  const ringMat = new THREE.MeshBasicMaterial({ map: tex.tex, transparent: true, side: THREE.DoubleSide });
  stage.onLook((name) => tex.redraw(name));
  const ringGeo = new THREE.PlaneGeometry((ringRadius + 0.3) * 2, (ringRadius + 0.3) * 2).rotateY(Math.PI / 2);
  B.part(ringGeo, ringMat, { parent, pos: [dialX, axisY, 0], edges: false, cast: false });
  // the stand under the dial
  B.part(rbox(0.14, axisY - ringRadius - 0.1, 0.5, 0.04), "graphite", { parent, pos: [dialX - 0.02, (axisY - ringRadius - 0.1) / 2, 0] });
  B.part(rbox(0.6, 0.06, 0.9, 0.03), "graphite", { parent, pos: [dialX - 0.02, 0.03, 0] });
  B.part(rbox(0.06, 0.16, 0.5, 0.02), "graphite", { parent, pos: [dialX - 0.02, axisY - ringRadius - 0.14, 0] });
  // the target marker (the demand): a signal-yellow wedge that rides the ring
  const target = B.group({ parent, pos: [dialX + 0.04, axisY, 0], dynamic: true });
  B.part(new THREE.ConeGeometry(0.1, 0.24, 3).rotateZ(Math.PI).translate(0, ringRadius + 0.38, 0), stage.glow(SEMANTIC.signal, 1.6), { parent: target, edges: false, cast: false });
  // an encoder can on the far end of the shaft
  const ex = x + Math.min(0, dialOffset) - 0.45;
  B.part(toX(chamferCyl(0.3, 0.4, 0.05, 32)), "housing", { parent, pos: [ex, axisY, 0] });
  B.part(rbox(0.26, axisY - 0.3, 0.3, 0.03), "graphite", { parent, pos: [ex, (axisY - 0.3) / 2, 0] });
  const encoderPort = v3(ex, 0.3, 0.2);

  return {
    spin, target,
    setAngle: (th) => { spin.rotation.x = th; },
    setTarget: (th, on = true) => { target.rotation.x = th; target.visible = on; },
    redraw: (look) => tex.redraw(look ?? stage.look),
    rim: (a = 0) => parent.localToWorld(v3(x, axisY + Math.cos(a) * radius, Math.sin(a) * radius)),
    pointerTip: (th) => parent.localToWorld(v3(dialX, axisY + Math.cos(th) * ringRadius, Math.sin(th) * ringRadius)),
    center: () => parent.localToWorld(v3(x, axisY, 0)),
    encoder: () => parent.localToWorld(encoderPort.clone()),
    anchor: () => parent.localToWorld(v3(dialX, axisY + ringRadius + 0.75, 0)),
  };
}

// ------------------------------------------------------------------ friction brake on the flywheel rim
// A bracket over the rim with a felt pad and an orange thumbscrew; set(f) screws the pad down (0…1).
export function frictionBrake(B, stage, { parent, x = 2.3, axisY = 1.45, radius = 1.0, angle = 0 } = {}) {
  const g = B.group({ parent, pos: [x, axisY, 0], rot: [angle, 0, 0] });
  const top = radius + 0.02;
  // a bridge that straddles the rim and is bolted to a post from the bench
  B.part(rbox(0.7, 0.16, 0.5, 0.04), "graphite", { parent: g, pos: [0, top + 0.42, 0] });
  for (const s of [-1, 1]) B.part(rbox(0.12, 0.42, 0.42, 0.03), "graphite", { parent: g, pos: [s * 0.3, top + 0.24, 0] });
  const screw = B.group({ parent: g, pos: [0, top + 0.5, 0], dynamic: true, merge: true });
  const cap = B.part(chamferCyl(0.26, 0.24, 0.05, 28), "accent", { parent: screw, pos: [0, 0.16, 0], thresh: 20 });
  cap.userData.noMerge = true;
  const kn = [];
  for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; kn.push(M4(Math.cos(a) * 0.26, 0.16, Math.sin(a) * 0.26, 0, -a, 0)); }
  B.inst(new THREE.BoxGeometry(0.035, 0.22, 0.035), "accentDark", kn, { parent: screw });
  B.part(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 12), "steel", { parent: screw, pos: [0, -0.15, 0] });
  const pad = B.group({ parent: g, pos: [0, top + 0.12, 0], dynamic: true });
  B.part(rbox(0.26, 0.1, 0.3, 0.02), "rubber", { parent: pad, edges: false });
  B.part(rbox(0.32, 0.05, 0.36, 0.02), "steel", { parent: pad, pos: [0, 0.07, 0] });
  let f = 0;
  const set = (v) => { f = Math.max(0, Math.min(1, v)); screw.rotation.y = -f * Math.PI * 3; pad.position.y = top + 0.12 - f * 0.08; screw.position.y = top + 0.5 - f * 0.08; };
  set(0);
  return {
    grab: [cap], set,
    get f() { return f; },
    padPoint: () => g.localToWorld(v3(0, top + 0.02, 0)),
    anchor: () => g.localToWorld(v3(0, top + 1.0, 0)),
  };
}

// ------------------------------------------------------------------ controller box
// A clay case with a flat graphite top panel. knobs: [{ id, label }] become orange rotaryKnobs in a row;
// display(lines) draws phosphor text on the panel's screen. switchAt gives a spot for a toggleSwitch.
export function controllerBox(B, stage, { pos = [2.6, 0, 2.3], rotY = 0, knobs = [], width = 3.4, title = "CONTROLLER" } = {}) {
  const g = B.group({ pos, rot: [0, rotY, 0] });
  const D = 1.5, H = 0.62;
  B.part(rbox(width, H, D, 0.1, 4), "clay", { parent: g, pos: [0, H / 2, 0] });
  // flat graphite top panel: display strip at the back, knobs at the front, legend under the knobs
  const panel = B.group({ parent: g, pos: [0, H + 0.01, 0] });
  B.part(rbox(width - 0.16, 0.04, D - 0.16, 0.02), "graphite", { parent: panel, pos: [0, 0, 0] });
  // phosphor display strip at the top of the panel
  const disp = canvasTex(1024, 160, (c, w, h, lines = []) => {
    c.fillStyle = "#07120b";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(60,255,143,.06)";
    for (let y = 0; y < h; y += 4) c.fillRect(0, y, w, 1);
    c.shadowColor = "#3cff8f";
    c.shadowBlur = 10;
    c.textBaseline = "middle";
    const cols = Math.max(1, lines.length);
    lines.forEach((ln, i) => {
      const item = typeof ln === "string" ? { k: "", v: ln } : ln;
      const x = (i + 0.5) * (w / cols);
      c.textAlign = "center";
      c.fillStyle = item.dim ? "rgba(60,255,143,.35)" : "#3cff8f";
      c.font = '500 30px "JetBrains Mono", monospace';
      c.fillText(item.k, x, 42);
      c.font = '900 62px Doto, "JetBrains Mono", monospace';
      c.fillText(item.v, x, 108);
    });
    c.shadowBlur = 0;
  });
  B.part(new THREE.PlaneGeometry(width - 0.4, 0.5), new THREE.MeshBasicMaterial({ map: disp.tex, toneMapped: false, color: new THREE.Color(1.4, 1.4, 1.4) }), { parent: panel, pos: [0, 0.025, -D * 0.29], rot: [-Math.PI / 2, 0, 0], edges: false, cast: false, dynamic: true });
  // printed legend under each knob
  const legend = canvasTex(1024, 96, (c, w, h, labels = []) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = "#e9e3d6";
    c.font = '700 40px "JetBrains Mono", monospace';
    c.textAlign = "center";
    c.textBaseline = "middle";
    labels.forEach((t, i) => c.fillText(t, (i + 0.5) * (w / Math.max(1, labels.length)), h / 2));
  });
  const legMesh = B.part(new THREE.PlaneGeometry(width - 0.4, 0.16), new THREE.MeshBasicMaterial({ map: legend.tex, transparent: true }), { parent: panel, pos: [0, 0.025, D * 0.4], rot: [-Math.PI / 2, 0, 0], edges: false, cast: false, dynamic: true });
  const K = {};
  const n = knobs.length;
  knobs.forEach((k, i) => {
    const x = -width / 2 + 0.4 + ((i + 0.5) * (width - 0.8)) / Math.max(1, n);
    K[k.id] = rotaryKnob(B, stage, { parent: panel, pos: [x, 0.02, D * 0.17], rot: [-Math.PI / 2, 0, 0], radius: 0.24 });
  });
  legend.redraw(knobs.map((k) => k.label));
  const ports = [-1, 1].map((s) => v3(s * (width / 2 - 0.35), 0.3, -D / 2 - 0.02));
  B.inst(chamferCyl(0.09, 0.14, 0.02, 16), "brass", ports.map((p) => M4(p.x, p.y, p.z, Math.PI / 2, 0, 0)), { parent: g });
  let lastLines = [];
  return {
    group: g, panel, knobs: K,
    display: (lines) => { lastLines = lines; disp.redraw(lines); },
    labels: (labels) => legend.redraw(labels),
    redraw: () => { disp.redraw(lastLines); legend.redraw(knobs.map((k) => k.label)); },
    ports: () => ports.map((p) => g.localToWorld(p.clone())),
    switchSpot: (dx = width / 2 + 0.75) => g.localToWorld(v3(dx, 0, 0.1)),
    anchor: () => g.localToWorld(v3(0, H + 1.0, 0)),
    legendMesh: legMesh,
  };
}
