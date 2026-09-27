import { describe, expect, it } from 'vitest';
import { rankCommands, sectionCommands, stepCursor, type Searchable } from './commandSearch';

const command = (label: string, group: string, keywords?: string): Searchable =>
  keywords === undefined ? { label, group } : { label, group, keywords };

const COMMANDS: readonly Searchable[] = [
  command('Pause', 'Speed', 'time stop'),
  command('Fast', 'Speed', 'time'),
  command('Rain', 'Weather'),
  command('Beach Bar', 'Build', 'amenities drink'),
  command('Snack Bar', 'Build', 'amenities food'),
  command('Barbecue', 'Build', 'leisure'),
  command('Café', 'Build', 'amenities'),
];

const labels = (items: readonly Searchable[]): readonly string[] => items.map((each) => each.label);

describe('rankCommands', () => {
  it('hands back the very same list when nothing is typed', () => {
    expect(rankCommands(COMMANDS, '')).toBe(COMMANDS);
    expect(rankCommands(COMMANDS, '  ')).toBe(COMMANDS);
  });

  it('puts a name that starts with the word ahead of one that only contains it', () => {
    expect(labels(rankCommands(COMMANDS, 'bar'))).toEqual(['Barbecue', 'Beach Bar', 'Snack Bar']);
  });

  it('reaches a command through its group and its keywords, below any name that matches', () => {
    expect(labels(rankCommands(COMMANDS, 'speed'))).toEqual(['Pause', 'Fast']);
    expect(labels(rankCommands(COMMANDS, 'drink'))).toEqual(['Beach Bar']);
  });

  it('asks every word to land, so two words narrow rather than widen', () => {
    expect(labels(rankCommands(COMMANDS, 'bar food'))).toEqual(['Snack Bar']);
    expect(rankCommands(COMMANDS, 'rain food')).toEqual([]);
  });

  it('ignores case and accents', () => {
    expect(labels(rankCommands(COMMANDS, 'CAFE'))).toEqual(['Café']);
  });
});

describe('sectionCommands', () => {
  it('orders the sections by their best hit and keeps the rank inside each', () => {
    const ranked = [COMMANDS[3]!, COMMANDS[2]!, COMMANDS[4]!];
    const sections = sectionCommands(ranked);
    expect(sections.map((each) => each.group)).toEqual(['Build', 'Weather']);
    expect(labels(sections[0]!.items)).toEqual(['Beach Bar', 'Snack Bar']);
  });

  it('has no sections for no commands', () => {
    expect(sectionCommands([])).toEqual([]);
  });
});

describe('stepCursor', () => {
  it('wraps round both ends', () => {
    expect(stepCursor(2, 1, 3)).toBe(0);
    expect(stepCursor(0, -1, 3)).toBe(2);
    expect(stepCursor(1, 1, 3)).toBe(2);
  });

  it('stays at the top of an empty list', () => {
    expect(stepCursor(0, 1, 0)).toBe(0);
    expect(stepCursor(0, -1, 0)).toBe(0);
  });
});
