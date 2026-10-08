import { useCallback, type RefObject } from 'react';
import type { Showcase } from './showcase';
import type { HudStore } from '../features/hud/domain/hudStore';
import { useHudSlice } from '../features/hud/components/useHudSlice';
import type { GuestViewControls } from '../features/hud/components/hudControls';

export function useGuestView(
  showcase: RefObject<Showcase | null>,
  hud: HudStore,
): GuestViewControls {
  const following = useHudSlice(hud, (state) => state.following);

  return {
    following,
    follow: useCallback(() => showcase.current?.followSelected(), [showcase]),
    ride: useCallback((craft: number) => showcase.current?.ride(craft), [showcase]),
    stop: useCallback(() => showcase.current?.stopFollowing(), [showcase]),
    toggleView: useCallback(() => showcase.current?.toggleFollowView(), [showcase]),
    rideAlong: useCallback(() => showcase.current?.rideAlong(), [showcase]),
    offers: useCallback(() => showcase.current?.rideOffers() ?? [], [showcase]),
  };
}
