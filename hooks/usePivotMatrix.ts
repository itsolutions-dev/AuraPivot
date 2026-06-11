import { useSyncExternalStore } from 'react';
import type PivotEngine from '../pivot-core/PivotEngine';
import type { ComputedMatrix } from '../pivot-core/matrix/MatrixComputer';

/**
 * Subscribes to the PivotEngine lifecycle and returns the latest computed
 * matrix. Built on useSyncExternalStore so concurrent rendering (React 18+)
 * cannot tear between the engine's state and what a component reads.
 *
 * Each engine gets one shared store (WeakMap): multiple components reading
 * the same engine see the same snapshot and trigger a single recompute.
 * Engine listeners attach with the first subscriber and detach with the
 * last, so unmounting consumers never leaks handlers.
 *
 * For datasets up to WORKER_THRESHOLD rows the recompute runs synchronously
 * so the first paint is immediate. Above the threshold the snapshot flips to
 * `loading: true` and the compute is deferred on a macrotask (`setTimeout`):
 * a microtask would run before the browser paints, hiding the loader.
 */
const WORKER_THRESHOLD = 5000;

interface MatrixSnapshot {
  matrix: ComputedMatrix | null;
  loading: boolean;
}

type EngineEventName = 'dataChange' | 'reportChange' | 'formatChange';
const ENGINE_EVENTS: EngineEventName[] = [
  'dataChange',
  'reportChange',
  'formatChange',
];

interface MatrixStore {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => MatrixSnapshot;
}

const createStore = (engine: PivotEngine): MatrixStore => {
  let snapshot: MatrixSnapshot = {
    matrix: engine.processMatrix(),
    loading: false,
  };
  const listeners = new Set<() => void>();
  let deferredScheduled = false;

  const emit = () => listeners.forEach((l) => l());

  const recompute = () => {
    if (engine.getRows().length > WORKER_THRESHOLD) {
      if (!snapshot.loading) {
        snapshot = { matrix: snapshot.matrix, loading: true };
        emit();
      }
      // Coalesce: a pending deferred compute reads the engine's latest
      // (memoized) matrix anyway, no need to stack timeouts.
      if (deferredScheduled) return;
      deferredScheduled = true;
      setTimeout(() => {
        deferredScheduled = false;
        snapshot = { matrix: engine.processMatrix(), loading: false };
        emit();
      }, 0);
    } else {
      snapshot = { matrix: engine.processMatrix(), loading: false };
      emit();
    }
  };

  return {
    subscribe(onStoreChange: () => void) {
      if (listeners.size === 0) {
        ENGINE_EVENTS.forEach((e) => engine.on(e, recompute));
        // Catch up on anything that happened while detached. processMatrix
        // is dirty-flag memoized, so this is free when nothing changed.
        recompute();
      }
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
        if (listeners.size === 0) {
          ENGINE_EVENTS.forEach((e) => engine.off(e, recompute));
        }
      };
    },
    getSnapshot: () => snapshot,
  };
};

const stores = new WeakMap<PivotEngine, MatrixStore>();

const storeFor = (engine: PivotEngine): MatrixStore => {
  let store = stores.get(engine);
  if (!store) {
    store = createStore(engine);
    stores.set(engine, store);
  }
  return store;
};

const NULL_SNAPSHOT: MatrixSnapshot = { matrix: null, loading: false };
const NULL_STORE: MatrixStore = {
  subscribe: () => () => {},
  getSnapshot: () => NULL_SNAPSHOT,
};

const usePivotMatrix = (
  engine: PivotEngine | null | undefined,
): { matrix: ComputedMatrix | null; loading: boolean } => {
  const store = engine ? storeFor(engine) : NULL_STORE;
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
};

export default usePivotMatrix;
