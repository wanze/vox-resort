import type { SaveOutcome } from '../../saves/domain/saveSlots';
import type { SaveMeta } from '../../saves/domain/snapshot';
import { UnsavedWarning } from '../../saves/components/UnsavedWarning';
import { summaryOf, type SharedResort } from '../domain/sharedResort';

export interface SharedResortCardProps {
  readonly shared: SharedResort;
  readonly ready: boolean;
  readonly busy: boolean;
  readonly failed: boolean;
  // The game in the unsaved slot, which opening the shared resort would autosave over.
  readonly unsaved: SaveMeta | null;
  readonly onKeepUnsaved: (name: string, overwrite: boolean) => Promise<SaveOutcome>;
  readonly onOpen: (shared: SharedResort) => void;
  readonly onBack: () => void;
}

const buildingsOf = (count: number): string => (count === 1 ? '1 building' : `${count} buildings`);

// Inside the welcome card, in the menu's place. Opening waits for the scene, as a new game does:
// there is nothing to build into before it.
export function SharedResortCard(props: SharedResortCardProps) {
  const summary = summaryOf(props.shared);
  return (
    <>
      <header className="welcome-card-head">
        <h2>A resort for you</h2>
        <button
          type="button"
          className="hud-resort-clear welcome-back"
          disabled={props.busy}
          onClick={props.onBack}
        >
          Back
        </button>
      </header>
      <div className="shared-summary">
        <strong>{summary.name}</strong>
        <span>
          {summary.tilesX} × {summary.tilesZ} tiles, {buildingsOf(summary.buildings)}
        </span>
      </div>
      <p className="share-note">
        Someone shared its layout with you. It opens in sandbox on day one, with fresh guests.
      </p>
      <UnsavedWarning unsaved={props.unsaved} onKeep={props.onKeepUnsaved} />
      <button
        type="button"
        className="hud-resort-go new-game-start"
        disabled={!props.ready || props.busy}
        aria-busy={props.busy}
        onClick={() => props.onOpen(props.shared)}
      >
        {props.busy ? 'Building…' : 'Open in sandbox'}
      </button>
      {props.failed ? (
        <p className="share-note" role="alert">
          The resort could not be built.
        </p>
      ) : null}
    </>
  );
}
