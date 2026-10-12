import type { Node } from 'three/webgpu';
import { uniform } from 'three/tsl';
import type { Weather } from '../../sim/domain/weather';
import { roughenTowards } from '../domain/seaState';

export interface RoughSea {
  // A uniform, so a storm blowing up never recompiles the sea.
  readonly level: Node<'float'>;
  readonly value: number;
  advance(dt: number, weather: Weather): void;
}

export function createRoughSea(): RoughSea {
  const level = uniform(0);
  return {
    level,
    get value() {
      return level.value;
    },
    advance(dt, weather) {
      level.value = roughenTowards(level.value, weather, dt);
    },
  };
}
