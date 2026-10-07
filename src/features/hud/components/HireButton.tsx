import type { Advice } from '../../sim/domain/advice';
import type { HireOffer } from '../domain/hireOffer';
import { roleWord } from './staffWords';

export interface HireControls {
  readonly offerFor: (advice: Advice) => HireOffer | null;
  readonly onHire: (offer: HireOffer) => void;
}

const wordsFor = ({ role, one }: HireOffer) =>
  one
    ? { label: `Hire ${roleWord(role, 1)}`, aria: `Hire one more ${roleWord(role, 1)}` }
    : { label: 'Hire', aria: `Hire ${roleWord(role, 2)} up to what the plot needs` };

export function HireButton({
  advice,
  hire,
}: {
  readonly advice: Advice;
  readonly hire: HireControls | undefined;
}) {
  const offer = hire?.offerFor(advice);
  if (!hire || !offer) return null;
  const { label, aria } = wordsFor(offer);
  return (
    <button
      type="button"
      className="hud-camera-mode hud-advice-show"
      aria-label={aria}
      onClick={() => hire.onHire(offer)}
    >
      {label}
    </button>
  );
}
