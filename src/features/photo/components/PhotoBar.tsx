import { useEffect, useState, type ReactNode } from 'react';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import { PHOTO_FILTER_IDS, PHOTO_FILTERS } from '../domain/photoFilters';
import { PHOTO_FOV, timeLabel } from '../domain/photoView';
import type { PhotoControls, PhotoScale, SelfieControls } from './photoControls';

export interface PhotoBarProps {
  readonly photo: PhotoControls;
  // A phone or a tablet: no 2x, whose buffer would not fit in its memory.
  readonly compact: boolean;
}

const LOOK_STEPS = 24 * 12;

function LensSlider({ photo }: { readonly photo: PhotoControls }) {
  return (
    <label className="ui-slider photo-slider">
      <span className="ui-slider-label">Lens</span>
      <input
        type="range"
        min={PHOTO_FOV.min}
        max={PHOTO_FOV.max}
        step={1}
        value={Math.round(photo.fov)}
        onChange={(event) => photo.setFov(Number(event.target.value))}
      />
      <span className="ui-slider-value">{Math.round(photo.fov)}°</span>
    </label>
  );
}

function TimeSlider({ photo }: { readonly photo: PhotoControls }) {
  const shown = photo.lookTime ?? photo.clockTime;
  return (
    <div className="ui-row">
      <label className="ui-slider photo-slider">
        <span className="ui-slider-label">Time</span>
        <input
          type="range"
          min={0}
          max={LOOK_STEPS - 1}
          step={1}
          value={Math.round(shown * LOOK_STEPS) % LOOK_STEPS}
          onChange={(event) => photo.setLookTime(Number(event.target.value) / LOOK_STEPS)}
        />
        <span className="ui-slider-value">{timeLabel(shown)}</span>
      </label>
      <button
        type="button"
        className="ui-button-large photo-now"
        disabled={photo.lookTime === null}
        onClick={() => photo.setLookTime(null)}
      >
        Now
      </button>
    </div>
  );
}

function Pressed(props: {
  readonly label: string;
  readonly pressed: boolean;
  readonly disabled?: boolean;
  readonly hint?: string;
  readonly onPress: () => void;
}) {
  return (
    <button
      type="button"
      className="ui-button-large photo-toggle"
      aria-pressed={props.pressed}
      disabled={props.disabled}
      title={props.hint}
      onClick={props.onPress}
    >
      {props.label}
    </button>
  );
}

// A label over its buttons, read out as the group's name.
function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="photo-field" role="group" aria-label={label}>
      <span className="ui-label" aria-hidden="true">
        {label}
      </span>
      <div className="ui-row ui-row--wrap photo-group">{children}</div>
    </div>
  );
}

function Filters({ photo }: { readonly photo: PhotoControls }) {
  return (
    <Field label="Filter">
      {PHOTO_FILTER_IDS.map((id) => (
        <Pressed
          key={id}
          label={PHOTO_FILTERS[id].label}
          pressed={photo.filter === id}
          onPress={() => photo.setFilter(id)}
        />
      ))}
    </Field>
  );
}

const SCALES: readonly PhotoScale[] = [1, 2];

const SCALE_HINTS: { readonly [scale in PhotoScale]: string } = {
  1: 'As many pixels as the screen',
  2: 'Twice the screen in each direction',
};

// A phone gets 1x only, so there is nothing to pick there.
function Resolution({ photo, compact }: PhotoBarProps) {
  if (compact) return null;
  return (
    <Field label="Resolution">
      {SCALES.map((scale) => (
        <Pressed
          key={scale}
          label={`${scale}x`}
          hint={SCALE_HINTS[scale]}
          pressed={photo.scale === scale}
          onPress={() => photo.setScale(scale)}
        />
      ))}
    </Field>
  );
}

function Selfie({ selfie }: { readonly selfie: SelfieControls }) {
  if (!selfie.offered) return null;
  return (
    <Field label="Selfie">
      <Pressed
        label="Take a selfie"
        hint="The guest you follow turns to the camera, with the sun behind them while it is up"
        pressed={selfie.on}
        onPress={() => selfie.setOn(!selfie.on)}
      />
    </Field>
  );
}

type Postcard =
  | { readonly kind: 'copied' }
  | { readonly kind: 'by-hand'; readonly link: string }
  | { readonly kind: 'failed' };

async function copyPostcard(make: () => Promise<string>): Promise<Postcard> {
  let link: string;
  try {
    link = await make();
  } catch (cause: unknown) {
    console.error(cause);
    return { kind: 'failed' };
  }
  try {
    await navigator.clipboard.writeText(link);
    return { kind: 'copied' };
  } catch {
    return { kind: 'by-hand', link };
  }
}

const NOTE_MS = 3000;

// A copied link is only told about for a moment; one to copy by hand stays until the next try.
function usePostcard(make: () => Promise<string>) {
  const [made, setMade] = useState<Postcard | null>(null);
  useEffect(() => {
    if (made === null || made.kind === 'by-hand') return;
    const fade = setTimeout(() => setMade(null), NOTE_MS);
    return () => clearTimeout(fade);
  }, [made]);
  return { made, copy: () => void copyPostcard(make).then(setMade) };
}

function PostcardNote({ made }: { readonly made: Postcard | null }) {
  if (made === null || made.kind === 'by-hand') return null;
  return (
    <p className="ui-note photo-note" role="status">
      {made.kind === 'copied' ? 'Postcard link copied' : 'The link could not be made'}
    </p>
  );
}

function Actions({
  photo,
  postcard,
}: {
  readonly photo: PhotoControls;
  readonly postcard: ReturnType<typeof usePostcard>;
}) {
  return (
    <div className="ui-actions">
      <PostcardNote made={postcard.made} />
      <button type="button" className="ui-button-large" onClick={postcard.copy}>
        Copy postcard link
      </button>
      <button
        type="button"
        className="ui-button-large ui-button-large--primary"
        disabled={photo.busy}
        aria-busy={photo.busy}
        onClick={photo.take}
      >
        Take photo
      </button>
    </div>
  );
}

function LastShot({ photo }: { readonly photo: PhotoControls }) {
  if (!photo.shot) return null;
  return (
    <div className="ui-row ui-row--wrap photo-group" role="group" aria-label="Last photo">
      <span className="photo-name">{photo.shot.name}</span>
      <button type="button" className="ui-button-large" onClick={photo.save}>
        Save
      </button>
      {photo.canShare ? (
        <button type="button" className="ui-button-large" onClick={photo.share}>
          Share…
        </button>
      ) : null}
    </div>
  );
}

function LinkByHand({ link }: { readonly link: string | null }) {
  if (link === null) return null;
  return (
    <input
      type="text"
      className="ui-field"
      value={link}
      readOnly
      aria-label="Postcard link"
      onFocus={(event) => event.currentTarget.select()}
    />
  );
}

const byHand = (made: Postcard | null): string | null =>
  made?.kind === 'by-hand' ? made.link : null;

// Set apart as a window's tab strip is: what was taken, not what is about to be.
function Taken({ photo, made }: { readonly photo: PhotoControls; readonly made: Postcard | null }) {
  const link = byHand(made);
  if (!photo.shot && link === null) return null;
  return (
    <footer className="photo-taken">
      <LastShot photo={photo} />
      <LinkByHand link={link} />
    </footer>
  );
}

// Outside the HUD, which photo mode hides; the bar itself is never in the picture, which is
// rendered offscreen.
export function PhotoBar({ photo, compact }: PhotoBarProps) {
  const postcard = usePostcard(photo.postcard);
  return (
    <section className="photo-bar ui-plate" aria-label="Photo mode">
      <header className="ui-window-head photo-head">
        <PixelIcon name="camera" />
        <h2 className="ui-window-title">Photo mode</h2>
        <button
          type="button"
          className="ui-window-close"
          aria-label="Close photo mode"
          title="Close (Esc)"
          onClick={photo.exit}
        >
          <PixelIcon name="close" scale={1} />
        </button>
      </header>
      <div className="photo-body">
        <LensSlider photo={photo} />
        <TimeSlider photo={photo} />
        <div className="photo-fields">
          <Filters photo={photo} />
          <Resolution photo={photo} compact={compact} />
          <Selfie selfie={photo.selfie} />
        </div>
        <Actions photo={photo} postcard={postcard} />
      </div>
      <Taken photo={photo} made={postcard.made} />
    </section>
  );
}
