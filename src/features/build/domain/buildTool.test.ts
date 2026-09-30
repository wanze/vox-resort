import { describe, expect, it } from 'vitest';
import { armedBrush, armedObject, armedRemove, armedZone, type BuildTool } from './buildTool';
import { NO_ZONE } from '../../sim/domain/zones';

const OBJECT: BuildTool = { kind: 'object', id: 'cottage' };
const BRUSH: BuildTool = { kind: 'terrain', brush: 'raise' };
const REMOVE: BuildTool = { kind: 'remove' };
const ZONE: BuildTool = { kind: 'zone', zone: 2 };
const ERASER: BuildTool = { kind: 'zone', zone: NO_ZONE };

describe('armedRemove', () => {
  it('is armed by the bulldozer and by nothing else', () => {
    expect([REMOVE, OBJECT, BRUSH, null].map(armedRemove)).toEqual([true, false, false, false]);
  });
});

describe('the bulldozer disarms the other two', () => {
  it('leaves no object armed', () => {
    expect(armedObject(REMOVE)).toBeNull();
    expect(armedObject(OBJECT)).toBe('cottage');
  });

  it('leaves no brush armed', () => {
    expect(armedBrush(REMOVE)).toBeNull();
    expect(armedBrush(BRUSH)).toBe('raise');
  });
});

describe('armedZone', () => {
  it('is armed by a zone brush, the eraser included, and by nothing else', () => {
    expect([ZONE, ERASER, OBJECT, BRUSH, REMOVE, null].map(armedZone)).toEqual([
      2,
      NO_ZONE,
      null,
      null,
      null,
      null,
    ]);
    expect(armedBrush(ZONE)).toBeNull();
    expect(armedRemove(ZONE)).toBe(false);
  });
});
