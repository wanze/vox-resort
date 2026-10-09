import { Vector3 } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  dot,
  length,
  max,
  min,
  mix,
  positionWorldDirection,
  pow,
  smoothstep,
  step,
  uniform,
  vec3,
} from 'three/tsl';
import type { SkyState } from '../domain/dayNight';
import { linearRgbOf } from '../domain/lightGrid';
import {
  BAND_HEIGHT,
  BAND_POWER,
  DISC_COS,
  DISC_SOFT,
  HALO_POWER,
  HALO_STRENGTH,
  ZENITH_REACH,
} from '../domain/skyDome';

export interface SkyDome {
  // For scene.backgroundNode: three draws it as a camera-centred sphere at the far plane.
  readonly node: Node<'vec3'>;
  // The sky seen along a world direction, for anything that reflects it.
  along(direction: Node<'vec3'>): Node<'vec3'>;
  apply(sky: SkyState): void;
  dispose(): void;
}

// Keeps a straight-up look or a sun at the zenith from dividing nought by nought.
const FLAT_EPSILON = 1e-5;

export function createSkyDome(): SkyDome {
  const horizon = uniform(new Vector3(...linearRgbOf(0x11161d)));
  const zenith = uniform(new Vector3(...linearRgbOf(0x11161d)));
  const sunColor = uniform(new Vector3());
  const sunDirection = uniform(new Vector3(0, 1, 0));
  const sunGlow = uniform(0);
  const dusk = uniform(0);

  // skyColourAt's sums, in linear colour; a step rather than a branch for below the horizon.
  const along = (direction: Node<'vec3'>): Node<'vec3'> => {
    const up = direction.y;
    const base = mix(horizon, zenith, smoothstep(0, ZENITH_REACH, up));
    const facing = max(dot(direction, sunDirection), 0);
    const halo = pow(facing, HALO_POWER).mul(HALO_STRENGTH).mul(sunGlow);
    const look = direction.xz;
    const towards = sunDirection.xz;
    const span = length(look).mul(length(towards)).add(FLAT_EPSILON);
    const round = max(dot(look, towards).div(span), 0);
    const fade = smoothstep(0, BAND_HEIGHT, up).oneMinus();
    const band = dusk.mul(pow(round, BAND_POWER)).mul(fade);
    const disc = smoothstep(DISC_COS - DISC_SOFT, DISC_COS, facing).mul(sunGlow);
    const glowing = min(base.add(sunColor.mul(halo.add(band))), vec3(1));
    return mix(horizon, mix(glowing, sunColor, disc), step(0, up));
  };

  const node = along(positionWorldDirection);

  return {
    node,
    along,
    apply(sky) {
      horizon.value.set(...linearRgbOf(sky.skyColor));
      zenith.value.set(...linearRgbOf(sky.zenithColor));
      sunColor.value.set(...linearRgbOf(sky.sunColor));
      sunDirection.value.set(sky.sunDirection.x, sky.sunDirection.y, sky.sunDirection.z);
      sunGlow.value = sky.sunGlow;
      dusk.value = sky.dusk;
    },
    // Three disposes the background sphere it built when the node it was built for is disposed.
    dispose() {
      node.dispose();
    },
  };
}
