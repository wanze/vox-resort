import {
  BEACH_PRESETS,
  clampConfig,
  HOUSING_STYLES,
  PARK_SHARE,
  VARIETIES,
  VILLA_SHARE,
  type ResortConfig,
} from '../../layout/domain/resortConfig';

export interface ResortAdvancedProps {
  readonly config: Partial<ResortConfig> | undefined;
  readonly onChange: (config: ResortConfig) => void;
}

function Choice<T extends string>(props: {
  readonly label: string;
  readonly options: readonly T[];
  readonly value: T;
  readonly onPick: (value: T) => void;
}) {
  return (
    <div className="ui-form-row ui-form-row--choice" role="group" aria-label={props.label}>
      <span>{props.label}</span>
      <div className="ui-form-choices">
        {props.options.map((option) => (
          <button
            key={option}
            type="button"
            className="ui-form-choice"
            aria-pressed={option === props.value}
            onClick={() => props.onPick(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function Share(props: {
  readonly label: string;
  readonly range: { readonly min: number; readonly max: number };
  readonly value: number;
  readonly aria: string;
  readonly onSlide: (value: number) => void;
}) {
  return (
    <label className="ui-form-row">
      <span>{props.label}</span>
      <input
        type="range"
        min={props.range.min}
        max={props.range.max}
        step={0.05}
        value={props.value}
        onChange={(event) => props.onSlide(Number(event.target.value))}
        aria-label={props.aria}
      />
      <span className="ui-form-value">{Math.round(props.value * 100)}%</span>
    </label>
  );
}

export function ResortAdvanced({ config, onChange }: ResortAdvancedProps) {
  const current = clampConfig(config);
  const change = (patch: Partial<ResortConfig>): void => onChange({ ...current, ...patch });

  return (
    <details className="ui-form-advanced">
      <summary>Advanced</summary>
      <div className="ui-form-advanced-body">
        <Share
          label="Parks"
          range={PARK_SHARE}
          value={current.parkShare}
          aria="Share of districts laid out as parks"
          onSlide={(parkShare) => change({ parkShare })}
        />
        <Share
          label="Villas"
          range={VILLA_SHARE}
          value={current.villaShare}
          aria="Share of house lots that become villas"
          onSlide={(villaShare) => change({ villaShare })}
        />
        <Choice
          label="Housing"
          options={HOUSING_STYLES}
          value={current.housing}
          onPick={(housing) => change({ housing })}
        />
        <Choice
          label="Beach"
          options={BEACH_PRESETS}
          value={current.beach}
          onPick={(beach) => change({ beach })}
        />
        <Choice
          label="Styles"
          options={VARIETIES}
          value={current.variety}
          onPick={(variety) => change({ variety })}
        />
        <div className="ui-form-flags">
          <label className="ui-form-flag">
            <input
              type="checkbox"
              checked={current.streetTrees}
              onChange={(event) => change({ streetTrees: event.target.checked })}
            />
            <span>Street trees</span>
          </label>
          <label className="ui-form-flag">
            <input
              type="checkbox"
              checked={current.gatePlazas}
              onChange={(event) => change({ gatePlazas: event.target.checked })}
            />
            <span>Gate plazas</span>
          </label>
        </div>
      </div>
    </details>
  );
}
