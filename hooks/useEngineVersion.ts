import { createEngineStoreHook } from './engineStore';

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
 */
export const useEngineVersion = createEngineStoreHook<number>(() => {
  let version = 0;
  return {
    getSnapshot: () => version,
    onEngineChange: (notify) => {
      version += 1;
      notify();
    },
    // Bump once so newly mounted consumers re-read rather than trust a
    // stale memo.
    onAttach: () => {
      version += 1;
    },
  };
}, 0);

export default useEngineVersion;
