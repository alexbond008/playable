export const SEMANTIC = {
  current: 0x56b4e9,
  voltage: 0x0072b2,
  force: 0x009e73,
  heat: 0xe69f00,
  field: 0xcc79a7,
  signal: 0xf0e442,
  error: 0xd55e00,
  accent: 0xff5a1f,
  phosphor: 0x3cff8f,
};

export const LOOKS = {
  bench: {
    label: "Bench",
    scene: { bg: 0x0e0f10, bench: 0x151618, graphite: 0x1d1f22, housing: 0x34373d, clay: 0xb4b7bd, ceramic: 0xd9d4c8, ink: 0xece7dc },
    edge: { color: 0x050506, opacity: 0.6 },
    light: { env: 0.32, key: 1.5, rim: 0.6, hemi: 0.12, exposure: 0.95 },
    bloom: { strength: 0.7, threshold: 1.15 },
    css: { bg: "#0E0F10", panel: "#16171A", panel2: "#1F2024", line: "#2C2E33", ink: "#ECE7DC", mute: "#8D8F96", phosphor: "#3CFF8F", scheme: "dark" },
  },
  cyanotype: {
    label: "Cyanotype",
    scene: { bg: 0x0b2a4a, bench: 0x0f3358, graphite: 0x133b64, housing: 0x245282, clay: 0xd8d3c4, ceramic: 0xd8d3c4, ink: 0xf4f1e6 },
    edge: { color: 0xf4f1e6, opacity: 0.85 },
    light: { env: 0.3, key: 1.4, rim: 0.6, hemi: 0.25, exposure: 0.95 },
    bloom: { strength: 0.6, threshold: 1.15 },
    css: { bg: "#0B2A4A", panel: "#0F3157", panel2: "#143A66", line: "#2A5A8C", ink: "#F4F1E6", mute: "#9DB6D3", phosphor: "#3CFF8F", scheme: "dark" },
  },
  paper: {
    label: "Paper",
    scene: { bg: 0xece8e0, bench: 0xcfc9bd, graphite: 0xc2bbae, housing: 0x5a5e66, clay: 0xe9e6df, ceramic: 0xeeeae2, ink: 0x1e1f22 },
    edge: { color: 0x2a2c30, opacity: 0.55 },
    light: { env: 0.5, key: 1.5, rim: 0.5, hemi: 0.35, exposure: 0.82 },
    bloom: { strength: 0.35, threshold: 1.6 },
    css: { bg: "#ECE8E0", panel: "#F7F5F0", panel2: "#E4DFD5", line: "#CFC8BA", ink: "#1E1F22", mute: "#6C6A64", phosphor: "#0E8F4A", scheme: "light" },
  },
};

export const LOOK_ORDER = ["bench", "cyanotype", "paper"];
