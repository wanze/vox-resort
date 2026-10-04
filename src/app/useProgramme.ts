import { useCallback, useMemo, useState, type RefObject } from 'react';
import type {
  BookingChange,
  BookingDraft,
  BookingRefusal,
} from '../features/events/domain/programme';
import {
  programmeView,
  type ProgrammeFacts,
  type ProgrammeView,
} from '../features/events/domain/programmeView';
import type { Showcase } from './showcase';

// The showcase owns the programme; this mirrors it and holds which stage the window shows.
export interface ProgrammeControls {
  readonly view: ProgrammeView | null;
  // Why the last booking or move was refused; cleared by the next one that is not.
  readonly refusal: BookingRefusal | null;
  // Stable, so the mount effect can hold it.
  readonly adopt: (facts: ProgrammeFacts) => void;
  choose(site: string): void;
  book(draft: BookingDraft): void;
  unbook(id: number): void;
  rebook(id: number, change: BookingChange): void;
  switchBuiltIn(id: number, on: boolean): void;
}

export function useProgramme(showcase: RefObject<Showcase | null>): ProgrammeControls {
  const [facts, adopt] = useState<ProgrammeFacts | null>(null);
  const [site, choose] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<BookingRefusal | null>(null);
  const view = useMemo(() => (facts ? programmeView(facts, site) : null), [facts, site]);

  return {
    view,
    refusal,
    adopt,
    choose,
    book: useCallback(
      (draft: BookingDraft) => setRefusal(showcase.current?.book(draft) ?? null),
      [showcase],
    ),
    unbook: useCallback(
      (id: number) => {
        setRefusal(null);
        showcase.current?.unbook(id);
      },
      [showcase],
    ),
    rebook: useCallback(
      (id: number, change: BookingChange) =>
        setRefusal(showcase.current?.rebook(id, change) ?? null),
      [showcase],
    ),
    switchBuiltIn: useCallback(
      (id: number, on: boolean) => {
        setRefusal(null);
        showcase.current?.switchBuiltIn(id, on);
      },
      [showcase],
    ),
  };
}
