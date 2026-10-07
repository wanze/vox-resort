import type { Group } from 'three/webgpu';
import { buildGroundQuads } from '../../rendering/adapters/groundQuads';
import { rampInto, zoneColourInto } from '../domain/ramp';
import { NO_ZONE } from '../../sim/domain/zones';
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
  // Categorical where paint is a ramp; a slot whose node is unzoned is hidden.
  paintZones(zoneOfNode: Int8Array | null): void;
  dispose(): void;
}

export function buildOverlayField(): OverlayField {
  // After the blob shadows' 1, so the tint is laid over them.
  const quads = buildGroundQuads({
    name: 'overlay',
    size: QUAD_SIZE,
    opacity: OPACITY,
    renderOrder: 2,
  });

  let placed: readonly OverlayTile[] = [];
  const colour = { r: 0, g: 0, b: 0 };

  // A slot with no data is scaled to nothing, as a waiting balloon is, so no second mesh is needed.
  function writeSlot(slot: number, shown: boolean): void {
    const { mesh } = quads;
    const matrices = mesh.instanceMatrix.array;
    const at = slot * 16;
    matrices.fill(0, at, at + 16);
    matrices[at + 15] = 1;
    if (!shown) return;
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

  function paintSlots(on: boolean, colourOf: (node: number) => boolean): void {
    const { mesh } = quads;
    mesh.visible = on && placed.length > 0;
    if (!on) return;
    for (let slot = 0; slot < placed.length; slot++) writeSlot(slot, colourOf(placed[slot]!.node));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
    // Without this the frustum test uses the sphere of the last graph and culls the new tiles.
    if (placed.length > 0) mesh.computeBoundingSphere();
  }

  return {
    group: quads.group,
    get drawCalls() {
      return quads.mesh.visible && quads.mesh.count > 0 ? 1 : 0;
    },
    get triangleCount() {
      return quads.mesh.visible ? quads.mesh.count * 2 : 0;
    },
    place(tiles) {
      quads.fit(tiles.length);
      placed = tiles;
      quads.mesh.visible = false;
    },
    paint(values) {
      paintSlots(values !== null, (node) => rampInto(values![node] ?? Number.NaN, colour));
    },
    paintZones(zoneOfNode) {
      paintSlots(zoneOfNode !== null, (node) =>
        zoneColourInto(zoneOfNode![node] ?? NO_ZONE, colour),
      );
    },
    dispose: quads.dispose,
  };
}
