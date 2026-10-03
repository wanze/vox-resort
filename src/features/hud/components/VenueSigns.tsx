import type { RefObject } from 'react';
import { signsUnder, type SignSpot } from '../domain/signs';
import { PixelIcon } from './PixelIcon';
import { SIGN_ICONS } from './signIcons';

type Tile = { readonly tileX: number; readonly tileZ: number };

export interface VenueSignsProps {
  readonly spots: readonly SignSpot[];
  readonly shown: boolean;
  // Alt is held, so every sign says its name.
  readonly named: boolean;
  // Where a problem marker stands: the sign there gives way, so the problem reads first.
  readonly marked: readonly Tile[];
  // Positioned and shown by the render loop, as the markers are; React only says what each is.
  readonly elements: RefObject<(HTMLElement | null)[]>;
  readonly onSelectAt: (at: Tile) => void;
}

export function VenueSigns({ spots, shown, named, marked, elements, onSelectAt }: VenueSignsProps) {
  if (!shown) return null;
  const under = signsUnder(spots, marked);
  return (
    <div className={named ? 'hud-signs hud-signs-named' : 'hud-signs'}>
      {spots.map((spot, index) => (
        <div
          key={spot.key}
          ref={(element) => {
            elements.current[index] = element;
          }}
          // A class rather than hidden: the render loop owns hidden and would show it again.
          className={under.has(spot.key) ? 'hud-sign-spot is-under-marker' : 'hud-sign-spot'}
          // Hidden until the render loop has placed it, so it never flashes in the corner.
          hidden
        >
          <button
            type="button"
            className="hud-sign"
            aria-label={spot.label}
            title={spot.label}
            onClick={() => onSelectAt(spot)}
          >
            <PixelIcon name={SIGN_ICONS[spot.sign]} />
          </button>
          <span className="hud-sign-name" aria-hidden="true">
            {spot.label}
          </span>
        </div>
      ))}
    </div>
  );
}
