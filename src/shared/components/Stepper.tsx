import { PixelIcon } from './PixelIcon';

export interface StepperStep {
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
}

// A setting the stepper can fall back to, such as a list price or hiring by itself.
export interface StepperPreset {
  readonly text: string;
  readonly label: string;
  readonly pressed: boolean;
  readonly onClick: () => void;
}

export interface StepperProps {
  readonly label: string;
  readonly less: StepperStep;
  readonly more: StepperStep;
  readonly preset?: StepperPreset;
}

function StepButton({
  step,
  icon,
}: {
  readonly step: StepperStep;
  readonly icon: 'minus' | 'plus';
}) {
  return (
    <button
      type="button"
      className="ui-button ui-stepper-step"
      aria-label={step.label}
      disabled={step.disabled}
      onClick={step.onClick}
    >
      <PixelIcon name={icon} scale={1} />
    </button>
  );
}

export function Stepper({ label, less, more, preset }: StepperProps) {
  return (
    <span className="ui-stepper" role="group" aria-label={label}>
      <StepButton step={less} icon="minus" />
      <StepButton step={more} icon="plus" />
      {preset ? (
        <button
          type="button"
          className="ui-button ui-stepper-preset"
          aria-label={preset.label}
          aria-pressed={preset.pressed}
          onClick={preset.onClick}
        >
          {preset.text}
        </button>
      ) : null}
    </span>
  );
}
