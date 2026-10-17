export const rad = (rpm) => (rpm * 2 * Math.PI) / 60;
export const rpm = (omega) => (omega * 60) / (2 * Math.PI);

export function q1({ n, T }) {
  const omega = rad(n);
  return { omega, P: T * omega };
}

export function q2({ I, K, n }) {
  return { T: K * I, E: K * rad(n) };
}

export function q3({ K, R, T, n }) {
  const I = T / K;
  const omega = rad(n);
  const V = K * omega + I * R;
  return { V, I, eta: (100 * T * omega) / (V * I) };
}

export function q4({ n0, n1 }) {
  return { n2: n0 - 2 * (n0 - n1) };
}

export function q5({ K, R, n, Tb }) {
  const E = K * rad(n);
  const I = Tb / K;
  return { Rb: E / I - R, E, I };
}

export function q6({ J_gcm2, n, t }) {
  const J = J_gcm2 * 1e-7;
  const energy = 0.5 * J * rad(n) ** 2;
  return { J, energy, P: energy / t };
}

export function q7({ K, R, V, Fc, TL }) {
  const omega = (K * V / R - TL) / (K * K / R + Fc);
  const n = rpm(omega);
  const n0 = rpm(V / K);
  return { omega, n, n0, drop: (100 * (n0 - n)) / n0, I: (V - K * omega) / R };
}

export function q8({ V, K1, R1, K2, R2, Fc, TL }) {
  const omega = (V * (K1 / R1 + K2 / R2) - TL) / (K1 * K1 / R1 + K2 * K2 / R2 + Fc);
  const T1 = (K1 * (V - K1 * omega)) / R1;
  const T2 = (K2 * (V - K2 * omega)) / R2;
  const mean = (T1 + T2) / 2;
  return { omega, n: rpm(omega), T1, T2, spread: (100 * (T1 - mean)) / mean };
}

export function steadySpeed({ K, R, V, T, Fc = 0 }) {
  return (K * V / R - T) / (K * K / R + Fc);
}

export function createMotorSim(init = {}) {
  const s = {
    K: 0.2, R: 0.1, J: 0.02, Fc: 0.0004,
    V: 0, Iset: 0, Rb: 2.52,
    drive: "voltage",
    dyno: "free",
    holdRpm: 0,
    load: 0,
    omega: 0, I: 0, T: 0, E: 0,
    brakeHeat: 0, tempC: 25, peakBrakeT: 0, energyIn: 0,
    twin: null,
    ...init,
  };

  function currents(omega) {
    if (s.drive === "brake") return [-(s.K * omega) / (s.R + s.Rb)];
    if (s.drive === "current") return [s.Iset];
    const I1 = (s.V - s.K * omega) / s.R;
    if (!s.twin) return [I1];
    return [I1, (s.V - s.twin.K * omega) / s.twin.R];
  }

  function step(dt) {
    const n = Math.max(1, Math.ceil(dt / 0.0005));
    const h = dt / n;
    for (let k = 0; k < n; k++) {
      const Is = currents(s.omega);
      const Tm = s.K * Is[0] + (s.twin ? s.twin.K * Is[1] : 0);
      if (s.dyno === "hold") {
        s.omega += (rad(s.holdRpm) - s.omega) * Math.min(1, h * 6);
      } else {
        const Tl = s.load * Math.tanh(s.omega / 2);
        s.omega += (h * (Tm - Tl - s.Fc * s.omega)) / s.J;
        if (s.omega < 0 && s.drive !== "voltage") s.omega = 0;
      }
      s.I = Is[0];
      s.T = s.K * Is[0];
      s.I2 = s.twin ? Is[1] : 0;
      s.T2 = s.twin ? s.twin.K * Is[1] : 0;
      s.E = s.K * s.omega;
      if (s.drive === "brake") {
        const p = s.I * s.I * s.Rb;
        s.brakeHeat += p * h;
        s.peakBrakeT = Math.max(s.peakBrakeT, Math.abs(s.T));
      }
    }
    const p = s.drive === "brake" ? s.I * s.I * s.Rb : 0;
    s.brakePower = p;
    s.tempC += dt * (p * 3.2 - (s.tempC - 25) * 0.28);
    if (s.drive === "current" || s.dyno === "hold") s.V = s.K * s.omega + s.I * s.R;
    return s;
  }

  return { state: s, step };
}
