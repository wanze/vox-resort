import { describe, expect, it } from 'vitest';
import {
  cleanResortName,
  MAX_RESORT_NAME,
  rerollResortName,
  resortNameFor,
  savedResortName,
} from './resortName';

const SHAPE = /^[A-Z][a-z]+ [A-Z][a-z]+$/;

describe('cleanResortName', () => {
  it('trims the ends and collapses inner runs of spaces', () => {
    expect(cleanResortName('  Coral   Cove \t')).toBe('Coral Cove');
  });

  it('turns an empty or blank name into none', () => {
    expect(cleanResortName('')).toBeNull();
    expect(cleanResortName('   ')).toBeNull();
  });

  it('cuts a long name at the cap', () => {
    const cleaned = cleanResortName('x'.repeat(40));
    expect(cleaned).toHaveLength(MAX_RESORT_NAME);
  });
});

describe('resortNameFor', () => {
  it('gives a seed the same name every time, and two seeds two names', () => {
    expect(resortNameFor(7)).toBe(resortNameFor(7));
    expect(resortNameFor(7)).not.toBe(resortNameFor(8));
    expect(resortNameFor(0xfffffffe)).toMatch(SHAPE);
  });
});

describe('savedResortName', () => {
  it('keeps a saved name, and names an older save by its seed', () => {
    expect(savedResortName('Lido 7', 7)).toBe('Lido 7');
    expect(savedResortName(undefined, 7)).toBe(resortNameFor(7));
  });
});

describe('rerollResortName', () => {
  it('picks a word from each list, even at the ends of the range', () => {
    expect(rerollResortName(() => 0)).toBe('Coral Cove');
    expect(rerollResortName(() => 0.999_999)).toBe('Citrus Dunes');
    expect(rerollResortName(Math.random)).toMatch(SHAPE);
  });
});
