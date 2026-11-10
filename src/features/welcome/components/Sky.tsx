import type { CSSProperties, ReactNode } from 'react';
import type { LoadingStep } from '../domain/loading';
import { HORIZON, skyStage, sunAt } from '../domain/sky';

interface SkyProps {
  readonly done: readonly LoadingStep[];
  // What the scene reads out, drawn over it and left to screen readers, unlike the scenery.
  readonly children: ReactNode;
}

// Short and close-set by the horizon, longer and sparser nearer the viewer, as a path of sun on
// water looks; the shifts keep the column from reading as a ladder.
const GLINTS = [
  { depth: 4, width: 18, shift: -4, delay: 0 },
  { depth: 9, width: 30, shift: 6, delay: 700 },
  { depth: 15, width: 24, shift: -10, delay: 1500 },
  { depth: 23, width: 42, shift: 3, delay: 400 },
  { depth: 33, width: 34, shift: 12, delay: 1100 },
  { depth: 46, width: 56, shift: -6, delay: 1900 },
  { depth: 62, width: 44, shift: 9, delay: 900 },
  { depth: 80, width: 64, shift: -2, delay: 1600 },
] as const;

const glintStyle = (glint: (typeof GLINTS)[number]): CSSProperties =>
  ({
    '--depth': `${glint.depth}%`,
    '--width': `${glint.width}%`,
    '--shift': `${glint.shift}%`,
    '--delay': `${-glint.delay}ms`,
  }) as CSSProperties;

const percent = (share: number): string => `${Math.round(share * 1000) / 10}%`;

// Each stage's sky lies over the one before and fades in, as gradients cannot be transitioned.
export function Sky({ done, children }: SkyProps) {
  const sun = sunAt(done);
  const place = {
    '--sun-x': percent(sun.x),
    '--sun-y': percent(sun.y),
    '--horizon': percent(HORIZON),
  } as CSSProperties;
  return (
    <div className="welcome-sky" data-stage={skyStage(done)} style={place}>
      <div className="welcome-sky-scene" aria-hidden="true">
        <div className="welcome-sky-layer welcome-sky-layer--night" />
        <div className="welcome-sky-layer welcome-sky-layer--dawn" />
        <div className="welcome-sky-layer welcome-sky-layer--morning" />
        <div className="welcome-sky-layer welcome-sky-layer--noon" />
        <div className="welcome-sky-halo" />
        <div className="welcome-sky-sun" />
        <div className="welcome-sky-sea">
          <div className="welcome-sky-glints">
            {GLINTS.map((glint) => (
              <span key={glint.depth} className="welcome-sky-glint" style={glintStyle(glint)} />
            ))}
          </div>
        </div>
        <div className="welcome-sky-layer welcome-sky-scrim" />
      </div>
      {children}
    </div>
  );
}
