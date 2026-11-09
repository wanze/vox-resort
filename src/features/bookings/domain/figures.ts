import { PARTY_MIX, type PartyKind } from '../../guests/domain/parties';
import { partyKindsOf, type Offer } from './offers';

export type Figure = 'adult' | 'child';

export interface Seat {
  readonly figure: Figure;
  // Counted across the whole group, so each guest drawn has a place of its own.
  readonly seat: number;
}

export interface GroupFigures {
  readonly parties: readonly (readonly Seat[])[];
  // Parties beyond the ones drawn, told as a number instead.
  readonly more: number;
}

// Past this the row outgrows a narrow window; the count says the rest.
const SHOWN_PARTIES = 5;

const mean = (range: { readonly min: number; readonly max: number }): number =>
  Math.round((range.min + range.max) / 2);

function typicalParty(kind: PartyKind): readonly Figure[] {
  const shape = PARTY_MIX.find((each) => each.kind === kind)!;
  return [
    ...Array.from({ length: mean(shape.adults) }, () => 'adult' as const),
    ...Array.from({ length: mean(shape.children) }, () => 'child' as const),
  ];
}

export function groupFigures(
  offer: Pick<Offer, 'kind' | 'parties'>,
  shown = SHOWN_PARTIES,
): GroupFigures {
  const kinds = partyKindsOf(offer);
  let seat = 0;
  return {
    parties: kinds
      .slice(0, shown)
      .map((kind) => typicalParty(kind).map((figure) => ({ figure, seat: seat++ }))),
    more: Math.max(0, kinds.length - shown),
  };
}
