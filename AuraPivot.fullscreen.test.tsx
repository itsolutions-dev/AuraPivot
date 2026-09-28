// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from 'vitest';
import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { VirtuosoMockContext } from 'react-virtuoso';
import Pivot from './AuraPivot';
import type { LocalizationDictionary, PivotOptions } from './index';
import en from './localization/en.json';

afterEach(() => {
  cleanup();
  delete (document as { fullscreenElement?: Element }).fullscreenElement;
});

const options: PivotOptions = {
  data: {
    fields: [{ uniqueName: 'region', dataType: 'string', caption: 'Region' }],
    dimensions: [{ axis: 'row', uniqueName: 'region' }],
  },
};

/** Puts `el` in (or `null` out of) fullscreen as far as the page can tell. */
const setFullscreen = (el: Element | null) =>
  act(() => {
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => el,
    });
    document.dispatchEvent(new Event('fullscreenchange'));
  });

const renderPivot = () => {
  const { container } = render(
    <VirtuosoMockContext.Provider
      value={{ viewportHeight: 600, itemHeight: 32 }}
    >
      <Pivot
        options={options}
        dataSource={[{ region: 'North' }]}
        localization={en as LocalizationDictionary}
        width={800}
        height={600}
      />
    </VirtuosoMockContext.Provider>,
  );
  return container.firstElementChild as HTMLElement;
};

describe('overlays in fullscreen', () => {
  test('dialogs portal into the pivot root while it is fullscreen', async () => {
    const root = renderPivot();
    await screen.findByText('North');
    setFullscreen(root);
    fireEvent.click(
      screen.getByText(en.toolbar.fields, { selector: 'button' }),
    );
    expect(root.contains(await screen.findByRole('dialog'))).toBe(true);
  });

  test('and into document.body otherwise', async () => {
    const root = renderPivot();
    await screen.findByText('North');
    fireEvent.click(
      screen.getByText(en.toolbar.fields, { selector: 'button' }),
    );
    expect(root.contains(await screen.findByRole('dialog'))).toBe(false);
  });

  test('tooltips follow too', async () => {
    const root = renderPivot();
    await screen.findByText('North');
    setFullscreen(root);
    fireEvent.mouseOver(
      screen.getByRole('button', { name: en.toolbar.exitFullscreen }),
    );
    expect(root.contains(await screen.findByRole('tooltip'))).toBe(true);
  });

  test('menus (popovers) follow too', async () => {
    const root = renderPivot();
    await screen.findByText('North');
    setFullscreen(root);
    fireEvent.click(
      screen.getByText(en.toolbar.export, { selector: 'button' }),
    );
    expect(root.contains(await screen.findByRole('menu'))).toBe(true);
  });
});
