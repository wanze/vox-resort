import { useEffect, useState } from 'react';
import { loadedShare, loadingLine, stepUnderway, type LoadingStep } from '../domain/loading';

interface LoadingProgressProps {
  readonly done: readonly LoadingStep[];
}

// Long enough to read a line twice over; a step that ends sooner never gets past its first.
const LINE_MS = 2600;

// Keyed by step, so each step starts over on its plain name.
function LoadingLine({ step }: { readonly step: LoadingStep }) {
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    const timer = globalThis.setInterval(() => setTurn((last) => last + 1), LINE_MS);
    return () => globalThis.clearInterval(timer);
  }, []);
  // Hidden from screen readers, which hear the step's name from the status once, not every turn.
  return (
    <p key={turn} className="welcome-caption" aria-hidden="true">
      {loadingLine(step, turn)}…
    </p>
  );
}

// Stays up once everything is loaded, full, so it fades out with the sky rather than vanishing.
export function LoadingProgress({ done }: LoadingProgressProps) {
  const step = stepUnderway(done);
  const share = loadedShare(done);
  return (
    <>
      <div
        className="welcome-horizon"
        role="progressbar"
        aria-label="Loading the resort"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share * 100)}
      >
        <span style={{ width: `${share * 100}%` }} />
      </div>
      <p className="ui-visually-hidden" role="status">
        {step ? `${loadingLine(step, 0)}…` : 'Ready'}
      </p>
    </>
  );
}

// Under the menu rather than in the scene, where the eye already is while it waits to click.
// Gone once loading has failed, as the steps will not move on.
export function LoadingCaption(props: LoadingProgressProps & { readonly failed: boolean }) {
  const step = stepUnderway(props.done);
  return step && !props.failed ? <LoadingLine key={step} step={step} /> : null;
}
