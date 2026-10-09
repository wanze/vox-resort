import type { RefObject } from 'react';
import type { StaffRole } from '../../sim/domain/staff';
import { PINNED_STAFF } from '../domain/staffPins';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import type { IconName } from '../../../shared/components/pixelIcons';
import { roleWord } from './staffWords';

export interface StaffPinsProps {
  // Positioned, titled and shown by the render loop; React only makes one per member of staff.
  readonly elements: RefObject<(HTMLButtonElement | null)[]>;
  readonly onSelectWorker: (worker: number) => void;
}

// The ring buoy is already the unwatched-water marker, so a lifeguard's pin is the figure.
const PIN_ICONS: { readonly [role in StaffRole]: IconName } = {
  cleaner: 'cleaner',
  lifeguard: 'guard',
  animator: 'animator',
  mechanic: 'mechanic',
};

export function StaffPins({ elements, onSelectWorker }: StaffPinsProps) {
  return (
    <div className="hud-pins">
      {PINNED_STAFF.map(({ worker, role }) => (
        <button
          key={worker}
          ref={(element) => {
            elements.current[worker] = element;
          }}
          type="button"
          className="hud-pin"
          data-role={role}
          aria-label={roleWord(role, 1)}
          // Hidden until the render loop has placed it, so it never flashes in the corner.
          hidden
          onClick={() => onSelectWorker(worker)}
        >
          <PixelIcon name={PIN_ICONS[role]} />
          <span className="hud-pin-inside" />
        </button>
      ))}
    </div>
  );
}
