import type { GuestView } from '../../inspect/domain/selection';
import { Meter } from '../../../shared/components/Meter';
import { StatRow } from '../../../shared/components/StatRow';
import { thoughtLine } from './thoughtWords';

export const PARTY_KINDS: { readonly [kind in GuestView['partyKind']]: string } = {
  family: 'Family',
  couple: 'Couple',
  friends: 'Friends',
  solo: 'On their own',
};

export const EXPECTATION_WORDS: { readonly [expects in GuestView['expects']]: string } = {
  'easy-going': 'Easy-going',
  particular: 'Particular',
  demanding: 'Demanding',
  'hard-to-please': 'Hard to please',
};

// Duplicated from selection.ts on purpose: that wording is what a venue serves.
const NEED_LABELS: { readonly [need in GuestView['needs'][number]['need']]: string } = {
  hunger: 'Hunger',
  thirst: 'Thirst',
  energy: 'Energy',
  fun: 'Fun',
  hygiene: 'Hygiene',
  health: 'Health',
};

// Rows of the guest's facts list, so mood and needs share its label column; a meter alone,
// with no figure, as how a guest feels is read at a glance.
function MeterRow({ label, level }: { readonly label: string; readonly level: number }) {
  return (
    <StatRow label={label}>
      <Meter label={label} level={level} />
    </StatRow>
  );
}

export function FeelingRows({ guest }: { readonly guest: GuestView }) {
  return (
    <>
      <MeterRow label="Mood" level={guest.happiness} />
      {guest.needs.map(({ need, level }) => (
        <MeterRow key={need} label={NEED_LABELS[need]} level={level} />
      ))}
    </>
  );
}

export function ThinksRow({ thought }: { readonly thought: GuestView['thought'] }) {
  return (
    <StatRow label="Thinks">
      {thought ? `“${thoughtLine(thought.kind, thought.subject)}”` : 'Nothing yet'}
    </StatRow>
  );
}
