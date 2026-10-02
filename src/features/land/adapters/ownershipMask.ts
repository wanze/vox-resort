import {
  ClampToEdgeWrapping,
  DataTexture,
  NearestFilter,
  NoColorSpace,
  RedFormat,
  UnsignedByteType,
  Vector2,
} from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  dot,
  float,
  floor,
  fract,
  max,
  mix,
  mod,
  positionWorld,
  step,
  texture,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { TILE_VOXELS } from '../../catalog/domain/objectTypes';
import { TILE_OWNED, tileMaskInto, type LandGrid, type World } from '../domain/landRights';

type ColorNode = Node<'vec3'>;
type VersionedGrid = LandGrid & { readonly version: number };
type FloatNode = Node<'float'>;

const EDGE_VOXELS = 1.5;
const DASH = { on: 5, period: 8 } as const;
const UNOWNED_DIM = 0.6;
const UNOWNED_GREY = 0.5;
// Linear RGB: a pale chalk line, visible on both grass and sand.
const EDGE_COLOR = [0.85, 0.82, 0.7] as const;
const EDGE_STRENGTH = 0.85;
const SALE_COLOR = [1, 0.62, 0.25] as const;
const SALE_TINT = 0.22;
const LUMA = [0.2126, 0.7152, 0.0722] as const;

export interface OwnershipMask {
  // The node graph is built once and shared by every material, so nothing here recompiles a shader.
  shade(color: ColorNode): ColorNode;
  update(rights: VersionedGrid | null, world: World): void;
  showForSale(on: boolean): void;
  dispose(): void;
}

const versionOf = (rights: VersionedGrid | null): number => rights?.version ?? -1;

const isOwned = (code: FloatNode): FloatNode =>
  step(TILE_OWNED - 0.5, code).mul(step(code, TILE_OWNED + 0.5));

const dashed = (along: FloatNode): FloatNode =>
  step(mod(along, DASH.period), float(DASH.on - 0.001));

function maskTexture(data: Uint8Array, tilesX: number, tilesZ: number): DataTexture {
  const tex = new DataTexture(data, tilesX, tilesZ);
  tex.format = RedFormat;
  tex.type = UnsignedByteType;
  tex.colorSpace = NoColorSpace;
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  // One byte a texel: WebGL2's default of four would shear any row not a multiple of four wide.
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

// A 1×1 owned world until the first resort: the materials need a texture from the start.
export function createOwnershipMask(): OwnershipMask {
  let data = Uint8Array.of(TILE_OWNED);
  let current = maskTexture(data, 1, 1);
  let seenRights: LandGrid | null = null;
  let seenVersion = -1;

  const sizeNode = uniform(new Vector2(1, 1));
  // Off without rights, so a plot that owns all of itself draws exactly as it did before land.
  const active = uniform(0);
  const forSale = uniform(0);
  const node = texture(current);

  const tile = floor(positionWorld.xz.div(TILE_VOXELS));
  const local = fract(positionWorld.xz.div(TILE_VOXELS)).mul(TILE_VOXELS);

  const inside = (at: Node<'vec2'>): FloatNode =>
    step(0, at.x)
      .mul(step(0, at.y))
      .mul(step(at.x, sizeNode.x.sub(1)))
      .mul(step(at.y, sizeNode.y.sub(1)));
  // Texel centres, with the bytes read back as the 0, 1, 2 that tileMaskInto wrote.
  const codeAt = (at: Node<'vec2'>): FloatNode =>
    node.sample(at.add(0.5).div(sizeNode)).r.mul(255).round().mul(inside(at));
  const ownedAt = (at: Node<'vec2'>): FloatNode => isOwned(codeAt(at));

  const code = codeAt(tile);
  const owned = isOwned(code);
  const onSale = step(1.5, code).mul(forSale);

  const side = (dx: number, dz: number, near: FloatNode, along: FloatNode): FloatNode =>
    float(1)
      .sub(ownedAt(tile.add(vec2(dx, dz))))
      .mul(step(near, EDGE_VOXELS))
      .mul(dashed(along));
  const edge = max(
    max(
      side(-1, 0, local.x, positionWorld.z),
      side(1, 0, float(TILE_VOXELS).sub(local.x), positionWorld.z),
    ),
    max(
      side(0, -1, local.y, positionWorld.x),
      side(0, 1, float(TILE_VOXELS).sub(local.y), positionWorld.x),
    ),
  ).mul(owned);

  // A new texture in the same node, never a new node: the materials keep their compiled shaders.
  const resize = ({ tilesX, tilesZ }: World): void => {
    if (current.image.width === tilesX && current.image.height === tilesZ) return;
    const old = current;
    data = new Uint8Array(tilesX * tilesZ);
    current = maskTexture(data, tilesX, tilesZ);
    node.value = current;
    old.dispose();
    sizeNode.value.set(tilesX, tilesZ);
  };

  return {
    shade(color) {
      const grey = vec3(dot(color, vec3(...LUMA)));
      const unowned = mix(color, grey, UNOWNED_GREY).mul(UNOWNED_DIM);
      const sale = mix(color, vec3(...SALE_COLOR), SALE_TINT);
      const land = mix(mix(unowned, sale, onSale), color, owned);
      const drawn = mix(land, vec3(...EDGE_COLOR), edge.mul(EDGE_STRENGTH));
      return mix(color, drawn, active);
    },
    update(rights, world) {
      if (rights !== null && rights === seenRights && versionOf(rights) === seenVersion) return;
      seenRights = rights;
      seenVersion = versionOf(rights);
      resize(world);
      tileMaskInto(rights, world, data);
      current.needsUpdate = true;
      active.value = Number(rights !== null);
    },
    showForSale(on) {
      forSale.value = on ? 1 : 0;
    },
    dispose() {
      current.dispose();
    },
  };
}
