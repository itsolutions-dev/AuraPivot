// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PivotEngine from '../../pivot-core/PivotEngine';
import type { InternalSlice } from '../../pivot-core/PivotEngine';
import { PivotProvider } from '../../context/PivotContext';
import en from '../../localization/en.json';
import DimensionFilterDialog from './DimensionFilterDialog';

// vitest runs without injected globals, so RTL cannot self-register cleanup.
afterEach(cleanup);

const dataset = [
  {
    region: { type: 'string', caption: 'Region' },
    revenue: { type: 'number', caption: 'Revenue' },
  },
  { region: 'North', revenue: 1200 },
  { region: 'South', revenue: 980 },
  { region: 'East', revenue: 300 },
];

const setup = (slice: Partial<InternalSlice> = {}) => {
  const engine = new PivotEngine();
  engine.setData(dataset);
  engine.setSlice({
    rows: [{ uniqueName: 'region' }],
    columns: [{ uniqueName: 'Measures' }],
    measures: [{ uniqueName: 'revenue', aggregation: 'sum' }],
    ...slice,
  });
  const onClose = vi.fn();
  const ui = (open: boolean) => (
    <PivotProvider
      value={{
        engine,
        localization: en,
        locale: undefined,
        options: engine.getOptions(),
        fullscreenRef: { current: null },
        isFullscreen: false,
      }}
    >
      <DimensionFilterDialog
        open={open}
        uniqueName="region"
        caption="Region"
        onClose={onClose}
      />
    </PivotProvider>
  );
  const view = render(ui(true));
  return {
    engine,
    onClose,
    reopen: () => {
      view.rerender(ui(false));
      view.rerender(ui(true));
    },
  };
};

const checkbox = (label: string | RegExp) =>
  screen.getByLabelText(label) as HTMLInputElement;

describe('DimensionFilterDialog', () => {
  test('every value starts checked; unchecking one applies a whitelist', () => {
    const { engine, onClose } = setup();
    expect(checkbox('North').checked).toBe(true);
    expect(checkbox('South').checked).toBe(true);
    fireEvent.click(checkbox('South'));
    fireEvent.click(screen.getByText('Apply'));
    expect(engine.getSlice().filters).toEqual([
      { uniqueName: 'region', members: ['East', 'North'] },
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('an existing members filter seeds the checkboxes', () => {
    const { engine } = setup({
      filters: [{ uniqueName: 'region', members: ['North'] }],
    });
    expect(checkbox('North').checked).toBe(true);
    expect(checkbox('South').checked).toBe(false);
    // Checking everything again drops the filter entirely.
    fireEvent.click(checkbox(/Select all/));
    fireEvent.click(screen.getByText('Apply'));
    expect(engine.getSlice().filters).toEqual([]);
  });

  test('"Select all" reflects the values the search leaves visible', () => {
    setup({ filters: [{ uniqueName: 'region', members: ['East'] }] });
    fireEvent.change(screen.getByPlaceholderText('Search…'), {
      target: { value: 'th' },
    });
    const selectAll = checkbox(/Select all/);
    expect(selectAll.checked).toBe(false);
    expect(selectAll.getAttribute('data-indeterminate')).toBe('false');
    fireEvent.click(checkbox('North'));
    expect(checkbox(/Select all/).getAttribute('data-indeterminate')).toBe(
      'true',
    );
  });

  test('the sort direction is applied to the dimension', () => {
    const { engine } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Descending' }));
    fireEvent.click(screen.getByText('Apply'));
    const field = engine.getSlice().rows[0];
    expect(field.fieldSort).toEqual({ mode: 'alpha', direction: 'desc' });
    expect(field.sort).toBe('desc');
  });

  test('the current sort direction is preselected', () => {
    setup({
      rows: [
        {
          uniqueName: 'region',
          fieldSort: { mode: 'alpha', direction: 'desc' },
        },
      ],
    });
    expect(
      screen
        .getByRole('button', { name: 'Descending' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  test('an active column sort is announced', () => {
    setup({ sort: { colKey: 'root', colDirection: 'desc' } });
    expect(screen.getByText(/A column sort is active/)).toBeDefined();
  });

  test('reopening discards unsaved edits', () => {
    const { engine, reopen } = setup();
    fireEvent.click(checkbox('South'));
    expect(checkbox('South').checked).toBe(false);
    reopen();
    expect(checkbox('South').checked).toBe(true);
    expect(engine.getSlice().filters).toEqual([]);
  });
});
