import { useCallback, type RefObject } from 'react';
import type { BookingsControls } from '../features/bookings/components/bookingsControls';
import { useHudSlice } from '../features/hud/components/useHudSlice';
import type { HudStore } from '../features/hud/domain/hudStore';
import type { Showcase } from './showcase';

export function useBookings(showcase: RefObject<Showcase | null>, hud: HudStore): BookingsControls {
  return {
    view: useHudSlice(hud, (state) => state.bookings),
    accept: useCallback((id: number) => showcase.current?.acceptOffer(id) ?? 'gone', [showcase]),
    decline: useCallback((id: number) => showcase.current?.declineOffer(id), [showcase]),
  };
}
