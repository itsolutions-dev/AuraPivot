// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PivotEngine from '../../pivot-core/PivotEngine';
import { PivotProvider } from '../../context/PivotContext';
import en from '../../localization/en.json';
import DrillThroughDialog from './DrillThroughDialog';

// vitest runs without injected globals, so RTL cannot self-register cleanup.
afterEach(cleanup);

const dataset = [
  {
    agent: { type: 'string', caption: 'Agent' },
    revenue: { type: 'number', caption: 'Revenue' },
  },
  { agent: 'Alice', revenue: 1200 },
  { agent: 'Bob', revenue: 980 },
  { agent: 'Carol', revenue: 300 },
];

const setup = () => {
  const engine = new PivotEngine();
  engine.setData(dataset);
  const rows = engine.getRows();
  const ui = (open: boolean) => (
    <PivotProvider
      value={{
        engine,
        localization: en,
        locale: 'en-US',
        options: engine.getOptions(),
        fullscreenRef: { current: null },
        isFullscreen: false,
      }}
    >
      <DrillThroughDialog open={open} rows={rows} onClose={() => {}} />
    </PivotProvider>
  );
  const view = render(ui(true));
  return {
    reopen: () => {
      view.rerender(ui(false));
      view.rerender(ui(true));
    },
  };
};

const filterInput = () =>
  screen.getByPlaceholderText('Filter records…') as HTMLInputElement;

const bodyCells = () =>
  Array.from(document.querySelectorAll('tbody tr td:first-child')).map(
    (td) => td.textContent,
  );

describe('DrillThroughDialog', () => {
  test('renders the default title and every source row', () => {
    setup();
    expect(screen.getByText('Detail data')).toBeDefined();
    expect(bodyCells()).toEqual(['Alice', 'Bob', 'Carol']);
  });

  test('filters and sorts the rows', () => {
    setup();
    fireEvent.change(filterInput(), { target: { value: 'o' } });
    expect(bodyCells()).toEqual(['Bob', 'Carol']);
    fireEvent.click(screen.getByText('Revenue'));
    expect(bodyCells()).toEqual(['Carol', 'Bob']);
  });

  test('reopening clears the filter and the sort', () => {
    const { reopen } = setup();
    fireEvent.change(filterInput(), { target: { value: 'o' } });
    fireEvent.click(screen.getByText('Revenue'));
    expect(bodyCells()).toEqual(['Carol', 'Bob']);
    reopen();
    expect(filterInput().value).toBe('');
    expect(bodyCells()).toEqual(['Alice', 'Bob', 'Carol']);
  });
});
