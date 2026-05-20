import { useEffect, useState } from 'react';
import type PivotEngine from '../pivot-core/PivotEngine';
import type { ComputedMatrix } from '../pivot-core/matrix/MatrixComputer';

/**
 * Subscribes to the PivotEngine lifecycle and returns the latest computed
 * matrix. The engine exposes 'dataChange' and 'reportChange' events; any time
 * one fires we re-run processMatrix().
 *
 * For datasets smaller than WORKER_THRESHOLD rows the pipeline runs
 * synchronously on the main thread so the first paint is immediate. Above
 * that threshold computation is wrapped in a microtask so the UI can paint a
 * "computing" state before the CPU-heavy work starts.
 */
const WORKER_THRESHOLD = 5000;

const usePivotMatrix = (
  engine: PivotEngine | null | undefined,
): { matrix: ComputedMatrix | null; loading: boolean } => {
  const [matrix, setMatrix] = useState<ComputedMatrix | null>(() =>
    engine ? engine.processMatrix() : null
  );
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!engine) return undefined;
    let cancelled = false;

    const recompute = () => {
      const rows = engine.getRows();
      if (rows.length > WORKER_THRESHOLD) {
        setLoading(true);
        // Yield to the browser so it can paint the loader.
        Promise.resolve().then(() => {
          if (cancelled) return;
          const m = engine.processMatrix();
          if (!cancelled) {
            setMatrix(m);
            setLoading(false);
          }
        });
      } else {
        setMatrix(engine.processMatrix());
      }
    };

    engine.on('dataChange', recompute);
    engine.on('reportChange', recompute);
    // Layout-level format changes (totals position, alternating rows) are
    // baked into the matrix, so recompute when they fire too.
    engine.on('formatChange', recompute);
    recompute();

    return () => {
      cancelled = true;
      engine.off('dataChange', recompute);
      engine.off('reportChange', recompute);
      engine.off('formatChange', recompute);
    };
  }, [engine]);

  return { matrix, loading };
};

export default usePivotMatrix;
