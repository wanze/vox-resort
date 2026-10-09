import { MenuOption } from '../../../shared/components/MenuOption';
import { keyLabel } from '../../hud/domain/keymap';
import { VOLUMES, type SoundPrefs, type Volume } from '../domain/soundPrefs';

export interface SoundOptionsProps {
  readonly prefs: SoundPrefs;
  readonly onChange: (prefs: SoundPrefs) => void;
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
    <label className="ui-slider">
      <span className="ui-slider-label">{VOLUME_NAMES[props.volume]}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        onChange={(event) => props.onChange(Number(event.target.value) / 100)}
      />
      <span className="ui-slider-value">{percent}</span>
    </label>
  );
}

// Nothing here closes the menu: a level is set by ear, a few tries at a time.
export function SoundOptions({ prefs, onChange }: SoundOptionsProps) {
  return (
    <>
      <MenuOption
        label="Sound"
        note="music, the resort and the buttons"
        shortcut={keyLabel('sound')}
        checked={prefs.on}
        many
        onSelect={() => onChange({ ...prefs, on: !prefs.on })}
      />
      <hr className="ui-rule" />
      {VOLUMES.map((volume) => (
        <VolumeSlider
          key={volume}
          volume={volume}
          value={prefs[volume]}
          onChange={(value) => onChange({ ...prefs, [volume]: value })}
        />
      ))}
    </>
  );
}
