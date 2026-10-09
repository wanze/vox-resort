import type { RefObject } from 'react';
import type { DebugElements } from './RenderStats';

// Written by the render loop outside React: re-rendering the HUD every frame
// would distort the frame rate it reports.
export interface HudNodes extends DebugElements {
  readonly day: RefObject<HTMLSpanElement | null>;
  readonly time: RefObject<HTMLSpanElement | null>;
  readonly inspect: RefObject<HTMLSpanElement | null>;
  readonly markers: RefObject<(HTMLElement | null)[]>;
  readonly staffPins: RefObject<(HTMLButtonElement | null)[]>;
  readonly signs: RefObject<(HTMLElement | null)[]>;
}
