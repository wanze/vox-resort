import type { BookingChange, BookingDraft, BookingRefusal } from '../domain/programme';
import type { Card, DayForecast, DayPart, ProgrammeView } from '../domain/programmeView';

export type ProgrammeTab = 'plan' | 'upcoming';

// The showcase owns the programme; this mirrors it and holds which stage the window shows.
export interface ProgrammeControls {
  readonly view: ProgrammeView | null;
  // The week's weather the programme plans around, which the top bar shows as well.
  readonly forecast: readonly DayForecast[];
  readonly tab: ProgrammeTab;
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
