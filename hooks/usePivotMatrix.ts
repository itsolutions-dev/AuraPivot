import { createEngineStoreHook } from './engineStore';
import type { ComputedMatrix } from '../pivot-core/matrix/MatrixComputer';

/**
 * The latest computed matrix of a PivotEngine, shared by every component
 * reading that engine (see createEngineStoreHook).
 *
 * For datasets up to DEFER_THRESHOLD rows the recompute runs synchronously
 * so the first paint is immediate. Above the threshold the snapshot flips to
 * `loading: true` and the compute is deferred on a macrotask (`setTimeout`):
 * a microtask would run before the browser paints, hiding the loader.
 */
const DEFER_THRESHOLD = 5000;

interface MatrixSnapshot {
  matrix: ComputedMatrix | null;
  loading: boolean;
}

const usePivotMatrix = createEngineStoreHook<MatrixSnapshot>(
  (engine) => {
    // The store is created during render, so computing the first matrix here
    // would block the first paint exactly for the datasets the threshold is
    // meant to protect. Above it we start empty + loading and let the first
    // subscriber schedule the deferred compute.
    let snapshot: MatrixSnapshot =
      engine.getRows().length > DEFER_THRESHOLD
        ? { matrix: null, loading: true }
        : { matrix: engine.processMatrix(), loading: false };
    let deferredTimer: ReturnType<typeof setTimeout> | null = null;

    const recompute = (notify: () => void) => {
      if (engine.getRows().length <= DEFER_THRESHOLD) {
        snapshot = { matrix: engine.processMatrix(), loading: false };
        notify();
        return;
      }
      if (!snapshot.loading) {
        snapshot = { matrix: snapshot.matrix, loading: true };
        notify();
      }
      // Coalesce: a pending deferred compute reads the engine's latest
      // (memoized) matrix anyway, no need to stack timeouts.
      if (deferredTimer !== null) return;
      deferredTimer = setTimeout(() => {
        deferredTimer = null;
        snapshot = { matrix: engine.processMatrix(), loading: false };
        notify();
      }, 0);
    };

    return {
      getSnapshot: () => snapshot,
      onEngineChange: recompute,
      // processMatrix is dirty-flag memoized, so catching up is free when
      // nothing changed.
      onAttach: recompute,
      // Drop a pending compute: nobody is listening, and the next subscriber
      // catches up on attach anyway.
      onDetach: () => {
        if (deferredTimer !== null) {
          clearTimeout(deferredTimer);
          deferredTimer = null;
        }
      },
    };
  },
  { matrix: null, loading: false },
);

export default usePivotMatrix;
