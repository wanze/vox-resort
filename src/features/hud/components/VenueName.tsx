import { useRef, useState } from 'react';
import type { VenueNaming } from '../../inspect/domain/selection';
import { MAX_VENUE_NAME } from '../../naming/domain/venueNames';
import { PixelIcon } from '../../../shared/components/PixelIcon';

export interface VenueNameProps {
  readonly name: string;
  readonly naming: VenueNaming;
  // An empty name asks for a fresh one, or for the kind where the model suggests none.
  readonly onRename: (name: string) => void;
}

// In the body rather than the window's header, which is a drag handle.
export function VenueName({ name, naming, onRename }: VenueNameProps) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <VenueNameField
        name={name}
        naming={naming}
        onDone={(typed) => {
          setEditing(false);
          if (typed !== null && typed !== name) onRename(typed);
        }}
      />
    );
  }
  return (
    <div className="hud-venue-name">
      <span className="hud-venue-kind">{naming.named ? naming.kind : null}</span>
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
      {naming.suggested ? (
        <button
          type="button"
          className="ui-button"
          aria-label="A different name"
          title="A different name"
          onClick={() => onRename('')}
        >
          <PixelIcon name="refresh" scale={1} />
        </button>
      ) : null}
    </div>
  );
}

// Every way out goes through blur, so Enter and a click elsewhere cannot both save. Null is a
// cancel.
function VenueNameField({
  name,
  naming,
  onDone,
}: {
  readonly name: string;
  readonly naming: VenueNaming;
  readonly onDone: (typed: string | null) => void;
}) {
  const [typed, setTyped] = useState(name);
  const cancelled = useRef(false);
  return (
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
      onBlur={() => onDone(cancelled.current ? null : typed)}
    />
  );
}
