/**
 * Excel export for a computed PivotMatrix.
 * Uses exceljs to produce a styled .xlsx and file-saver to trigger download.
 *
 * exceljs is ~900 KB and is loaded with a dynamic import() on the first
 * export call only — it must never sit in the consumer's critical path.
 * The package marks it external in rollup, so the consumer's bundler
 * code-splits it from `dependencies`.
 */

import { saveAs } from 'file-saver';
import type ExcelJS from 'exceljs';
import type { MetadataRow } from '../types';
import type { ComputedMatrix } from '../matrix/MatrixComputer';

type ExcelJSModule = typeof ExcelJS;

let exceljsPromise: Promise<ExcelJSModule> | null = null;

const loadExcelJS = (): Promise<ExcelJSModule> => {
  if (!exceljsPromise) {
    exceljsPromise = import('exceljs').then(
      // CJS/ESM interop: bundlers expose the namespace under `default`,
      // plain Node require-shims may expose it directly.
      (mod) =>
        (mod as { default?: ExcelJSModule }).default ??
        (mod as unknown as ExcelJSModule),
    );
  }
  return exceljsPromise;
};

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1D5B9D' },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  color: { argb: 'FFFFFFFF' },
  bold: true,
};
const TOTAL_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE3E8F1' },
};

interface ExportMatrixOptions {
  matrix: ComputedMatrix;
  filename?: string;
  sheetName?: string;
  metadata?: MetadataRow;
}

export const exportMatrixToExcel = async ({
  matrix,
  filename = 'pivot.xlsx',
  sheetName = 'Pivot',
  metadata = {},
}: ExportMatrixOptions): Promise<void> => {
  const Excel = await loadExcelJS();
  const workbook = new Excel.Workbook();
  workbook.creator = 'AuraPivot';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName);

  const { rowLeaves, colLeaves } = matrix;

  // Header row: first column is a label column, then one column per colLeaf.
  const headerRow = ['', ...colLeaves.map((c) => c.caption || '')];
  const rowRef = sheet.addRow(headerRow);
  rowRef.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  rowLeaves.forEach((rowNode) => {
    const prefix = '  '.repeat(Math.max(0, rowNode.depth));
    const rowData: (string | number | null)[] = [`${prefix}${rowNode.caption}`];
    colLeaves.forEach((colNode) => {
      // Mirror the grid: group rows/cols kept alive by `totalsPosition: 'none'`
      // exist only to carry the expand/collapse control — no aggregate.
      if (rowNode.totalsHidden || colNode.totalsHidden) {
        rowData.push('');
        return;
      }
      const cell = matrix.cells.get(`${rowNode.key}::${colNode.key}`);
      rowData.push(cell ? (cell.value ?? '') : '');
    });
    const excelRow = sheet.addRow(rowData);
    if (rowNode.isTotal) {
      excelRow.eachCell((cell) => {
        cell.fill = TOTAL_FILL;
        cell.font = { bold: true };
      });
    }
  });

  // Auto width (capped).
  sheet.columns.forEach((col) => {
    if (!col) return;
    let maxLength = 10;
    col.eachCell?.({ includeEmpty: true }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLength) maxLength = len;
    });
    col.width = Math.min(40, maxLength + 2);
  });

  // Avoid unused-param warning; metadata is reserved for future column typing.
  void metadata;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, filename);
};
