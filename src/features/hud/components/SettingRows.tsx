import type { ReactNode } from 'react';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import type { IconName } from '../../../shared/components/pixelIcons';
import { Stepper, type StepperProps } from '../../../shared/components/Stepper';

// Green for what helps the resort, red for what costs it.
export type Tone = 'good' | 'bad';

export interface SettingRowProps {
  readonly icon: IconName;
  readonly name: string;
  readonly value: ReactNode;
  readonly note: ReactNode;
  readonly stepper: StepperProps;
  readonly under?: ReactNode;
  readonly tone?: Tone | undefined;
}

export function SettingRow({ icon, name, value, note, stepper, under, tone }: SettingRowProps) {
  return (
    <div className="hud-settings-row">
      <dt className="hud-settings-name">
        <span className="hud-settings-icon">
          <PixelIcon name={icon} />
        </span>
        <span className="hud-settings-label">
          <span className="hud-settings-text">{name}</span>
          {under}
        </span>
      </dt>
      <dd className="hud-settings-value">{value}</dd>
      <dd className="hud-settings-note" data-tone={tone}>
        {note}
      </dd>
      <dd>
        <Stepper {...stepper} />
      </dd>
    </div>
  );
}

export function SettingGroup({
  title,
  children,
}: {
  readonly title?: string;
  readonly children: ReactNode;
}) {
  return (
    <>
      {title ? <h3 className="hud-report-heading hud-settings-heading">{title}</h3> : null}
      <dl className="hud-settings-group">{children}</dl>
    </>
  );
}
