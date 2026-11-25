export interface HomeParams {
  /** penetration factor (0..1) */ P: number;
  /** deposition rate, 1/h */ k: number;
  /** effective purifier air changes per hour */ q: number;
  /** indoor source, ug/m3/h (cooking) */ S?: number;
}

/** One hour of the single-zone mass balance with constant inputs; exact solution, not Euler. */
export function stepIndoor(cStart: number, cOut: number, a: number, h: HomeParams): { cEnd: number; cMean: number; cSS: number } {
  const lambda = a + h.k + h.q;
  if (!(lambda > 0)) throw new RangeError("a + k + q must be > 0");
  const cSS = (h.P * a * cOut + (h.S ?? 0)) / lambda;
  const decay = Math.exp(-lambda);
  return {
    cSS,
    cEnd: cSS + (cStart - cSS) * decay,
    cMean: cSS + ((cStart - cSS) * (1 - decay)) / lambda,
  };
}

/** Effective purifier ACH: derate * CADR / room volume. Ceiling height 2.7 m. */
export function purifierQ(cadrM3h: number, roomAreaM2: number, derate = 0.5): number {
  if (!(roomAreaM2 > 0)) throw new RangeError("roomAreaM2 must be > 0");
  return (derate * cadrM3h) / (roomAreaM2 * 2.7);
}

/** Long-run indoor concentration for constant outdoor air. */
export function steadyState(cOut: number, a: number, h: HomeParams): number {
  return (h.P * a * cOut + (h.S ?? 0)) / (a + h.k + h.q);
}
