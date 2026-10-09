import type { KeyboardEvent } from 'react';
import { PixelIcon } from './PixelIcon';
import type { IconName } from './pixelIcons';
import { rovingTarget } from '../domain/roving';

export interface TabsProps<T extends string> {
  readonly tabs: readonly T[];
  readonly current: T;
  readonly onPick: (tab: T) => void;
  readonly titleOf: (tab: T) => string;
  readonly iconOf?: (tab: T) => IconName;
  readonly badgeOf?: (tab: T) => number;
  readonly label?: string;
  // The id of the element showing the current tab's content, which labels itself with tabIdOf.
  readonly panelId: string;
}

export const tabIdOf = (panelId: string, tab: string): string => `${panelId}-${tab}`;

const noBadge = (): number => 0;

function Tab(props: {
  readonly id: string;
  readonly panelId: string;
  readonly title: string;
  readonly icon: IconName | null;
  readonly badge: number;
  readonly selected: boolean;
  readonly onPick: () => void;
}) {
  return (
    <button
      type="button"
      id={props.id}
      className="ui-tab"
      role="tab"
      aria-controls={props.panelId}
      aria-selected={props.selected}
      tabIndex={props.selected ? 0 : -1}
      onClick={props.onPick}
    >
      {props.icon ? <PixelIcon name={props.icon} /> : null}
      <span>{props.title}</span>
      {props.badge > 0 ? (
        <span className="ui-badge" aria-label={`${props.badge} to look at`}>
          {props.badge}
        </span>
      ) : null}
    </button>
  );
}

// Only the current tab takes Tab, and the arrows pick as they move, as a native tab strip does.
export function Tabs<T extends string>({
  tabs,
  current,
  onPick,
  titleOf,
  iconOf,
  badgeOf = noBadge,
  label,
  panelId,
}: TabsProps<T>) {
  const step = (event: KeyboardEvent<HTMLDivElement>): void => {
    const at = rovingTarget(event.key, tabs.indexOf(current), tabs.length, 'horizontal');
    const next = at === null ? undefined : tabs[at];
    if (at === null || next === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    onPick(next);
    event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[at]?.focus();
  };

  return (
    <div className="ui-tabs" role="tablist" aria-label={label} onKeyDown={step}>
      {tabs.map((tab) => (
        <Tab
          key={tab}
          id={tabIdOf(panelId, tab)}
          panelId={panelId}
          title={titleOf(tab)}
          icon={iconOf ? iconOf(tab) : null}
          badge={badgeOf(tab)}
          selected={tab === current}
          onPick={() => onPick(tab)}
        />
      ))}
    </div>
  );
}
