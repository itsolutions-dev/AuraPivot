import { useSyncExternalStore } from 'react';
import type PivotEngine from '../pivot-core/PivotEngine';

/**
 * Single subscription primitive for every component that mirrors engine state.
 *
 * Returns a counter that increments on `dataChange` / `reportChange` /
 * `formatChange`; read the engine through a `useMemo` keyed on
 * `[engine, version]` instead of copying its state into `useState` from an
 * effect. That fixes two problems the hand-rolled mirrors shared:
 *
 *   - `useMemo(..., [engine])` never re-ran, because the engine object is
 *     created once per mount and mutates in place;
 *   - `useState` + `useEffect` mirrors can tear under concurrent rendering
 *     and miss events fired between the first render and effect commit.
 *
 * Like `usePivotMatrix`, one store per engine (WeakMap) so N consumers share
 * one set of engine listeners, attached with the first subscriber and
 * detached with the last.
 */

const ENGINE_EVENTS = ['dataChange', 'reportChange', 'formatChange'] as const;

interface VersionStore {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => number;
}

const createStore = (engine: PivotEngine): VersionStore => {
  let version = 0;
  const listeners = new Set<() => void>();
  const bump = () => {
    version += 1;
    listeners.forEach((l) => l());
  };
  return {
    subscribe(onStoreChange: () => void) {
      if (listeners.size === 0) {
        ENGINE_EVENTS.forEach((e) => engine.on(e, bump));
        // Anything emitted while detached was missed: bump once so newly
        // mounted consumers re-read rather than trust a stale memo.
        version += 1;
      }
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
        if (listeners.size === 0) {
          ENGINE_EVENTS.forEach((e) => engine.off(e, bump));
        }
      };
    },
    getSnapshot: () => version,
  };
};

const stores = new WeakMap<PivotEngine, VersionStore>();

const storeFor = (engine: PivotEngine): VersionStore => {
  let store = stores.get(engine);
  if (!store) {
    store = createStore(engine);
    stores.set(engine, store);
  }
  return store;
};

const NULL_STORE: VersionStore = {
  subscribe: () => () => {},
  getSnapshot: () => 0,
};

export const useEngineVersion = (
  engine: PivotEngine | null | undefined,
): number => {
  const store = engine ? storeFor(engine) : NULL_STORE;
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
};

export default useEngineVersion;
