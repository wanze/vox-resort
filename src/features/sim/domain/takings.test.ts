import { describe, expect, it } from 'vitest';
import { createGuests } from '../../guests/domain/guests';
import { NO_HOME } from '../../guests/domain/homes';
import { earn, maintenanceFor, stayBill, takingsOf, type VenueTakings } from './takings';

const guestsIn = (homes: number) =>
  createGuests({
    count: 12,
    homes: Array.from({ length: homes }, (_, index) => ({
      key: `bungalow#${index}`,
      id: 'bungalow',
      label: 'Bungalow',
      beds: 6,
    })),
    variants: 4,
    childVariant: 3,
    seed: 1,
  });

describe('stayBill', () => {
  it('bills a party of four staying five nights the rate, four times, five times over', () => {
    const guests = guestsIn(1);
    const party = [0, 1, 2, 3];
    for (const person of party) {
      guests.home[person] = 0;
      guests.nights[person] = 5;
    }
    expect(stayBill(party, guests, () => 20)).toBe(20 * 4 * 5);
  });

  it('bills nothing for somebody with no bed on the plot', () => {
    const guests = guestsIn(1);
    guests.home[0] = NO_HOME;
    guests.nights[0] = 3;
    expect(stayBill([0], guests, () => 20)).toBe(0);
  });

  it('rates each guest by their own home', () => {
    const guests = guestsIn(2);
    guests.home[0] = 0;
    guests.nights[0] = 2;
    guests.home[1] = 1;
    guests.nights[1] = 3;
    const rates = [10, 30];
    expect(stayBill([0, 1], guests, (home) => rates[home]!)).toBe(10 * 2 + 30 * 3);
  });

  it('earns each stay on the lodging it sleeps in', () => {
    const guests = guestsIn(2);
    for (const person of [0, 1, 2]) {
      guests.home[person] = person === 2 ? 1 : 0;
      guests.nights[person] = 4;
    }
    const takings: VenueTakings = new Map();
    stayBill([0, 1, 2], guests, () => 20, takings);
    expect(takings.get('bungalow#0')).toBe(2 * 20 * 4);
    expect(takings.get('bungalow#1')).toBe(20 * 4);
  });
});

describe('maintenanceFor', () => {
  it('is a hundredth of what stands, rounded', () => {
    expect(maintenanceFor([680, 1_870, 20, 20])).toBe(Math.round((680 + 1_870 + 40) * 0.01));
    expect(maintenanceFor([])).toBe(0);
  });
});

describe('earn', () => {
  it('adds takings up by key, skips nothing earned, and clears', () => {
    const takings: VenueTakings = new Map();
    earn(takings, 'bakery#0', 3);
    earn(takings, 'bakery#0', 3);
    earn(takings, 'restaurant#1', 8);
    earn(takings, 'restrooms#2', 0);
    expect(takings.get('bakery#0')).toBe(6);
    expect(takings.get('restaurant#1')).toBe(8);
    expect(takings.has('restrooms#2')).toBe(false);
    expect(takingsOf(takings, 'restrooms#2')).toBe(0);
    expect(takingsOf(takings, 'bakery#0')).toBe(6);
    takings.clear();
    expect(takings.size).toBe(0);
  });
});
