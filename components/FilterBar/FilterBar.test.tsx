// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from 'vitest';
import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import PivotEngine from '../../pivot-core/PivotEngine';
import type { FilterEntry } from '../../pivot-core/slice/FilterEngine';
import { PivotProvider } from '../../context/PivotContext';
import en from '../../localization/en.json';
import FilterBar from './FilterBar';

// vitest runs without injected globals, so RTL cannot self-register cleanup.
afterEach(cleanup);

const dataset = [
  {
    region: { type: 'string', caption: 'Region' },
    revenue: { type: 'number', caption: 'Revenue' },
    day: { type: 'date', caption: 'Day' },
  },
  { region: 'North', revenue: 1200, day: '2024-03-15' },
  { region: 'South', revenue: 980, day: '2024-03-16' },
  { region: 'East', revenue: 300, day: '2024-03-16' },
  { region: 'West', revenue: 50, day: '2024-03-17' },
];

const renderBar = (filter: FilterEntry) => {
  const engine = new PivotEngine();
  engine.setData(dataset);
  engine.setSlice({
    rows: [],
    columns: [{ uniqueName: 'Measures' }],
    measures: [{ uniqueName: 'revenue', aggregation: 'sum' }],
    filters: [filter],
  });
  render(
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
      <FilterBar />
    </PivotProvider>,
  );
  return engine;
};

const openEditor = () => {
  fireEvent.click(screen.getByText('Region'));
  return screen.getByRole('presentation');
};

const checkbox = (editor: HTMLElement, label: string | RegExp) =>
  within(editor).getByLabelText(label) as HTMLInputElement;

describe('FilterBar members editor', () => {
  test('picking members in multi mode applies a whitelist', () => {
    const engine = renderBar({ uniqueName: 'region' });
    const editor = openEditor();
    fireEvent.click(within(editor).getByText('Multiple values'));
    fireEvent.click(checkbox(editor, 'North'));
    fireEvent.click(checkbox(editor, 'South'));
    fireEvent.click(within(editor).getByText('Apply'));
    expect(engine.getSlice().filters).toEqual([
      { uniqueName: 'region', members: ['North', 'South'] },
    ]);
  });

  test('picking a value in single mode applies a value filter', () => {
    const engine = renderBar({ uniqueName: 'region' });
    const editor = openEditor();
    fireEvent.click(checkbox(editor, 'South'));
    fireEvent.click(within(editor).getByText('Apply'));
    expect(engine.getSlice().filters).toEqual([
      { uniqueName: 'region', value: 'South' },
    ]);
  });

  test('"Select all" only adds the values the search leaves visible', () => {
    const engine = renderBar({ uniqueName: 'region' });
    const editor = openEditor();
    fireEvent.click(within(editor).getByText('Multiple values'));
    fireEvent.change(within(editor).getByPlaceholderText('Search…'), {
      target: { value: 'th' },
    });
    fireEvent.click(checkbox(editor, /Select all/));
    fireEvent.click(within(editor).getByText('Apply'));
    expect(engine.getSlice().filters).toEqual([
      { uniqueName: 'region', members: ['North', 'South'] },
    ]);
  });

  test('"Select all" is not indeterminate for selections hidden by the search', () => {
    renderBar({ uniqueName: 'region', members: ['East', 'West'] });
    const editor = openEditor();
    fireEvent.change(within(editor).getByPlaceholderText('Search…'), {
      target: { value: 'th' },
    });
    // Neither visible value is selected: clicking selects both, which is
    // what an unchecked (not a mixed) box announces.
    const selectAll = checkbox(editor, /Select all/);
    expect(selectAll.checked).toBe(false);
    expect(selectAll.getAttribute('data-indeterminate')).toBe('false');
  });

  test('a one-member filter opens with that member selected and survives Apply', () => {
    // The shape DimensionFilterDialog writes when a single value is kept.
    const engine = renderBar({ uniqueName: 'region', members: ['North'] });
    const editor = openEditor();
    expect(checkbox(editor, 'North').checked).toBe(true);
    expect(checkbox(editor, 'South').checked).toBe(false);
    fireEvent.click(within(editor).getByText('Apply'));
    expect(engine.getSlice().filters).toEqual([
      { uniqueName: 'region', members: ['North'] },
    ]);
  });
});

describe('FilterBar modes by field type', () => {
  // Dates have no multi mode: a one-member list opened there showed no
  // mode selected and a checklist the toolbar does not offer.
  test('a one-member filter on a date field opens as that single date', () => {
    renderBar({ uniqueName: 'day', members: ['2024-03-16'] });
    fireEvent.click(screen.getByText('Day'));
    const editor = screen.getByRole('presentation');
    expect(
      within(editor)
        .getByRole('button', { name: 'Single date' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      (editor.querySelector('input[type="date"]') as HTMLInputElement).value,
    ).toBe('2024-03-16');
  });
});

describe('FilterBar chips', () => {
  const chip = () => screen.getByText('Region').closest('.MuiChip-root');

  test('a filter that constrains nothing renders as an outlined chip', () => {
    renderBar({ uniqueName: 'region' });
    expect(chip()?.classList.contains('MuiChip-outlined')).toBe(true);
  });

  test('exclude-only and search-only filters render as active', () => {
    renderBar({ uniqueName: 'region', exclude: ['South'] });
    expect(chip()?.classList.contains('MuiChip-colorSecondary')).toBe(true);
    cleanup();
    renderBar({ uniqueName: 'region', search: 'or' });
    expect(chip()?.classList.contains('MuiChip-colorSecondary')).toBe(true);
  });

  test('exclude and search filters are summarized, not shown as "All"', () => {
    renderBar({ uniqueName: 'region', exclude: ['South'] });
    expect(chip()?.textContent).toContain('≠ South');
    cleanup();
    renderBar({ uniqueName: 'region', search: 'or' });
    expect(chip()?.textContent).toContain('“or”');
  });
});
