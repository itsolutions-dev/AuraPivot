/**
 * Produces the final pivot matrix by intersecting every visible row node with
 * every visible column node and then evaluating every measure.
 *
 * The special 'Measures' field may live either on the column axis or on the
 * row axis. When it appears on an axis, every visible leaf on that axis is
 * expanded into N leaves — one per measure — each carrying its `measureKey`
 * so the matrix knows which measure value to compute for the intersecting cell.
 */

import {
  applyAggregation,
  formatMeasureValue,
} from '../aggregation/Aggregator';
import { flattenTreeCompact, sortTreeSiblings } from '../slice/TreeBuilder';
import { compileFormulaExpression } from './FormulaEvaluator';
import type { FormulaEvalOptions } from './FormulaEvaluator';
import type { DataRow, TreeNode, MatrixCell, MetadataRow } from '../types';
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

interface SortMeasure {
  uniqueName: string;
  aggregation: string;
}

/** Sort config for column-driven row sort or row-driven column sort. */
interface SortConfig {
  rowKey?: string;
  rowDirection?: 'asc' | 'desc';
  rowMeasure?: SortMeasure;
  colKey?: string;
  colDirection?: 'asc' | 'desc';
  colMeasure?: SortMeasure;
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
  layout: {
    totalsRowsPosition: string;
    totalsColumnsPosition: string;
    alternateRows: boolean;
  };
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
  totalsOff = false,
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

/**
 * Shared sibling comparator: numeric values first (missing values last in
 * either direction), caption fallback. Used by every axis sort below.
 */
const compareNodes = (
  va: number | null,
  vb: number | null,
  a: TreeNode,
  b: TreeNode,
  dir: number,
  locale: string | undefined,
): number => {
  if (va !== null && vb !== null) return (va - vb) * dir;
  if (va !== null) return -1 * dir;
  if (vb !== null) return 1 * dir;
  return (
    String(a.caption || '').localeCompare(
      String(b.caption || ''),
      locale || undefined,
      { numeric: true },
    ) * dir
  );
};

const measureKeyOf = (m: { uniqueName: string; aggregation: string }): string =>
  `${m.uniqueName}:${m.aggregation}`;

/** Sum of `field` over `indexes` (every row when omitted), skipping non-numbers. */
const sumField = (
  rows: DataRow[],
  field: string,
  indexes?: number[],
): number => {
  let total = 0;
  const add = (row: DataRow | undefined) => {
    const v = Number(row?.[field]);
    if (Number.isFinite(v)) total += v;
  };
  if (indexes) indexes.forEach((i) => add(rows[i]));
  else rows.forEach(add);
  return total;
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

const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const AGGREGATOR_CALL =
  /\b(sum|count|avg|min|max|distinctcount|runningsum|running)\s*\(\s*"([^"]+)"\s*\)/gi;

const NUMERIC_NAME = /^\s*(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*$/i;
const KEYWORDS = new Set(['and', 'or', 'not']);
const FUNCTION_NAMES = new Set([
  'if',
  'abs',
  'min',
  'max',
  'sum',
  'count',
  'avg',
  'distinctcount',
  'runningsum',
  'running',
]);

/** Stands in for one measure reference inside a compiled formula. */
const REF_PREFIX = '__aura_ref_';
const REF_PATTERN = new RegExp(`${REF_PREFIX}(\\d+)`, 'g');

interface FormulaRef {
  agg: string;
  field: string;
  /** The reference as written in the formula, for error messages. */
  source: string;
}

interface CompiledFormula {
  formula: string;
  refs: FormulaRef[];
  evaluate: ((opts: FormulaEvalOptions) => unknown) | null;
  /** Syntax error, reported on every cell of the field. */
  error: string | null;
  /** Whether a failure of this formula has been logged already. */
  logged: boolean;
}

/**
 * Compiles a calculated-field formula once per matrix. The formula may
 * reference measures as `sum("field")`, `count(…)`, `avg(…)`, `min(…)`,
 * `max(…)`, `distinctcount(…)`, `runningsum(…)` (alias `running`), or as a
 * bare field name — a chip inserted by the Calculated Field dialog — which
 * means `sum(field)`. Each reference becomes a placeholder identifier that
 * the evaluator resolves per cell, so the per-cell work is one AST walk.
 *
 * @param fieldNames known data-field uniqueNames used to detect bare references
 */
const compileFormula = (
  formula: string,
  fieldNames: string[],
): CompiledFormula => {
  const refs: FormulaRef[] = [];
  const placeholder = (agg: string, field: string, source: string): string => {
    refs.push({ agg, field, source });
    return `${REF_PREFIX}${refs.length - 1}`;
  };
  let expression = formula.replace(AGGREGATOR_CALL, (source, agg, field) => {
    const aggLower = agg.toLowerCase();
    return placeholder(
      aggLower === 'running' ? 'runningsum' : aggLower,
      field,
      source,
    );
  });
  // Longer names first so "revenueGross" doesn't get shortened to "revenue".
  const sorted = [...fieldNames].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    const lower = name.toLowerCase();
    // A dataset key that is also formula syntax must not change what the
    // formula means: skip empty and numeric names and the AND/OR/NOT
    // keywords, and leave a function name alone where it is being called.
    if (!name.trim() || NUMERIC_NAME.test(name) || KEYWORDS.has(lower)) {
      continue;
    }
    const notCalled = FUNCTION_NAMES.has(lower) ? '(?!\\s*\\()' : '';
    const re = new RegExp(`\\b${escapeRegExp(name)}\\b${notCalled}`, 'g');
    expression = expression.replace(re, () => placeholder('sum', name, name));
  }
  // Error messages quote tokens; show the user what they wrote, not the
  // placeholder it compiled to.
  const describe = (message: string): string =>
    message.replace(REF_PATTERN, (_, i) => refs[Number(i)].source);
  try {
    return {
      formula,
      refs,
      evaluate: compileFormulaExpression(expression),
      error: null,
      logged: false,
    };
  } catch (ex) {
    return {
      formula,
      refs,
      evaluate: null,
      error: describe((ex as Error)?.message || String(ex)),
      logged: false,
    };
  }
};

const reportFormulaError = (compiled: CompiledFormula, error: string): void => {
  if (compiled.logged) return;
  compiled.logged = true;
  console.error(`Error evaluating formula "${compiled.formula}":`, error);
};

/**
 * Evaluates a compiled formula for one cell. Every reference is resolved
 * before evaluation, in formula order — running sums advance on each read,
 * so resolution must not depend on which IF branch is taken.
 */
const evalFormula = (
  compiled: CompiledFormula,
  resolver: (agg: string, fieldName: string) => number | null,
): { value: number | null; error: string | null } => {
  if (!compiled.evaluate) {
    reportFormulaError(compiled, compiled.error as string);
    return { value: null, error: compiled.error };
  }
  const values = compiled.refs.map(({ agg, field }) => {
    const val = resolver(agg, field);
    return val === null || val === undefined ? 0 : Number(val);
  });
  try {
    const result = compiled.evaluate({
      resolveIdentifier: (name) => {
        if (name.startsWith(REF_PREFIX)) {
          const value = values[Number(name.slice(REF_PREFIX.length))];
          if (value !== undefined) return value;
        }
        throw new Error(`Unknown identifier '${name}' in formula`);
      },
    });
    if (typeof result === 'number' && Number.isFinite(result)) {
      return { value: result, error: null };
    }
    if (typeof result === 'number') {
      return {
        value: null,
        error: Number.isNaN(result)
          ? 'Invalid numeric result (NaN)'
          : 'Division by zero',
      };
    }
    return { value: null, error: null };
  } catch (ex) {
    const error = (ex as Error)?.message || String(ex);
    reportFormulaError(compiled, error);
    return { value: null, error };
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

  const calcMeasures = (measures || []).filter(
    (m) => m.aggregation === 'formula',
  );
  // Merge calc fields — calculatedFields (from the engine) carry the actual
  // `formula` string, while slice-side calcMeasures only carry uniqueName +
  // aggregation. calculatedFields MUST win so the resolver sees the formula.
  const allCalcFields = [
    ...(calculatedFields || []),
    ...calcMeasures.filter(
      (m) =>
        !(calculatedFields || []).some((cf) => cf.uniqueName === m.uniqueName),
    ),
  ];
  // Calc-field measures must share axis expansion with regular measures so
  // they get real column/row leaves and cell keys that match the view.
  // Preserve the slice-defined order — FieldList's measures list is the
  // source of truth for display order.
  const effectiveMeasures = measures || [];
  const measuresOnCols = hasMeasuresOnColumns && effectiveMeasures.length > 0;
  const measuresOnRows = hasMeasuresOnRows && effectiveMeasures.length > 0;

  const measureByKey = new Map<string, EnrichedMeasure>();
  effectiveMeasures.forEach((m) => {
    if (!measureByKey.has(measureKeyOf(m)))
      measureByKey.set(measureKeyOf(m), m);
  });
  const defaultMeasureKey = effectiveMeasures[0]
    ? measureKeyOf(effectiveMeasures[0])
    : null;
  // Which measure drives a cell: the axis that carries measures wins; with
  // measures on neither axis it is the first one (single-measure mode).
  const cellMeasure = (
    rowLeaf: AxisLeaf,
    colLeaf: AxisLeaf,
  ): { measureKey: string | null; measure: EnrichedMeasure | undefined } => {
    const measureKey =
      rowLeaf.measureKey || colLeaf.measureKey || defaultMeasureKey;
    return {
      measureKey,
      measure: measureKey ? measureByKey.get(measureKey) : undefined,
    };
  };

  // Ratio aggregations divide a sum for numeric fields, a record count
  // otherwise; `indexes` omitted means the whole dataset.
  const ratioPart = (field: string, indexes?: number[]): number =>
    metadata?.[field]?.type === 'number'
      ? sumField(rows, field, indexes)
      : (indexes ?? rows).length;

  // Expand column axis with measures (if requested).
  const colVisible = flattenTreeCompact(colRoot, {
    includeRoot: true,
    totalsPosition: colsTotalsPosition,
  });
  const colLeaves = buildAxisLeaves(
    colVisible,
    effectiveMeasures,
    measuresOnCols,
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
    measuresOnRows,
  );

  const cells = new Map<string, MatrixCell & { error?: string | null }>();

  // 'ratioTotal' divides by the grand total across the whole dataset.
  const ratioDenominators = new Map<string, number>();
  effectiveMeasures.forEach((m) => {
    if (m.aggregation === 'ratioTotal') {
      ratioDenominators.set(measureKeyOf(m), ratioPart(m.uniqueName));
    }
  });

  rowTraversal.forEach((rowLeaf) => {
    colLeaves.forEach((colLeaf) => {
      const intersection = intersectIndexes(
        rowLeaf.rowIndexes,
        colLeaf.rowIndexes,
      );

      const { measureKey, measure } = cellMeasure(rowLeaf, colLeaf);
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
        const num = ratioPart(measure.uniqueName, intersection);
        // 'currentRatio' divides by the row-context total — the measure over
        // every record of this row leaf, ignoring the column split — so each
        // row is normalized on its own: 10 missed / 90 answered → 0.1 / 0.9.
        const den =
          measure.aggregation === 'currentRatio'
            ? ratioPart(measure.uniqueName, rowLeaf.rowIndexes)
            : ratioDenominators.get(measureKey as string) || 0;
        value = den > 0 ? num / den : 0;
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

    const calcByName = new Map<string, CalculatedField | EnrichedMeasure>();
    allCalcFields.forEach((c) => {
      if (!calcByName.has(c.uniqueName)) calcByName.set(c.uniqueName, c);
    });
    const compiledByName = new Map<string, CompiledFormula>();
    const compiledFor = (name: string, formula: string): CompiledFormula => {
      let compiled = compiledByName.get(name);
      if (!compiled) {
        compiled = compileFormula(formula, fieldNames);
        compiledByName.set(name, compiled);
      }
      return compiled;
    };

    rowTraversal.forEach((rowLeaf) => {
      colLeaves.forEach((colLeaf) => {
        const { measureKey, measure } = cellMeasure(rowLeaf, colLeaf);
        if (!measure || measure.aggregation !== 'formula') return;

        const cf = calcByName.get(measure.uniqueName);
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
              colLeaf.rowIndexes,
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
            colLeaf.rowIndexes,
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
          compiledFor(cf.uniqueName, cf.formula),
          resolver,
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
  const applyDimensionSort = (
    root: TreeNode,
    fields: RichSliceField[],
    axis: 'row' | 'col',
  ): void => {
    const fieldByDepth = (fields || []).filter(
      (f) => f && f.uniqueName !== 'Measures',
    );
    if (fieldByDepth.length === 0) return;
    const hasAnyMeasureSort = fieldByDepth.some(
      (f) =>
        f.fieldSort && f.fieldSort.mode === 'measure' && f.fieldSort.measure,
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
        node.children.sort((a, b) =>
          compareNodes(readValue(a), readValue(b), a, b, dir, locale),
        );
      }
      if (node.children) node.children.forEach((c) => walk(c, depth + 1));
    };
    walk(root, 0);
  };
  applyDimensionSort(rowRoot, rowFields, 'row');
  applyDimensionSort(colRoot, colFields, 'col');

  // Axis sorts driven by a single opposite-axis key. The two directions are
  // exact mirrors: reorder one tree's siblings by the cell values sitting on
  // a fixed key of the other tree. When measures live on the tree being
  // sorted, the key alone doesn't pin one value per node — every node has a
  // cell per measure variant — so the key is suffixed with the measure the
  // user picked, falling back to the first effective measure so legacy
  // slices keep their previous order.
  const sortAxisByOppositeKey = (
    root: TreeNode,
    direction: string | undefined,
    sortMeasure: SortMeasure | undefined,
    measuresOnThisAxis: boolean,
    cellKey: (nodeKey: string) => string,
  ): void => {
    const dir = direction === 'asc' ? 1 : -1;
    const measureForKey =
      measuresOnThisAxis &&
      sortMeasure &&
      effectiveMeasures.find(
        (m) =>
          m.uniqueName === sortMeasure.uniqueName &&
          m.aggregation === sortMeasure.aggregation,
      );
    const pick = measureForKey || (measuresOnThisAxis && effectiveMeasures[0]);
    const suffix = pick ? `||M:${pick.uniqueName}:${pick.aggregation}` : '';
    const read = (node: TreeNode): number | null => {
      const v = cells.get(cellKey(`${node.key}${suffix}`))?.value;
      return Number.isFinite(v) ? (v as number) : null;
    };
    sortTreeSiblings(root, (a, b) => {
      if (!!a.isTotal !== !!b.isTotal) return 0;
      return compareNodes(read(a), read(b), a, b, dir, locale);
    });
  };

  if (sort && sort.rowKey) {
    sortAxisByOppositeKey(
      colRoot,
      sort.rowDirection,
      sort.rowMeasure,
      measuresOnCols,
      (k) => `${sort.rowKey}::${k}`,
    );
  }

  if (sort && sort.colKey) {
    sortAxisByOppositeKey(
      rowRoot,
      sort.colDirection,
      sort.colMeasure,
      measuresOnRows,
      (k) => `${k}::${sort.colKey}`,
    );
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
    rowsTotalsPosition === 'none',
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
    colsTotalsPosition === 'none',
  );

  // effectiveMeasures already includes calcMeasures; append only standalone
  // calculated fields that aren't in the slice so the engine can still
  // surface them in report metadata without duplicating axis leaves.
  const standaloneCalc = allCalcFields.filter(
    (cf) => !calcMeasures.some((m) => m.uniqueName === cf.uniqueName),
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
