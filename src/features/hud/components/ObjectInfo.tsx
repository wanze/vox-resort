import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type RefObject,
} from 'react';
import { flushSync } from 'react-dom';
import { familyOf, objectTypeById } from '../../catalog/domain/objectTypes';
import { buildCostOf } from '../../catalog/domain/prices';
import { objectFacts, type ObjectFacts } from '../domain/objectFacts';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import { StatRow } from '../../../shared/components/StatRow';

export interface ObjectInfoProps {
  readonly typeId: string;
  readonly className: string;
  readonly mode: 'hover' | 'toggle';
  readonly scale?: number;
}

function ObjectInfoCard({ facts }: { readonly facts: ObjectFacts }) {
  return (
    <>
      <h3 className="hud-object-info-title">{facts.title}</h3>
      <dl className="ui-stats hud-object-info-facts">
        {facts.facts.map((fact) => (
          <StatRow key={fact.label} label={fact.label}>
            {fact.value}
          </StatRow>
        ))}
      </dl>
      {facts.notes.length > 0 ? (
        <ul className="hud-object-info-notes">
          {facts.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

// Long enough that a pointer crossing the shelf does not flash a card at every icon it passes.
const HOVER_DELAY_MS = 150;

// Manual, so nothing outside closes it: with an object armed, a click outside would place it.
function useCard(popover: RefObject<HTMLDivElement | null>) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const show = () => {
    flushSync(() => setOpen(true));
    if (!popover.current?.matches(':popover-open')) popover.current?.showPopover();
  };
  const hide = () => {
    clearTimeout(timer.current);
    if (popover.current?.matches(':popover-open')) popover.current.hidePopover();
    setOpen(false);
  };
  const showSoon = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(show, HOVER_DELAY_MS);
  };
  return { open, show, hide, showSoon, toggle: () => (open ? hide() : show()) };
}

type Card = ReturnType<typeof useCard>;

// A mouse reads it by pointing; a finger, which has no hover, presses the button on and off.
function triggersOf(mode: ObjectInfoProps['mode'], card: Card): ButtonHTMLAttributes<HTMLElement> {
  if (mode === 'toggle') return { onClick: card.toggle };
  return {
    onPointerEnter: (event) => event.pointerType === 'mouse' && card.showSoon(),
    onPointerLeave: card.hide,
    onFocus: (event) => event.currentTarget.matches(':focus-visible') && card.show(),
    onBlur: card.hide,
  };
}

// The card is drawn only while open, so a shelf of tiles carries empty popovers, not eighty cards.
export function ObjectInfo({ typeId, className, mode, scale = 1 }: ObjectInfoProps) {
  const popover = useRef<HTMLDivElement>(null);
  const card = useCard(popover);
  const anchor = `--object-info-${useId().replace(/[^\w-]/g, '')}`;
  const facts = useMemo(() => {
    const family = familyOf(typeId);
    return card.open ? objectFacts(objectTypeById(family), buildCostOf(family)) : null;
  }, [card.open, typeId]);

  return (
    <span
      className="hud-object-info-host"
      style={{ '--object-info-anchor': anchor } as CSSProperties}
    >
      <button
        type="button"
        className={`hud-object-info-button ${className}`}
        aria-label={`About ${objectTypeById(typeId).label}`}
        aria-expanded={card.open}
        title={mode === 'toggle' ? 'About' : undefined}
        {...triggersOf(mode, card)}
      >
        <PixelIcon name="info" scale={scale} />
      </button>
      <div ref={popover} popover="manual" className="hud-object-info" data-mode={mode}>
        <div className="ui-panel hud-object-info-card">
          {facts ? <ObjectInfoCard facts={facts} /> : null}
        </div>
      </div>
    </span>
  );
}
