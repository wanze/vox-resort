import type { Guests } from '../../guests/domain/guests';
import type { PartyKind } from '../../guests/domain/parties';
import { mix } from '../../sim/domain/night';
import { drawOf, type AudienceParty, type EventKind } from './catalogue';

// A guest this hungry or tired goes to see to that first; a show is no answer to an empty stomach.
export const INVITE_URGENCY = 0.5;

// The share of a plot's guests who are free in an evening, for the window's guess at the audience.
const FREE_SHARE = 0.4;

const PARTY_KINDS: readonly PartyKind[] = ['family', 'couple', 'friends', 'solo'];

export type PartyMix = {
  readonly [kind in PartyKind]: { readonly people: number; readonly withChildren: number };
};

export interface AudienceAsk {
  readonly parties: readonly AudienceParty[];
  readonly kind: EventKind;
  readonly tier: string | undefined;
  readonly day: number;
  // People, not parties.
  readonly room: number;
  readonly salt: number;
}

// `urgency` leaves fun out: wanting some fun is the reason to come, not a reason to stay away.
function freeParty(
  guests: Guests,
  index: number,
  isFree: (person: number) => boolean,
  urgency: (person: number) => number,
): AudienceParty | null {
  const party = guests.parties[index];
  if (!party) return null;
  let people = 0;
  let children = 0;
  for (const person of party.members) {
    if (guests.present[person] !== 1 || guests.party[person] !== index) continue;
    if (!isFree(person) || urgency(person) >= INVITE_URGENCY) return null;
    people++;
    children += guests.child[person]!;
  }
  if (people === 0) return null;
  return {
    party: index,
    kind: party.kind,
    people,
    children,
    arrivedOn: guests.arrivedOn[party.members[0]!]!,
  };
}

export function partiesOf(
  guests: Guests,
  isFree: (person: number) => boolean,
  urgency: (person: number) => number,
): readonly AudienceParty[] {
  return partiesAmong(guests, guests.parties.keys(), isFree, urgency);
}

export function partiesAmong(
  guests: Guests,
  parties: Iterable<number>,
  isFree: (person: number) => boolean,
  urgency: (person: number) => number,
): readonly AudienceParty[] {
  const free: AudienceParty[] = [];
  for (const index of parties) {
    const party = freeParty(guests, index, isFree, urgency);
    if (party) free.push(party);
  }
  return free;
}

// Hashed rather than drawn, so the router's seeded stream is never touched by an invitation.
const keenness = (party: number, salt: number): number =>
  mix(Math.imul(party + 1, 0x9e37_79b1) ^ salt) / 2 ** 32;

export function pickAudience(ask: AudienceAsk): readonly number[] {
  const { kind, day, salt } = ask;
  const share = drawOf(kind, ask.tier);
  const keen = ask.parties
    .map((party) => ({ party, at: keenness(party.party, salt) }))
    .filter(
      ({ party, at }) =>
        (kind.audience?.(party, day) ?? true) && at < kind.appeal[party.kind] * share,
    )
    .toSorted((a, b) => a.at - b.at || a.party.party - b.party.party);
  const picked: number[] = [];
  let left = ask.room;
  for (const { party } of keen) {
    if (party.people > left) continue;
    picked.push(party.party);
    left -= party.people;
  }
  return picked;
}

export function partyMixOf(guests: Guests): PartyMix {
  const counts = Object.fromEntries(
    PARTY_KINDS.map((kind) => [kind, { people: 0, withChildren: 0 }]),
  ) as { [kind in PartyKind]: { people: number; withChildren: number } };
  for (const [index, party] of guests.parties.entries()) {
    const present = party.members.filter(
      (person) => guests.present[person] === 1 && guests.party[person] === index,
    );
    const count = counts[party.kind];
    count.people += present.length;
    if (present.some((person) => guests.child[person] === 1)) count.withChildren += present.length;
  }
  return counts;
}

// A kind's audience rule is asked of one party with children and one without, arrived today,
// as the mix keeps no more.
export function expectedAudience(kind: EventKind, partyMix: PartyMix, capacity: number): number {
  let people = 0;
  for (const partyKind of PARTY_KINDS) {
    const { people: all, withChildren } = partyMix[partyKind];
    const sample = (children: number): AudienceParty => ({
      party: 0,
      kind: partyKind,
      people: 1 + children,
      children,
      arrivedOn: 0,
    });
    const welcome = (children: number): boolean => kind.audience?.(sample(children), 0) ?? true;
    const comes = (welcome(1) ? withChildren : 0) + (welcome(0) ? all - withChildren : 0);
    people += comes * kind.appeal[partyKind];
  }
  return Math.min(capacity, Math.round(FREE_SHARE * people));
}
