import { describe, expect, it } from 'vitest';
import { expectationFor, expectationWords, paidShareOf, valueThought } from './expectations';

describe('expectationFor', () => {
  it('asks little of a modest resort at list price and a lot of a dear five-star one', () => {
    expect(expectationFor(3, 1)).toBeCloseTo(0.22, 2);
    expect(expectationFor(4.5, 1.15)).toBeCloseTo(0.655, 2);
    expect(expectationFor(5, 1.25)).toBeCloseTo(0.825, 2);
  });

  it('stays inside 0..1 at either end', () => {
    expect(expectationFor(2.5, 0.8)).toBe(0);
    expect(expectationFor(0, 0)).toBe(0);
    expect(expectationFor(5, 1.6)).toBe(1);
    expect(expectationFor(7, 3)).toBe(1);
  });

  it('rises with the stars at a fixed price, and with the price at fixed stars', () => {
    expect(expectationFor(4, 1)).toBeGreaterThan(expectationFor(3.5, 1));
    expect(expectationFor(3.5, 1.2)).toBeGreaterThan(expectationFor(3.5, 1));
  });
});

describe('paidShareOf', () => {
  it('compares the charge with the list price', () => {
    expect(paidShareOf(60, 50)).toBeCloseTo(1.2);
  });

  it('reads a free bed as list price', () => {
    expect(paidShareOf(30, 0)).toBe(1);
  });
});

describe('expectationWords', () => {
  it('names each quarter', () => {
    expect(expectationWords(0)).toBe('easy-going');
    expect(expectationWords(0.25)).toBe('particular');
    expect(expectationWords(0.5)).toBe('demanding');
    expect(expectationWords(0.75)).toBe('hard-to-please');
    expect(expectationWords(1)).toBe('hard-to-please');
  });
});

describe('valueThought', () => {
  it('grumbles when an overcharged guest is not happy enough for what they expect', () => {
    expect(valueThought(0.6, 0, 1.2)).toBeNull();
    expect(valueThought(0.6, 0.4, 1.2)).toBe('not-worth-it');
    expect(valueThought(0.5, 0, 1.2)).toBe('not-worth-it');
  });

  it('praises a happy guest who paid no more than list', () => {
    expect(valueThought(0.8, 1, 1.05)).toBe('good-value');
    expect(valueThought(0.9, 0, 1)).toBe('good-value');
  });

  it('says nothing in between', () => {
    expect(valueThought(0.7, 0.5, 1)).toBeNull();
    expect(valueThought(0.95, 1, 1.25)).toBeNull();
  });
});
