// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest';
import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import PivotEngine from '../../pivot-core/PivotEngine';
import { PivotProvider } from '../../context/PivotContext';
import en from '../../localization/en.json';
import CalculatedFieldDialog from './CalculatedFieldDialog';

// vitest runs without injected globals, so RTL cannot self-register cleanup.
afterEach(cleanup);

const dataset = [
  {
    region: { type: 'string', caption: 'Region' },
    revenue: { type: 'number', caption: 'Revenue' },
    cost: { type: 'number', caption: 'Cost' },
  },
  { region: 'North', revenue: 1200, cost: 700 },
  { region: 'South', revenue: 980, cost: 400 },
];

type EditField = { uniqueName: string; caption: string; formula: string };

const setup = (editField: EditField | null = null) => {
  const engine = new PivotEngine();
  engine.setData(dataset);
  engine.setSlice({
    rows: [{ uniqueName: 'region' }],
    columns: [{ uniqueName: 'Measures' }],
    measures: [{ uniqueName: 'revenue', aggregation: 'sum' }],
  });
  if (editField) engine.addCalculatedField(editField);
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
      <CalculatedFieldDialog
        open={open}
        editField={editField}
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

const formulaBox = () =>
  document.querySelector('[data-placeholder]') as HTMLDivElement;

const nameInput = () => screen.getByLabelText('Field name') as HTMLInputElement;

describe('CalculatedFieldDialog', () => {
  test('edit mode seeds the name and renders field references as chips', async () => {
    setup({
      uniqueName: 'margin',
      caption: 'Margin',
      formula: 'revenue - cost',
    });
    expect(nameInput().value).toBe('Margin');
    await waitFor(() =>
      expect(formulaBox().querySelectorAll('.pv-calc-chip')).toHaveLength(2),
    );
    const chips = formulaBox().querySelectorAll('.pv-calc-chip');
    expect(chips[0].getAttribute('data-un')).toBe('revenue');
    expect(chips[0].getAttribute('contenteditable')).toBe('false');
    expect(chips[0].textContent).toBe('Revenue×');
    expect(chips[1].getAttribute('data-un')).toBe('cost');
    expect(formulaBox().textContent).toBe('Revenue× - Cost×');
  });

  test('saving an edit updates the calculated field', async () => {
    const { engine, onClose } = setup({
      uniqueName: 'margin',
      caption: 'Margin',
      formula: 'revenue - cost',
    });
    await waitFor(() =>
      expect(formulaBox().querySelectorAll('.pv-calc-chip')).toHaveLength(2),
    );
    fireEvent.change(nameInput(), { target: { value: 'Gross margin' } });
    fireEvent.click(screen.getByText('Save changes'));
    expect(engine.getCalculatedFields()).toEqual([
      {
        uniqueName: 'margin',
        caption: 'Gross margin',
        formula: 'revenue - cost',
      },
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('clicking a field chip inserts a reference into the formula', () => {
    const { engine } = setup();
    fireEvent.change(nameInput(), { target: { value: 'Double' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revenue' }));
    expect(formulaBox().querySelector('.pv-calc-chip')).not.toBeNull();
    fireEvent.click(screen.getByText('Create field'));
    expect(engine.getCalculatedFields()).toMatchObject([
      { caption: 'Double', formula: 'revenue' },
    ]);
  });

  test('a missing name is reported instead of saving', () => {
    const { engine, onClose } = setup();
    fireEvent.click(screen.getByText('Create field'));
    expect(screen.getByText('Field name is required.')).toBeDefined();
    expect(engine.getCalculatedFields()).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
  });

  test('reopening discards the unsaved draft', () => {
    const { reopen } = setup();
    fireEvent.change(nameInput(), { target: { value: 'Draft' } });
    reopen();
    expect(nameInput().value).toBe('');
  });
});
