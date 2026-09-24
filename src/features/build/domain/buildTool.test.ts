import { describe, expect, it } from 'vitest';
import { armedBrush, armedObject, armedRemove, type BuildTool } from './buildTool';

const OBJECT: BuildTool = { kind: 'object', id: 'cottage' };
const BRUSH: BuildTool = { kind: 'terrain', brush: 'raise' };
const REMOVE: BuildTool = { kind: 'remove' };

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
