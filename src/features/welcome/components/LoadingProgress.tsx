import type { CSSProperties } from 'react';
import { loadedShare, stepUnderway, type LoadingStep } from '../domain/loading';

export interface LoadingProgressProps {
  readonly done: readonly LoadingStep[];
}

const STEP_LABELS: { readonly [step in LoadingStep]: string } = {
  models: 'Carving the voxel models',
  resort: 'Laying out the resort',
  scene: 'Lighting the scene',
};

// Laid in the order a builder fills a course of blocks, back and forth, so the animation reads as
// building rather than spinning.
const BLOCKS = [0, 1, 2, 5, 4, 3, 6, 7, 8];

export function LoadingProgress({ done }: LoadingProgressProps) {
  const step = stepUnderway(done);
  const share = loadedShare(done);
  return (
    <div className="welcome-loading" role="status">
      <div className="welcome-blocks" aria-hidden="true">
        {BLOCKS.map((order) => (
          <span key={order} style={{ '--block': order } as CSSProperties} />
        ))}
      </div>
      <div className="welcome-loading-text">
        <p>{step ? `${STEP_LABELS[step]}…` : 'Ready'}</p>
        <div
          className="welcome-progress"
          role="progressbar"
          aria-label="Loading the resort"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(share * 100)}
        >
          <span style={{ width: `${share * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
