import { describe, expect, it } from 'vitest';
import { OPERATORS, operatorFor } from './operators';

describe('operatorFor', () => {
  it('draws a listed operator at both ends of the roll', () => {
    expect(operatorFor(() => 0)).toBe(OPERATORS[0]);
    expect(operatorFor(() => 0.999_999)).toBe(OPERATORS.at(-1));
  });

  it('names no operator twice', () => {
    expect(new Set(OPERATORS).size).toBe(OPERATORS.length);
  });
});
