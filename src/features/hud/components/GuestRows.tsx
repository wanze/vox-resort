import type { GuestView } from '../../inspect/domain/selection';
import { StatRow } from '../../../shared/components/StatRow';
import { thoughtLine } from './thoughtWords';

export const PARTY_KINDS: { readonly [kind in GuestView['partyKind']]: string } = {
  family: 'Family',
  couple: 'Couple',
  friends: 'Friends',
  solo: 'On their own',
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

export function NeedBars({ needs }: { readonly needs: GuestView['needs'] }) {
  return (
    <div className="hud-needs" role="group" aria-label="How they are doing">
      {needs.map(({ need, level }) => (
        <div key={need} className="hud-need">
          <span className="hud-need-label">{NEED_LABELS[need]}</span>
          <span
            className="hud-need-track"
            aria-label={`${NEED_LABELS[need]} ${Math.round(level * 100)}%`}
          >
            <span
              className="hud-need-fill"
              style={{ width: `${level * 100}%`, ['--level' as string]: level }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

export function ThinksRow({ thought }: { readonly thought: GuestView['thought'] }) {
  return (
    <dl className="ui-stats hud-advice">
      <StatRow label="Thinks">
        {thought ? `“${thoughtLine(thought.kind, thought.subject)}”` : 'Nothing yet'}
      </StatRow>
    </dl>
  );
}
