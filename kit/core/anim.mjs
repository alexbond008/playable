export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  out: (t) => 1 - (1 - t) ** 3,
  back: (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2,
};

export function createAnimator() {
  const live = new Set();
  return {
    tween(duration, fn, curve = ease.inOut) {
      return new Promise((resolve) => {
        const job = { t: 0, duration: Math.max(1e-4, duration), fn, curve, resolve };
        fn(0, 0);
        live.add(job);
      });
    },
    wait(duration) {
      return this.tween(duration, () => {});
    },
    update(dt) {
      for (const job of [...live]) {
        job.t = Math.min(job.duration, job.t + dt);
        const k = job.t / job.duration;
        job.fn(job.curve(k), k);
        if (k >= 1) {
          live.delete(job);
          job.resolve();
        }
      }
    },
    get busy() { return live.size > 0; },
    clear() { live.clear(); },
  };
}
