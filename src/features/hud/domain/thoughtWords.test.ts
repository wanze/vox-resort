import { describe, expect, it } from 'vitest';
import { THOUGHT_KINDS } from '../../sim/domain/thoughts';
import { THOUGHT_LABELS, thoughtLine } from './thoughtWords';

describe('a thought in a guest’s words', () => {
  it('has a line for every kind, with a subject and without', () => {
    for (const kind of THOUGHT_KINDS) {
      expect(thoughtLine(kind, null)).not.toBe('');
      expect(thoughtLine(kind, 'Tiki Bar')).not.toBe('');
      expect(THOUGHT_LABELS[kind]).not.toBe('');
    }
  });

  it('names the subject where the thought has one', () => {
    expect(thoughtLine('queue-too-long', 'Tiki Bar')).toBe('The line at Tiki Bar was too long');
    expect(thoughtLine('queue-too-long', null)).toBe('The lines were too long');
  });
});
