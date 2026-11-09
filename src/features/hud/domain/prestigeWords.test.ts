import { describe, expect, it } from 'vitest';
import { createPrestige, prestigeAfterDay, STREAK_DAYS } from '../../sim/domain/prestige';
import { prestigeGoal, reachedWords } from './prestigeWords';

describe('prestigeGoal', () => {
  it('counts the days towards the next tier and names what it unlocks', () => {
    let prestige = createPrestige();
    for (let day = 0; day < 3; day++) prestige = prestigeAfterDay(prestige, 3.6, day).prestige;
    const goal = prestigeGoal(prestige)!;
    expect(goal).toMatch(/^3\.5★ for 3 of 7 days: unlocks /);
    expect(goal).toContain('Massage');
  });

  it('says nothing once every tier is reached', () => {
    let prestige = createPrestige();
    for (let day = 0; day < STREAK_DAYS; day++)
      prestige = prestigeAfterDay(prestige, 5, day).prestige;
    expect(prestigeGoal(prestige)).toBeNull();
  });
});

describe('reachedWords', () => {
  it('names the highest tier and every building it opened', () => {
    const words = reachedWords([3.5, 4])!;
    expect(words).toMatch(/^Reached a 4★ reputation: /);
    expect(words).toContain('Villa');
    expect(words).toContain('Massage');
  });

  it('points to the prices once the stars let guests pay more than list', () => {
    expect(reachedWords([4])).toContain('Guests will now pay more');
    expect(reachedWords([3])).not.toContain('pay more');
  });

  it('says nothing for a day that reached nothing', () => {
    expect(reachedWords([])).toBeNull();
  });
});
