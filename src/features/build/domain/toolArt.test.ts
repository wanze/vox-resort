import { describe, expect, it } from 'vitest';
import { TERRAIN_BRUSHES } from './terrainBrush';
import { TOOL_ART } from './toolArt';

describe('TOOL_ART', () => {
  it('has a picture for every terrain brush', () => {
    for (const brush of TERRAIN_BRUSHES) expect(TOOL_ART[brush.id]).toBeDefined();
  });

  it('names each picture once, apart from every catalogue id', () => {
    const ids = Object.values(TOOL_ART);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^tool-/);
  });
});
