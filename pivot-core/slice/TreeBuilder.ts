/**
 * Builds a hierarchical tree by grouping data rows over an ordered list of
 * SliceFields. Used for both the row tree and the column tree.
 *
 * The produced tree is flat-friendly: every node carries the array of row
 * indexes belonging to its subtree so the MatrixComputer can intersect a row
 * bucket with a column bucket in O(n).
 */

import type { DataRow, TreeNode, MetadataRow, SortDirection } from "../types";

/** Extended SliceField that may carry a richer per-dimension sort config. */
export interface RichSliceField {
  uniqueName: string;
  sort?: SortDirection;
  caption?: string;
  fieldSort?: {
    mode?: string;
    direction?: SortDirection;
    measure?: { uniqueName: string; aggregation?: string };
  };
}

const compare = (a: unknown, b: unknown, direction: string, locale: string | undefined): number => {
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  const isNumeric = typeof a === 'number' && typeof b === 'number';
  let result;
  if (isNumeric) {
    result = a - b;
  } else {
    result = String(a).localeCompare(String(b), locale || undefined, {
      numeric: true,
    });
  }
  return direction === 'desc' ? -result : result;
};

interface MakeNodeArgs {
  key: string;
  caption: string;
  value?: string | number | null;
  field?: string | null;
  depth: number;
  rowIndexes: number[];
  isTotal?: boolean;
}

const makeNode = ({
  key,
  caption,
  value,
  field,
  depth,
  rowIndexes,
  isTotal = false,
}: MakeNodeArgs): TreeNode => ({
  key,
  caption,
  value: value ?? null,
  field: field ?? undefined,
  depth,
  rowIndexes,
  isExpanded: true,
  isTotal,
  children: [],
});

const isMeasuresField = (field: RichSliceField): boolean => field && field.uniqueName === 'Measures';

export interface BuildTreeOptions {
  rows: DataRow[];
  fields: RichSliceField[];
  metadata: MetadataRow;
  expands?: { expandAll?: boolean; expandedMembers?: string[] };
  rootCaption?: string;
  formatValue?: (field: RichSliceField, value: string | number | null, metadata: MetadataRow) => string | undefined;
  locale?: string;
}

export const buildTree = ({
  rows,
  fields,
  metadata,
  expands = {},
  rootCaption = 'Total',
  formatValue,
  locale,
}: BuildTreeOptions): TreeNode => {
  const rootIndexes = rows.map((_: DataRow, idx: number) => idx);
  const root = makeNode({
    key: '__root__',
    caption: rootCaption,
    depth: -1,
    rowIndexes: rootIndexes,
    isTotal: true,
  });

  // `expandedMembers` is treated as an EXCEPTION set against the default
  // state dictated by `expandAll`: every key inside it flips its node.
  // This is what lets a user collapse a single branch while the rest of
  // the tree stays expanded (and vice-versa). The root participates too so
  // the chevron on the grand-total row can collapse/expand the whole tree.
  const toggledMembers = new Set(expands.expandedMembers || []);
  const defaultExpanded = expands.expandAll !== false;
  root.isExpanded = toggledMembers.has(root.key)
    ? !defaultExpanded
    : defaultExpanded;

  if (!fields || fields.length === 0) {
    return root;
  }

  const recurse = (node: TreeNode, remainingFields: RichSliceField[]): void => {
    if (remainingFields.length === 0) return;
    const [field, ...rest] = remainingFields;

    if (isMeasuresField(field)) {
      // The Measures node is a layout placeholder handled by the matrix
      // computer. We do not split data by it here.
      return;
    }

    // Group parent's rows by the current field value.
    const buckets = new Map<string, { value: string | number | null; indexes: number[] }>();
    node.rowIndexes.forEach((rowIdx: number) => {
      const row = rows[rowIdx];
      const rawValue = row?.[field.uniqueName];
      const bucketKey = rawValue === null || rawValue === undefined
        ? '__blank__'
        : String(rawValue);
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, { value: rawValue, indexes: [] });
      }
      buckets.get(bucketKey)!.indexes.push(rowIdx);
    });

    const bucketEntries = Array.from(buckets.entries());
    // `field.fieldSort` is the richer per-dimension sort config set from the
    // DimensionFilterDialog. When its `mode` is 'measure' the alphabetical
    // ordering here is irrelevant — the MatrixComputer re-sorts siblings
    // after cell values are known. Otherwise (mode 'alpha' or no config) we
    // sort alphabetically using the configured direction, falling back to
    // the legacy `field.sort` value.
    const fieldSort = field.fieldSort || null;
    const alphaDirection =
      (fieldSort && fieldSort.mode === 'alpha' && fieldSort.direction) ||
      field.sort ||
      'asc';
    bucketEntries.sort((a, b) =>
      compare(a[1].value, b[1].value, alphaDirection, locale)
    );

    bucketEntries.forEach(([bucketKey, bucket]) => {
      let caption;
      if (bucket.value === null || bucket.value === undefined) {
        caption = '(vuoto)';
      } else if (typeof formatValue === 'function') {
        const formatted = formatValue(field, bucket.value, metadata);
        caption = formatted === undefined ? String(bucket.value) : formatted;
      } else {
        caption = String(bucket.value);
      }
      const childKey = `${node.key}|${field.uniqueName}:${bucketKey}`;
      const child = makeNode({
        key: childKey,
        caption,
        value: bucket.value,
        field: field.uniqueName,
        depth: node.depth + 1,
        rowIndexes: bucket.indexes,
      });
      child.isExpanded = toggledMembers.has(childKey)
        ? !defaultExpanded
        : defaultExpanded;
      node.children.push(child);
      recurse(child, rest);
    });
  };

  recurse(root, fields);
  return root;
};

/**
 * Flattens a tree into an ordered list of visible rows (compact layout).
 * The root is omitted unless `includeRoot` is true.
 *
 * `totalsPosition` controls whether the parent/total node is emitted before
 * or after its children:
 *   - 'before' (default): parent row, then its descendants
 *   - 'after':            descendants first, then the parent as a subtotal row
 *   - 'none':             emit only leaves; grand total and subtotals are skipped
 * The setting is applied at every depth, so intermediate subtotals move too.
 */
export const flattenTreeCompact = (
  root: TreeNode,
  { includeRoot = true, totalsPosition = 'before' }: { includeRoot?: boolean; totalsPosition?: string } = {}
): TreeNode[] => {
  const out: TreeNode[] = [];
  if (totalsPosition === 'none') {
    const walk = (node: TreeNode): void => {
      const hasKids = node.children && node.children.length > 0;
      if (hasKids) {
        if (node.isExpanded !== false) node.children.forEach(walk);
      } else if (node !== root || includeRoot) {
        out.push(node);
      }
    };
    walk(root);
    return out;
  }
  const after = totalsPosition === 'after';
  const walk = (node: TreeNode): void => {
    const emitSelf = (): void => {
      if (node !== root || includeRoot) out.push(node);
    };
    const emitChildren = (): void => {
      if (node.isExpanded !== false) node.children.forEach(walk);
    };
    if (after && node.children && node.children.length > 0) {
      emitChildren();
      emitSelf();
    } else {
      emitSelf();
      emitChildren();
    }
  };
  walk(root);
  return out;
};

/**
 * Sorts sibling groups in the tree according to a comparator receiving each
 * child node. Mutates in place and returns the root for chaining.
 */
export const sortTreeSiblings = (root: TreeNode, comparator: (a: TreeNode, b: TreeNode) => number): TreeNode => {
  const walk = (node: TreeNode): void => {
    if (!node.children || node.children.length === 0) return;
    node.children.sort(comparator);
    node.children.forEach(walk);
  };
  walk(root);
  return root;
};

export const findNodeByKey = (root: TreeNode, key: string): TreeNode | null => {
  if (root.key === key) return root;
  for (const child of root.children) {
    const found = findNodeByKey(child, key);
    if (found) return found;
  }
  return null;
};
