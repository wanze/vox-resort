import { ZONE_COLOURS } from '../../overlays/domain/ramp';
import { STAFF_ROLES, type Roster } from '../../sim/domain/staff';
import { NO_ZONE, ZONES } from '../../sim/domain/zones';
import { roleWord } from './staffWords';

export const ZONE_IDS = Array.from({ length: ZONES }, (_, zone) => zone);

export const cssColour = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;

export const zoneLabel = (zone: number): string =>
  zone === NO_ZONE ? 'Erase zone' : `Zone ${zone + 1}`;

export function crewLine(roster: Roster): string {
  const parts = STAFF_ROLES.filter((role) => roster[role] > 0).map(
    (role) => `${roster[role]} ${roleWord(role, roster[role])}`,
  );
  return parts.length > 0 ? parts.join(', ') : 'nobody';
}

export interface ZoneBrush {
  readonly zone: number;
  readonly hint: string;
  readonly colour?: string;
}

export const ZONE_BRUSHES: readonly ZoneBrush[] = [
  ...ZONE_IDS.map((zone) => ({
    zone,
    hint: 'Paint where staff work, drag to paint a run',
    colour: cssColour(ZONE_COLOURS[zone]!),
  })),
  {
    zone: NO_ZONE,
    hint: 'Take the zone off a tile, drag to clear a run',
  },
];
