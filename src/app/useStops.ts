import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { dayAt } from '../features/events/domain/week';
import type { ProgrammeControls } from '../features/events/components/programmeControls';
import type { ClockControls, WindowControls } from '../features/hud/components/hudControls';
import type { HudPrefs } from '../features/hud/domain/hudPrefs';
import type { HudStore } from '../features/hud/domain/hudStore';
import type { BookingNews } from '../features/hud/domain/news';
import {
  answer as answerStop,
  morningStops,
  NO_STOPS,
  offerStop,
  PLANNING,
  shownStop,
  stop,
  type MorningFacts,
  type Stop,
  type Stops,
} from '../features/hud/domain/stops';
import { isShown } from '../features/hud/domain/windowLayout';

export interface StopControls {
  readonly shown: Stop | null;
  answer(key: string): void;
  // Leaves the game paused until the Programme window it opens is closed.
  plan(key: string): void;
  hearMorning(): void;
  hearBooking(news: BookingNews): void;
  // A load or a new game: what waited belonged to the resort that was replaced.
  clear(): void;
}

interface Latest {
  readonly clock: Pick<ClockControls, 'speed' | 'setSpeed'>;
  readonly prefs: HudPrefs;
  readonly playing: boolean;
}

function morningFacts(hud: HudStore): MorningFacts | null {
  const { programme } = hud.getSnapshot();
  if (!programme) return null;
  return {
    day: dayAt(programme.now),
    stage: programme.stages.length > 0 || programme.beachRoom > 0,
  };
}

// Outside React's state, so the callbacks the showcase holds once see the queue as it is now.
function createKeeper(latest: Latest) {
  let now = latest;
  let stops = NO_STOPS;
  return {
    adopt(next: Latest): void {
      now = next;
    },
    now: (): Latest => now,
    // Null when nothing new was queued.
    push(added: readonly Stop[]): Stops | null {
      if (!now.playing || added.length === 0) return null;
      const next = stop(stops, added, now.clock.speed);
      if (next === stops) return null;
      stops = next;
      return next;
    },
    // A speed the player picked while a sheet was up is theirs, so it is left as it is.
    answer(key: string): Stops {
      const answered = answerStop(stops, key);
      stops = answered.stops;
      const { clock } = now;
      if (answered.resume !== null && clock.speed === 'paused') clock.setSpeed(answered.resume);
      return stops;
    },
    hold(): void {
      stops = stop(stops, [PLANNING], 'paused');
    },
    morning: (facts: MorningFacts): readonly Stop[] => morningStops(facts, now.prefs),
    clear(): void {
      stops = NO_STOPS;
    },
  };
}

export function useStops(
  hud: HudStore,
  latest: Latest,
  windows: WindowControls,
  programme: Pick<ProgrammeControls, 'showTab'>,
): StopControls {
  const [stops, setStops] = useState(NO_STOPS);
  const [keeper] = useState(() => createKeeper(latest));
  useLayoutEffect(() => keeper.adopt(latest));

  const push = useCallback(
    (added: readonly Stop[]) => {
      const next = keeper.push(added);
      if (!next) return;
      setStops(next);
      keeper.now().clock.setSpeed('paused');
    },
    [keeper],
  );

  const answer = useCallback((key: string) => setStops(keeper.answer(key)), [keeper]);

  const { show } = windows;
  const { showTab } = programme;
  const plan = useCallback(
    (key: string) => {
      show('programme', true);
      showTab('plan');
      keeper.hold();
      answer(key);
    },
    [show, showTab, keeper, answer],
  );

  // The planning hold is never shown, so the state may keep it a little after it is let go.
  const programmeUp = isShown(windows.layout, 'programme');
  useEffect(() => {
    if (!programmeUp) keeper.answer(PLANNING.key);
  }, [programmeUp, keeper]);

  return {
    shown: shownStop(stops),
    answer,
    plan,
    hearMorning: useCallback(() => {
      const facts = morningFacts(hud);
      if (facts) push(keeper.morning(facts));
    }, [hud, keeper, push]),
    hearBooking: useCallback(
      (news: BookingNews) => {
        if (news.kind === 'offer' && keeper.now().prefs.pauseOffers) {
          push([offerStop(news.offer.id)]);
        }
      },
      [keeper, push],
    ),
    clear: useCallback(() => {
      keeper.clear();
      setStops(NO_STOPS);
    }, [keeper]),
  };
}
