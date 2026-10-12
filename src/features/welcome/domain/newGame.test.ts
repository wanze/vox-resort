import { describe, expect, it } from 'vitest';
import { resortNameFor } from '../../naming/domain/resortName';
import { DEFAULT_CONFIG } from '../../layout/domain/resortConfig';
import { groundOf, landscapeHintFor, nameFor, paramsFor, startParamsFor } from './newGame';

describe('groundOf', () => {
  it('always starts a tycoon on bare ground', () => {
    expect(groundOf({ mode: 'tycoon', ground: 'bare' })).toBe('bare');
    expect(groundOf({ mode: 'tycoon', ground: 'grown' })).toBe('bare');
  });

  it('lets free play start on bare ground or a grown resort', () => {
    expect(groundOf({ mode: 'sandbox', ground: 'bare' })).toBe('bare');
    expect(groundOf({ mode: 'sandbox', ground: 'grown' })).toBe('grown');
  });
});

describe('paramsFor', () => {
  const draft = { tilesX: 112, tilesZ: 100, density: 1, seed: 7 };

  it('sets a bare game to the fixed world', () => {
    expect(paramsFor({ mode: 'tycoon', ground: 'grown' }, draft)).toEqual({
      ...draft,
      tilesX: 256,
      tilesZ: 256,
    });
    expect(paramsFor({ mode: 'sandbox', ground: 'bare' }, draft)).toEqual({
      ...draft,
      tilesX: 256,
      tilesZ: 256,
    });
  });

  it('leaves a generated game the size it asked for', () => {
    expect(paramsFor({ mode: 'sandbox', ground: 'grown' }, draft)).toBe(draft);
  });
});

describe('startParamsFor', () => {
  const draft = { tilesX: 112, tilesZ: 100, density: 1, seed: 7 };
  const lands = { grown: { island: true }, bare: { river: false } };

  it('keeps bare land the whole fixed world, past the largest plot grown', () => {
    const bare = startParamsFor({ mode: 'tycoon', ground: 'bare' }, draft, lands);
    expect(bare).toMatchObject({ tilesX: 256, tilesZ: 256, land: { river: false } });
  });

  it('gives a grown resort its own landscape, and caps its size', () => {
    const big = { ...draft, tilesX: 999 };
    const grown = startParamsFor({ mode: 'sandbox', ground: 'grown' }, big, lands);
    expect(grown).toMatchObject({ tilesX: 256, land: { island: true } });
    const carried = { ...draft, land: { hills: true }, config: { housing: 'mixed' as const } };
    const started = startParamsFor({ mode: 'sandbox', ground: 'grown' }, carried, {});
    expect(started).not.toHaveProperty('land');
    expect(started.config).toEqual(DEFAULT_CONFIG);
  });
});

describe('landscapeHintFor', () => {
  it('names each option the plot is too small for, and what it needs', () => {
    expect(landscapeHintFor(48, 48)).toBe(
      'Needs a larger plot: River 72 wide, Hills 72 wide, Island 72 × 64.',
    );
    expect(landscapeHintFor(80, 56)).toBe('Needs a larger plot: Island 72 × 64.');
    expect(landscapeHintFor(80, 64)).toBeNull();
  });
});

describe('nameFor', () => {
  it('takes the typed name, cleaned, and the seed name for an empty field', () => {
    expect(nameFor('  Coral   Cove ', 7)).toBe('Coral Cove');
    expect(nameFor(' ', 7)).toBe(resortNameFor(7));
  });
});
