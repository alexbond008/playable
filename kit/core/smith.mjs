// Smith-chart drawing helpers for 2D canvases (used by parts/rf.mjs, usable on any canvas texture).
// Everything works in the reflection-coefficient plane Γ = u + jv; the chart is the unit circle.
// Canvas mapping: centre (cx, cy), radius R, v up.

export const toCanvas = (G, cx, cy, R) => ({ x: cx + G.re * R, y: cy - G.im * R });

// Γ for a normalised impedance z = r + jx
export function gammaOfZ(z) {
  const d = (z.re + 1) ** 2 + z.im ** 2;
  return { re: (z.re * z.re + z.im * z.im - 1) / d, im: (2 * z.im) / d };
}

// Circle geometry in the Γ plane
export const rCircle = (r) => ({ c: [r / (1 + r), 0], rad: 1 / (1 + r) }); // constant resistance
export const gCircle = (g) => ({ c: [-g / (1 + g), 0], rad: 1 / (1 + g) }); // constant conductance (YZ chart)
export const xArc = (x) => ({ c: [1, 1 / x], rad: 1 / Math.abs(x) }); // constant reactance
export const bArc = (b) => ({ c: [-1, -1 / b], rad: 1 / Math.abs(b) }); // constant susceptance

function circle(g, cx, cy, R, { c, rad }) {
  g.beginPath();
  g.arc(cx + c[0] * R, cy - c[1] * R, rad * R, 0, Math.PI * 2);
}

// The engraved chart: impedance grid (and optionally the admittance grid, fainter), rim scale in wavelengths.
export function drawSmithGrid(g, cx, cy, R, opts = {}) {
  const ink = opts.ink ?? "#d8d4ca";
  const faint = opts.faint ?? "rgba(216,212,202,.32)";
  const yInk = opts.yInk ?? "rgba(216,212,202,.18)";
  const font = opts.font ?? '"JetBrains Mono", monospace';
  const rs = opts.r ?? [0.2, 0.5, 1, 2, 5];
  const xs = opts.x ?? [0.2, 0.5, 1, 2, 5];
  g.save();
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.clip();
  g.lineWidth = Math.max(1, R / 300);
  if (opts.admittance !== false) {
    g.strokeStyle = yInk;
    g.setLineDash([R / 70, R / 90]);
    for (const v of rs) { circle(g, cx, cy, R, gCircle(v)); g.stroke(); }
    for (const v of xs) for (const s of [1, -1]) { circle(g, cx, cy, R, bArc(s * v)); g.stroke(); }
    g.setLineDash([]);
  }
  g.strokeStyle = faint;
  for (const v of [0.1, 0.3, 0.4, 0.7, 1.5, 3, 10]) { circle(g, cx, cy, R, rCircle(v)); g.stroke(); }
  for (const v of [0.1, 0.3, 0.7, 1.5, 3, 10]) for (const s of [1, -1]) { circle(g, cx, cy, R, xArc(s * v)); g.stroke(); }
  g.strokeStyle = ink;
  g.lineWidth = Math.max(1.4, R / 220);
  for (const v of rs) { circle(g, cx, cy, R, rCircle(v)); g.stroke(); }
  for (const v of xs) for (const s of [1, -1]) { circle(g, cx, cy, R, xArc(s * v)); g.stroke(); }
  g.beginPath();
  g.moveTo(cx - R, cy);
  g.lineTo(cx + R, cy);
  g.stroke();
  g.restore();
  // rim
  g.strokeStyle = ink;
  g.lineWidth = Math.max(2, R / 140);
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.stroke();
  // labels on the real axis and the rim
  g.fillStyle = ink;
  g.font = `500 ${Math.round(R / 26)}px ${font}`;
  g.textAlign = "center";
  g.textBaseline = "top";
  for (const v of rs) {
    const G = gammaOfZ({ re: v, im: 0 });
    const p = toCanvas(G, cx, cy, R);
    g.fillText(String(v), p.x - R / 40, p.y + R / 90);
  }
  g.textBaseline = "middle";
  for (const v of xs) for (const s of [1, -1]) {
    const G = gammaOfZ({ re: 0, im: s * v });
    const p = toCanvas(G, cx, cy, R * 1.075);
    g.fillText(`${s > 0 ? "+" : "−"}j${v}`, p.x, p.y);
  }
  if (opts.wavelengths !== false) {
    // "wavelengths toward generator" scale: 0 at the left (short), clockwise, 0.5 λ per turn
    const r0 = R * 1.14, r1 = R * 1.18;
    g.lineWidth = Math.max(1, R / 300);
    g.textBaseline = "middle";
    g.font = `500 ${Math.round(R / 34)}px ${font}`;
    for (let i = 0; i < 100; i++) {
      const a = Math.PI - (i / 100) * Math.PI * 2; // angle of Γ, clockwise from 180°
      const big = i % 5 === 0;
      const rr = big ? r1 + R * 0.03 : r1;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy - Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a) * rr, cy - Math.sin(a) * rr);
      g.stroke();
      if (i % 10 === 0) {
        const rl = r1 + R * 0.09;
        g.fillText((i / 200).toFixed(2), cx + Math.cos(a) * rl, cy - Math.sin(a) * rl);
      }
    }
    g.beginPath();
    g.arc(cx, cy, r0, 0, Math.PI * 2);
    g.stroke();
  }
}

// Overlay strokes (semantic colours are passed in by the caller)
export function strokeR(g, cx, cy, R, r, color, width = 4, dash = null) { g.strokeStyle = color; g.lineWidth = width; clipUnit(g, cx, cy, R, () => { if (dash) g.setLineDash(dash); circle(g, cx, cy, R, rCircle(r)); g.stroke(); g.setLineDash([]); }); }
export function strokeG(g, cx, cy, R, gv, color, width = 4, dash = null) { g.strokeStyle = color; g.lineWidth = width; clipUnit(g, cx, cy, R, () => { if (dash) g.setLineDash(dash); circle(g, cx, cy, R, gCircle(gv)); g.stroke(); g.setLineDash([]); }); }
export function strokeVSWR(g, cx, cy, R, mag, color, width = 4, dash = null) {
  g.strokeStyle = color;
  g.lineWidth = width;
  if (dash) g.setLineDash(dash);
  g.beginPath();
  g.arc(cx, cy, mag * R, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
}
export function strokeTrail(g, cx, cy, R, gammas, color, width = 5) {
  if (gammas.length < 2) return;
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  gammas.forEach((G, i) => { const p = toCanvas(G, cx, cy, R); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); });
  g.stroke();
}
export function dot(g, cx, cy, R, G, color, size = 8, label = null) {
  const p = toCanvas(G, cx, cy, R);
  g.fillStyle = color;
  g.beginPath();
  g.arc(p.x, p.y, size, 0, Math.PI * 2);
  g.fill();
  if (label) {
    g.font = `600 ${Math.round(R / 22)}px "JetBrains Mono", monospace`;
    g.textAlign = "left";
    g.textBaseline = "bottom";
    g.fillText(label, p.x + size + 4, p.y - 4);
  }
}
function clipUnit(g, cx, cy, R, fn) {
  g.save();
  g.beginPath();
  g.arc(cx, cy, R + 1, 0, Math.PI * 2);
  g.clip();
  fn();
  g.restore();
}
