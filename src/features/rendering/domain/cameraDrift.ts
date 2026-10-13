export interface Orbit {
  readonly radius: number;
  // From straight overhead, as three's Spherical measures it.
  readonly polar: number;
  readonly azimuth: number;
}

// Periods that share no common factor, so the swing, the dolly and the tilt never line up into a
// loop anyone would notice.
const SWING = { amplitude: 0.3, period: 97 };
const DOLLY = { amplitude: 0.75, period: 127 };
const TILT = { amplitude: 0.08, period: 61 };

const wave = (seconds: number, period: number): number =>
  Math.sin((2 * Math.PI * seconds) / period);

// Eases from 0 up to 1 and back, starting at rest so the drift begins without a jolt.
const swell = (seconds: number, period: number): number =>
  (1 - Math.cos((2 * Math.PI * seconds) / period)) / 2;

// The tilt only ever lifts the camera, so it can never drop under the horizon the controls enforce,
// and the dolly only ever moves in, so it never pulls back past the framing onto the empty edges.
// The dolly is geometric because the eye reads zoom as a ratio: a linear one rushes when close.
export function driftedOrbit(base: Orbit, seconds: number): Orbit {
  return {
    radius: base.radius * (1 - DOLLY.amplitude) ** swell(seconds, DOLLY.period),
    polar: base.polar - TILT.amplitude * swell(seconds, TILT.period),
    azimuth: base.azimuth + SWING.amplitude * wave(seconds, SWING.period),
  };
}
