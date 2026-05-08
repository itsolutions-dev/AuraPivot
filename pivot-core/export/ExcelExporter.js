/**
 * Excel export for a computed PivotMatrix.
 * Uses exceljs to produce a styled .xlsx and file-saver to trigger download.
 */

import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1D5B9D' },
};
const HEADER_FONT = { color: { argb: 'FFFFFFFF' }, bold: true };
const TOTAL_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE3E8F1' },
};

export const exportMatrixToExcel = async ({
  matrix,
  filename = 'pivot.xlsx',
  sheetName = 'Pivot',
  metadata = {},
}) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Databeasy';
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
    const rowData = [`${prefix}${rowNode.caption}`];
    colLeaves.forEach((colNode) => {
      const cell = matrix.cells.get(`${rowNode.key}::${colNode.key}`);
      rowData.push(cell ? cell.value ?? '' : '');
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
    let maxLength = 10;
    col.eachCell({ includeEmpty: true }, (cell) => {
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
