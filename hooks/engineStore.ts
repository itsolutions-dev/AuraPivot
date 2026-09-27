import { useSyncExternalStore } from 'react';
import type PivotEngine from '../pivot-core/PivotEngine';

const ENGINE_EVENTS = ['dataChange', 'reportChange', 'formatChange'] as const;

interface Store<T> {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => T;
}

/** What a store does with the engine; `notify` re-renders the subscribers. */
export interface EngineStoreSource<T> {
  getSnapshot: () => T;
  /** An engine event fired while the store has subscribers. */
  onEngineChange: (notify: () => void) => void;
  /**
   * The first subscriber is arriving. Anything emitted while detached was
   * missed, so this is where the snapshot catches up; a synchronous
   * `notify` reaches nobody yet, a deferred one reaches the subscribers.
   */
  onAttach: (notify: () => void) => void;
  /** The last subscriber left. */
  onDetach?: () => void;
}

/**
 * Builds a `useSyncExternalStore` hook over a PivotEngine. Each engine gets
 * one store (WeakMap), so N components reading the same engine share one
 * snapshot and one set of engine listeners — attached with the first
 * subscriber and detached with the last, so unmounting never leaks
 * handlers. `useSyncExternalStore` keeps concurrent rendering from tearing
 * between engine state and what components read.
 */
export const createEngineStoreHook = <T>(
  source: (engine: PivotEngine) => EngineStoreSource<T>,
  nullSnapshot: T,
): ((engine: PivotEngine | null | undefined) => T) => {
  const stores = new WeakMap<PivotEngine, Store<T>>();

  const createStore = (engine: PivotEngine): Store<T> => {
    const src = source(engine);
    const listeners = new Set<() => void>();
    const notify = () => listeners.forEach((l) => l());
    const onEvent = () => src.onEngineChange(notify);
    return {
      subscribe(onStoreChange) {
        if (listeners.size === 0) {
          ENGINE_EVENTS.forEach((e) => engine.on(e, onEvent));
          src.onAttach(notify);
        }
        listeners.add(onStoreChange);
        return () => {
          listeners.delete(onStoreChange);
          if (listeners.size === 0) {
            ENGINE_EVENTS.forEach((e) => engine.off(e, onEvent));
            src.onDetach?.();
          }
        };
      },
      getSnapshot: src.getSnapshot,
    };
  };

  const nullStore: Store<T> = {
    subscribe: () => () => {},
    getSnapshot: () => nullSnapshot,
  };

  const storeFor = (engine: PivotEngine | null | undefined): Store<T> => {
    if (!engine) return nullStore;
    let store = stores.get(engine);
    if (!store) {
      store = createStore(engine);
      stores.set(engine, store);
    }
    return store;
  };

  return (engine) => {
    const store = storeFor(engine);
    return useSyncExternalStore(
      store.subscribe,
      store.getSnapshot,
      store.getSnapshot,
    );
  };
};
