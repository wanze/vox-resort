import { describe, expect, it, vi } from 'vitest';
import { createHudStore, INITIAL_HUD } from './hudStore';

describe('createHudStore', () => {
  it('starts from the initial state', () => {
    expect(createHudStore().getSnapshot()).toBe(INITIAL_HUD);
  });

  it('tells nobody when every value published is the one already held', () => {
    const store = createHudStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const { orders, camera } = store.getSnapshot();
    store.publish({ open: true, weather: 'clear', orders, camera });
    store.publish({});
    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBe(INITIAL_HUD);
  });

  it('tells every listener once when one value differs, and keeps the other slices', () => {
    const store = createHudStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.getSnapshot();
    store.publish({ open: false, weather: 'clear' });
    expect(listener).toHaveBeenCalledTimes(1);
    const after = store.getSnapshot();
    expect(after).not.toBe(before);
    expect(after.open).toBe(false);
    expect(after.camera).toBe(before.camera);
    expect(after.advice).toBe(before.advice);
    expect(after.voices).toBe(before.voices);
  });

  it('watches one slice: a change elsewhere is not its business', () => {
    const store = createHudStore();
    const changed = vi.fn();
    store.watch((state) => state.advice, changed);
    store.publish({ open: false });
    expect(changed).not.toHaveBeenCalled();
    const advice = { list: [], ticks: 3 };
    store.publish({ advice });
    store.publish({ advice });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledWith(advice);
    store.publish({ advice: { list: [], ticks: 3 } });
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('stops telling a listener or a watcher that unsubscribed', () => {
    const store = createHudStore();
    const listener = vi.fn();
    const changed = vi.fn();
    const stopListening = store.subscribe(listener);
    const stopWatching = store.watch((state) => state.name, changed);
    stopListening();
    stopWatching();
    store.publish({ name: 'Bay' });
    expect(listener).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });
});
