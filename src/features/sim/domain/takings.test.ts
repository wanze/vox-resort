import { describe, expect, it } from 'vitest';
import { createGuests } from '../../guests/domain/guests';
import { NO_HOME } from '../../guests/domain/homes';
import { earn, maintenanceFor, nightBill, takingsOf, type VenueTakings } from './takings';

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

describe('nightBill', () => {
  const housed = (homes: number, people: readonly number[]) => {
    const guests = guestsIn(homes);
    guests.present.fill(0);
    for (const person of people) {
      guests.present[person] = 1;
      guests.home[person] = 0;
    }
    return guests;
  };

  it('bills a night for everybody here with a bed, and nobody else', () => {
    const guests = housed(1, [0, 1, 2, 3]);
    expect(nightBill(guests, () => 20)).toBe(20 * 4);
  });

  it('bills nothing for somebody with no bed on the plot', () => {
    const guests = housed(1, [0]);
    guests.home[0] = NO_HOME;
    expect(nightBill(guests, () => 20)).toBe(0);
  });

  it('rates each guest by their own home', () => {
    const guests = housed(2, [0, 1]);
    guests.home[1] = 1;
    const rates = [10, 30];
    expect(nightBill(guests, (home) => rates[home]!)).toBe(10 + 30);
  });

  it('earns each night on the lodging it was slept in', () => {
    const guests = housed(2, [0, 1, 2]);
    guests.home[2] = 1;
    const takings: VenueTakings = new Map();
    nightBill(guests, () => 20, takings);
    expect(takings.get('bungalow#0')).toBe(2 * 20);
    expect(takings.get('bungalow#1')).toBe(20);
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
