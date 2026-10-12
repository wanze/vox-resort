import { useId, type KeyboardEvent } from 'react';
import type { PhotoCallControls } from './paperControls';

// Escape is Skip, stopped here so it does not also open the menu behind.
const skipOnEscape =
  (skip: () => void) =>
  (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    skip();
  };

export function PhotoCall({ call }: { readonly call: PhotoCallControls }) {
  const titleId = useId();
  const textId = useId();
  if (call.season === null) return null;
  return (
    <div className="ui-modal">
      <div className="ui-scrim newspaper-call-scrim" />
      <div
        className="ui-panel newspaper-call"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        onKeyDown={skipOnEscape(call.skip)}
      >
        <h2 className="ui-window-title" id={titleId}>
          {`Last night of season ${call.season}`}
        </h2>
        <p className="newspaper-call-text" id={textId}>
          The paper goes to print when the last guests leave.
        </p>
        <div className="ui-actions">
          <button
            type="button"
            className="ui-button-large ui-button-large--primary"
            autoFocus
            onClick={call.take}
          >
            Take front-page photo
          </button>
          <button type="button" className="ui-button-large" onClick={call.skip}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
