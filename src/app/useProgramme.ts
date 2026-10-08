import { useCallback, useMemo, useState, type RefObject } from 'react';
import type { BookingChange, BookingDraft } from '../features/events/domain/programme';
import {
  cardsAt,
  programmeView,
  type DayForecast,
  type DayPart,
  type ProgrammeFacts,
} from '../features/events/domain/programmeView';
import type { Showcase } from './showcase';
import type { HudStore } from '../features/hud/domain/hudStore';
import { useHudSlice } from '../features/hud/components/useHudSlice';
import type {
  ProgrammeControls,
  ProgrammeTab,
} from '../features/events/components/programmeControls';

const NO_FORECAST: readonly DayForecast[] = [];

const forecastOf = (facts: ProgrammeFacts | null): readonly DayForecast[] =>
  facts?.forecast ?? NO_FORECAST;

export function useProgramme(
  showcase: RefObject<Showcase | null>,
  hud: HudStore,
): ProgrammeControls {
  const facts = useHudSlice(hud, (state) => state.programme);
  const [site, setSite] = useState<string | null>(null);
  const [tab, showTab] = useState<ProgrammeTab>('plan');
  const view = useMemo(() => (facts ? programmeView(facts, site) : null), [facts, site]);
  const chosen = view?.site ?? null;

  return {
    view,
    forecast: forecastOf(facts),
    tab,
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
