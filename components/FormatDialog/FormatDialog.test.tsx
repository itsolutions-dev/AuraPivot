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
import Pivot, { type AuraPivotRef } from '../../AuraPivot';
import type { LocalizationDictionary, PivotOptions } from '../../index';
import PivotEngine from '../../pivot-core/PivotEngine';
import en from '../../localization/en.json';
import it from '../../localization/it.json';

// vitest runs without injected globals, so RTL cannot self-register cleanup.
afterEach(cleanup);

/**
 * Characterization of the Format dialog, driven through the real component
 * tree: open it from the toolbar, edit, Apply / Reset, and read the result
 * back from the engine and `onOptionsChange`.
 */

// happy-dom has no layout; the mock gives TableVirtuoso a viewport.
const virtuosoMock = { viewportHeight: 600, itemHeight: 32 };

const rows = [
  { agentName: 'Alice', region: 'North', revenue: 1200 },
  { agentName: 'Bob', region: 'South', revenue: 980 },
  { agentName: 'Carol', region: 'South', revenue: 300 },
];

const baseOptions: PivotOptions = {
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

interface RenderArgs {
  dict?: LocalizationDictionary;
  options?: PivotOptions;
  onOptionsChange?: (next: unknown) => void;
}

const renderPivot = ({
  dict = en as LocalizationDictionary,
  options = baseOptions,
  onOptionsChange,
}: RenderArgs = {}) => {
  const ref = createRef<AuraPivotRef>();
  render(
    <VirtuosoMockContext.Provider value={virtuosoMock}>
      <Pivot
        ref={ref}
        options={options}
        dataSource={rows}
        localization={dict}
        onOptionsChange={onOptionsChange}
        width={800}
        height={600}
      />
    </VirtuosoMockContext.Provider>,
  );
  return ref;
};

const engineOf = (ref: React.RefObject<AuraPivotRef | null>) =>
  ref.current!.engine;

/**
 * Clicks the button labelled `text`. A text query skips the accessible-name
 * and visibility computation `getByRole` runs over every button, which gets
 * slow once a rule is expanded and its colour swatches (40 buttons) render.
 */
const clickButton = (container: HTMLElement, text: string) =>
  fireEvent.click(within(container).getByText(text, { selector: 'button' }));

/** Opens the Format dialog from the toolbar and returns it. */
const openFormatDialog = async (
  dict: LocalizationDictionary = en as LocalizationDictionary,
) => {
  await screen.findByText('North');
  const label = (dict.toolbar as Record<string, string>).format;
  clickButton(document.body, label);
  return screen.findByRole('dialog');
};

const openTab = (dialog: HTMLElement, name: string) =>
  fireEvent.click(within(dialog).getByRole('tab', { name }));

/**
 * The dialog's Selects carry no label, so they are found by the value they
 * currently display.
 */
const comboboxes = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[role="combobox"]'));
const comboboxShowing = (container: HTMLElement, text: string) => {
  const match = comboboxes(container).find((el) => el.textContent === text);
  if (!match) throw new Error(`No combobox showing "${text}"`);
  return match;
};
const hasComboboxShowing = (container: HTMLElement, text: string) =>
  comboboxes(container).some((el) => el.textContent === text);

/** Opens a MUI Select and picks the option whose text matches `name`. */
const choose = (combobox: HTMLElement, name: string | RegExp) => {
  fireEvent.mouseDown(combobox);
  fireEvent.click(screen.getByRole('option', { name }));
};

describe('tabs', () => {
  // Bug fix: the labels were read from flat `tabs.layout` keys while the
  // dictionaries nest them under `formatDialog.tabs`, so they never localized.
  test('tab labels come from the dictionary', async () => {
    renderPivot({ dict: it as LocalizationDictionary });
    const dialog = await openFormatDialog(it as LocalizationDictionary);
    const labels = within(dialog)
      .getAllByRole('tab')
      .map((tab) => tab.textContent);
    const tabs = it.formatDialog.tabs;
    expect(labels).toEqual([
      tabs.layout,
      tabs.headers,
      tabs.dimensions,
      tabs.values,
      tabs.conditional,
      tabs.grandTotals,
    ]);
  });
});

describe('values tab', () => {
  test('applying a values format reaches the engine and onOptionsChange', async () => {
    const onOptionsChange = vi.fn();
    const ref = renderPivot({ onOptionsChange });
    const dialog = await openFormatDialog();
    openTab(dialog, 'Values');

    fireEvent.click(within(dialog).getByLabelText('Format as percentage'));
    clickButton(dialog, 'Apply');

    expect(engineOf(ref).getFormat().values.percentage).toBe(true);
    await waitFor(() =>
      expect(onOptionsChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          format: expect.objectContaining({
            values: expect.objectContaining({ percentage: true }),
          }),
        }),
      ),
    );
  });

  test('a per-measure override lands in valuesByMeasure only', async () => {
    const ref = renderPivot();
    const dialog = await openFormatDialog();
    openTab(dialog, 'Values');

    choose(comboboxes(dialog)[0], 'Revenue (Sum)');
    fireEvent.click(within(dialog).getByLabelText('Format as percentage'));
    clickButton(dialog, 'Apply');

    const format = engineOf(ref).getFormat();
    expect(format.valuesByMeasure['revenue:sum']?.percentage).toBe(true);
    expect(format.values.percentage).toBe(false);
  });

  // Bug fix: the dialog's own aggregation lookup keyed `distinctCount`, so
  // the engine's `distinctcount` rendered as the raw key.
  test('measure captions use the localized aggregation name', async () => {
    renderPivot({
      options: {
        data: {
          ...baseOptions.data,
          measures: [
            { uniqueName: 'revenue', aggregation: 'sum' },
            { uniqueName: 'agentName', aggregation: 'distinctcount' },
          ],
        },
      },
    });
    const dialog = await openFormatDialog();
    openTab(dialog, 'Values');

    fireEvent.mouseDown(comboboxes(dialog)[0]);
    expect(
      screen.getByRole('option', { name: 'Agent (Distinct count)' }),
    ).toBeDefined();
  });
});

describe('font size', () => {
  // Bug fix: the slider had no `value`, so its thumb sat at the minimum (10)
  // whatever the section's size.
  test('the slider reflects and edits the section font size', async () => {
    const ref = renderPivot();
    const dialog = await openFormatDialog();
    openTab(dialog, 'Headers');

    const headersSize = new PivotEngine().getFormat().headers.fontSize;
    const slider = within(dialog).getByRole('slider');
    expect(slider.getAttribute('aria-valuenow')).toBe(String(headersSize));

    fireEvent.change(slider, { target: { value: 20 } });
    expect(
      within(dialog).getByRole('slider').getAttribute('aria-valuenow'),
    ).toBe('20');
    expect(within(dialog).getByText(/\(20px\)/)).toBeDefined();

    clickButton(dialog, 'Apply');
    expect(engineOf(ref).getFormat().headers.fontSize).toBe(20);
  });
});

describe('conditional tab', () => {
  // For the two walkthroughs below (between bounds, expression dialog): they
  // mount the pivot, then drive the rule editor through several menus and
  // nested dialogs, which takes about a second alone and several times that
  // when the whole suite runs in parallel.
  const slow = { timeout: 15_000 };

  test('an added rule reaches the engine with the default style', async () => {
    const onOptionsChange = vi.fn();
    const ref = renderPivot({ onOptionsChange });
    const dialog = await openFormatDialog();
    openTab(dialog, 'Conditional');

    clickButton(dialog, 'Add rule');
    clickButton(dialog, 'Apply');

    const [rule] = engineOf(ref).getFormat().conditional;
    expect(rule).toMatchObject({
      operator: 'gt',
      value: 0,
      style: {
        textColor: '#000000',
        backgroundColor: '#FFEB3B',
        fontWeight: 600,
        italic: false,
      },
    });
    expect(rule.id).toEqual(expect.any(String));
    await waitFor(() =>
      expect(onOptionsChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          format: expect.objectContaining({
            conditional: [expect.objectContaining({ operator: 'gt' })],
          }),
        }),
      ),
    );
  });

  test(
    'a rule on a measure compares against a constant between two bounds',
    slow,
    async () => {
      const ref = renderPivot();
      const dialog = await openFormatDialog();
      openTab(dialog, 'Conditional');
      clickButton(dialog, 'Add rule');

      // The summary line carries the operator symbol.
      const summary = within(dialog).getByText('All measures > 0');
      fireEvent.click(summary);

      choose(comboboxShowing(dialog, 'All measures'), 'Revenue (Sum)');
      choose(comboboxShowing(dialog, 'Greater than (>)'), 'Between');
      fireEvent.change(within(dialog).getByLabelText('Value'), {
        target: { value: '100' },
      });
      fireEvent.change(within(dialog).getByLabelText('Upper bound'), {
        target: { value: '500' },
      });
      expect(
        within(dialog).getByText('Revenue (Sum) ∈ [100, 500]'),
      ).toBeDefined();

      clickButton(dialog, 'Apply');
      expect(engineOf(ref).getFormat().conditional[0]).toMatchObject({
        measure: 'revenue:sum',
        operator: 'between',
        value: 100,
        value2: 500,
      });
    },
  );

  test('the expression dialog keeps a draft until Apply', slow, async () => {
    const ref = renderPivot();
    const dialog = await openFormatDialog();
    openTab(dialog, 'Conditional');
    clickButton(dialog, 'Add rule');
    fireEvent.click(within(dialog).getByText('All measures > 0'));
    choose(comboboxShowing(dialog, 'Greater than (>)'), 'Expression');

    // While the expression dialog is open the Format dialog is aria-hidden,
    // so wait for the former to unmount before querying the latter again.
    const gone = (el: HTMLElement) =>
      waitFor(() => expect(el.isConnected).toBe(false));
    // The expression dialog portals in after the Format dialog, so it is
    // the last one in the document.
    const openExpression = () => {
      clickButton(dialog, 'Edit expression');
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
      return dialogs[dialogs.length - 1];
    };

    // A clause added and then cancelled is dropped…
    let expr = openExpression();
    clickButton(expr, 'Add Clause');
    expect(hasComboboxShowing(expr, 'Region')).toBe(true);
    clickButton(expr, 'Cancel');
    await gone(expr);

    // …so the next open starts from the rule's (still empty) expression.
    expr = openExpression();
    expect(hasComboboxShowing(expr, 'Region')).toBe(false);

    // Apply commits the draft to the rule, and the next open re-seeds from it.
    clickButton(expr, 'Add Clause');
    clickButton(expr, 'Apply');
    await gone(expr);
    expect(
      within(dialog).getAllByText('1 clause (AND)').length,
    ).toBeGreaterThan(0);

    expr = openExpression();
    expect(hasComboboxShowing(expr, 'Region')).toBe(true);
    clickButton(expr, 'Cancel');
    await gone(expr);

    clickButton(dialog, 'Apply');
    const [rule] = engineOf(ref).getFormat().conditional;
    expect(rule.operator).toBe('expression');
    expect(rule.expression).toMatchObject({
      join: 'and',
      clauses: [
        { kind: 'dim', target: 'region', operator: 'equals', value: '' },
      ],
    });
  });
});

describe('reset', () => {
  // Bug fix: the dialog kept its own copy of the defaults, which had drifted
  // from the engine's (headers 14/700 against 12/600).
  test('Reset restores the engine defaults', async () => {
    const ref = renderPivot({
      options: {
        ...baseOptions,
        layout: { alternateRows: true, title: 'Q3' },
        format: {
          headers: { fontSize: 20, fontWeight: 400 },
          values: { percentage: true },
          conditional: [
            { operator: 'gt', value: 1, style: { textColor: '#FF0000' } },
          ],
          conditionalMode: 'all',
        },
      },
    });
    const dialog = await openFormatDialog();
    clickButton(dialog, 'Reset');

    const fresh = new PivotEngine().getFormat();
    const format = engineOf(ref).getFormat();
    expect(format.headers).toEqual(fresh.headers);
    expect(format.values).toEqual(fresh.values);
    expect(format.dimensions).toEqual(fresh.dimensions);
    expect(format.grandTotals).toEqual(fresh.grandTotals);
    expect(format.valuesByMeasure).toEqual({});
    expect(format.conditional).toEqual([]);
    expect(format.conditionalMode).toBe('first');
    expect(format.layout).toMatchObject({
      ...fresh.layout,
      enableDrillThrough: true,
      density: 'Standard',
      title: '',
      note: '',
    });
  });
});

describe('layout tab', () => {
  test('both totals axes can be pinned during scroll', async () => {
    const ref = renderPivot();
    const dialog = await openFormatDialog();
    openTab(dialog, 'Grand totals');

    const pins = within(dialog).getAllByLabelText('Pin during scroll');
    expect(pins).toHaveLength(2);
    pins.forEach((pin) => fireEvent.click(pin));
    clickButton(dialog, 'Apply');

    expect(engineOf(ref).getFormat().layout).toMatchObject({
      totalsRowsSticky: true,
      totalsColumnsSticky: true,
    });
  });

  test('layout edits reach the engine', async () => {
    const ref = renderPivot();
    const dialog = await openFormatDialog();

    fireEvent.change(within(dialog).getByPlaceholderText('Report title'), {
      target: { value: 'Sales' },
    });
    clickButton(dialog, 'Compact');
    clickButton(dialog, 'Apply');

    expect(engineOf(ref).getFormat().layout).toMatchObject({
      title: 'Sales',
      density: 'Compact',
    });
  });

  test('Cancel discards the drafts and the next open re-seeds', async () => {
    const ref = renderPivot();
    let dialog = await openFormatDialog();
    fireEvent.change(within(dialog).getByPlaceholderText('Report title'), {
      target: { value: 'Draft' },
    });
    clickButton(dialog, 'Cancel');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(engineOf(ref).getFormat().layout.title).toBeUndefined();

    dialog = await openFormatDialog();
    expect(
      (within(dialog).getByPlaceholderText('Report title') as HTMLInputElement)
        .value,
    ).toBe('');
  });
});
