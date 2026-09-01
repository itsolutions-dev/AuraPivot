// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';

// vitest runs without injected globals, so RTL cannot self-register its
// afterEach cleanup — without this, renders accumulate across tests and
// findByText trips on duplicates.
afterEach(cleanup);
import { VirtuosoMockContext } from 'react-virtuoso';
import Pivot from './AuraPivot';
import type { LocalizationDictionary, PivotOptions } from './index';
import en from './localization/en.json';

const dict = en as LocalizationDictionary;

// happy-dom has no real layout, so TableVirtuoso measures a zero-height
// viewport and renders no rows. The mock context fakes the measurements.
const virtuosoMock = { viewportHeight: 600, itemHeight: 32 };

/**
 * Mount-level characterization: the full component tree (toolbar, filter
 * bar, virtualized table) renders against real data. Safety net for
 * type-debt refactors in PivotTable.tsx — typing fixes must not change
 * runtime behavior.
 */

const rows = [
  { agentName: 'Alice', region: 'North', revenue: 1200 },
  { agentName: 'Bob', region: 'South', revenue: 980 },
  { agentName: 'Alice', region: 'South', revenue: 300 },
];

const options: PivotOptions = {
  data: {
    fields: [
      { uniqueName: 'agentName', dataType: 'string', caption: 'Agent' },
      { uniqueName: 'region', dataType: 'string', caption: 'Region' },
      { uniqueName: 'revenue', dataType: 'number', caption: 'Revenue' },
    ],
    dimensions: [{ axis: 'row', uniqueName: 'agentName' }],
    measures: [{ uniqueName: 'revenue', aggregation: 'sum' }],
  },
};

describe('AuraPivot mount smoke', () => {
  test('renders toolbar and row dimension members', async () => {
    render(
      <VirtuosoMockContext.Provider value={virtuosoMock}>
        <Pivot
          options={options}
          dataSource={rows}
          localization={dict}
          width={800}
          height={600}
        />
      </VirtuosoMockContext.Provider>,
    );
    // Toolbar tabs from the en dictionary.
    expect(await screen.findByText(en.toolbar.fields)).toBeDefined();
    // Row members from the dataset.
    expect(await screen.findByText('Alice')).toBeDefined();
    expect(await screen.findByText('Bob')).toBeDefined();
  });

  test('zero-config renders a fully English UI (no blank captions)', async () => {
    render(
      <VirtuosoMockContext.Provider value={virtuosoMock}>
        <Pivot options={options} dataSource={rows} width={800} height={600} />
      </VirtuosoMockContext.Provider>,
    );
    // Component-level inline fallbacks.
    expect(await screen.findByText('Fields')).toBeDefined();
    expect(await screen.findByText('Format')).toBeDefined();
    // Engine-level fallback: enriched measure caption template.
    expect(await screen.findByText(/Sum Total of Revenue/)).toBeDefined();
    // Data still renders.
    expect(await screen.findByText('Alice')).toBeDefined();
  });
});

describe('totals turned off (layout.totalsRowsPosition: "none")', () => {
  const nestedOptions: PivotOptions = {
    data: {
      ...options.data,
      dimensions: [
        { axis: 'row', uniqueName: 'region' },
        { axis: 'row', uniqueName: 'agentName' },
      ],
    },
    layout: { totalsRowsPosition: 'none' },
  };

  const renderPivot = (opts: PivotOptions) =>
    render(
      <VirtuosoMockContext.Provider value={virtuosoMock}>
        <Pivot
          options={opts}
          dataSource={rows}
          localization={dict}
          width={800}
          height={600}
        />
      </VirtuosoMockContext.Provider>,
    );

  test('group rows keep their expand/collapse control', async () => {
    const { container } = renderPivot(nestedOptions);
    // Group rows are still on the axis…
    expect(await screen.findByText('North')).toBeDefined();
    expect(await screen.findByText('South')).toBeDefined();
    // …and they own an active chevron.
    const chevrons = container.querySelectorAll(
      'td.pvt-chevron:not(.pvt-chevron-empty)',
    );
    expect(chevrons.length).toBeGreaterThan(0);
  });

  test('the grand-total row is gone', async () => {
    renderPivot(nestedOptions);
    expect(await screen.findByText('North')).toBeDefined();
    expect(screen.queryByText(/Sum Total of Revenue/)).toBeNull();
  });
});
