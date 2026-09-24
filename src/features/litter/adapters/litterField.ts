import { Group } from 'three/webgpu';
import type { BakedLightVolume } from '../../lighting/adapters/bakedLightVolume';
import {
  disposeFieldMeshes,
  fieldMaterials,
  fieldMeshesFor,
  fieldTriangles,
  slotsFor,
  type FieldMesh,
} from '../../rendering/adapters/movingField';
import type { ModelGeometry } from '../../rendering/adapters/voxelMeshBuilder';
import type { LitterPiece } from '../domain/litterPieces';

export interface LitterField {
  readonly group: Group;
  readonly drawCalls: number;
  readonly triangleCount: number;
  write(pieces: readonly LitterPiece[]): void;
  dispose(): void;
}

export interface LitterFieldOptions {
  readonly models: readonly ModelGeometry[];
  readonly capacity: number;
  readonly lightVolume?: BakedLightVolume | null;
}

const QUARTER_COS = [1, 0, -1, 0] as const;
const QUARTER_SIN = [0, 1, 0, -1] as const;

// A slot with no piece is scaled to nothing, as a waiting balloon is: it keeps its place in the
// buffer and costs no extra pass.
function writeSlot(part: FieldMesh, slot: number, piece: LitterPiece | null): void {
  const matrices = part.mesh.instanceMatrix.array;
  const at = slot * 16;
  matrices.fill(0, at, at + 16);
  matrices[at + 15] = 1;
  if (!piece) return;
  const cos = QUARTER_COS[piece.turns % 4]!;
  const sin = QUARTER_SIN[piece.turns % 4]!;
  matrices[at] = cos;
  matrices[at + 2] = -sin;
  matrices[at + 5] = 1;
  matrices[at + 8] = sin;
  matrices[at + 10] = cos;
  matrices[at + 12] = piece.x;
  matrices[at + 13] = piece.y;
  matrices[at + 14] = piece.z;
}

export function buildLitterField(options: LitterFieldOptions): LitterField {
  const { models, capacity } = options;
  const group = new Group();
  group.name = 'litter';

  const { lit, dispose: disposeMaterials } = fieldMaterials(options.lightVolume ?? null);

  // Dealt once, round-robin: which slot a piece takes changes on every write, its variant never.
  const kinds = Math.max(1, models.length);
  const dealt = Int32Array.from({ length: capacity }, (_, slot) => slot % kinds);
  // Lit only, so one mesh per model: litter has nothing that glows.
  const byVariant: (FieldMesh | undefined)[] = models.map(
    (model, variant) =>
      fieldMeshesFor({
        name: `litter-${model.id}`,
        members: slotsFor(dealt, capacity, variant),
        surfaces: [{ kind: 'lit', source: model.lit, material: lit }],
      })[0],
  );
  const parts = byVariant.filter((part): part is FieldMesh => part !== undefined);
  for (const part of parts) group.add(part.mesh);
  const filled = new Int32Array(byVariant.length);

  const place = (piece: LitterPiece): void => {
    const part = byVariant[piece.variant];
    const slot = filled[piece.variant] ?? 0;
    if (!part || slot >= part.members.length) return;
    writeSlot(part, slot, piece);
    filled[piece.variant] = slot + 1;
  };

  const emptyFrom = (part: FieldMesh, from: number): void => {
    for (let slot = from; slot < part.members.length; slot++) writeSlot(part, slot, null);
    part.mesh.instanceMatrix.needsUpdate = true;
  };

  const write = (pieces: readonly LitterPiece[]): void => {
    filled.fill(0);
    for (const piece of pieces) place(piece);
    for (const [variant, part] of byVariant.entries()) {
      if (part) emptyFrom(part, filled[variant]!);
    }
  };
  write([]);

  return {
    group,
    drawCalls: parts.length,
    triangleCount: fieldTriangles(parts),
    write,
    dispose() {
      disposeFieldMeshes(parts);
      group.clear();
      disposeMaterials();
    },
  };
}
