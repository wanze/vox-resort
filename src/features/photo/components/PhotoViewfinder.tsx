import { PHOTO_FILTERS } from '../domain/photoFilters';
import { focalLength, timeLabel } from '../domain/photoView';
import type { PhotoControls } from './photoControls';

const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

const lensWords = (photo: PhotoControls): string =>
  `${focalLength(photo.fov)} mm · ${photo.scale}x`;

const hourWords = (photo: PhotoControls): string => {
  const time = timeLabel(photo.lookTime ?? photo.clockTime);
  return photo.filter === 'none' ? time : `${PHOTO_FILTERS[photo.filter].label} · ${time}`;
};

const busyFlag = (busy: boolean): '' | undefined => (busy ? '' : undefined);

// Never in the picture, which is rendered offscreen; the shutter blinks while one is being taken.
export function PhotoViewfinder({ photo }: { readonly photo: PhotoControls }) {
  return (
    <div className="photo-viewfinder" aria-hidden="true" data-busy={busyFlag(photo.busy)}>
      <span className="photo-viewfinder-thirds" />
      {CORNERS.map((corner) => (
        <span key={corner} className="photo-viewfinder-corner" data-corner={corner} />
      ))}
      <span className="photo-viewfinder-focus" />
      <span className="photo-viewfinder-readout" data-side="left">
        {lensWords(photo)}
      </span>
      <span className="photo-viewfinder-readout" data-side="right">
        {hourWords(photo)}
      </span>
      <span className="photo-viewfinder-shutter" />
    </div>
  );
}
