import { describe, expect, it } from 'vitest';
import { contrast, gradeOf, over, parseColour } from './contrast';

describe('parseColour', () => {
  it('reads hex in its short, long and alpha spellings', () => {
    expect(parseColour('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColour('#3a2e22')).toEqual({ r: 58, g: 46, b: 34, a: 1 });
    expect(parseColour('#00000080')?.a).toBeCloseTo(0.5, 2);
  });

  it('reads the comma and space spellings of rgb a browser computes', () => {
    expect(parseColour('rgb(80, 58, 34)')).toEqual({ r: 80, g: 58, b: 34, a: 1 });
    expect(parseColour('rgba(80, 58, 34, 0.5)')).toEqual({ r: 80, g: 58, b: 34, a: 0.5 });
    expect(parseColour('rgb(80 58 34 / 22%)')).toEqual({ r: 80, g: 58, b: 34, a: 0.22 });
  });

  it('gives up on anything else', () => {
    expect(parseColour('linear-gradient(red, blue)')).toBeNull();
    expect(parseColour('#12345')).toBeNull();
  });
});

describe('contrast', () => {
  const black = parseColour('#000')!;
  const white = parseColour('#fff')!;

  it('runs from 1 for the same colour to 21 for black on white', () => {
    expect(contrast(white, white)).toBeCloseTo(1);
    expect(contrast(black, white)).toBeCloseTo(21);
  });

  it('matches the HUD text on its panel stone', () => {
    expect(contrast(parseColour('#3a2e22')!, parseColour('#e9ddc8')!)).toBeCloseTo(9.81, 1);
  });

  it('judges a see-through ink as it lands on the ground', () => {
    const half = { ...black, a: 0.5 };
    expect(over(half, white).r).toBeCloseTo(127.5);
    expect(contrast(half, white)).toBeLessThan(contrast(black, white));
  });
});

describe('gradeOf', () => {
  it('passes body text from 4.5 and large text or a bar from 3', () => {
    expect(gradeOf(4.5)).toBe('text');
    expect(gradeOf(3.3)).toBe('large');
    expect(gradeOf(2.1)).toBe('fail');
  });
});
