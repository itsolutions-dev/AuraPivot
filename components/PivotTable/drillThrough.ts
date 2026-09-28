/** Source records and breadcrumbs behind one value cell, for drill-through. */
import { findNodeByKey } from '../../pivot-core/slice/TreeBuilder';
import type {
  AxisLeaf,
  ComputedMatrix,
} from '../../pivot-core/matrix/MatrixComputer';
import type { DataRow, TreeNode } from '../../pivot-core/types';
import { baseKey, nodeKeyOf } from './layout';

/** What the drill-through dialog shows. */
export interface DrillThroughData {
  rows: DataRow[];
  breadcrumbs: { field?: string; value?: string }[];
}

/**
 * The source records both the row leaf and the column node aggregate: the
 * intersection of their row-index buckets.
 */
export const buildDrillThrough = (
  matrix: ComputedMatrix,
  rowNode: AxisLeaf,
  colKey: string,
  captionFor: (uniqueName: string) => string,
): DrillThroughData => {
  // Measures sit on top of the columns, not in the column tree — look
  // the node up by its base key.
  const baseColKey = baseKey(colKey);
  const colNode = findNodeByKey(matrix.colRoot, baseColKey);
  const source = matrix.sourceRows || [];
  const rowIndexes = rowNode?.rowIndexes || [];
  const colIndexes = colNode?.rowIndexes || [];
  if (rowIndexes.length === 0 || colIndexes.length === 0) {
    return { rows: [], breadcrumbs: [] };
  }
  const [small, large] =
    rowIndexes.length < colIndexes.length
      ? [rowIndexes, colIndexes]
      : [colIndexes, rowIndexes];
  const smallSet = new Set(small);
  const intersected = large.filter((i) => smallSet.has(i));
  const rows = intersected.map((i) => source[i]).filter(Boolean);

  // Breadcrumbs: ancestor chain of rowNode and colNode (skipping roots).
  const buildBreadcrumbs = (
    root: TreeNode | null | undefined,
    targetKey: string | null | undefined,
  ) => {
    if (!root || !targetKey) return [];
    const path: TreeNode[] = [];
    const walk = (node: TreeNode, trail: TreeNode[]): boolean => {
      if (!node) return false;
      const nextTrail = [...trail, node];
      if (node.key === targetKey) {
        path.push(...nextTrail);
        return true;
      }
      for (const c of node.children || []) {
        if (walk(c, nextTrail)) return true;
      }
      return false;
    };
    walk(root, []);
    return path
      .filter((n) => !n.isTotal && n.field)
      .map((n) => ({
        field: captionFor(String(n.field)),
        value: n.caption,
      }));
  };
  const breadcrumbs = [
    ...buildBreadcrumbs(matrix.rowRoot, nodeKeyOf(rowNode)),
    ...buildBreadcrumbs(matrix.colRoot, baseColKey),
  ];
  if (rowNode?.measureKey) {
    const [uniqueName] = rowNode.measureKey.split(':');
    breadcrumbs.push({
      field: captionFor('Measures'),
      value: rowNode.measureCaption || uniqueName,
    });
  }
  return { rows, breadcrumbs };
};
