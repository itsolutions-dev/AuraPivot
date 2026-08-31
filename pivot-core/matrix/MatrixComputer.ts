/**
 * Produces the final pivot matrix by intersecting every visible row node with
 * every visible column node and then evaluating every measure.
 *
 * The special 'Measures' field may live either on the column axis or on the
 * row axis (analogous to WebDataRocks). When it appears on an axis, every
 * visible leaf on that axis is expanded into N leaves — one per measure —
 * each carrying its `measureKey` so the matrix knows which measure value to
 * compute for the intersecting cell.
 */

import {
  applyAggregation,
  formatMeasureValue,
} from '../aggregation/Aggregator';
import { flattenTreeCompact, sortTreeSiblings } from '../slice/TreeBuilder';
import { evaluateFormulaExpression } from './FormulaEvaluator';
import type { DataRow, TreeNode, MatrixCell, MetadataRow, AggregationType } from '../types';
import type { RichSliceField } from '../slice/TreeBuilder';

/** A measure enriched with optional engine-level fields. aggregation is wider than AggregationType to include internal kinds. */
export interface EnrichedMeasure {
  uniqueName: string;
  aggregation: string; // wider than AggregationType: includes 'formula', 'ratioTotal', 'currentRatio'
  caption?: string;
  grandTotalCaption?: string;
  formula?: string;
  availableAggregations?: string[];
}

/** A calculated field definition carrying its formula string. */
interface CalculatedField {
  uniqueName: string;
  caption?: string;
  formula: string;
}

/** Sort config for column-driven row sort or row-driven column sort. */
interface SortConfig {
  rowKey?: string;
  rowDirection?: 'asc' | 'desc';
  rowMeasure?: { uniqueName: string; aggregation: string };
  colKey?: string;
  colDirection?: 'asc' | 'desc';
  colMeasure?: { uniqueName: string; aggregation: string };
}

/** Layout options passed to computeMatrix. */
interface LayoutOptions {
  totalsRowsPosition?: string;
  totalsColumnsPosition?: string;
  alternateRows?: boolean;
}

/** A TreeNode expanded to an axis leaf, with measure metadata. */
export interface AxisLeaf extends TreeNode {
  nodeKey: string;
  measureKey: string | null;
  measureCaption?: string;
  isFirstMeasure: boolean;
  /**
   * True for group nodes kept on the axis only to carry the expand/collapse
   * control while totals are turned off (`totalsPosition: 'none'`), and for
   * the header clones of `totalsPosition: 'after'`. Their cells must render
   * empty — the aggregate they'd show IS the subtotal.
   */
  totalsHidden?: boolean;
  /** Undecorated member caption, before the ` — <measure>` suffix. */
  memberCaption?: string;
}

/** The extended matrix returned by computeMatrix (superset of PivotMatrix). */
export interface ComputedMatrix {
  rowLeaves: AxisLeaf[];
  colLeaves: AxisLeaf[];
  rowRoot: TreeNode;
  colRoot: TreeNode;
  cells: Map<string, MatrixCell & { error?: string | null }>;
  sourceRows: DataRow[];
  measures: EnrichedMeasure[];
  sort: SortConfig | null;
  layout: { totalsRowsPosition: string; totalsColumnsPosition: string; alternateRows: boolean };
  measuresOnRows: boolean;
  measuresOnColumns: boolean;
}

/**
 * Expands a list of axis nodes with per-measure copies. Each produced leaf
 * keeps `.nodeKey` pointing at the original tree node (needed for
 * expand/collapse toggling) while `.key` becomes an axis-unique composite
 * that matches the cell storage key.
 */
const buildAxisLeaves = (
  visible: TreeNode[],
  measures: EnrichedMeasure[],
  hasMeasures: boolean,
  totalsOff = false
): AxisLeaf[] => {
  const hidesTotals = (leaf: TreeNode): boolean =>
    !!leaf.isGroupHeader ||
    (totalsOff && !!leaf.children && leaf.children.length > 0);
  if (!hasMeasures || !measures || measures.length === 0) {
    return visible.map((leaf) => ({
      ...leaf,
      nodeKey: leaf.key,
      measureKey: null,
      isFirstMeasure: true,
      totalsHidden: hidesTotals(leaf),
      memberCaption: leaf.caption,
    }));
  }
  const out: AxisLeaf[] = [];
  visible.forEach((leaf) => {
    measures.forEach((measure, mIdx) => {
      const measureKey = `${measure.uniqueName}:${measure.aggregation}`;
      const measureCaption = measure.caption || measure.uniqueName;
      const isGrandTotalLeaf = leaf.isTotal && leaf.depth === -1;
      const totalCaption =
        isGrandTotalLeaf && measure.grandTotalCaption
          ? measure.grandTotalCaption
          : measureCaption;
      out.push({
        ...leaf,
        nodeKey: leaf.key,
        key: `${leaf.key}||M:${measureKey}`,
        caption: leaf.isTotal
          ? totalCaption
          : `${leaf.caption} — ${measureCaption}`,
        measureKey,
        measureCaption,
        isFirstMeasure: mIdx === 0,
        totalsHidden: hidesTotals(leaf),
        memberCaption: leaf.caption,
      });
    });
  });
  return out;
};

const intersectIndexes = (a: number[], b: number[]): number[] => {
  if (a.length === 0 || b.length === 0) return [];
  const [small, large] = a.length < b.length ? [a, b] : [b, a];
  const set = new Set(small);
  const out: number[] = [];
  for (const idx of large) {
    if (set.has(idx)) out.push(idx);
  }
  return out;
};

/**
 * Evaluates a calculated-field formula for a specific cell.
 * The formula may reference any measure with the syntax:
 *   sum("fieldName"), count("fieldName"), avg("fieldName"), min("fieldName"),
 *   max("fieldName"), distinctcount("fieldName")
 *
 * Bare field identifiers (without an aggregator wrapper — e.g. the chips
 * inserted by the Calculated Field dialog) are treated as `sum(fieldName)`
 * so the formula has data to compute against at this cell's intersection.
 *
 * Each call is replaced by the aggregated value already computed for the
 * intersecting row/col bucket, so the formula runs after all regular measures.
 *
 * @param {string} formula
 * @param {Function} resolver (aggregation, uniqueName) => number | null
 * @param {string[]} fieldNames known data-field uniqueNames used to detect bare references
 */
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const evalFormula = (formula: string, resolver: (agg: string, fieldName: string) => number | null, fieldNames: string[] = []): { value: number | null; error: string | null } => {
  try {
    const resolveValue = (agg: string, fieldName: string): string => {
      const val = resolver(agg, fieldName);
      return val === null || val === undefined ? '0' : String(Number(val));
    };
    let patched = formula.replace(
      /\b(sum|count|avg|min|max|distinctcount|runningsum|running)\s*\(\s*"([^"]+)"\s*\)/gi,
      (_, agg, fieldName) => {
        const aggLower = agg.toLowerCase();
        const normalized = aggLower === 'running' ? 'runningsum' : aggLower;
        return resolveValue(normalized, fieldName);
      }
    );
    // Bare field references (chips) → default to sum(field). Longer names
    // matched first so "revenueGross" doesn't get shortened to "revenue".
    const sorted = [...fieldNames].sort((a, b) => b.length - a.length);
    for (const name of sorted) {
      const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'g');
      patched = patched.replace(re, () => resolveValue('sum', name));
    }
    // Safe AST evaluation — `^`, AND/OR keywords and IF/ABS/MIN/MAX are part
    // of the evaluator grammar; no dynamic code generation involved.
    const result = evaluateFormulaExpression(patched);
    if (typeof result === 'number' && Number.isFinite(result)) {
      return { value: result, error: null };
    }
    if (typeof result === 'number' && !Number.isFinite(result)) {
      if (Number.isNaN(result)) {
        return { value: null, error: 'Invalid numeric result (NaN)' };
      }
      return { value: null, error: 'Division by zero' };
    }
    return { value: null, error: null };
  } catch (ex) {
    console.error('Error evaluating formula:', ex);
    return { value: null, error: (ex as Error)?.message || String(ex) };
  }
};

interface ComputeMatrixOptions {
  rows: DataRow[];
  rowRoot: TreeNode;
  colRoot: TreeNode;
  rowFields?: RichSliceField[];
  colFields?: RichSliceField[];
  measures: EnrichedMeasure[];
  calculatedFields?: CalculatedField[];
  hasMeasuresOnColumns: boolean;
  hasMeasuresOnRows?: boolean;
  sort?: SortConfig | null;
  layout?: LayoutOptions;
  metadata?: MetadataRow;
  locale?: string;
}

export const computeMatrix = ({
  rows,
  rowRoot,
  colRoot,
  rowFields = [],
  colFields = [],
  measures,
  calculatedFields = [],
  hasMeasuresOnColumns,
  hasMeasuresOnRows = false,
  sort = null,
  layout = {},
  metadata = {},
  locale,
}: ComputeMatrixOptions): ComputedMatrix => {
  const rowsTotalsPosition = layout.totalsRowsPosition || 'before';
  const colsTotalsPosition = layout.totalsColumnsPosition || 'before';

  const regularMeasures = (measures || []).filter(
    (m) => m.aggregation !== 'formula'
  );
  const calcMeasures = (measures || []).filter(
    (m) => m.aggregation === 'formula'
  );
  // Merge calc fields — calculatedFields (from the engine) carry the actual
  // `formula` string, while slice-side calcMeasures only carry uniqueName +
  // aggregation. calculatedFields MUST win so the resolver sees the formula.
  const allCalcFields = [
    ...(calculatedFields || []),
    ...calcMeasures.filter(
      (m) =>
        !(calculatedFields || []).some((cf) => cf.uniqueName === m.uniqueName)
    ),
  ];
  // Calc-field measures must share axis expansion with regular measures so
  // they get real column/row leaves and cell keys that match the view.
  // Preserve the slice-defined order — FieldList's measures list is the
  // source of truth for display order.
  const effectiveMeasures = measures || [];
  const measuresOnCols = hasMeasuresOnColumns && effectiveMeasures.length > 0;
  const measuresOnRows = hasMeasuresOnRows && effectiveMeasures.length > 0;

  // Expand column axis with measures (if requested).
  const colVisible = flattenTreeCompact(colRoot, {
    includeRoot: true,
    totalsPosition: colsTotalsPosition,
  });
  const colLeaves = buildAxisLeaves(
    colVisible,
    effectiveMeasures,
    measuresOnCols
  );

  // Initial row traversal — unsorted, 'before' orientation — used to compute
  // cells. The final visible order is produced after applying sort so the
  // comparator can read the computed values.
  const rowTraversalSrc = flattenTreeCompact(rowRoot, {
    includeRoot: true,
    totalsPosition: 'before',
  });
  const rowTraversal = buildAxisLeaves(
    rowTraversalSrc,
    effectiveMeasures,
    measuresOnRows
  );

  const cells = new Map<string, MatrixCell & { error?: string | null }>();

  // Pre-compute ratio denominators (grand total across the whole dataset)
  // for every measure using the 'ratioTotal' aggregation. For numeric
  // fields the denominator is the sum of the field; for non-numeric
  // fields it's the total record count.
  const ratioDenominators = new Map<string, number>();
  effectiveMeasures.forEach((m) => {
    if (m.aggregation !== 'ratioTotal') return;
    const fieldName = m.uniqueName;
    const isNumeric = metadata?.[fieldName]?.type === 'number';
    let den = 0;
    if (isNumeric) {
      for (const r of rows) {
        const v = Number(r?.[fieldName]);
        if (Number.isFinite(v)) den += v;
      }
    } else {
      den = rows.length;
    }
    ratioDenominators.set(`${m.uniqueName}:${m.aggregation}`, den);
  });

  rowTraversal.forEach((rowLeaf) => {
    colLeaves.forEach((colLeaf) => {
      const intersection = intersectIndexes(
        rowLeaf.rowIndexes,
        colLeaf.rowIndexes
      );

      // Which measure drives this cell?
      //   - measures on columns : colLeaf.measureKey wins
      //   - measures on rows    : rowLeaf.measureKey wins
      //   - neither             : first measure (legacy single-measure mode)
      const measureKey =
        rowLeaf.measureKey ||
        colLeaf.measureKey ||
        (effectiveMeasures[0]
          ? `${effectiveMeasures[0].uniqueName}:${effectiveMeasures[0].aggregation}`
          : null);
      const measure = measureKey
        ? effectiveMeasures.find(
            (m) => `${m.uniqueName}:${m.aggregation}` === measureKey
          ) || effectiveMeasures[0]
        : null;
      if (!measure) return;

      // Calc fields are filled by the dedicated second pass below.
      if (measure.aggregation === 'formula') {
        cells.set(`${rowLeaf.key}::${colLeaf.key}`, {
          rowKey: rowLeaf.key,
          colKey: colLeaf.key,
          measureKey,
          value: null,
          formattedValue: '',
        });
        return;
      }

      let value = null;
      if (
        measure.aggregation === 'ratioTotal' ||
        measure.aggregation === 'currentRatio'
      ) {
        const fieldName = measure.uniqueName;
        const isNumeric = metadata?.[fieldName]?.type === 'number';
        let num = 0;
        if (isNumeric) {
          for (const idx of intersection) {
            const v = Number(rows[idx]?.[fieldName]);
            if (Number.isFinite(v)) num += v;
          }
        } else {
          num = intersection.length;
        }
        if (measure.aggregation === 'currentRatio') {
          // Denominator = the current row-context total, i.e. the
          // measure aggregated over every record that belongs to this
          // row leaf, ignoring the column split. Produces per-row
          // normalized ratios: e.g. Sara row with 10 missed / 90
          // answered yields 0.1 / 0.9.
          let den = 0;
          if (isNumeric) {
            for (const idx of rowLeaf.rowIndexes) {
              const v = Number(rows[idx]?.[fieldName]);
              if (Number.isFinite(v)) den += v;
            }
          } else {
            den = (rowLeaf.rowIndexes || []).length;
          }
          value = den > 0 ? num / den : 0;
        } else {
          const den = (measureKey ? ratioDenominators.get(measureKey) : undefined) || 0;
          value = den > 0 ? num / den : 0;
        }
      } else if (intersection.length > 0) {
        if (measure.aggregation === 'count') {
          value = intersection.length;
        } else if (measure.aggregation === 'distinctcount') {
          const set = new Set();
          intersection.forEach((idx) => {
            set.add(rows[idx]?.[measure.uniqueName]);
          });
          value = set.size;
        } else {
          const values = intersection
            .map((idx) => Number(rows[idx]?.[measure.uniqueName]))
            .filter((v) => Number.isFinite(v));
          value = applyAggregation(measure.aggregation, values);
        }
      } else if (
        measure.aggregation === 'count' ||
        measure.aggregation === 'distinctcount'
      ) {
        value = 0;
      }

      cells.set(`${rowLeaf.key}::${colLeaf.key}`, {
        rowKey: rowLeaf.key,
        colKey: colLeaf.key,
        measureKey,
        value,
        formattedValue: formatMeasureValue(value, measure.aggregation, locale),
      });
    });
  });

  // Second pass: evaluate calculated fields on the SAME expanded axis leaves
  // used by the first pass, so cells end up under the standard
  // `${rowLeaf.key}::${colLeaf.key}` key that the view reads.
  if (calcMeasures.length > 0) {
    // runningSum state per (colLeaf × field). Rows are walked in display
    // order; total rows read the cumulative value without advancing it.
    const runningTotals = new Map<string, number>();
    const runningCellCache = new Map<string, number>();
    // Harvest every field present anywhere in the dataset so bare field
    // references in a formula (inserted as chips, no aggregator) can be
    // resolved. Sampling a handful of rows guards against sparse first rows.
    const fieldNameSet = new Set<string>();
    const sampleCount = Math.min(rows.length, 20);
    for (let i = 0; i < sampleCount; i++) {
      Object.keys(rows[i] || {}).forEach((k) => fieldNameSet.add(k));
    }
    const fieldNames = Array.from(fieldNameSet);

    rowTraversal.forEach((rowLeaf) => {
      colLeaves.forEach((colLeaf) => {
        const measureKey =
          rowLeaf.measureKey ||
          colLeaf.measureKey ||
          (effectiveMeasures[0]
            ? `${effectiveMeasures[0].uniqueName}:${effectiveMeasures[0].aggregation}`
            : null);
        const measure = measureKey
          ? effectiveMeasures.find(
              (m) => `${m.uniqueName}:${m.aggregation}` === measureKey
            )
          : null;
        if (!measure || measure.aggregation !== 'formula') return;

        const cf = allCalcFields.find(
          (c) => c.uniqueName === measure.uniqueName
        );
        if (!cf || !cf.formula) return;

        const resolver = (agg: string, fieldName: string): number | null => {
          if (agg === 'runningsum') {
            const cellKey = `${rowLeaf.key}::${colLeaf.key}::${fieldName}`;
            if (runningCellCache.has(cellKey))
              return runningCellCache.get(cellKey) ?? null;
            const accKey = `${colLeaf.key}::${fieldName}`;
            if (rowLeaf.isTotal) {
              const v = runningTotals.get(accKey) || 0;
              runningCellCache.set(cellKey, v);
              return v;
            }
            const inter = intersectIndexes(
              rowLeaf.rowIndexes,
              colLeaf.rowIndexes
            );
            const nums = inter
              .map((i) => Number(rows[i]?.[fieldName]))
              .filter((v) => Number.isFinite(v));
            const cur = applyAggregation('sum', nums) || 0;
            const next = (runningTotals.get(accKey) || 0) + cur;
            runningTotals.set(accKey, next);
            runningCellCache.set(cellKey, next);
            return next;
          }
          const inter = intersectIndexes(
            rowLeaf.rowIndexes,
            colLeaf.rowIndexes
          );
          if (inter.length === 0) {
            return agg === 'count' || agg === 'distinctcount' ? 0 : null;
          }
          if (agg === 'count') return inter.length;
          if (agg === 'distinctcount') {
            return new Set(inter.map((i) => rows[i]?.[fieldName])).size;
          }
          const nums = inter
            .map((i) => Number(rows[i]?.[fieldName]))
            .filter((v) => Number.isFinite(v));
          return applyAggregation(agg, nums);
        };

        const { value, error } = evalFormula(
          cf.formula,
          resolver,
          fieldNames
        );
        cells.set(`${rowLeaf.key}::${colLeaf.key}`, {
          rowKey: rowLeaf.key,
          colKey: colLeaf.key,
          measureKey,
          value,
          formattedValue: formatMeasureValue(value, 'formula', locale),
          error: error || null,
        });
      });
    });
  }

  // Per-dimension measure-based sort. Each row/column field may carry a
  // `fieldSort` of shape { mode: 'measure', measure: { uniqueName,
  // aggregation }, direction }. We walk each tree and sort a node's
  // children using the cell value at the grand-total of the opposite axis.
  const applyDimensionSort = (root: TreeNode, fields: RichSliceField[], axis: 'row' | 'col'): void => {
    const fieldByDepth = (fields || []).filter(
      (f) => f && f.uniqueName !== 'Measures'
    );
    if (fieldByDepth.length === 0) return;
    const hasAnyMeasureSort = fieldByDepth.some(
      (f) =>
        f.fieldSort && f.fieldSort.mode === 'measure' && f.fieldSort.measure
    );
    if (!hasAnyMeasureSort) return;

    const oppositeRootKey = axis === 'row' ? colRoot.key : rowRoot.key;
    const oppositeMeasuresOn = axis === 'row' ? measuresOnCols : measuresOnRows;
    const sameAxisMeasuresOn = axis === 'row' ? measuresOnRows : measuresOnCols;

    const walk = (node: TreeNode, depth: number): void => {
      const field = fieldByDepth[depth];
      const fs = field?.fieldSort;
      if (
        node.children &&
        node.children.length > 0 &&
        fs &&
        fs.mode === 'measure' &&
        fs.measure?.uniqueName
      ) {
        const mAgg = fs.measure.aggregation || 'sum';
        const measureKey = `${fs.measure.uniqueName}:${mAgg}`;
        const oppositeKey = oppositeMeasuresOn
          ? `${oppositeRootKey}||M:${measureKey}`
          : oppositeRootKey;
        const dir = fs.direction === 'asc' ? 1 : -1;
        const readValue = (child: TreeNode): number | null => {
          const sameKey = sameAxisMeasuresOn
            ? `${child.key}||M:${measureKey}`
            : child.key;
          const cellKey =
            axis === 'row'
              ? `${sameKey}::${oppositeKey}`
              : `${oppositeKey}::${sameKey}`;
          const v = cells.get(cellKey)?.value;
          return Number.isFinite(v) ? (v as number) : null;
        };
        node.children.sort((a, b) => {
          const va = readValue(a);
          const vb = readValue(b);
          if (va !== null && vb !== null) return (va - vb) * dir;
          if (va !== null) return -1 * dir;
          if (vb !== null) return 1 * dir;
          return (
            String(a.caption || '').localeCompare(
              String(b.caption || ''),
              locale || undefined,
              { numeric: true }
            ) * dir
          );
        });
      }
      if (node.children) node.children.forEach((c) => walk(c, depth + 1));
    };
    walk(root, 0);
  };
  applyDimensionSort(rowRoot, rowFields, 'row');
  applyDimensionSort(colRoot, colFields, 'col');

  // Row-driven sort: reorder column-tree siblings using the values in a
  // single row. Mirror of the column-driven sort below — the comparator
  // reads cells at `${sort.rowKey}::${child.key}` and, when measures live
  // on the column axis, picks the user-selected measure variant (falling
  // back to the first effective measure for legacy slices).
  if (sort && sort.rowKey) {
    const dir = sort.rowDirection === 'asc' ? 1 : -1;
    const sortMeasure = sort.rowMeasure;
    const measureForKey =
      measuresOnCols &&
      sortMeasure &&
      effectiveMeasures.find(
        (m) =>
          m.uniqueName === sortMeasure.uniqueName &&
          m.aggregation === sortMeasure.aggregation
      );
    const colKeySuffix = measuresOnCols
      ? measureForKey
        ? `||M:${measureForKey.uniqueName}:${measureForKey.aggregation}`
        : effectiveMeasures[0]
          ? `||M:${effectiveMeasures[0].uniqueName}:${effectiveMeasures[0].aggregation}`
          : ''
      : '';
    sortTreeSiblings(colRoot, (a, b) => {
      if (a.isTotal && !b.isTotal) return 0;
      if (!a.isTotal && b.isTotal) return 0;
      const va = cells.get(`${sort.rowKey}::${a.key}${colKeySuffix}`)?.value;
      const vb = cells.get(`${sort.rowKey}::${b.key}${colKeySuffix}`)?.value;
      const aNum = Number.isFinite(va) ? (va as number) : null;
      const bNum = Number.isFinite(vb) ? (vb as number) : null;
      if (aNum !== null && bNum !== null) return (aNum - bNum) * dir;
      if (aNum !== null) return -1 * dir;
      if (bNum !== null) return 1 * dir;
      return (
        String(a.caption || '').localeCompare(
          String(b.caption || ''),
          locale || undefined,
          { numeric: true }
        ) * dir
      );
    });
  }

  // When sort is active, reorder row-tree siblings at every depth. The
  // comparator reads the cell value on the sorted column; if measures live
  // on rows, we probe the cell key of the FIRST measure variant of the node.
  if (sort && sort.colKey) {
    const dir = sort.colDirection === 'asc' ? 1 : -1;
    // When measures live on rows the column key alone doesn't pin a single
    // value per row-tree node — every node has one cell per measure variant.
    // Prefer the measure picked by the user (sort.colMeasure); fall back to
    // the first effective measure so legacy slices keep their previous order.
    const sortMeasure = sort.colMeasure;
    const measureForKey =
      measuresOnRows &&
      sortMeasure &&
      effectiveMeasures.find(
        (m) =>
          m.uniqueName === sortMeasure.uniqueName &&
          m.aggregation === sortMeasure.aggregation
      );
    const rowKeySuffix = measuresOnRows
      ? measureForKey
        ? `||M:${measureForKey.uniqueName}:${measureForKey.aggregation}`
        : effectiveMeasures[0]
          ? `||M:${effectiveMeasures[0].uniqueName}:${effectiveMeasures[0].aggregation}`
          : ''
      : '';
    sortTreeSiblings(rowRoot, (a, b) => {
      if (a.isTotal && !b.isTotal) return 0;
      if (!a.isTotal && b.isTotal) return 0;
      const va = cells.get(`${a.key}${rowKeySuffix}::${sort.colKey}`)?.value;
      const vb = cells.get(`${b.key}${rowKeySuffix}::${sort.colKey}`)?.value;
      const aNum = Number.isFinite(va) ? (va as number) : null;
      const bNum = Number.isFinite(vb) ? (vb as number) : null;
      if (aNum !== null && bNum !== null) return (aNum - bNum) * dir;
      if (aNum !== null) return -1 * dir;
      if (bNum !== null) return 1 * dir;
      return (
        String(a.caption || '').localeCompare(
          String(b.caption || ''),
          locale || undefined,
          { numeric: true }
        ) * dir
      );
    });
  }

  // `emitGroupHeaders` only on the row axis: the column axis renders parents
  // in its own header band, so a header clone there would just duplicate
  // columns.
  const rowVisibleSrc = flattenTreeCompact(rowRoot, {
    includeRoot: true,
    totalsPosition: rowsTotalsPosition,
    emitGroupHeaders: true,
  });
  const rowLeaves = buildAxisLeaves(
    rowVisibleSrc,
    effectiveMeasures,
    measuresOnRows,
    rowsTotalsPosition === 'none'
  );

  // Re-flatten column leaves after per-dimension sort may have reordered
  // colRoot's siblings (the initial flatten happened before cell values
  // were known).
  const colVisibleFinal = flattenTreeCompact(colRoot, {
    includeRoot: true,
    totalsPosition: colsTotalsPosition,
  });
  const colLeavesFinal = buildAxisLeaves(
    colVisibleFinal,
    effectiveMeasures,
    measuresOnCols,
    colsTotalsPosition === 'none'
  );

  // effectiveMeasures already includes calcMeasures; append only standalone
  // calculated fields that aren't in the slice so the engine can still
  // surface them in report metadata without duplicating axis leaves.
  const standaloneCalc = allCalcFields.filter(
    (cf) => !calcMeasures.some((m) => m.uniqueName === cf.uniqueName)
  );
  const allMeasures: EnrichedMeasure[] = [
    ...effectiveMeasures,
    ...standaloneCalc.map((cf): EnrichedMeasure => ({
      uniqueName: cf.uniqueName,
      caption: cf.caption,
      aggregation: 'formula',
    })),
  ];

  return {
    rowLeaves,
    colLeaves: colLeavesFinal,
    rowRoot,
    colRoot,
    cells,
    sourceRows: rows,
    measures: allMeasures,
    sort,
    layout: {
      totalsRowsPosition: rowsTotalsPosition,
      totalsColumnsPosition: colsTotalsPosition,
      alternateRows: !!layout.alternateRows,
    },
    measuresOnRows,
    measuresOnColumns: measuresOnCols,
  };
};

