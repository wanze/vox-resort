import type { ModelVenue } from '../../../../voxel-gen/voxelgen.ts';
import type { ObjectTypeDefinition } from '../../catalog/domain/objectTypes';
import { SETTING_PREMIUM } from '../../catalog/domain/prices';
import { clockWords } from '../../events/domain/week';
import { dwellWording, NEED_LABELS } from '../../inspect/domain/selection';
import { footprintLabel } from './paletteFilter';

export interface ObjectFact {
  readonly label: string;
  readonly value: string;
}

export interface ObjectFacts {
  readonly title: string;
  readonly facts: readonly ObjectFact[];
  readonly notes: readonly string[];
}

const GROUND_WORDS = { beach: 'Beach only', shore: 'At the water’s edge' } as const;

const whole = (value: number): string => value.toLocaleString('en-US');

const fact = (label: string, value: string): ObjectFact => ({ label, value });

function sceneryWord(strength: number): string {
  if (strength >= 0.75) return 'Strong';
  return strength >= 0.4 ? 'Good' : 'Slight';
}

function lodgingFacts(venue: ModelVenue): ObjectFact[] {
  const beds = venue.beds ?? 0;
  return [
    fact('Sleeps', `${beds} ${beds === 1 ? 'guest' : 'guests'}`),
    fact('Price', `${whole(venue.price ?? 0)} per guest a night`),
  ];
}

function venueFacts(venue: ModelVenue): ObjectFact[] {
  const serves = (venue.satisfies ?? []).map((relief) => NEED_LABELS[relief.need]);
  const price = venue.price ?? 0;
  return [
    ...(serves.length > 0 ? [fact('Serves', serves.join(', '))] : []),
    fact('Guests at once', whole(venue.capacity)),
    fact('Typical stay', dwellWording(venue.dwellSeconds)),
    fact('Price', price > 0 ? `${whole(price)} a visit` : 'Free'),
    ...(venue.hours
      ? [fact('Open', `${clockWords(venue.hours.opens)} to ${clockWords(venue.hours.closes)}`)]
      : []),
  ];
}

// A venue's seats are already its capacity, and a lifeguard's post is a seat no guest is offered.
function fixtureFacts({ model }: ObjectTypeDefinition): ObjectFact[] {
  const free = model.venue ? [] : model.seats.filter((seat) => seat.post === undefined);
  const seats = free.length;
  return [
    ...(model.scenery > 0 ? [fact('Scenery', sceneryWord(model.scenery))] : []),
    ...(model.binReach > 0 ? [fact('Reach', `${model.binReach} tiles`)] : []),
    ...(seats > 0 ? [fact('Seats', whole(seats))] : []),
  ];
}

function venueNotes(venue: ModelVenue): string[] {
  const notes: [boolean, string][] = [
    [venue.role === 'lodging', `Up to ${SETTING_PREMIUM * 100}% more in pleasant surroundings`],
    [venue.receives === true, 'Arriving guests check in here first'],
    [venue.shelter === 'open', 'Open-air: closes in rain and storms'],
    [venue.cools === true, 'Draws more guests the hotter the day'],
    [venue.stage === true, 'Animators can put on shows here'],
    [venue.dj === true, 'Music and dancing whenever it is open'],
    [venue.bathing === true, 'Guests swim here, so a lifeguard should watch'],
    [venue.reliability !== undefined, 'Breaks down now and then; a mechanic repairs it'],
  ];
  return notes.filter(([shown]) => shown).map(([, note]) => note);
}

function fixtureNotes({ model }: ObjectTypeDefinition): string[] {
  const notes: [boolean, string][] = [
    [model.gateway, 'Guests arrive and leave here'],
    [model.depot !== null, 'Staff start their shifts here and cleaners restock'],
    [model.hire !== null, 'Hires out craft on the water in front of it'],
    [model.scenery > 0, 'Makes the tiles around it more pleasant'],
    [model.shade, 'Shades the sand: nobody under it gets sunburnt'],
    [model.binReach > 0, 'Guests carrying litter walk over to it'],
    [model.seats.some((seat) => seat.post === 'lifeguard'), 'A lifeguard watches from here'],
    [model.venue === null && model.lights.length > 0, 'Lights up at night'],
  ];
  return notes.filter(([shown]) => shown).map(([, note]) => note);
}

// Read from the family's original: a style differs only in looks, and only the original declares a hire.
export function objectFacts(type: ObjectTypeDefinition, cost: number): ObjectFacts {
  const { venue, model } = type;
  const ground = model.placement.ground;
  const ownFacts = venue?.role === 'lodging' ? lodgingFacts(venue) : venue ? venueFacts(venue) : [];
  return {
    title: type.label,
    facts: [
      fact('Cost', whole(cost)),
      fact('Size', `${footprintLabel(type)} tiles`),
      ...(ground ? [fact('Ground', GROUND_WORDS[ground])] : []),
      ...ownFacts,
      ...fixtureFacts(type),
    ],
    notes: [...(venue ? venueNotes(venue) : []), ...fixtureNotes(type)],
  };
}
