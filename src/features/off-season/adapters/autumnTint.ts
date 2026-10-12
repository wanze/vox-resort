import type { Node } from 'three/webgpu';
import { clamp, dot, max, mix, pow, uniform, vec3 } from 'three/tsl';
import { swellAt } from '../domain/offSeason';

type ColorNode = Node<'vec3'>;

// The colour study's terms were picked on screen colours, so the greens are judged and turned on
// an approximate sRGB of the albedo rather than on the linear one.
const GAMMA = 2.2;
const LUMA = vec3(0.2126, 0.7152, 0.0722);
// The study's 40 of 255: a green this much above its other channels turns all the way.
const GREEN_RANGE = 40 / 255;
const OCHRE = { r: 1.05, lift: 28 / 255, g: 0.86, b: 0.45 } as const;
const DESATURATION = 0.15;

export interface AutumnTint {
  tint(color: ColorNode): ColorNode;
  readonly swell: Node<'float'>;
  set(blend: number): void;
}

// Uniforms shared by every material that wears them, so a turn never recompiles a shader. Mixed
// with the albedo last, so a blend of 0 is the albedo exactly.
export function createAutumnTint(): AutumnTint {
  const autumn = uniform(0);
  const swell = uniform(swellAt(0));
  return {
    tint(color) {
      const shown = pow(color, vec3(1 / GAMMA));
      const green = clamp(shown.y.sub(max(shown.x, shown.z)).div(GREEN_RANGE), 0, 1);
      const luminance = dot(shown, LUMA);
      const ochre = vec3(
        luminance.mul(OCHRE.r).add(OCHRE.lift),
        luminance.mul(OCHRE.g),
        luminance.mul(OCHRE.b),
      );
      const turned = mix(shown, ochre, green);
      const greyed = mix(turned, vec3(dot(turned, LUMA)), DESATURATION);
      return mix(color, pow(greyed, vec3(GAMMA)), autumn);
    },
    swell,
    set(blend) {
      autumn.value = blend;
      swell.value = swellAt(blend);
    },
  };
}
