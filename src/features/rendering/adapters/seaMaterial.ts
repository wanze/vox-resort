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
 *    shading normal; the surface stays at `SEA_LEVEL`. A height field's normal
 *    is `(-dh/dx, 1, -dh/dz)`, and since each wave contributes its own cosine
 *    term the whole normal is a sum of four cheap terms with no square roots in
 *    the middle.
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
 *
 * **Why the waves fade with distance.** A wavelength of nine voxels seen from
 * across the plot is a fraction of a pixel, and sampling it once per fragment is
 * aliasing by construction — the sea crawls with moiré as the camera moves. Each
 * wave is therefore faded out past the distance at which it stops being
 * resolvable, shortest first, which leaves the far water smooth and the near
 * water detailed. It is a hand-rolled mip chain for a function that has no
 * texture to mip.
 */

import { MeshStandardNodeMaterial, Vector3 } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  cos,
  dot,
  float,
  mix,
  normalize,
  positionWorld,
  pow,
  saturate,
  sin,
  smoothstep,
  time,
  transformNormalToView,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import { linearRgbOf } from '../../lighting/domain/lightGrid';

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
 * One travelling wave.
 *
 * `slope` is the steepness the wave gives the normal, not a height: this shader
 * never has a height, only its gradient. `direction` need not be normalised —
 * it is normalised here — and points the way the crests travel, which for the
 * long swell is in from the sea towards the beach at -z.
 */
interface Wave {
  readonly direction: readonly [number, number];
  /** Voxels between crests. */
  readonly length: number;
  /** Voxels a crest travels per second. */
  readonly speed: number;
  readonly slope: number;
}

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

/** What the slopes come to, which is what normalises the swell's height. */
const TOTAL_SLOPE = WAVES.reduce((total, wave) => total + wave.slope, 0);

/**
 * How many wavelengths away a wave has faded out completely.
 *
 * One number for every wave, so the fade is a property of scale rather than of
 * any particular wave: the ripples go first and the swell survives to the
 * horizon, and adding a wave needs no new constant.
 */
const WAVE_FADE_LENGTHS = 30;

/** Roughness of open water, and of the foam that rides on it. */
const WATER_ROUGHNESS = 0.14;
const FOAM_ROUGHNESS = 0.9;

/** Reflectance of water head on, and how much of the sky a glancing angle gets. */
const FRESNEL_BASE = 0.02;
const FRESNEL_REACH = 0.65;

export interface SeaMaterial {
  readonly material: MeshStandardNodeMaterial;
  /** Repaints the sky the water reflects, in packed sRGB. */
  setSky(sky: number): void;
  dispose(): void;
}

/**
 * The swell: its shading normal in world space, and its height.
 *
 * Each wave contributes `slope * direction * cos(phase)` to the horizontal part
 * of the normal and nothing to the vertical, which is the gradient of
 * `slope/k * sin(phase)` — the height field this pretends to be. Summing the
 * gradients rather than the heights is what keeps the normal to one cosine per
 * wave; the height is the matching sine, and is a phase rather than a length,
 * since the surface it belongs to is drawn dead flat.
 */
function swell() {
  const at = positionWorld.xz;
  const viewDistance = positionWorld.sub(cameraPosition).length();
  let slopeX: Node<'float'> = float(0);
  let slopeZ: Node<'float'> = float(0);
  let height: Node<'float'> = float(0);
  for (const wave of WAVES) {
    const length = Math.hypot(wave.direction[0], wave.direction[1]);
    const dirX = wave.direction[0] / length;
    const dirZ = wave.direction[1] / length;
    const frequency = (Math.PI * 2) / wave.length;
    // Minus the clock, not plus: a crest has to travel *along* its direction,
    // which for the swell is in towards the beach.
    const phase = dot(at, vec2(dirX, dirZ))
      .mul(frequency)
      .sub(time.mul(wave.speed * frequency));
    // Faded out where a wavelength no longer covers a pixel; see the header.
    // Reversed by negating a rising ramp rather than by swapping the edges,
    // which is undefined in both WGSL and GLSL.
    const faded = wave.length * WAVE_FADE_LENGTHS;
    const visible = smoothstep(faded * 0.5, faded, viewDistance).oneMinus();
    const amount = cos(phase).mul(wave.slope).mul(visible);
    slopeX = slopeX.add(amount.mul(dirX));
    slopeZ = slopeZ.add(amount.mul(dirZ));
    // The height this is the gradient of, normalised to roughly -1..1 by
    // dropping the amplitudes: nothing reads it as a length, only as a phase.
    height = height.add(
      sin(phase)
        .mul(wave.slope / TOTAL_SLOPE)
        .mul(visible),
    );
  }
  return { normal: normalize(vec3(slopeX.negate(), 1, slopeZ.negate())), height };
}

/**
 * Builds the material the sea mesh is drawn with.
 *
 * Takes the light volume for the same reason every other surface does: the sea
 * runs in under the resort's lamps, and water that stayed flatly blue while the
 * sand beside it caught a pool of lamplight would give the whole bake away.
 */
export function createSeaMaterial(lightVolume: BakedLightVolume | null): SeaMaterial {
  const skyColor = uniform(new Vector3(...linearRgbOf(0x11161d)));
  const material = new MeshStandardNodeMaterial({ metalness: 0 });

  const edgeDistance = attribute<'float'>('shoreEdgeDistance', 'float');
  const coastDistance = attribute<'float'>('shoreCoastDistance', 'float');
  const { normal, height } = swell();

  // The depth gradient: sandbank, then the turquoise of water you can see the
  // bottom of, then the blue of water you cannot. Dragged back and forth by the
  // swell, so the boundaries move with the water rather than under it.
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
   * Driven off the swell's own height rather than off a clock of its own, which
   * is what makes the foam a consequence of the waves instead of a second thing
   * happening nearby: the water cannot rise while the foam retreats. It also
   * takes the last straight edge out of the shore — the swell varies along the
   * beach as well as across it, so the foam line is a wandering one and the tile
   * staircase under it stops being the shape the eye picks out.
   */
  const wash = height.mul(0.5).add(0.5);
  const foamEdge = mix(float(FOAM_RETREAT), float(FOAM_REACH), wash);
  const foam = smoothstep(foamEdge.mul(0.35), foamEdge, edgeDistance).oneMinus();

  // Schlick, with the base reflectance of water. The normal is the swell's, so
  // a crest turning away from the eye lights up while the trough beside it
  // stays the colour of the sea.
  const facing = saturate(dot(normalize(cameraPosition.sub(positionWorld)), normal));
  const fresnel = float(FRESNEL_BASE)
    .add(pow(facing.oneMinus(), 4).mul(FRESNEL_REACH))
    .mul(foam.oneMinus());

  const color = mix(mix(water, skyColor, fresnel), vec3(...linearRgbOf(COLORS.foam)), foam);

  material.normalNode = transformNormalToView(normal);
  material.colorNode = color;
  material.roughnessNode = mix(float(WATER_ROUGHNESS), float(FOAM_ROUGHNESS), foam);
  if (lightVolume) {
    material.emissiveNode = lightVolume.lampLight(color);
    material.aoNode = lightVolume.skyVisibility();
  }

  return {
    material,
    setSky(sky) {
      skyColor.value.set(...linearRgbOf(sky));
    },
    dispose() {
      material.dispose();
    },
  };
}
