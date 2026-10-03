import { HudDropdown } from '../../hud/components/HudDropdown';
import { HudOption } from '../../hud/components/HudOption';
import { PixelIcon } from '../../hud/components/PixelIcon';
import { VOLUMES, type SoundPrefs, type Volume } from '../domain/soundPrefs';

export interface SoundControlProps {
  readonly prefs: SoundPrefs;
  readonly onChange: (prefs: SoundPrefs) => void;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

const VOLUME_NAMES: { readonly [volume in Volume]: string } = {
  master: 'Master',
  music: 'Music',
  ambience: 'Ambience',
  effects: 'Effects',
  interface: 'Interface',
};

function VolumeSlider(props: {
  readonly volume: Volume;
  readonly value: number;
  readonly onChange: (value: number) => void;
}) {
  const percent = Math.round(props.value * 100);
  return (
    <label className="hud-slider">
      <span className="hud-slider-label">{VOLUME_NAMES[props.volume]}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        onChange={(event) => props.onChange(Number(event.target.value) / 100)}
      />
      <span className="hud-slider-value">{percent}</span>
    </label>
  );
}

// Stays open while sliding: a level is set by ear, a few tries at a time.
export function SoundControl({ prefs, onChange, open, onOpenChange }: SoundControlProps) {
  return (
    <HudDropdown
      className="hud-sound"
      open={open}
      onOpenChange={onOpenChange}
      title={prefs.on ? 'Sound' : 'Sound: muted'}
      label={<PixelIcon name={prefs.on ? 'sound' : 'muted'} />}
    >
      <HudOption
        label="Sound"
        note="music, the resort and the buttons"
        shortcut="M"
        checked={prefs.on}
        many
        onSelect={() => onChange({ ...prefs, on: !prefs.on })}
      />
      <hr className="hud-rule" />
      {VOLUMES.map((volume) => (
        <VolumeSlider
          key={volume}
          volume={volume}
          value={prefs[volume]}
          onChange={(value) => onChange({ ...prefs, [volume]: value })}
        />
      ))}
    </HudDropdown>
  );
}
