import { describe, expect, it } from 'vitest';
import { createRandom } from '../../layout/domain/random';
import { CHILD_NAMES, FAMILY_NAMES, familyName, GIVEN_NAMES, givenName } from './names';

describe('the name lists', () => {
  it.each([
    ['given', GIVEN_NAMES, 60],
    ['child', CHILD_NAMES, 30],
    ['family', FAMILY_NAMES, 50],
  ] as const)('has at least enough %s names, none twice', (_, list, least) => {
    expect(list.length).toBeGreaterThanOrEqual(least);
    expect(new Set(list).size).toBe(list.length);
  });
});

describe('givenName', () => {
  it('draws the same name from the same seed', () => {
    expect(givenName(createRandom(9), false)).toBe(givenName(createRandom(9), false));
    expect(familyName(createRandom(9))).toBe(familyName(createRandom(9)));
  });

  it('gives a child only a child name', () => {
    const random = createRandom(3);
    for (let i = 0; i < 500; i++) expect(CHILD_NAMES).toContain(givenName(random, true));
  });

  it('never runs off the end of a list', () => {
    expect(GIVEN_NAMES).toContain(givenName(() => 0.9999999999, false));
    expect(FAMILY_NAMES).toContain(familyName(() => 0));
  });
});
