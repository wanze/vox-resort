import {
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardNodeMaterial,
  PlaneGeometry,
} from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { float, instanceIndex, mix, positionLocal, sin, time, uniform, vec3 } from 'three/tsl';
import type { FlagSite } from '../../catalog/domain/placementFacts';
import type { Weather } from '../../sim/domain/weather';
import { DOWNWIND_YAW, FLAG_COLORS, flagFor } from '../domain/beachFlags';

export interface FlagField {
  readonly group: Group;
  readonly drawCalls: number;
  readonly triangleCount: number;
  place(sites: readonly FlagSite[]): void;
  show(weather: Weather): void;
  dispose(): void;
}

// In voxels, about a beach towel: big enough to read from the overview, small beside the parasol.
const CLOTH = { length: 7, height: 4, segments: 8 } as const;

const FLUTTER = { wavelength: 5, speed: 9, calm: 0.25, storm: 1 } as const;

// How far the tip hangs in still air; a storm holds it out straight.
const DROOP = 2.5;

// Clear of the pole's own half voxel, or the cloth runs through it.
const POLE_GAP = 0.5;

const PHASE_STEP = 1.7;

const turned = new Matrix4();

// Hung by its top-left corner, so the instance stands it at the top of the pole.
function clothGeometry(): PlaneGeometry {
  const geometry = new PlaneGeometry(CLOTH.length, CLOTH.height, CLOTH.segments, 1);
  geometry.translate(CLOTH.length / 2 + POLE_GAP, -CLOTH.height / 2, 0);
  return geometry;
}

// Waved in the vertex stage: a few dozen vertices per flag, and nothing to upload per frame.
function clothMaterial(color: Node<'color'>, gust: Node<'float'>): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.9, metalness: 0 });
  const along = positionLocal.x.div(CLOTH.length + POLE_GAP);
  const phase = float(instanceIndex).mul(PHASE_STEP);
  const wave = sin(
    positionLocal.x
      .mul((Math.PI * 2) / FLUTTER.wavelength)
      .sub(time.mul(FLUTTER.speed))
      .add(phase),
  )
    .mul(mix(float(FLUTTER.calm), float(FLUTTER.storm), gust))
    .mul(along);
  const droop = along.mul(along).mul(DROOP).mul(gust.oneMinus());
  material.positionNode = positionLocal.add(vec3(0, droop.negate(), wave));
  material.colorNode = color;
  return material;
}

export function buildFlagField(gust: Node<'float'>): FlagField {
  const group = new Group();
  group.name = 'beach-flags';
  const geometry = clothGeometry();
  const color = uniform(new Color(FLAG_COLORS.calm));
  const material = clothMaterial(color, gust);
  const triangles = (geometry.getIndex()?.count ?? 0) / 3;
  let mesh: InstancedMesh | null = null;
  let shown: number = FLAG_COLORS.calm;

  const meshFor = (count: number): InstancedMesh => {
    if (mesh && mesh.instanceMatrix.count >= count) return mesh;
    if (mesh) {
      group.remove(mesh);
      mesh.dispose();
    }
    mesh = new InstancedMesh(geometry, material, Math.max(count, 8));
    mesh.name = 'beach-flag-cloth';
    // The cloth moves in the shader, past any bounding sphere taken from the flat plane.
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };

  return {
    group,
    get drawCalls() {
      return mesh && mesh.count > 0 ? 1 : 0;
    },
    get triangleCount() {
      return mesh ? mesh.count * triangles : 0;
    },
    place(sites) {
      if (sites.length === 0 && !mesh) return;
      const flags = meshFor(sites.length);
      sites.forEach((site, slot) => {
        turned.makeRotationY(DOWNWIND_YAW).setPosition(site.x, site.y, site.z);
        flags.setMatrixAt(slot, turned);
      });
      flags.count = sites.length;
      flags.instanceMatrix.needsUpdate = true;
    },
    // A lifeguard swaps the flag rather than fading it, so the colour changes at once.
    show(weather) {
      const next = FLAG_COLORS[flagFor(weather)];
      if (next === shown) return;
      shown = next;
      color.value.setHex(next);
    },
    dispose() {
      mesh?.dispose();
      group.clear();
      geometry.dispose();
      material.dispose();
    },
  };
}
