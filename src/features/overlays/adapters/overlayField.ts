import {
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicNodeMaterial,
  PlaneGeometry,
} from 'three/webgpu';
import { capacityFor } from '../../rendering/domain/spatialChunks';
import { rampInto } from '../domain/ramp';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';

// Just above the blob shadows' 2.05, so a tile is tinted over its shadow rather than under it.
const OVERLAY_LIFT = 2.1;

// A voxel short of the tile on each side, so the gaps between quads draw the tile grid.
const QUAD_SIZE = TILE_VOXELS - 2;

const OPACITY = 0.55;

export interface OverlayTile {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly node: number;
}

export interface OverlayField {
  readonly group: Group;
  readonly drawCalls: number;
  readonly triangleCount: number;
  // One quad per tile, at a node's height; the list is rebuilt on an edit.
  place(tiles: readonly OverlayTile[]): void;
  paint(values: Float32Array | null): void;
  dispose(): void;
}

function quadGeometry(): PlaneGeometry {
  const geometry = new PlaneGeometry(QUAD_SIZE, QUAD_SIZE);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

// The colour attribute is made up front: the material's shader is built on the first draw, and
// one built without instance colours would never read them.
function createMesh(
  geometry: PlaneGeometry,
  material: MeshBasicNodeMaterial,
  capacity: number,
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.name = 'overlay';
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  mesh.instanceColor.setUsage(DynamicDrawUsage);
  mesh.count = 0;
  mesh.visible = false;
  // After the blob shadows' 1, so the tint is laid over them.
  mesh.renderOrder = 2;
  return mesh;
}

export function buildOverlayField(): OverlayField {
  const group = new Group();
  group.name = 'overlay';

  const geometry = quadGeometry();
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    opacity: OPACITY,
  });
  let mesh = createMesh(geometry, material, capacityFor(0));
  group.add(mesh);

  let placed: readonly OverlayTile[] = [];
  const colour = { r: 0, g: 0, b: 0 };

  // A slot with no data is scaled to nothing, as a waiting balloon is, so no second mesh is needed.
  function writeSlot(slot: number, value: number): void {
    const matrices = mesh.instanceMatrix.array;
    const at = slot * 16;
    matrices.fill(0, at, at + 16);
    matrices[at + 15] = 1;
    if (!rampInto(value, colour)) return;
    const tile = placed[slot]!;
    matrices[at] = 1;
    matrices[at + 5] = 1;
    matrices[at + 10] = 1;
    matrices[at + 12] = tile.x;
    matrices[at + 13] = tile.y + OVERLAY_LIFT;
    matrices[at + 14] = tile.z;
    const colours = mesh.instanceColor!.array;
    colours[slot * 3] = colour.r;
    colours[slot * 3 + 1] = colour.g;
    colours[slot * 3 + 2] = colour.b;
  }

  function grow(capacity: number): void {
    const previous = mesh;
    mesh = createMesh(geometry, material, capacity);
    group.remove(previous);
    previous.dispose();
    group.add(mesh);
  }

  return {
    group,
    get drawCalls() {
      return mesh.visible && mesh.count > 0 ? 1 : 0;
    },
    get triangleCount() {
      return mesh.visible ? mesh.count * 2 : 0;
    },
    place(tiles) {
      const capacity = capacityFor(tiles.length, mesh.instanceMatrix.count);
      if (capacity !== mesh.instanceMatrix.count) grow(capacity);
      placed = tiles;
      mesh.count = tiles.length;
      mesh.visible = false;
    },
    paint(values) {
      mesh.visible = values !== null && placed.length > 0;
      if (!values) return;
      for (let slot = 0; slot < placed.length; slot++) {
        writeSlot(slot, values[placed[slot]!.node] ?? Number.NaN);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
      // Without this the frustum test uses the sphere of the last graph and culls the new tiles.
      if (placed.length > 0) mesh.computeBoundingSphere();
    },
    dispose() {
      mesh.dispose();
      group.clear();
      geometry.dispose();
      material.dispose();
    },
  };
}
