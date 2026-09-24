// Two materials rather than a tinted uniform, both compiled once; unlit so a ghost still reads after dark.

import {
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  PlaneGeometry,
} from 'three/webgpu';
import { color, mix, vertexColor } from 'three/tsl';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { Placement, Tile } from '../../layout/domain/resortLayout';
import { rotationRadians, turnedOrigin } from '../../layout/domain/rotation';
import type { ModelGeometry } from '../../rendering/adapters/voxelMeshBuilder';

const VALID_TINT = 0x7dd87f;
const BLOCKED_TINT = 0xe8615a;

const TINT_STRENGTH = 0.45;

// Half a voxel clears the one-voxel paving slabs, so the patch does not z-fight inside a path.
const PAD_LIFT = 0.5;

export interface PlacementGhost {
  readonly group: Group;
  show(placement: Placement, blocked: boolean): void;
  showGround(tile: Tile, y: number, blocked: boolean): void;
  // Drawn through whatever stands on it, with no model: a translucent copy over the original would shimmer.
  showRemoval(placement: Placement): void;
  hide(): void;
  dispose(): void;
}

function ghostMaterial(tint: number, opacity: number): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({ transparent: true, opacity });
  material.colorNode = mix(vertexColor().rgb, color(tint), TINT_STRENGTH);
  // Writing depth would let the near half of a translucent model hide its own far half.
  material.depthWrite = false;
  return material;
}

function padMaterial(tint: number): MeshBasicNodeMaterial {
  return new MeshBasicNodeMaterial({
    color: tint,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    // The camera may pass under the patch on a low orbit.
    side: DoubleSide,
  });
}

export function createPlacementGhost(geometries: readonly ModelGeometry[]): PlacementGhost {
  const group = new Group();
  group.name = 'placement-ghost';
  // Drawn after the world so the translucent ghost blends over what it covers.
  group.renderOrder = 2;

  const litById = new Map<string, BufferGeometry>();
  for (const model of geometries) {
    if (model.lit) litById.set(model.id, model.lit);
  }

  const materials = {
    valid: ghostMaterial(VALID_TINT, 0.55),
    blocked: ghostMaterial(BLOCKED_TINT, 0.4),
  };
  const pads = {
    valid: padMaterial(VALID_TINT),
    blocked: padMaterial(BLOCKED_TINT),
    removal: padMaterial(BLOCKED_TINT),
  };
  pads.removal.depthTest = false;

  // A unit tile scaled to the footprint, so no size needs geometry of its own.
  const padGeometry = new PlaneGeometry(TILE_VOXELS, TILE_VOXELS).rotateX(-Math.PI / 2);
  const pad = new Mesh(padGeometry, pads.valid);
  pad.renderOrder = 3;
  group.add(pad);

  // Stands in until a model is borrowed, so the mesh never carries a geometry nobody owns.
  const empty = new BufferGeometry();
  const ghost = new Mesh(empty, materials.valid);
  ghost.visible = false;
  group.add(ghost);

  const placePad = (
    footprint: { tileX: number; tileZ: number; tilesX: number; tilesZ: number; y: number },
    blocked: boolean,
  ): void => {
    pad.material = blocked ? pads.blocked : pads.valid;
    pad.scale.set(footprint.tilesX, 1, footprint.tilesZ);
    pad.position.set(
      (footprint.tileX + footprint.tilesX / 2) * TILE_VOXELS,
      footprint.y + PAD_LIFT,
      (footprint.tileZ + footprint.tilesZ / 2) * TILE_VOXELS,
    );
    group.visible = true;
  };

  return {
    group,
    show(placement, blocked) {
      const geometry = litById.get(placement.id);
      placePad(placement, blocked);
      if (!geometry) {
        // A model that is nothing but glowing voxels has no shaded geometry to borrow.
        ghost.visible = false;
        return;
      }
      ghost.geometry = geometry;
      ghost.material = blocked ? materials.blocked : materials.valid;
      ghost.rotation.set(0, rotationRadians(placement.rotation), 0);
      const origin = turnedOrigin(placement.width, placement.depth, placement.rotation);
      ghost.position.set(placement.x + origin.x, placement.y, placement.z + origin.z);
      ghost.visible = true;
    },
    showGround(tile, y, blocked) {
      placePad({ tileX: tile.x, tileZ: tile.z, tilesX: 1, tilesZ: 1, y }, blocked);
      ghost.visible = false;
    },
    showRemoval(placement) {
      placePad(placement, true);
      pad.material = pads.removal;
      ghost.visible = false;
    },
    hide() {
      group.visible = false;
      ghost.visible = false;
    },
    dispose() {
      group.clear();
      padGeometry.dispose();
      empty.dispose();
      // The ghost's geometry is the catalogue's, which outlives every resort.
      for (const material of [
        materials.valid,
        materials.blocked,
        pads.valid,
        pads.blocked,
        pads.removal,
      ]) {
        material.dispose();
      }
    },
  };
}
