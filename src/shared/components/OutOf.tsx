import type { Tone } from './tone';

export interface OutOfProps {
  readonly value: number;
  readonly total: number;
  // Said after the total to a screen reader, where the figure's label does not name it.
  readonly unit?: string;
  readonly tone?: Tone | undefined;
}

const whole = (value: number): string => value.toLocaleString('en-US');

// Read as "40 of 60": a reader says the slash as "slash".
export function OutOf({ value, total, unit, tone }: OutOfProps) {
  return (
    <span className="ui-out-of" data-tone={tone}>
      {whole(value)}
      <span className="ui-out-of-total">
        <span aria-hidden="true"> / </span>
        <span className="ui-visually-hidden"> of </span>
        {whole(total)}
        {unit ? <span className="ui-visually-hidden">{` ${unit}`}</span> : null}
      </span>
    </span>
  );
}
