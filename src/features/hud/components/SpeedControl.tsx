import { DropdownMenu } from '../../../shared/components/Dropdown';
import { MenuOption } from '../../../shared/components/MenuOption';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import { speedNote } from './controlNames';
import { keyLabel } from '../domain/keymap';
import { SIM_SPEEDS, SPEED_LABELS, type SimSpeed } from '../../sim/domain/simClock';

export interface SpeedControlProps {
  readonly speed: SimSpeed;
  readonly onSpeedChange: (speed: SimSpeed) => void;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  // The clock is stopped until the next season opens, whatever the speed.
  readonly betweenSeasons?: boolean;
}

export function SpeedControl(props: SpeedControlProps) {
  const { speed, onSpeedChange, open, onOpenChange } = props;
  if (props.betweenSeasons) {
    return (
      <div className="ui-dropdown hud-speed">
        <button type="button" className="ui-chip" disabled title="The resort is between seasons">
          <PixelIcon name={speed} />
          <span className="ui-chip-label">{SPEED_LABELS[speed]}</span>
        </button>
      </div>
    );
  }
  return (
    <DropdownMenu
      className="hud-speed"
      open={open}
      onOpenChange={onOpenChange}
      title={`Game speed: ${SPEED_LABELS[speed]}`}
      label={
        <>
          <PixelIcon name={speed} />
          <span className="ui-chip-label">{SPEED_LABELS[speed]}</span>
        </>
      }
    >
      {SIM_SPEEDS.map((option) => (
        <MenuOption
          key={option}
          icon={option}
          label={SPEED_LABELS[option]}
          note={speedNote(option)}
          shortcut={option === 'paused' ? keyLabel('pause') : undefined}
          checked={speed === option}
          onSelect={() => {
            onSpeedChange(option);
            onOpenChange(false);
          }}
        />
      ))}
    </DropdownMenu>
  );
}
