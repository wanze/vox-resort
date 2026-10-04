import type { VoxelModelSource } from '../voxelgen.ts';
import { mosaicSources, type MosaicStyle } from './pieces.ts';
import { calcada } from './styles/calcada.ts';
import { terracotta } from './styles/terracotta.ts';
import { terrazzo } from './styles/terrazzo.ts';
import { zellige } from './styles/zellige.ts';

// The first is the family's original, so its label is what the palette's Grounds shelf shows.
export const MOSAIC_STYLES: readonly MosaicStyle[] = [terracotta, calcada, zellige, terrazzo];

const SOURCES = MOSAIC_STYLES.map(mosaicSources);

// Every piece is a family of its own, so only a style's own model can be a variant of mosaic.
export const MOSAIC_MODELS: readonly VoxelModelSource[] = SOURCES.flatMap((sources, index) =>
  index === 0 ? sources : sources.slice(1),
);

export const MOSAIC_VARIANTS: readonly {
  readonly of: string;
  readonly source: VoxelModelSource;
}[] = SOURCES.slice(1).map((sources) => ({ of: MOSAIC_STYLES[0]!.id, source: sources[0]! }));

export const MOSAIC_IDS: readonly string[] = SOURCES.flat().map((source) => source.id);
