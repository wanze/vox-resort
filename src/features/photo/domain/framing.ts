import { mix, unitOf } from '../../random/domain/hash';
import type { PhotoKind } from '../../sim/domain/views';

export interface Framing {
  readonly headingJitter: number;
  readonly fov: number;
  readonly tilt: number;
}

const DEGREE = Math.PI / 180;

// A sight or a stage is small in the frame, so a wide swing would turn it out of the picture.
const JITTER = 12 * DEGREE;
const STEADY_JITTER = 5 * DEGREE;

const FOV = { min: 45, max: 70 } as const;

// From just under level to well up: a slight downward tilt still keeps the horizon in frame.
const TILT = { min: -0.02, max: 0.2 } as const;

// Its own salt, so a framing is not the photo's draw for the same person, node and tick.
const SALT = 0x2c1b_3c6d;

const steady = (kind: PhotoKind): boolean => kind === 'sight' || kind === 'show';

export function framingOf(person: number, node: number, tick: number, kind: PhotoKind): Framing {
  const seed = mix(Math.imul(person + 1, SALT) ^ mix(Math.imul(node + 2, 0x9e37_79b1) ^ tick));
  const turn = unitOf(mix(seed ^ 0x1));
  const zoom = unitOf(mix(seed ^ 0x2));
  const raise = unitOf(mix(seed ^ 0x3));
  const swing = steady(kind) ? STEADY_JITTER : JITTER;
  return {
    headingJitter: (turn * 2 - 1) * swing,
    fov: FOV.min + zoom * (FOV.max - FOV.min),
    tilt: TILT.min + raise * (TILT.max - TILT.min),
  };
}
