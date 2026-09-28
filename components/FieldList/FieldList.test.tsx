// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest';
import React, { createRef } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { VirtuosoMockContext } from 'react-virtuoso';
import Pivot from '../../AuraPivot';
import type {
  AuraPivotRef,
  LocalizationDictionary,
  PivotOptions,
} from '../../index';
import en from '../../localization/en.json';

// vitest runs without injected globals, so RTL cannot self-register cleanup.
afterEach(cleanup);

// happy-dom has no layout; the mock context fakes TableVirtuoso's viewport.
const virtuosoMock = { viewportHeight: 600, itemHeight: 32 };

const rows = [
  { agentName: 'Alice', region: 'North', product: 'A', revenue: 1200 },
  { agentName: 'Bob', region: 'South', product: 'B', revenue: 980 },
  { agentName: 'Alice', region: 'South', product: 'A', revenue: 300 },
];

const fields = [
  { uniqueName: 'agentName', dataType: 'string', caption: 'Agent' },
  { uniqueName: 'region', dataType: 'string', caption: 'Region' },
  { uniqueName: 'product', dataType: 'string', caption: 'Product' },
  { uniqueName: 'revenue', dataType: 'number', caption: 'Revenue' },
] as NonNullable<PivotOptions['data']>['fields'];

const baseOptions = (data: Partial<PivotOptions['data']> = {}): PivotOptions =>
  ({
    data: {
      fields,
      dimensions: [
        { axis: 'row', uniqueName: 'region' },
        { axis: 'row', uniqueName: 'agentName' },
      ],
      measures: [{ uniqueName: 'revenue', aggregation: 'sum' }],
      ...data,
    },
  }) as PivotOptions;

const renderPivot = (options: PivotOptions) => {
  const ref = createRef<AuraPivotRef>();
  const onOptionsChange = vi.fn();
  render(
    <VirtuosoMockContext.Provider value={virtuosoMock}>
      <Pivot
        ref={ref}
        options={options}
        dataSource={rows}
        localization={en as LocalizationDictionary}
        onOptionsChange={onOptionsChange}
        width={800}
        height={600}
      />
    </VirtuosoMockContext.Provider>,
  );
  return { ref, onOptionsChange };
};

/** Opens the field list from the toolbar and returns its dialog element. */
const openFieldList = async (): Promise<HTMLElement> => {
  fireEvent.click(await screen.findByRole('button', { name: 'Fields' }));
  return screen.getByRole('dialog');
};

const apply = (dialog: HTMLElement) =>
  fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));

/** A drop zone box (the element carrying its onDrop), by its label. */
const zone = (dialog: HTMLElement, label: string): HTMLElement =>
  within(dialog).getByText(label).parentElement!;

/** The draggable chip wrapper holding `caption` inside a zone. */
const chipIn = (zoneEl: HTMLElement, caption: string): HTMLElement =>
  within(zoneEl).getByText(caption).closest('[draggable="true"]')!;

/** The "All fields" palette row for `caption`. */
const paletteRow = (dialog: HTMLElement, caption: string): HTMLElement => {
  const palette = within(dialog).getByText('All fields').parentElement!
    .nextElementSibling as HTMLElement;
  return within(palette).getByText(caption).closest('[draggable]')!;
};

/**
 * Stand-in for the browser DataTransfer: what a drag start writes is what
 * the matching drop reads back, keyed by MIME type.
 */
const fakeTransfer = (store: Record<string, string> = {}) => ({
  getData: (type: string) => store[type] ?? '',
  setData: (type: string, value: string) => {
    store[type] = value;
  },
});

/** Drags `from` and drops it on `to`, through a shared DataTransfer. */
const dragTo = (from: HTMLElement, to: HTMLElement) => {
  const dt = fakeTransfer();
  fireEvent.dragStart(from, { dataTransfer: dt });
  fireEvent.drop(to, { dataTransfer: dt });
};

const rowNames = (ref: React.RefObject<AuraPivotRef | null>) =>
  ref
    .current!.auraPivot.getOptions()
    .data!.dimensions!.filter((d) => d.axis === 'row')
    .map((d) => d.uniqueName);

const measureList = (ref: React.RefObject<AuraPivotRef | null>) =>
  ref.current!.auraPivot.getOptions().data!.measures!.map((m) => ({
    uniqueName: m.uniqueName,
    aggregation: m.aggregation,
  }));

/** Opens the aggregation <Select> of the measure chip for `caption`. */
const openAggregationMenu = (dialog: HTMLElement, index = 0) => {
  const combos = within(zone(dialog, 'Values')).getAllByRole('combobox');
  fireEvent.mouseDown(combos[index]);
  return screen.getByRole('listbox');
};

describe('aggregations', () => {
  test('Distinct count is offered and applies as the engine spelling', async () => {
    const { ref, onOptionsChange } = renderPivot(baseOptions());
    const dialog = await openFieldList();

    const listbox = openAggregationMenu(dialog);
    fireEvent.click(
      within(listbox).getByRole('option', { name: 'Distinct count' }),
    );
    apply(dialog);

    expect(measureList(ref)).toEqual([
      { uniqueName: 'revenue', aggregation: 'distinctcount' },
    ]);
    // Emitted from a microtask that coalesces the engine events of one edit.
    await waitFor(() => {
      const { calls } = onOptionsChange.mock;
      const last = calls[calls.length - 1]?.[0] as PivotOptions;
      expect(last.data!.measures![0].aggregation).toBe('distinctcount');
    });
  });

  // Bug fix (Bug 1): the menu used the dictionary key `distinctCount`, so a
  // saved `distinctcount` measure matched no option and rendered blank.
  test('a saved distinctcount measure shows its caption', async () => {
    renderPivot(
      baseOptions({
        measures: [{ uniqueName: 'revenue', aggregation: 'distinctcount' }],
      }),
    );
    const dialog = await openFieldList();
    expect(
      within(zone(dialog, 'Values')).getByRole('combobox').textContent,
    ).toBe('Distinct count');
  });

  // Bug fix (Bug 1): sibling-used aggregations compare in engine spelling.
  test('a sibling distinctcount is not offered again', async () => {
    renderPivot(
      baseOptions({
        measures: [
          { uniqueName: 'revenue', aggregation: 'sum' },
          { uniqueName: 'revenue', aggregation: 'distinctcount' },
        ],
      }),
    );
    const dialog = await openFieldList();
    const listbox = openAggregationMenu(dialog, 0);
    const offered = within(listbox)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(offered).toContain('Sum');
    expect(offered).not.toContain('Distinct count');
  });
});

describe('calculated fields', () => {
  const calcOptions = (data: Partial<PivotOptions['data']>) =>
    baseOptions({
      calculatedFields: [
        { uniqueName: 'double', caption: 'Double', formula: 'revenue * 2' },
      ],
      ...data,
    });

  test('deleting from a measure chip removes it from measures', async () => {
    const { ref } = renderPivot(
      calcOptions({
        measures: [
          { uniqueName: 'revenue', aggregation: 'sum' },
          { uniqueName: 'double', aggregation: 'formula' as never },
        ],
      }),
    );
    const dialog = await openFieldList();
    fireEvent.click(
      within(zone(dialog, 'Values')).getByRole('button', { name: 'Delete' }),
    );
    apply(dialog);

    expect(measureList(ref)).toEqual([
      { uniqueName: 'revenue', aggregation: 'sum' },
    ]);
    expect(ref.current!.auraPivot.getOptions().data!.calculatedFields).toEqual(
      [],
    );
  });

  // Bug fix (Bug 9): the palette delete left the field in the draft slice,
  // so Apply wrote a filter on a field that no longer exists.
  test('deleting from the palette also removes it from filters', async () => {
    const { ref } = renderPivot(
      calcOptions({ filters: [{ uniqueName: 'double' }] }),
    );
    const dialog = await openFieldList();
    expect(
      within(zone(dialog, 'Filters')).queryByText('Double'),
    ).not.toBeNull();

    fireEvent.click(
      within(paletteRow(dialog, 'Double')).getByRole('button', {
        name: 'Delete',
      }),
    );
    expect(within(zone(dialog, 'Filters')).queryByText('Double')).toBeNull();
    apply(dialog);

    const opts = ref.current!.auraPivot.getOptions();
    expect(opts.data!.filters).toEqual([]);
    expect(opts.data!.calculatedFields).toEqual([]);
  });
});

describe('drag and drop', () => {
  test('a palette field dropped on a zone joins it', async () => {
    const { ref } = renderPivot(baseOptions());
    const dialog = await openFieldList();
    dragTo(paletteRow(dialog, 'Product'), zone(dialog, 'Rows'));
    apply(dialog);
    expect(rowNames(ref)).toEqual(['region', 'agentName', 'product']);
  });

  test('a chip moved down within its zone lands before the target', async () => {
    const { ref } = renderPivot(
      baseOptions({
        dimensions: [
          { axis: 'row', uniqueName: 'region' },
          { axis: 'row', uniqueName: 'agentName' },
          { axis: 'row', uniqueName: 'product' },
        ],
      }),
    );
    const dialog = await openFieldList();
    const rowsZone = zone(dialog, 'Rows');
    dragTo(chipIn(rowsZone, 'Region'), chipIn(rowsZone, 'Product'));
    apply(dialog);
    expect(rowNames(ref)).toEqual(['agentName', 'region', 'product']);
  });

  test('a chip moved up within its zone lands before the target', async () => {
    const { ref } = renderPivot(baseOptions());
    const dialog = await openFieldList();
    const rowsZone = zone(dialog, 'Rows');
    dragTo(chipIn(rowsZone, 'Agent'), chipIn(rowsZone, 'Region'));
    apply(dialog);
    expect(rowNames(ref)).toEqual(['agentName', 'region']);
  });

  test('a measure dragged to rows becomes a dimension', async () => {
    const { ref } = renderPivot(baseOptions());
    const dialog = await openFieldList();
    dragTo(chipIn(zone(dialog, 'Values'), 'Revenue'), zone(dialog, 'Rows'));
    apply(dialog);
    expect(rowNames(ref)).toEqual(['region', 'agentName', 'revenue']);
    expect(measureList(ref)).toEqual([]);
  });

  test('a measures reorder keeps each entry aggregation', async () => {
    const { ref } = renderPivot(
      baseOptions({
        measures: [
          { uniqueName: 'revenue', aggregation: 'sum' },
          { uniqueName: 'revenue', aggregation: 'count' },
        ],
      }),
    );
    const dialog = await openFieldList();
    const values = zone(dialog, 'Values');
    const chips = within(values).getAllByText('Revenue');
    dragTo(
      chips[1].closest('[draggable="true"]')!,
      chips[0].closest('[draggable="true"]')!,
    );
    apply(dialog);
    expect(measureList(ref)).toEqual([
      { uniqueName: 'revenue', aggregation: 'count' },
      { uniqueName: 'revenue', aggregation: 'sum' },
    ]);
  });

  test('a measures reorder keeps a hidden measure hidden', async () => {
    const { ref } = renderPivot(
      baseOptions({
        measures: [
          { uniqueName: 'revenue', aggregation: 'sum' },
          { uniqueName: 'revenue', aggregation: 'count', hidden: true },
        ],
      }),
    );
    const dialog = await openFieldList();
    const chips = within(zone(dialog, 'Values')).getAllByText('Revenue');
    dragTo(
      chips[1].closest('[draggable="true"]')!,
      chips[0].closest('[draggable="true"]')!,
    );
    apply(dialog);
    expect(
      ref.current!.auraPivot.getOptions().data!.measures!.map((m) => m.hidden),
    ).toEqual([true, false]);
  });

  describe('foreign drops are ignored (security)', () => {
    const dropOnRows = (dialog: HTMLElement, store: Record<string, string>) =>
      fireEvent.drop(zone(dialog, 'Rows'), {
        dataTransfer: fakeTransfer(store),
      });

    const expectUnchanged = (
      dialog: HTMLElement,
      ref: React.RefObject<AuraPivotRef | null>,
    ) => {
      apply(dialog);
      expect(rowNames(ref)).toEqual(['region', 'agentName']);
      expect(measureList(ref)).toEqual([
        { uniqueName: 'revenue', aggregation: 'sum' },
      ]);
    };

    test('plain text is not read as a field name', async () => {
      const { ref } = renderPivot(baseOptions());
      const dialog = await openFieldList();
      dropOnRows(dialog, { 'text/plain': 'revenue' });
      expectUnchanged(dialog, ref);
    });

    test('a text/plain JSON payload is not read', async () => {
      const { ref } = renderPivot(baseOptions());
      const dialog = await openFieldList();
      dropOnRows(dialog, {
        'text/plain': JSON.stringify({
          source: 'measures',
          uniqueName: 'revenue',
          idx: 0,
        }),
      });
      expectUnchanged(dialog, ref);
    });

    test.each([
      ['an unknown source', { source: '__proto__', uniqueName: 'revenue' }],
      ['an unknown field', { source: 'all', uniqueName: 'nope' }],
      ['a prototype key', { source: 'all', uniqueName: '__proto__' }],
      [
        'an out-of-range index',
        { source: 'measures', uniqueName: 'revenue', idx: 5 },
      ],
      [
        'a fractional index',
        { source: 'measures', uniqueName: 'revenue', idx: 0.5 },
      ],
      [
        'an index naming another field',
        { source: 'rows', uniqueName: 'revenue', idx: 0 },
      ],
    ])('a private payload with %s', async (_label, payload) => {
      const { ref } = renderPivot(baseOptions());
      const dialog = await openFieldList();
      dropOnRows(dialog, {
        'application/x-aurapivot-field': JSON.stringify(payload),
      });
      expectUnchanged(dialog, ref);
    });
  });

  // Bug fix (found during the refactor): chips were indexed without the
  // hidden Measures anchor, so on a zone holding the anchor before other
  // fields a chip's delete / drag addressed the anchor instead.
  test('deleting a chip after the Measures anchor removes that chip', async () => {
    const { ref } = renderPivot({
      ...baseOptions(),
      layout: { measuresAxis: 'rows' },
    });
    const dialog = await openFieldList();
    const rowsZone = zone(dialog, 'Rows');
    dragTo(paletteRow(dialog, 'Product'), rowsZone);

    const product = within(rowsZone)
      .getByText('Product')
      .closest('.MuiChip-root')!;
    fireEvent.click(product.querySelector('.MuiChip-deleteIcon')!);
    expect(within(rowsZone).queryByText('Product')).toBeNull();
    apply(dialog);

    expect(rowNames(ref)).toEqual(['region', 'agentName']);
    expect(ref.current!.auraPivot.getOptions().layout!.measuresAxis).toBe(
      'rows',
    );
  });
});

describe('dialog header', () => {
  test('the close button is labelled and closes the dialog', async () => {
    renderPivot(baseOptions());
    const dialog = await openFieldList();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
