import { MeshStandardNodeMaterial } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  float,
  max,
  mix,
  positionWorld,
  reflect,
  sin,
  smoothstep,
  time,
  vec3,
} from 'three/tsl';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import { linearRgbOf } from '../../lighting/domain/lightGrid';
import {
  skyFresnel,
  swellOf,
  waterMaterialOf,
  WATER_ROUGHNESS,
  type Wave,
  type WaterMaterial,
} from './waterSurface';

// `sandbank` is the sand seen through a foot of water: the sea is opaque, so this is the only way
// the shallows show what they lie on.
const COLORS = {
  sandbank: 0x5fc4b8,
  shallow: 0x2e9fb5,
  deep: 0x0e3f66,
  foam: 0xeaf6f7,
  storm: 0x2c4a52,
} as const;

const SHALLOW_REACH = 26;
const DEEP_REACH = 170;

const SWELL_DRAG = 9;

const FOAM_REACH = 15;
const FOAM_RETREAT = 2;

// No two wavelengths divide each other, so the waves never beat into a visible repeating tile.
const WAVES: readonly Wave[] = [
  { direction: [0, -1], length: 97, speed: 15, slope: 0.1 },
  { direction: [0.36, -0.93], length: 53, speed: 11.5, slope: 0.075 },
  { direction: [-0.62, -0.78], length: 23, speed: 7.5, slope: 0.05 },
  { direction: [0.86, -0.5], length: 11, speed: 4.5, slope: 0.03 },
];

const FOAM_ROUGHNESS = 0.9;

// A storm steepens the slopes rather than speeding the waves: a faster clock would jump every crest.
const STORM_STEEPEN = 1.6;
const STORM_GREY = 0.55;
const STORM_SURGE = 1.4;

// Lines of surf rolling in on the coast; spaced and paced in voxels, and only near the beach,
// where a wave breaks.
const BREAKER_SPACING = 22;
const BREAKER_SPEED = 9;
const SURF_REACH = 90;

// Crests of the swell itself, so the white rides the waves out at sea.
const WHITECAP = { from: 0.35, to: 0.7, share: 0.7 } as const;

export type SeaMaterial = WaterMaterial;

// The sea mirrors the whole sky, sunset and all; pools and rivers are small and seen from above,
// so they keep the flat horizon colour they are handed.
export function createSeaMaterial(
  lightVolume: BakedLightVolume | null,
  skyAlong: (direction: Node<'vec3'>) => Node<'vec3'>,
  swell?: Node<'float'>,
  rough?: Node<'float'>,
): SeaMaterial {
  const material = new MeshStandardNodeMaterial({ metalness: 0 });
  const edgeDistance = attribute<'float'>('shoreEdgeDistance', 'float');
  const coastDistance = attribute<'float'>('shoreCoastDistance', 'float');

  return waterMaterialOf(material, lightVolume, () => {
    const storm = rough ?? float(0);
    const steepen = storm.mul(STORM_STEEPEN).add(1);
    const { normal, height } = swellOf(WAVES, swell ? swell.mul(steepen) : steepen);
    // A reflected ray that points down gets the horizon colour, by the dome's own rule.
    const sky = skyAlong(reflect(positionWorld.sub(cameraPosition).normalize(), normal));

    const depth = coastDistance.add(height.mul(SWELL_DRAG));
    const shallowT = smoothstep(0, SHALLOW_REACH, depth);
    const deepT = smoothstep(SHALLOW_REACH, DEEP_REACH, depth);
    const calm = mix(
      mix(vec3(...linearRgbOf(COLORS.sandbank)), vec3(...linearRgbOf(COLORS.shallow)), shallowT),
      vec3(...linearRgbOf(COLORS.deep)),
      deepT,
    );
    const water = mix(calm, vec3(...linearRgbOf(COLORS.storm)), storm.mul(STORM_GREY));

    // Driven off the swell's height rather than a clock, so the water cannot rise while the foam retreats.
    const wash = height.mul(0.5).add(0.5);
    const foamEdge = mix(float(FOAM_RETREAT), storm.mul(STORM_SURGE).add(1).mul(FOAM_REACH), wash);
    const shoreFoam = smoothstep(foamEdge.mul(0.35), foamEdge, edgeDistance).oneMinus();

    const surf = (Math.PI * 2) / BREAKER_SPACING;
    const crest = smoothstep(
      0.75,
      0.97,
      sin(coastDistance.mul(surf).add(time.mul(BREAKER_SPEED * surf))),
    );
    const surfZone = smoothstep(SURF_REACH * 0.4, SURF_REACH, coastDistance).oneMinus();
    // Broken up along its length by the swell, or every line would be a ruled stripe.
    const breakers = crest.mul(surfZone).mul(smoothstep(-0.2, 0.5, height));
    const caps = smoothstep(WHITECAP.from, WHITECAP.to, height).mul(WHITECAP.share);
    const foam = max(shoreFoam, max(breakers, caps).mul(storm));

    // No sky in the foam: it is the one part of the sea that is not a mirror.
    const fresnel = skyFresnel(normal).mul(foam.oneMinus());

    return {
      normal,
      color: mix(mix(water, sky, fresnel), vec3(...linearRgbOf(COLORS.foam)), foam),
      roughness: mix(float(WATER_ROUGHNESS), float(FOAM_ROUGHNESS), foam),
    };
  });
}
