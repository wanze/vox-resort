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

export const turnedAwayShare = ({ turnedAway }: Pressure): string => {
  const percent = Math.round(turnedAway * 100);
  return percent > 0 ? `${percent}%` : '';
};

export function pressureNote(line: DemandLine, pressure: Pressure): string {
  const { used, places, turnedAway } = pressure;
  const away = `${Math.round(turnedAway * 100)}% turned away`;
  if (line === 'beds') return `${whole(used)} of ${whole(places)} beds taken, ${away} lately`;
  return `${whole(used)} in the busiest hour of the day, room for ${whole(places)}, ${away}`;
}
