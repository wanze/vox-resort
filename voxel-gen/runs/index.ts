import type { VoxelModelSource } from '../voxelgen.ts';
import { runSources, type RunStyle } from './pieces.ts';
import { hedge } from './styles/hedge.ts';
import { stoneWall } from './styles/stone-wall.ts';

export const RUN_STYLES: readonly RunStyle[] = [hedge, stoneWall];

export const RUN_MODELS: readonly VoxelModelSource[] = RUN_STYLES.flatMap(runSources);

export const RUN_IDS: readonly string[] = RUN_MODELS.map((source) => source.id);
