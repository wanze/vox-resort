/**
 * The water: a TSL shader over the flat sea mesh that `domain/terrainSurface.ts`
 * builds.
 *
 * The mesh is one quad per tile column and completely flat, so everything that
 * makes it read as water happens per fragment. Nothing here displaces a vertex.
 * There are four parts, and they are worth naming because each fixes a different
 * way flat blue geometry fails to look wet:
 *
 * 1. **Swell.** A sum of four travelling sine waves, differing in direction,
 *    wavelength and speed, evaluated only for its *slope*. The slopes bend the
 *    shading normal; the surface stays at `SEA_LEVEL`. That part is shared with
 *    the pools, which run the same field at a tenth of the wavelength — see
 *    `waterSwell.ts`, and `poolWaterMaterial.ts` for the other end of it.
 * 2. **Sun glint.** The bent normal goes into the standard PBR lighting as
 *    `normalNode`, so the scene's own directional sun answers it — a low
 *    roughness turns the swell into a moving specular streak that tracks the
 *    time of day for free. This is the single biggest thing that separates water
 *    from painted blue.
 * 3. **Reflection.** Water is a mirror at a glancing angle and glass head on, so
 *    a Schlick term mixes the sky colour in by how far the bent normal has
 *    turned away from the eye. The sky is a uniform rather than a constant
 *    because the scene's is: at dusk the sea has to go orange with it.
 * 4. **Depth and foam.** The two shore distances the geometry carries drive a
 *    two-stop gradient from a pale sandbank green through turquoise to open
 *    blue, and a band of foam that washes in and out along the beach. The
 *    gradient reads the distance off the coastline as a curve and the foam reads
 *    it off the drawn edge of the sand — see `domain/terrainSurface.ts` for why
 *    those are two numbers — and the gradient's is then pushed about by the
 *    swell, so the shallows breathe with the waves crossing them instead of
 *    lying in fixed bands.
 */

import { MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute, float, mix, smoothstep, vec3 } from 'three/tsl';
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

/**
 * The palette, as packed sRGB — the same form the models paint in.
 *
 * `sandbank` is not the sand's own colour: it is the sand *seen through* a foot
 * of water, which is greener and darker than the dry beach. The sea is opaque,
 * so this is the only way the shallows can show what they are lying on.
 */
const COLORS = {
  sandbank: 0x5fc4b8,
  shallow: 0x2e9fb5,
  deep: 0x0e3f66,
  foam: 0xeaf6f7,
} as const;

/**
 * How far out to sea, in voxels, each colour stop sits.
 *
 * A tile is sixteen voxels, so the sandbank runs about a tile and a half out and
 * the water is fully deep some ten tiles offshore. Both are far shorter than the
 * sea itself, which reaches the horizon: past `deep` there is nothing left to
 * grade.
 */
const SHALLOW_REACH = 26;
const DEEP_REACH = 170;

/**
 * How far the swell shifts the depth gradient, in voxels.
 *
 * A crest carries deeper water over the sandbank and a trough draws it back, so
 * the colour boundary moves with the waves rather than sitting still under them.
 * It is also what dissolves the last of the straight edges: a boundary that
 * wanders by a few voxels along its own length stops reading as a boundary.
 */
const SWELL_DRAG = 9;

/** How far up the beach the foam runs, in voxels, at its furthest and least. */
const FOAM_REACH = 15;
const FOAM_RETREAT = 2;

/**
 * Four waves, no two of whose wavelengths divide each other.
 *
 * Wavelengths that share a factor beat against each other into a visible
 * repeating tile; these do not, so the sea takes minutes rather than seconds to
 * come back round to a pattern the eye has already seen. The long swell runs
 * straight in at the beach because that is what a swell does; the short ones
 * cross it at an angle, which is what stops the whole sea from looking corrugated.
 */
const WAVES: readonly Wave[] = [
  { direction: [0, -1], length: 97, speed: 15, slope: 0.1 },
  { direction: [0.36, -0.93], length: 53, speed: 11.5, slope: 0.075 },
  { direction: [-0.62, -0.78], length: 23, speed: 7.5, slope: 0.05 },
  { direction: [0.86, -0.5], length: 11, speed: 4.5, slope: 0.03 },
];

/** Roughness of the foam that rides on the water; the water's own is shared. */
const FOAM_ROUGHNESS = 0.9;

/** The sea is a body of water like the pools are; see `waterSurface.ts`. */
export type SeaMaterial = WaterMaterial;

/**
 * Builds the material the sea mesh is drawn with.
 *
 * The swell, the glint, the sky and the bake are all `waterSurface.ts`, which
 * the pools use too. What is left here is what only the sea has: a bottom that
 * shelves away from the beach, and a line of foam along it.
 */
export function createSeaMaterial(lightVolume: BakedLightVolume | null): SeaMaterial {
  const material = new MeshStandardNodeMaterial({ metalness: 0 });
  const edgeDistance = attribute<'float'>('shoreEdgeDistance', 'float');
  const coastDistance = attribute<'float'>('shoreCoastDistance', 'float');

  return waterMaterialOf(material, lightVolume, (sky) => {
    const { normal, height } = swellOf(WAVES);

    // The depth gradient: sandbank, then the turquoise of water you can see the
    // bottom of, then the blue of water you cannot. Dragged back and forth by
    // the swell, so the boundaries move with the water rather than under it.
    const depth = coastDistance.add(height.mul(SWELL_DRAG));
    const shallowT = smoothstep(0, SHALLOW_REACH, depth);
    const deepT = smoothstep(SHALLOW_REACH, DEEP_REACH, depth);
    const water = mix(
      mix(vec3(...linearRgbOf(COLORS.sandbank)), vec3(...linearRgbOf(COLORS.shallow)), shallowT),
      vec3(...linearRgbOf(COLORS.deep)),
      deepT,
    );

    /**
     * The wash, which is the swell arriving as a thing you can see the edge of.
     *
     * Driven off the swell's own height rather than off a clock of its own,
     * which is what makes the foam a consequence of the waves instead of a
     * second thing happening nearby: the water cannot rise while the foam
     * retreats. It also takes the last straight edge out of the shore — the
     * swell varies along the beach as well as across it, so the foam line is a
     * wandering one and the tile staircase under it stops being the shape the
     * eye picks out.
     */
    const wash = height.mul(0.5).add(0.5);
    const foamEdge = mix(float(FOAM_RETREAT), float(FOAM_REACH), wash);
    const foam = smoothstep(foamEdge.mul(0.35), foamEdge, edgeDistance).oneMinus();

    // No sky in the foam: it is the one part of the sea that is not a mirror.
    const fresnel = skyFresnel(normal).mul(foam.oneMinus());

    return {
      normal,
      color: mix(mix(water, sky, fresnel), vec3(...linearRgbOf(COLORS.foam)), foam),
      roughness: mix(float(WATER_ROUGHNESS), float(FOAM_ROUGHNESS), foam),
    };
  });
}
