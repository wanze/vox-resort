/**
 * The preview under the pointer: the object as it would stand, plus the patch of
 * ground it would claim.
 *
 * It draws the model's own geometry rather than a box, so what is about to be
 * placed is recognisable before the click, and it reuses the very geometry the
 * scene already uploaded for that model — the ghost costs one more draw call and
 * not one more buffer.
 *
 * Two materials rather than one tinted uniform: the pair is compiled once at
 * startup and swapping between them is a pointer move's worth of work, whereas a
 * uniform written per move would still be two programs by the time the blocked
 * state has its own colour. Both are unlit and translucent, which is what keeps
 * a ghost reading as a ghost after dark, when a shaded one would go black.
 */

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

/** Colour a valid placement is washed with, and the colour of a refused one. */
const VALID_TINT = 0x7dd87f;
const BLOCKED_TINT = 0xe8615a;

/** How far the model's own colours are pushed towards the tint. */
const TINT_STRENGTH = 0.45;

/**
 * How high above the ground the footprint patch floats.
 *
 * Half a voxel clears the paving slabs, which are a voxel thick, so the patch
 * still reads over a path instead of z-fighting inside it. Measured off the
 * placement's own height, so the patch lies on the terrace it is drawn over.
 */
const PAD_LIFT = 0.5;

export interface PlacementGhost {
  readonly group: Group;
  /** Shows the object standing at a placement, tinted by whether it may. */
  show(placement: Placement, blocked: boolean): void;
  /**
   * Shows one tile of ground at a height, and no object at all.
   *
   * What the terrain tool wants, and the whole of what it wants: a brush places
   * nothing, so there is no model to borrow and the footprint patch alone says
   * where the spade would go. It is the same patch, the same two tints and the
   * same rule about what red means — which is why it lives here rather than in a
   * cursor of its own that would have to be kept looking like this one.
   */
  showGround(tile: Tile, y: number, blocked: boolean): void;
  /**
   * Marks a placement's footprint as about to be taken away, and draws no model.
   *
   * The same patch in the refused tint, because red already means "this will not
   * be standing" — but drawn through whatever stands on it. The patch lies on the
   * ground, and the thing being demolished is standing on exactly that ground: a
   * patch hidden under the cottage it marks would mark nothing. The model is not
   * redrawn on top, because a translucent copy exactly over the original fights
   * it for depth and shimmers.
   */
  showRemoval(placement: Placement): void;
  hide(): void;
  dispose(): void;
}

function ghostMaterial(tint: number, opacity: number): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({ transparent: true, opacity });
  material.colorNode = mix(vertexColor().rgb, color(tint), TINT_STRENGTH);
  // Writing depth would let the near half of a translucent model hide its own
  // far half, which reads as holes punched in the ghost.
  material.depthWrite = false;
  return material;
}

function padMaterial(tint: number): MeshBasicNodeMaterial {
  return new MeshBasicNodeMaterial({
    color: tint,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    // The patch is a flat plane the camera may pass under on a low orbit.
    side: DoubleSide,
  });
}

/**
 * @param geometries the meshed catalogue, so the ghost can borrow a model's
 * geometry rather than mesh its own.
 */
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

  // A unit tile lying flat; the footprint it draws comes from the mesh's scale,
  // so a 2x3 building needs no geometry of its own.
  const padGeometry = new PlaneGeometry(TILE_VOXELS, TILE_VOXELS).rotateX(-Math.PI / 2);
  const pad = new Mesh(padGeometry, pads.valid);
  pad.renderOrder = 3;
  group.add(pad);

  // The ghost borrows a model's geometry when it is shown; this stands in until
  // it does, so the mesh never carries a geometry nobody owns.
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
        // A model that is nothing but glowing voxels has no shaded geometry to
        // borrow; its footprint alone still says where it would land.
        ghost.visible = false;
        return;
      }
      ghost.geometry = geometry;
      ghost.material = blocked ? materials.blocked : materials.valid;
      // The same turn and offset the instance gets, so what the ghost shows is
      // what the placement will draw — the footprint patch under it is already
      // turned, because the placement's own footprint is.
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
      // The ghost's own geometry is the catalogue's, which outlives every resort
      // and is freed by the showcase. See `instancedWorld.ts`.
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
