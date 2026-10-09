import { useRef, useState, type FocusEvent, type ReactNode } from 'react';
import type { VenueNaming } from '../../inspect/domain/selection';
import { MAX_VENUE_NAME } from '../../naming/domain/venueNames';
import { PixelIcon } from '../../../shared/components/PixelIcon';

export interface VenueActionsProps {
  readonly name: string;
  readonly naming: VenueNaming | undefined;
  // An empty name asks for a fresh one, or for the kind where the model suggests none.
  readonly onRename: (name: string) => void;
  // The venue's other actions, which make way for the name field while it is open.
  readonly children: ReactNode;
}

export function VenueKind({ naming }: { readonly naming: VenueNaming | undefined }) {
  if (!naming?.named) return null;
  return <p className="hud-venue-kind">{naming.kind}</p>;
}

// In the body rather than the window's header, which is a drag handle.
export function VenueActions({ name, naming, onRename, children }: VenueActionsProps) {
  const [editing, setEditing] = useState(false);
  if (editing && naming) {
    return (
      <div className="ui-actions">
        <VenueNameField
          name={name}
          naming={naming}
          onReroll={() => onRename('')}
          onDone={(typed) => {
            setEditing(false);
            if (typed !== null && typed !== name) onRename(typed);
          }}
        />
      </div>
    );
  }
  return (
    <div className="ui-actions">
      {children}
      {naming ? (
        <button
          type="button"
          className="ui-button"
          aria-label={`Rename ${name}`}
          title="Rename"
          onClick={() => setEditing(true)}
        >
          <PixelIcon name="rename" scale={1} />
          Rename
        </button>
      ) : null}
    </div>
  );
}

// A drawn name lands in the field, so the player can draw again or keep it with Enter.
function useDraft(name: string) {
  const [typed, setTyped] = useState(name);
  const [drawn, setDrawn] = useState(name);
  if (name !== drawn) {
    setDrawn(name);
    setTyped(name);
  }
  return [typed, setTyped] as const;
}

// Every way out goes through leaving the field and its button, so Enter and a click elsewhere
// cannot both save. Null is a cancel.
function VenueNameField({
  name,
  naming,
  onReroll,
  onDone,
}: {
  readonly name: string;
  readonly naming: VenueNaming;
  readonly onReroll: () => void;
  readonly onDone: (typed: string | null) => void;
}) {
  const [typed, setTyped] = useDraft(name);
  const cancelled = useRef(false);
  const leave = (event: FocusEvent<HTMLDivElement>): void => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    onDone(cancelled.current ? null : typed);
  };
  return (
    <div className="hud-venue-name-edit" onBlur={leave}>
      <input
        type="text"
        className="hud-venue-name-field"
        autoFocus
        value={typed}
        maxLength={MAX_VENUE_NAME}
        placeholder={naming.suggested ? 'Empty for a new name' : naming.kind}
        aria-label={`Name of the ${naming.kind}`}
        onChange={(event) => setTyped(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== 'Escape') return;
          event.stopPropagation();
          cancelled.current = event.key === 'Escape';
          event.currentTarget.blur();
        }}
      />
      {naming.suggested ? (
        <button
          type="button"
          className="ui-button"
          // Safari never focuses a clicked button, so the field would close under the click.
          onMouseDown={(event) => event.preventDefault()}
          onClick={onReroll}
        >
          <PixelIcon name="refresh" scale={1} />
          Random name
        </button>
      ) : null}
    </div>
  );
}
