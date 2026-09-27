import { HudDropdown } from './HudDropdown';
import { HudOption } from './HudOption';
import { PixelIcon } from './PixelIcon';
import { speedNote } from './controlNames';
import { SIM_SPEEDS, SPEED_LABELS, type SimSpeed } from '../../sim/domain/simClock';

export interface SpeedControlProps {
  readonly speed: SimSpeed;
  readonly onSpeedChange: (speed: SimSpeed) => void;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function SpeedControl({ speed, onSpeedChange, open, onOpenChange }: SpeedControlProps) {
  return (
    <HudDropdown
      className="hud-speed"
      open={open}
      onOpenChange={onOpenChange}
      title={`Game speed: ${SPEED_LABELS[speed]}`}
      label={
        <>
          <PixelIcon name={speed} />
          <span className="hud-chip-label">{SPEED_LABELS[speed]}</span>
        </>
      }
    >
      {SIM_SPEEDS.map((option) => (
        <HudOption
          key={option}
          icon={option}
          label={SPEED_LABELS[option]}
          note={speedNote(option)}
          shortcut={option === 'paused' ? 'Space' : undefined}
          checked={speed === option}
          onSelect={() => {
            onSpeedChange(option);
            onOpenChange(false);
          }}
        />
      ))}
    </HudDropdown>
  );
}
