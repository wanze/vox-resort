export interface Orbit {
  readonly radius: number;
  // From straight overhead, as three's Spherical measures it.
  readonly polar: number;
  readonly azimuth: number;
}

// Periods that share no common factor, so the swing, the dolly and the tilt never line up into a
// loop anyone would notice.
const SWING = { amplitude: 0.3, period: 97 };
const DOLLY = { amplitude: 0.1, period: 43 };
const TILT = { amplitude: 0.08, period: 61 };

const wave = (seconds: number, period: number): number =>
  Math.sin((2 * Math.PI * seconds) / period);

// The tilt only ever lifts the camera, so it can never drop under the horizon the controls enforce.
export function driftedOrbit(base: Orbit, seconds: number): Orbit {
  const lift = (1 - Math.cos((2 * Math.PI * seconds) / TILT.period)) / 2;
  return {
    radius: base.radius * (1 + DOLLY.amplitude * wave(seconds, DOLLY.period)),
    polar: base.polar - TILT.amplitude * lift,
    azimuth: base.azimuth + SWING.amplitude * wave(seconds, SWING.period),
  };
}
