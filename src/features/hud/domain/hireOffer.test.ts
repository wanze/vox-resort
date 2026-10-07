import { describe, expect, it } from 'vitest';
import type { Advice, AdviceKind } from '../../sim/domain/advice';
import { AUTO_HIRING, type Roster } from '../../sim/domain/staff';
import { hireOffer, type StaffNumbers } from './hireOffer';

const advice = (kind: AdviceKind, subject = 'Splash Point'): Advice => ({
  kind,
  weight: 0.5,
  subject,
  count: 1,
  at: { tileX: 0, tileZ: 0 },
  need: null,
});

const roster = (lifeguard: number, mechanic = 1): Roster => ({
  cleaner: 1,
  lifeguard,
  animator: 0,
  mechanic,
});

// Two lifeguards set by hand where the plot now wants three.
const short: StaffNumbers = {
  roster: roster(2),
  recommended: roster(3),
  hiring: { ...AUTO_HIRING, lifeguard: 2 },
};

describe('hireOffer', () => {
  it('offers one more lifeguard for water nobody watches', () => {
    expect(hireOffer(advice('unwatched'), short)).toEqual({
      role: 'lifeguard',
      count: 3,
      one: true,
    });
  });

  it('offers the role that sees to each kind of place problem', () => {
    const everyRoleShort: StaffNumbers = {
      roster: { cleaner: 0, lifeguard: 0, animator: 0, mechanic: 0 },
      recommended: { cleaner: 2, lifeguard: 1, animator: 1, mechanic: 1 },
      hiring: { cleaner: 0, lifeguard: 0, animator: 0, mechanic: 0 },
    };
    const roleFor = (kind: AdviceKind) => hireOffer(advice(kind), everyRoleShort)?.role;
    expect(roleFor('broken')).toBe('mechanic');
    expect(roleFor('dirty')).toBe('cleaner');
    expect(roleFor('unmade')).toBe('cleaner');
    expect(roleFor('full-lines')).toBeUndefined();
  });

  it('tops a short-staffed role up to what the plot needs', () => {
    expect(hireOffer(advice('short-staffed', 'lifeguard'), short)).toEqual({
      role: 'lifeguard',
      count: 3,
      one: false,
    });
  });

  it('offers nothing on Auto, which already hires what the plot needs', () => {
    const auto: StaffNumbers = { ...short, roster: roster(3), hiring: AUTO_HIRING };
    expect(hireOffer(advice('unwatched'), auto)).toBeNull();
  });

  it('offers nothing once the hand-set role meets the plot', () => {
    const enough: StaffNumbers = {
      ...short,
      roster: roster(3),
      hiring: { ...AUTO_HIRING, lifeguard: 3 },
    };
    expect(hireOffer(advice('unwatched'), enough)).toBeNull();
    expect(hireOffer(advice('short-staffed', 'lifeguard'), enough)).toBeNull();
  });

  it('offers nothing before the staff are counted', () => {
    expect(hireOffer(advice('unwatched'), null)).toBeNull();
  });
});
