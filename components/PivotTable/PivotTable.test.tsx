// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from 'vitest';
import React from 'react';
import {
  act,
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
import { justifyFor } from './layout';

// vitest runs without injected globals, so RTL cannot self-register cleanup.
afterEach(cleanup);

// happy-dom has no layout: fake the viewport so Virtuoso renders rows.
const virtuosoMock = { viewportHeight: 600, itemHeight: 32 };
const dict = en as LocalizationDictionary;

const rows = [
  { agentName: 'Alice', region: 'North', revenue: 1200, units: 7 },
  { agentName: 'Bob', region: 'South', revenue: 980, units: 5 },
  { agentName: 'Carol', region: 'South', revenue: 300, units: 3 },
];

const fields = [
  { uniqueName: 'agentName', dataType: 'string', caption: 'Agent' },
  { uniqueName: 'region', dataType: 'string', caption: 'Region' },
  { uniqueName: 'revenue', dataType: 'number', caption: 'Revenue' },
  { uniqueName: 'units', dataType: 'number', caption: 'Units' },
] as const;

const REVENUE = { uniqueName: 'revenue', aggregation: 'sum' } as const;
const UNITS = { uniqueName: 'units', aggregation: 'sum' } as const;

const makeOptions = (
  data: Partial<NonNullable<PivotOptions['data']>>,
  layout?: PivotOptions['layout'],
): PivotOptions => ({
  data: {
    fields: [...fields],
    dimensions: [{ axis: 'row', uniqueName: 'region' }],
    measures: [REVENUE],
    ...data,
  },
  ...(layout ? { layout } : {}),
});

const renderPivot = (options: PivotOptions) => {
  const ref = React.createRef<AuraPivotRef>();
  const utils = render(
    <VirtuosoMockContext.Provider value={virtuosoMock}>
      <Pivot
        ref={ref}
        options={options}
        dataSource={rows}
        localization={dict}
        width={800}
        height={600}
      />
    </VirtuosoMockContext.Provider>,
  );
  return { ...utils, engine: () => ref.current!.engine };
};

/** Sort indicators carry their tooltip text as the icon's aria-label. */
const sortIndicator = (container: HTMLElement, label: string) =>
  container.querySelector(`[aria-label="${label}"]`);

const ONE_TWO_HUNDRED = /^1[.,\s]?200$/;

describe('column-header sort', () => {
  test('a header click cycles desc → asc → off via engine.setSort', async () => {
    const { container, engine } = renderPivot(
      makeOptions({
        dimensions: [
          { axis: 'row', uniqueName: 'region' },
          { axis: 'column', uniqueName: 'agentName' },
        ],
      }),
    );
    // Measures on columns: each member header carries its measure suffix.
    const caption = 'Alice — Revenue (Sum)';
    fireEvent.click(await screen.findByText(caption));
    const colKey = engine().getSlice().sort?.colKey;
    expect(colKey).toBeTruthy();
    expect(engine().getSlice().sort).toMatchObject({
      colDirection: 'desc',
      colMeasure: null,
    });
    const desc = sortIndicator(container, `${caption} (Descending)`);
    expect(desc?.getAttribute('data-testid')).toBe('ArrowDownwardIcon');

    fireEvent.click(screen.getByText(caption));
    expect(engine().getSlice().sort).toMatchObject({
      colKey,
      colDirection: 'asc',
    });
    const asc = sortIndicator(container, `${caption} (Ascending)`);
    expect(asc?.getAttribute('data-testid')).toBe('ArrowUpwardIcon');

    fireEvent.click(screen.getByText(caption));
    expect(engine().getSlice().sort).toBeNull();
    expect(sortIndicator(container, `${caption} (Ascending)`)).toBeNull();
  });

  test('with 2+ measures on rows the header opens the sort-by-measure menu', async () => {
    const { container, engine } = renderPivot(
      makeOptions(
        {
          dimensions: [
            { axis: 'row', uniqueName: 'region' },
            { axis: 'column', uniqueName: 'agentName' },
          ],
          measures: [REVENUE, UNITS],
        },
        { measuresAxis: 'rows' },
      ),
    );
    fireEvent.click(await screen.findByText('Alice'));

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Sort by measure')).toBeDefined();
    expect(within(menu).queryByText('Remove sort')).toBeNull();
    fireEvent.click(within(menu).getByRole('button', { name: 'Ascending' }));
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: 'Units (Sum)' }),
    );

    expect(engine().getSlice().sort).toMatchObject({
      colDirection: 'asc',
      colMeasure: UNITS,
    });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(
      sortIndicator(container, 'Alice — Units (Sum) (Ascending)'),
    ).not.toBeNull();

    // Reopening marks the active measure and offers to remove the sort.
    fireEvent.click(screen.getByText('Alice'));
    const reopened = await screen.findByRole('menu');
    expect(
      within(reopened)
        .getByRole('menuitem', { name: 'Units (Sum)' })
        .classList.contains('Mui-selected'),
    ).toBe(true);
    fireEvent.click(within(reopened).getByText('Remove sort'));
    expect(engine().getSlice().sort).toBeNull();
  });
});

describe('row-label sort', () => {
  test('a label click cycles desc → asc → off via engine.setSortByRow', async () => {
    const { container, engine } = renderPivot(makeOptions({}));
    fireEvent.click(await screen.findByText('North'));
    const rowKey = engine().getSlice().sort?.rowKey;
    expect(rowKey).toBeTruthy();
    expect(engine().getSlice().sort).toMatchObject({
      rowDirection: 'desc',
      rowMeasure: null,
    });
    const desc = sortIndicator(container, 'North (Descending)');
    expect(desc?.getAttribute('data-testid')).toBe('ArrowBackIcon');

    fireEvent.click(screen.getByText('North'));
    expect(engine().getSlice().sort).toMatchObject({
      rowKey,
      rowDirection: 'asc',
    });
    const asc = sortIndicator(container, 'North (Ascending)');
    expect(asc?.getAttribute('data-testid')).toBe('ArrowForwardIcon');

    fireEvent.click(screen.getByText('North'));
    expect(engine().getSlice().sort).toBeNull();
  });

  test('with 2+ measures on columns the label opens the sort-by-measure menu', async () => {
    const { container, engine } = renderPivot(
      makeOptions({ measures: [REVENUE, UNITS] }),
    );
    fireEvent.click(await screen.findByText('North'));

    const menu = await screen.findByRole('menu');
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: 'Revenue (Sum)' }),
    );
    expect(engine().getSlice().sort).toMatchObject({
      rowDirection: 'desc',
      rowMeasure: REVENUE,
    });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(
      sortIndicator(container, 'North — Revenue (Sum) (Descending)'),
    ).not.toBeNull();

    fireEvent.click(screen.getByText('North'));
    fireEvent.click(
      within(await screen.findByRole('menu')).getByText('Remove sort'),
    );
    expect(engine().getSlice().sort).toBeNull();
  });
});

describe('drill-through', () => {
  const clickFirstValue = async () => {
    const values = await screen.findAllByText(ONE_TWO_HUNDRED);
    fireEvent.click(values[0]);
  };

  test('is on by default', async () => {
    renderPivot(makeOptions({}));
    await clickFirstValue();
    expect(await screen.findByText('Detail data')).toBeDefined();
  });

  test('options.layout.enableDrillThrough = false turns it off', async () => {
    renderPivot(makeOptions({}, { enableDrillThrough: false }));
    await clickFirstValue();
    expect(screen.queryByText('Detail data')).toBeNull();
  });

  test('the Format dialog toggle (format.layout) turns it off and on', async () => {
    const { engine } = renderPivot(makeOptions({}));
    await screen.findAllByText(ONE_TWO_HUNDRED);

    act(() => engine().setFormat({ layout: { enableDrillThrough: false } }));
    await clickFirstValue();
    expect(screen.queryByText('Detail data')).toBeNull();

    act(() => engine().setFormat({ layout: { enableDrillThrough: true } }));
    await clickFirstValue();
    expect(await screen.findByText('Detail data')).toBeDefined();
  });
});

describe('drill-through flag', () => {
  const clickFirstValue = async () => {
    const values = await screen.findAllByText(ONE_TWO_HUNDRED);
    fireEvent.click(values[0]);
  };

  // Regression: setFormat merges layout, so dropping the key kept `false`.
  test('comes back when the host drops layout.enableDrillThrough', async () => {
    const view = renderPivot(makeOptions({}, { enableDrillThrough: false }));
    await screen.findAllByText(ONE_TWO_HUNDRED);
    view.rerender(
      <VirtuosoMockContext.Provider value={virtuosoMock}>
        <Pivot
          options={makeOptions({}, {})}
          dataSource={rows}
          localization={dict}
          width={800}
          height={600}
        />
      </VirtuosoMockContext.Provider>,
    );
    await clickFirstValue();
    expect(await screen.findByText('Detail data')).toBeDefined();
  });
});

describe('active-filter badge', () => {
  /** The Region chip in the expanded dimension-filter header row. */
  const regionChip = async (container: HTMLElement) => {
    fireEvent.click(await screen.findByTitle('Expand filters'));
    const thead = container.querySelector('thead') as HTMLElement;
    return within(thead).getByText('Region').parentElement as HTMLElement;
  };
  const hasBadge = (chip: HTMLElement) =>
    !!chip.querySelector('[data-testid="FilterAltIcon"]');

  test('no filter, no badge', async () => {
    const { container } = renderPivot(makeOptions({}));
    expect(hasBadge(await regionChip(container))).toBe(false);
  });

  test('a members filter marks the chip', async () => {
    const { container } = renderPivot(
      makeOptions({ filters: [{ uniqueName: 'region', members: ['North'] }] }),
    );
    expect(hasBadge(await regionChip(container))).toBe(true);
  });

  test('exclude-only and search-only filters mark the chip too', async () => {
    const { container, engine } = renderPivot(makeOptions({}));
    await screen.findByText('North');
    const setFilter = (filter: Record<string, unknown>) =>
      act(() =>
        engine().setSlice({
          ...engine().getSlice(),
          filters: [{ uniqueName: 'region', ...filter }],
        }),
      );

    setFilter({ exclude: ['South'] });
    expect(hasBadge(await regionChip(container))).toBe(true);

    setFilter({ search: 'nor' });
    const thead = container.querySelector('thead') as HTMLElement;
    expect(
      hasBadge(within(thead).getByText('Region').parentElement as HTMLElement),
    ).toBe(true);
  });
});

describe('hidden measures', () => {
  test('hovering a value lists the hidden measures for that cell', async () => {
    renderPivot(
      makeOptions({ measures: [REVENUE, { ...UNITS, hidden: true }] }),
    );
    const values = await screen.findAllByText(ONE_TWO_HUNDRED);
    fireEvent.mouseOver(values[0]);

    const tooltip = await screen.findByRole('tooltip');
    expect(within(tooltip).getByText('Other measures')).toBeDefined();
    expect(within(tooltip).getByText('Units (Sum)')).toBeDefined();
    expect(within(tooltip).getByText('7')).toBeDefined();
  });
});

describe('justifyFor', () => {
  test('maps text-align onto flex, with a per-cell fallback', () => {
    expect(justifyFor('right')).toBe('flex-end');
    expect(justifyFor('end')).toBe('flex-end');
    expect(justifyFor('left', 'flex-end')).toBe('flex-start');
    expect(justifyFor('center')).toBe('center');
    // Value cells align to the end unless told otherwise.
    expect(justifyFor('justify', 'flex-end')).toBe('flex-end');
    expect(justifyFor('justify')).toBe('flex-start');
  });
});
