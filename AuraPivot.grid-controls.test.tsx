// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

afterEach(cleanup);
import { VirtuosoMockContext } from 'react-virtuoso';
import Pivot from './AuraPivot';
import type { LocalizationDictionary, PivotOptions } from './index';
import en from './localization/en.json';
import it from './localization/it.json';

const virtuosoMock = { viewportHeight: 600, itemHeight: 32 };

const rows = [
  { agentName: 'Alice', region: 'North', revenue: 1200 },
  { agentName: 'Bob', region: 'South', revenue: 980 },
  { agentName: 'Carol', region: 'South', revenue: 300 },
];

const options: PivotOptions = {
  data: {
    fields: [
      { uniqueName: 'agentName', dataType: 'string', caption: 'Agent' },
      { uniqueName: 'region', dataType: 'string', caption: 'Region' },
      { uniqueName: 'revenue', dataType: 'number', caption: 'Revenue' },
    ],
    dimensions: [
      { axis: 'row', uniqueName: 'region' },
      { axis: 'row', uniqueName: 'agentName' },
    ],
    measures: [{ uniqueName: 'revenue', aggregation: 'sum' }],
  },
};

const renderPivot = (dict: LocalizationDictionary) =>
  render(
    <VirtuosoMockContext.Provider value={virtuosoMock}>
      <Pivot
        options={options}
        dataSource={rows}
        localization={dict}
        width={800}
        height={600}
      />
    </VirtuosoMockContext.Provider>
  );

const iconOf = (el: Element | null | undefined) =>
  el?.querySelector('svg')?.getAttribute('data-testid') ?? null;

/** The chevron cell of the first group row (a node that has children). */
const firstNodeChevron = (container: HTMLElement) =>
  container.querySelector('td.pvt-chevron:not(.pvt-chevron-empty)');

const expandAllButton = (dict: LocalizationDictionary) =>
  screen.getByTitle(
    (dict.grid as Record<string, string>).expandCollapseAll
  );

describe('expand / collapse icons reflect state', () => {
  test('a node chevron points down when expanded, right when collapsed', async () => {
    const { container } = renderPivot(en as LocalizationDictionary);
    await screen.findByText('North');

    const chevron = firstNodeChevron(container);
    expect(iconOf(chevron)).toBe('ExpandMoreIcon');

    fireEvent.click(chevron!.querySelector('button')!);
    expect(iconOf(firstNodeChevron(container))).toBe('ChevronRightIcon');
  });

  test('"expand/collapse all" offers collapse while the grid is expanded', async () => {
    renderPivot(en as LocalizationDictionary);
    await screen.findByText('North');

    const button = expandAllButton(en as LocalizationDictionary);
    expect(iconOf(button)).toBe('UnfoldLessIcon');

    fireEvent.click(button);
    expect(iconOf(expandAllButton(en as LocalizationDictionary))).toBe(
      'UnfoldMoreIcon'
    );
  });
});

describe('drill-through localization', () => {
  test('the Italian dictionary drives every drill-through label', async () => {
    const { container } = renderPivot(it as LocalizationDictionary);
    await screen.findByText('North');

    // Any rendered measure value opens the drill-through dialog. The number
    // is locale-formatted, so match around the group separator.
    const values = await screen.findAllByText(/^1[.,\s]?200$/);
    fireEvent.click(values[0]);

    expect(await screen.findByText('Dettaglio dati')).toBeDefined();
    expect(screen.queryByText('Drill-through')).toBeNull();
    expect(screen.queryByText('records')).toBeNull();
    expect(screen.queryByText('columns')).toBeNull();
  });
});
