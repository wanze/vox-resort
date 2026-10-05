import { useCallback, useMemo, useState, type RefObject } from 'react';
import type {
  BookingChange,
  BookingDraft,
  BookingRefusal,
} from '../features/events/domain/programme';
import {
  cardsAt,
  programmeView,
  type Card,
  type DayForecast,
  type DayPart,
  type ProgrammeFacts,
  type ProgrammeView,
} from '../features/events/domain/programmeView';
import type { Showcase } from './showcase';

export type ProgrammeTab = 'plan' | 'upcoming';

// The showcase owns the programme; this mirrors it and holds which stage the window shows.
export interface ProgrammeControls {
  readonly view: ProgrammeView | null;
  // The week's weather the programme plans around, which the top bar shows as well.
  readonly forecast: readonly DayForecast[];
  readonly tab: ProgrammeTab;
  // Stable, so the mount effect can hold it.
  readonly adopt: (facts: ProgrammeFacts) => void;
  // Turns to the plan, since a stage is chosen to book on it.
  choose(site: string): void;
  showTab(tab: ProgrammeTab): void;
  // Asked for one cell at a time: every start is checked against the whole programme.
  cardsAt(day: number, part: DayPart): readonly Card[];
  // Each answers why it was refused, or null once it is done.
  book(draft: BookingDraft): BookingRefusal | null;
  unbook(id: number): void;
  rebook(id: number, change: BookingChange): BookingRefusal | null;
  switchBuiltIn(id: number, on: boolean): void;
}

const NO_FORECAST: readonly DayForecast[] = [];

const forecastOf = (facts: ProgrammeFacts | null): readonly DayForecast[] =>
  facts?.forecast ?? NO_FORECAST;

export function useProgramme(showcase: RefObject<Showcase | null>): ProgrammeControls {
  const [facts, adopt] = useState<ProgrammeFacts | null>(null);
  const [site, setSite] = useState<string | null>(null);
  const [tab, showTab] = useState<ProgrammeTab>('plan');
  const view = useMemo(() => (facts ? programmeView(facts, site) : null), [facts, site]);
  const chosen = view?.site ?? null;

  return {
    view,
    forecast: forecastOf(facts),
    tab,
    adopt,
    choose: useCallback((key: string) => {
      setSite(key);
      showTab('plan');
    }, []),
    showTab,
    cardsAt: useCallback(
      (day: number, part: DayPart) => (facts && chosen ? cardsAt(facts, chosen, day, part) : []),
      [facts, chosen],
    ),
    book: useCallback((draft: BookingDraft) => showcase.current?.book(draft) ?? null, [showcase]),
    unbook: useCallback((id: number) => showcase.current?.unbook(id), [showcase]),
    rebook: useCallback(
      (id: number, change: BookingChange) => showcase.current?.rebook(id, change) ?? null,
      [showcase],
    ),
    switchBuiltIn: useCallback(
      (id: number, on: boolean) => showcase.current?.switchBuiltIn(id, on),
      [showcase],
    ),
  };
}
