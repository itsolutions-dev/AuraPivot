// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import PivotEngine from '../pivot-core/PivotEngine';
import usePivotMatrix from './usePivotMatrix';

const smallRows = (n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => ({ a: i + offset, b: `m${i % 3}` }));

const makeEngine = (rows: Array<Record<string, unknown>>) => {
  const engine = new PivotEngine();
  engine.setData(rows);
  return engine;
};

const listenerCount = (engine: PivotEngine, event: string): number => {
  const listeners = (
    engine as unknown as { _listeners: Map<string, Set<unknown>> }
  )._listeners;
  return listeners.get(event)?.size ?? 0;
};

describe('usePivotMatrix', () => {
  test('returns the computed matrix synchronously on mount', () => {
    const engine = makeEngine(smallRows(10));
    const { result } = renderHook(() => usePivotMatrix(engine));
    expect(result.current.matrix).not.toBeNull();
    expect(result.current.loading).toBe(false);
  });

  test('returns null matrix and not loading for a null engine', () => {
    const { result } = renderHook(() => usePivotMatrix(null));
    expect(result.current.matrix).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  test('recomputes when dataChange fires (small dataset, synchronous)', () => {
    const engine = makeEngine(smallRows(10));
    const { result } = renderHook(() => usePivotMatrix(engine));
    const before = result.current.matrix;
    act(() => {
      engine.setData(smallRows(20, 100));
    });
    expect(result.current.matrix).not.toBeNull();
    expect(result.current.matrix).not.toBe(before);
    expect(result.current.loading).toBe(false);
  });

  test('large dataset: shows loading before the deferred recompute lands', async () => {
    const engine = makeEngine(smallRows(10));
    const { result } = renderHook(() => usePivotMatrix(engine));
    const before = result.current.matrix;

    await act(async () => {
      engine.setData(smallRows(5001));
    });
    // The deferred compute is scheduled on a macrotask so the browser can
    // actually paint the loader — microtasks (flushed inside act) must NOT
    // have resolved it yet.
    expect(result.current.loading).toBe(true);
    expect(result.current.matrix).toBe(before);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.matrix).not.toBe(before);
  });

  test('two consumers of the same engine see the same snapshot', () => {
    const engine = makeEngine(smallRows(10));
    const first = renderHook(() => usePivotMatrix(engine));
    const second = renderHook(() => usePivotMatrix(engine));
    expect(first.result.current.matrix).toBe(second.result.current.matrix);
    act(() => {
      engine.setData(smallRows(15, 50));
    });
    expect(first.result.current.matrix).toBe(second.result.current.matrix);
  });

  test('detaches engine listeners on unmount', () => {
    const engine = makeEngine(smallRows(10));
    const { unmount } = renderHook(() => usePivotMatrix(engine));
    expect(listenerCount(engine, 'dataChange')).toBeGreaterThan(0);
    unmount();
    expect(listenerCount(engine, 'dataChange')).toBe(0);
    expect(listenerCount(engine, 'reportChange')).toBe(0);
    expect(listenerCount(engine, 'formatChange')).toBe(0);
  });
});
