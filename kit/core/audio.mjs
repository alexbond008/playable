export function buzz(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {}
}

export function createAudio() {
  let A = null;
  let muted = false;

  function unlock() {
    if (A) {
      A.ctx.resume?.();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    A = { ctx, master, noise, voices: new Map() };
  }

  function voice(name) {
    if (!A) return null;
    if (A.voices.has(name)) return A.voices.get(name);
    const { ctx, master } = A;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    lp.Q.value = 4;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(lp);
    lp.connect(master);
    const o1 = ctx.createOscillator();
    o1.type = "sawtooth";
    const o2 = ctx.createOscillator();
    o2.type = "square";
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    o1.connect(gain);
    o2.connect(g2);
    g2.connect(gain);
    o1.start();
    o2.start();
    const v = { gain, lp, o1, o2 };
    A.voices.set(name, v);
    return v;
  }

  function hiss() {
    if (!A) return null;
    if (A.voices.has("hiss")) return A.voices.get("hiss");
    const { ctx, master, noise } = A;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 5200;
    bp.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(bp);
    bp.connect(gain);
    gain.connect(master);
    src.start();
    const v = { gain };
    A.voices.set("hiss", v);
    return v;
  }

  function burst(f, dur, vol) {
    if (!A) return;
    const t = A.ctx.currentTime;
    const s = A.ctx.createBufferSource();
    s.buffer = A.noise;
    const bp = A.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f;
    bp.Q.value = 6;
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp);
    bp.connect(g);
    g.connect(A.master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  function tone(freqs, dur = 0.18, type = "sine", vol = 0.18, gap = 0.09) {
    if (!A) return;
    freqs.forEach((f, i) => {
      const t = A.ctx.currentTime + i * gap;
      const o = A.ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = A.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(A.master);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
  }

  return {
    unlock,
    get ready() { return !!A; },
    get muted() { return muted; },
    setMuted(m) {
      muted = m;
      if (A) A.master.gain.value = m ? 0 : 0.5;
    },
    detent: () => { burst(2600, 0.01, 0.18); buzz(6); },
    notch: () => { burst(1500, 0.02, 0.3); buzz(10); },
    thump() {
      if (!A) return;
      const t = A.ctx.currentTime;
      const o = A.ctx.createOscillator();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      const g = A.ctx.createGain();
      g.gain.setValueAtTime(0.6, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g);
      g.connect(A.master);
      o.start(t);
      o.stop(t + 0.2);
      burst(900, 0.03, 0.4);
      buzz([15, 30, 15]);
    },
    clack: (v = 0.35) => { burst(700 + Math.random() * 300, 0.05, v); buzz(12); },
    commit: () => { tone([660, 990], 0.12, "triangle", 0.14, 0.06); buzz(10); },
    win: () => { tone([523, 659, 784, 1047], 0.32, "triangle", 0.16, 0.1); buzz([20, 40, 20, 40, 60]); },
    star: (i) => tone([784 * Math.pow(1.122, i)], 0.25, "triangle", 0.15),
    miss: () => { tone([330, 247], 0.22, "sine", 0.14, 0.12); buzz([40, 30, 40]); },
    unlockFx: () => { tone([392, 523, 659, 1047, 1319], 0.5, "sine", 0.12, 0.07); buzz([10, 20, 10, 20, 10, 20, 80]); },
    motor(name, freq, level, brightness = 900) {
      const v = voice(name);
      if (!v) return;
      const t = A.ctx.currentTime;
      v.o1.frequency.setTargetAtTime(freq, t, 0.05);
      v.o2.frequency.setTargetAtTime(freq * 2.01, t, 0.05);
      v.gain.gain.setTargetAtTime(level, t, 0.08);
      v.lp.frequency.setTargetAtTime(brightness, t, 0.1);
    },
    hiss(level) {
      const v = hiss();
      if (v) v.gain.gain.setTargetAtTime(level, A.ctx.currentTime, 0.1);
    },
  };
}
