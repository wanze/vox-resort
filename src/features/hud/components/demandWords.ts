import type { DemandGroup, DemandLine, Pressure } from '../../sim/domain/demand';

export const GROUP_NAMES: { readonly [group in DemandGroup]: string } = {
  stay: 'Stay',
  food: 'Food',
  fun: 'Fun',
  care: 'Care',
};

export const GROUP_TITLES: { readonly [group in DemandGroup]: string } = {
  stay: 'Stay',
  food: 'Food & drink',
  fun: 'Fun',
  care: 'Care',
};

export const LINE_NAMES: { readonly [line in DemandLine]: string } = {
  beds: 'Beds',
  energy: 'Rest',
  hunger: 'Eat',
  thirst: 'Drink',
  fun: 'Fun',
  hygiene: 'Wash',
  health: 'First aid',
};

// Past this the bar turns red: most of the line is already being turned away.
export const PRESSURE_LOUD = 0.6;

export function pressureWord(pressure: number): string {
  if (pressure > PRESSURE_LOUD) return 'build more now';
  if (pressure > 0) return 'could use more';
  if (pressure < -0.5) return 'plenty';
  return 'about right';
}

const whole = (value: number): string => value.toLocaleString('en-US');

export const wantedOfPlaces = ({ wanting, places }: Pressure): string =>
  `${whole(wanting)} / ${whole(places)}`;

export const turnedAwayShare = ({ turnedAway }: Pressure): string => {
  const percent = Math.round(turnedAway * 100);
  return percent > 0 ? `${percent}%` : '';
};

// The beds line keeps the homeless only as a share of those present, so they are counted back.
export function pressureNote(line: DemandLine, pressure: Pressure, present: number): string {
  const { wanting, places, turnedAway } = pressure;
  if (line === 'beds') {
    const without = Math.round(turnedAway * present);
    return `${whole(wanting - without)} of ${whole(places)} beds taken, ${whole(without)} without one`;
  }
  const away = `${Math.round(turnedAway * 100)}% turned away`;
  return `${whole(wanting)} want it, room for ${whole(places)} each half hour, ${away}`;
}
