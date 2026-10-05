import { describe, expect, it } from 'vitest';
import { createRandom } from '../../layout/domain/random';
import type { BuildTool, StylePick } from './buildTool';
import {
  armWithMemory,
  cycledTool,
  itemChooser,
  nextPick,
  pickLabel,
  resolveStyle,
  startsOnOriginal,
  styleIdsOf,
  styleStripFor,
} from './stylePick';

const STYLES = ['bakery', 'bakery-b', 'bakery-c'];
const NONE: ReadonlyMap<string, StylePick> = new Map();

describe('resolveStyle', () => {
  it('places the style that was picked', () => {
    expect(resolveStyle(STYLES, 'bakery-b', () => 0)).toBe('bakery-b');
  });

  it('rolls every style in time when nothing was picked', () => {
    const random = createRandom(7);
    const rolled = new Set(Array.from({ length: 60 }, () => resolveStyle(STYLES, null, random)));
    expect([...rolled].toSorted()).toEqual(STYLES);
  });

  it('rolls when the pick is not one of the family', () => {
    expect(resolveStyle(STYLES, 'hotel-b', () => 0.99)).toBe('bakery-c');
  });

  it('refuses a family with no style at all', () => {
    expect(() => resolveStyle([], null, () => 0)).toThrow();
  });
});

describe('nextPick', () => {
  it('walks random, then every style, then back to random', () => {
    const walked: StylePick[] = [null];
    for (let step = 0; step < STYLES.length + 1; step++) {
      walked.push(nextPick(STYLES, walked.at(-1)!));
    }
    expect(walked).toEqual([null, 'bakery', 'bakery-b', 'bakery-c', null]);
  });

  it('stays on random for a family of one', () => {
    expect(nextPick(['hotel'], null)).toBeNull();
    expect(nextPick(['hotel'], 'hotel')).toBeNull();
  });
});

const armed = (next: BuildTool | null, memory = NONE) => armWithMemory(next, memory);

describe('armWithMemory', () => {
  it('arms a family on random the first time', () => {
    expect(armed({ kind: 'object', id: 'bakery' }).tool).toEqual({
      kind: 'object',
      id: 'bakery',
      style: null,
    });
  });

  it('arms a family drawn in runs on its original the first time', () => {
    expect(armed({ kind: 'object', id: 'palm' }).tool).toMatchObject({ style: 'palm' });
    expect(armed({ kind: 'object', id: 'street-lamp' }).tool).toMatchObject({
      style: 'street-lamp',
    });
  });

  it('remembers random for a family drawn in runs once the player picks it', () => {
    const { memory } = armed({ kind: 'object', id: 'palm', style: null });
    expect(armed({ kind: 'object', id: 'palm' }, memory).tool).toMatchObject({ style: null });
  });

  it('remembers a style the player named', () => {
    const { tool, memory } = armed({ kind: 'object', id: 'bakery', style: 'bakery-b' });
    expect(tool).toEqual({ kind: 'object', id: 'bakery', style: 'bakery-b' });
    expect(memory.get('bakery')).toBe('bakery-b');
  });

  it('comes back on the remembered style when the family is armed again', () => {
    const { memory } = armed({ kind: 'object', id: 'bakery', style: 'bakery-b' });
    expect(armed({ kind: 'object', id: 'bakery' }, memory).tool).toEqual({
      kind: 'object',
      id: 'bakery',
      style: 'bakery-b',
    });
  });

  it('remembers going back to random', () => {
    const { memory } = armed({ kind: 'object', id: 'bakery', style: 'bakery-b' });
    const reset = armed({ kind: 'object', id: 'bakery', style: null }, memory).memory;
    expect(armed({ kind: 'object', id: 'bakery' }, reset).tool).toMatchObject({ style: null });
  });

  it('keeps each family to its own pick', () => {
    const { memory } = armed({ kind: 'object', id: 'bakery', style: 'bakery-b' });
    expect(armed({ kind: 'object', id: 'hotel' }, memory).tool).toMatchObject({ style: null });
  });

  it('keeps the memory when nothing is armed', () => {
    const { memory } = armed({ kind: 'object', id: 'bakery', style: 'bakery-b' });
    const disarmed = armed(null, memory);
    expect(disarmed.tool).toBeNull();
    expect(disarmed.memory.get('bakery')).toBe('bakery-b');
  });

  it('passes the terrain and bulldozer tools through untouched', () => {
    const brush: BuildTool = { kind: 'terrain', brush: 'raise' };
    const remove: BuildTool = { kind: 'remove' };
    expect(armed(brush).tool).toBe(brush);
    expect(armed(remove).tool).toBe(remove);
  });
});

describe('itemChooser', () => {
  it('lays out the picked style, whatever the roll', () => {
    const choose = itemChooser({ kind: 'object', id: 'bakery', style: 'bakery-b' }, () => 0);
    expect(choose?.()).toMatchObject({ id: 'bakery-b', variantOf: 'bakery' });
  });

  it('rolls afresh every time it is asked on random', () => {
    const rolls = [0, 0.99];
    const choose = itemChooser({ kind: 'object', id: 'bakery', style: null }, () => rolls.shift()!);
    expect([choose?.().id, choose?.().id]).toEqual(['bakery', 'bakery-b']);
  });

  it('has nothing to lay out without an armed object', () => {
    expect(itemChooser({ kind: 'remove' }, () => 0)).toBeNull();
    expect(itemChooser(null, () => 0)).toBeNull();
  });
});

describe('cycledTool', () => {
  it('moves an armed family on to its next style', () => {
    expect(cycledTool({ kind: 'object', id: 'bakery', style: null })).toEqual({
      kind: 'object',
      id: 'bakery',
      style: 'bakery',
    });
    expect(cycledTool({ kind: 'object', id: 'bakery', style: 'bakery-b' })).toMatchObject({
      style: null,
    });
  });

  it('cycles a family drawn in runs through random too', () => {
    const palm = { kind: 'object', id: 'palm', style: 'palm' } as const;
    expect(cycledTool(palm)).toMatchObject({ style: 'palm-b' });
    expect(cycledTool({ ...palm, style: 'palm-b' })).toMatchObject({ style: null });
  });

  it('has nothing to cycle for a family of one, terrain, the bulldozer or nothing', () => {
    expect(cycledTool({ kind: 'object', id: 'path', style: null })).toBeNull();
    expect(cycledTool({ kind: 'object', id: 'hedge', style: null })).toBeNull();
    expect(cycledTool({ kind: 'terrain', brush: 'raise' })).toBeNull();
    expect(cycledTool({ kind: 'remove' })).toBeNull();
    expect(cycledTool(null)).toBeNull();
  });
});

describe('styleIdsOf', () => {
  it('lists the original first', () => {
    expect(styleIdsOf('bakery')).toEqual(['bakery', 'bakery-b']);
  });
});

describe('styleStripFor', () => {
  it('offers the styles of an armed family that has more than one', () => {
    const strip = styleStripFor({ kind: 'object', id: 'bakery', style: 'bakery-b' });
    expect(strip?.family).toBe('bakery');
    expect(strip?.pick).toBe('bakery-b');
    expect(strip?.styles.map((type) => type.id)).toEqual(['bakery', 'bakery-b']);
  });

  it('starts only a family drawn in runs on its original', () => {
    expect(startsOnOriginal('flowerbed')).toBe(true);
    expect(startsOnOriginal('palm')).toBe(true);
    expect(startsOnOriginal('hotel')).toBe(false);
  });

  it('offers nothing for a family of one, or with no object armed', () => {
    expect(styleStripFor({ kind: 'object', id: 'path' })).toBeNull();
    expect(styleStripFor({ kind: 'remove' })).toBeNull();
    expect(styleStripFor(null)).toBeNull();
  });
});

const labelOf = (style: StylePick): string =>
  pickLabel(styleStripFor({ kind: 'object', id: 'bakery', style })!);

describe('pickLabel', () => {
  it('names the pick by its letter', () => {
    expect(labelOf(null)).toBe('Random');
    expect(labelOf('bakery')).toBe('Style A');
    expect(labelOf('bakery-b')).toBe('Style B');
    expect(labelOf('hotel')).toBe('Random');
  });
});
