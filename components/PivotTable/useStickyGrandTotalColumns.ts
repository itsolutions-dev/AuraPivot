/**
 * Measures the data-column headers so the grand-total column(s) can pin to
 * their exact offsets while the grid scrolls horizontally.
 */
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { AxisLeaf } from '../../pivot-core/matrix/MatrixComputer';

interface StickyGrandTotalColumnsOptions {
  colLeaves: AxisLeaf[];
  stickyColTotals: boolean;
  colsTotalsPosition: string;
  stickyRowTotals: boolean;
  chevronColWidth: number;
}

export const useStickyGrandTotalColumns = function useStickyGrandTotalColumns({
  colLeaves,
  stickyColTotals,
  colsTotalsPosition,
  stickyRowTotals,
  chevronColWidth,
}: StickyGrandTotalColumnsOptions) {
  // Sticky grand-total columns keep their normal width — forcing a width
  // shrinks them. Instead every data-column header carries a `data-pvt-ci`
  // attribute; after layout its real `offsetLeft` is measured and the sticky
  // cell is pinned to that exact device-pixel offset, so the columns neither
  // overlap nor leave seams while scrolling, at any width.
  const scrollerElRef = useRef<HTMLElement | null>(null);
  const scrollerObsRef = useRef<ResizeObserver | null>(null);
  const [measureTick, setMeasureTick] = useState(0);
  const handleScrollerRef = useCallback((node: HTMLElement | Window | null) => {
    if (scrollerObsRef.current) {
      scrollerObsRef.current.disconnect();
      scrollerObsRef.current = null;
    }
    scrollerElRef.current = node && node instanceof HTMLElement ? node : null;
    if (!scrollerElRef.current) return;
    const ro = new ResizeObserver(() => setMeasureTick((t) => t + 1));
    ro.observe(scrollerElRef.current);
    scrollerObsRef.current = ro;
    setMeasureTick((t) => t + 1);
  }, []);

  // `colGeom` maps each data-column index to its measured natural offsetLeft,
  // plus `__cw` (the table's full content width). `null` when sticky is off.
  const [colGeom, setColGeom] = useState<Record<string, number> | null>(null);
  useLayoutEffect(() => {
    const scroller = scrollerElRef.current;
    if (!scroller || !stickyColTotals || colsTotalsPosition === 'none') {
      setColGeom((prev) => (prev === null ? prev : null));
      return;
    }
    const ths = scroller.querySelectorAll<HTMLTableCellElement>(
      'thead th[data-pvt-ci]',
    );
    if (!ths.length) return;
    const geom: Record<string, number> = {};
    let contentWidth = 0;
    ths.forEach((th) => {
      geom[th.getAttribute('data-pvt-ci') ?? ''] = th.offsetLeft;
      const right = th.offsetLeft + th.offsetWidth;
      if (right > contentWidth) contentWidth = right;
    });
    geom.__cw = contentWidth;
    setColGeom((prev) => {
      if (prev) {
        const keys = Object.keys(geom);
        const same =
          keys.length === Object.keys(prev).length &&
          keys.every((k) => prev[k] === geom[k]);
        if (same) return prev;
      }
      return geom;
    });
  }, [
    colLeaves,
    measureTick,
    stickyColTotals,
    colsTotalsPosition,
    chevronColWidth,
  ]);

  // Sticky grand-total column — grand-total col leaves (depth -1) pin to the
  // left ("before") or right ("after") edge during horizontal scroll, at the
  // exact measured offset. Returns a style fragment, or null.
  const stickyColStyle = useCallback(
    (
      col: AxisLeaf,
      ci: number,
      isHeader: boolean,
    ): React.CSSProperties | null => {
      if (!stickyColTotals || colsTotalsPosition === 'none') return null;
      if (!(col?.isTotal && col.depth === -1)) return null;
      if (!colGeom || colGeom[String(ci)] == null) return null;
      // Header cells live inside Virtuoso's own <thead> stacking context, so a
      // high zIndex there is safe — and necessary, because the scrolling
      // column headers carry positioned content (MUI IconButtons are
      // `position: relative`) that would otherwise paint over them.
      // Body cells must stay below the pinned grand-total row (topItemCount /
      // fixed footer, both zIndex 1) when totalsRowsSticky is on, so they drop
      // to zIndex 0 then; otherwise zIndex 1 to cover positioned cell content.
      const zIndex = isHeader ? 3 : stickyRowTotals ? 0 : 1;
      if (colsTotalsPosition === 'after') {
        // Right offset = distance from this column's right edge (== the next
        // column's measured left) to the table's content right edge.
        const nextLeft = colGeom[String(ci + 1)];
        const rightEdge = nextLeft == null ? colGeom.__cw : nextLeft;
        return {
          position: 'sticky',
          right: colGeom.__cw - rightEdge,
          zIndex,
        };
      }
      return { position: 'sticky', left: colGeom[String(ci)], zIndex };
    },
    [stickyColTotals, colsTotalsPosition, colGeom, stickyRowTotals],
  );

  return { handleScrollerRef, stickyColStyle };
};
