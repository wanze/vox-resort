import {
  BoxGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  MeshBasicNodeMaterial,
} from 'three/webgpu';
import { dropAt, type DropPose, type RainfallLook, type Raindrops } from '../domain/rainfall';

// A backgrounded tab reports its whole absence as one frame.
const MAX_STEP = 0.1;

// Near-white rather than grey: the ground under a storm is already slate. The opacity keeps it subtle.
const RAIN_COLOR = 0xcfe0ef;

export interface RainField {
  readonly group: Group;
  readonly drawCalls: number;
  readonly triangleCount: number;
  advance(dt: number, look: RainfallLook | null, centre: DropPose): void;
  dispose(): void;
}

// Hung on its foot so the instance matrix's Y column carries both the length and the wind's lean.
function streakGeometry(): BoxGeometry {
  const geometry = new BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

// The lean is a shear rather than a rotation: it keeps the foot where the drop is and costs no trig per drop.
function writeStreaks(
  mesh: InstancedMesh,
  drops: Raindrops,
  seconds: number,
  look: RainfallLook,
  centre: DropPose,
): void {
  const matrices = mesh.instanceMatrix.array;
  const drawn = Math.min(look.drops, drops.count);
  for (let index = 0; index < drawn; index++) {
    const pose = dropAt(drops, index, seconds, look, centre);
    const at = index * 16;
    matrices[at] = look.width;
    matrices[at + 4] = look.leanX;
    matrices[at + 5] = look.length;
    matrices[at + 6] = look.leanZ;
    matrices[at + 10] = look.width;
    matrices[at + 12] = pose.x;
    matrices[at + 13] = pose.y;
    matrices[at + 14] = pose.z;
    matrices[at + 15] = 1;
  }
  mesh.count = drawn;
  mesh.instanceMatrix.needsUpdate = true;
}

export function buildRainField(drops: Raindrops): RainField {
  const group = new Group();
  group.name = 'rain';

  const geometry = streakGeometry();
  const material = new MeshBasicNodeMaterial({
    color: RAIN_COLOR,
    transparent: true,
    // Unsorted on purpose: at this opacity blend order is invisible, and without depth writes near streaks
    // cannot punch holes in far ones.
    depthWrite: false,
  });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, drops.count));
  mesh.name = 'rain-streaks';
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.count = 0;
  group.add(mesh);

  const triangles = (geometry.getIndex()?.count ?? geometry.attributes.position!.count) / 3;
  let seconds = 0;

  return {
    group,
    get drawCalls() {
      return mesh.visible ? 1 : 0;
    },
    get triangleCount() {
      return mesh.visible ? triangles * mesh.count : 0;
    },
    advance(dt, look, centre) {
      if (look === null) {
        mesh.visible = false;
        mesh.count = 0;
        return;
      }
      // Falls while the resort is paused, like the balloons and boats.
      seconds += Math.min(Math.max(dt, 0), MAX_STEP);
      material.opacity = look.opacity;
      mesh.visible = true;
      writeStreaks(mesh, drops, seconds, look, centre);
    },
    dispose() {
      mesh.dispose();
      group.clear();
      geometry.dispose();
      material.dispose();
    },
  };
}
