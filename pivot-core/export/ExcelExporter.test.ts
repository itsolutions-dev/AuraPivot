import { describe, expect, test, vi } from 'vitest';

/**
 * exceljs is ~900 KB and must stay out of the consumer's critical path:
 * the module has to load lazily on the first export call, not when the
 * library is imported. The hoisted mock tracks when vitest instantiates
 * the exceljs module factory.
 */
const state = vi.hoisted(() => ({
  exceljsLoaded: false,
  savedBlobs: [] as Array<{ blob: unknown; filename: string }>,
}));

vi.mock('exceljs', () => {
  state.exceljsLoaded = true;

  class FakeCell {
    value: unknown = null;
    fill: unknown;
    font: unknown;
    alignment: unknown;
  }

  class FakeRow {
    cells: FakeCell[];
    constructor(values: unknown[]) {
      this.cells = values.map((v) => {
        const c = new FakeCell();
        c.value = v;
        return c;
      });
    }
    eachCell(cb: (cell: FakeCell) => void) {
      this.cells.forEach(cb);
    }
  }

  class FakeColumn {
    width = 0;
    eachCell(_opts: unknown, cb: (cell: FakeCell) => void) {
      void cb;
    }
  }

  class FakeWorksheet {
    rows: FakeRow[] = [];
    columns: FakeColumn[] = [new FakeColumn()];
    addRow(values: unknown[]) {
      const row = new FakeRow(values);
      this.rows.push(row);
      return row;
    }
  }

  class FakeWorkbook {
    creator = '';
    created: Date | null = null;
    sheets: FakeWorksheet[] = [];
    xlsx = { writeBuffer: async () => new ArrayBuffer(8) };
    addWorksheet() {
      const ws = new FakeWorksheet();
      this.sheets.push(ws);
      return ws;
    }
  }

  return { default: { Workbook: FakeWorkbook } };
});

// Mirrors the source's default import: file-saver is CommonJS with no
// named exports, so the mock has to expose `saveAs` under `default` or it
// stops intercepting and the assertions below would pass vacuously.
vi.mock('file-saver', () => ({
  default: {
    saveAs: (blob: unknown, filename: string) => {
      state.savedBlobs.push({ blob, filename });
    },
  },
}));

const tinyMatrix = {
  rowLeaves: [{ key: 'r1', caption: 'Alice', depth: 0, isTotal: false }],
  colLeaves: [{ key: 'c1', caption: 'Revenue' }],
  cells: new Map([['r1::c1', { value: 42 }]]),
  measures: [],
} as never;

describe('ExcelExporter', () => {
  test('importing the module does not load exceljs', async () => {
    await import('./ExcelExporter');
    expect(state.exceljsLoaded).toBe(false);
  });

  test('first export call loads exceljs and saves the workbook', async () => {
    const { exportMatrixToExcel } = await import('./ExcelExporter');
    await exportMatrixToExcel({ matrix: tinyMatrix, filename: 'out.xlsx' });
    expect(state.exceljsLoaded).toBe(true);
    expect(state.savedBlobs).toHaveLength(1);
    expect(state.savedBlobs[0].filename).toBe('out.xlsx');
    expect(state.savedBlobs[0].blob).toBeInstanceOf(Blob);
  });
});
