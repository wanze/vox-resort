import type { KeyboardEvent } from 'react';
import { PixelIcon } from './PixelIcon';
import type { IconName } from './pixelIcons';

export interface HudTabsProps<T extends string> {
  readonly tabs: readonly T[];
  readonly current: T;
  readonly onPick: (tab: T) => void;
  readonly titleOf: (tab: T) => string;
  readonly iconOf: (tab: T) => IconName;
  readonly badgeOf?: (tab: T) => number;
  readonly label?: string;
}

const STEPS: { readonly [key: string]: number } = { ArrowLeft: -1, ArrowRight: 1 };

const noBadge = (): number => 0;

function HudTab(props: {
  readonly title: string;
  readonly icon: IconName;
  readonly badge: number;
  readonly selected: boolean;
  readonly onPick: () => void;
}) {
  return (
    <button
      type="button"
      className="hud-tab"
      role="tab"
      aria-selected={props.selected}
      tabIndex={props.selected ? 0 : -1}
      onClick={props.onPick}
    >
      <PixelIcon name={props.icon} />
      <span className="hud-tab-label">{props.title}</span>
      {props.badge > 0 ? (
        <span className="hud-tool-badge" aria-label={`${props.badge} to look at`}>
          {props.badge}
        </span>
      ) : null}
    </button>
  );
}

// Only the current tab takes Tab, and the arrows pick as they move, as a native tab strip does.
export function HudTabs<T extends string>({
  tabs,
  current,
  onPick,
  titleOf,
  iconOf,
  badgeOf = noBadge,
  label,
}: HudTabsProps<T>) {
  const step = (event: KeyboardEvent<HTMLDivElement>): void => {
    const by = STEPS[event.key];
    if (by === undefined) return;
    event.preventDefault();
    const at = (tabs.indexOf(current) + by + tabs.length) % tabs.length;
    const next = tabs[at];
    if (next === undefined) return;
    onPick(next);
    event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[at]?.focus();
  };

  return (
    <div className="hud-tabs" role="tablist" aria-label={label} onKeyDown={step}>
      {tabs.map((tab) => (
        <HudTab
          key={tab}
          title={titleOf(tab)}
          icon={iconOf(tab)}
          badge={badgeOf(tab)}
          selected={tab === current}
          onPick={() => onPick(tab)}
        />
      ))}
    </div>
  );
}
