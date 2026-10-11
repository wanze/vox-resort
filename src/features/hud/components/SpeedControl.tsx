import { DropdownMenu } from '../../../shared/components/Dropdown';
import { MenuOption } from '../../../shared/components/MenuOption';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import { speedNote } from './controlNames';
import { keyLabel } from '../domain/keymap';
import { SIM_SPEEDS, SPEED_LABELS, type SimSpeed } from '../../sim/domain/simClock';

export interface FastNights {
  readonly on: boolean;
  readonly onChange: (on: boolean) => void;
  // Running now: the clock is through the quiet part of a night faster than the speed picked.
  readonly running: boolean;
}

export interface SpeedControlProps {
  readonly speed: SimSpeed;
  readonly onSpeedChange: (speed: SimSpeed) => void;
  readonly fastNights: FastNights;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  // The clock is stopped until the next season opens, whatever the speed.
  readonly betweenSeasons?: boolean;
}

const BETWEEN_SEASONS = 'The resort is between seasons';

// Rising steps, one lit per speed above pause, so the chip reads like a meter at a glance.
function SpeedSteps({ speed, night }: { readonly speed: SimSpeed; readonly night: boolean }) {
  const lit = SIM_SPEEDS.indexOf(speed);
  return (
    <span className="hud-speed-steps">
      {SIM_SPEEDS.slice(1).map((step, at) => (
        <span key={step} className="hud-speed-step" data-lit={at < lit || undefined} />
      ))}
      {night ? (
        <span className="hud-speed-night">
          <PixelIcon name="moon" scale={1} />
        </span>
      ) : null}
    </span>
  );
}

export interface PlayButtonProps {
  readonly speed: SimSpeed;
  readonly onToggle: () => void;
  readonly betweenSeasons: boolean;
}

// Shows what a press does, as a player's button does: play while paused, pause while running.
export function PlayButton({ speed, onToggle, betweenSeasons }: PlayButtonProps) {
  const paused = speed === 'paused';
  const action = paused ? 'Resume' : 'Pause';
  return (
    <button
      type="button"
      className="ui-button hud-play"
      disabled={betweenSeasons}
      title={betweenSeasons ? BETWEEN_SEASONS : `${action} (${keyLabel('pause')})`}
      aria-label={action}
      onClick={onToggle}
    >
      <PixelIcon name={paused ? 'normal' : 'paused'} />
    </button>
  );
}

export function SpeedControl(props: SpeedControlProps) {
  const { speed, onSpeedChange, open, onOpenChange, fastNights } = props;
  if (props.betweenSeasons) {
    return (
      <div className="ui-dropdown hud-speed">
        <button type="button" className="ui-chip" disabled title={BETWEEN_SEASONS}>
          <SpeedSteps speed={speed} night={false} />
        </button>
      </div>
    );
  }
  return (
    <DropdownMenu
      className="hud-speed"
      open={open}
      onOpenChange={onOpenChange}
      title={`Game speed: ${SPEED_LABELS[speed]}${fastNights.running ? ', fast night' : ''}`}
      label={<SpeedSteps speed={speed} night={fastNights.running} />}
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
      <hr className="ui-rule" />
      <MenuOption
        icon="moon"
        label="Fast nights"
        note="run the quiet hours to 05:00 in a few seconds"
        many
        checked={fastNights.on}
        onSelect={() => fastNights.onChange(!fastNights.on)}
      />
    </DropdownMenu>
  );
}
