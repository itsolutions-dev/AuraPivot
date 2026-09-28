// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest';
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { VirtuosoMockContext } from 'react-virtuoso';
import Pivot from '../../AuraPivot';
import type { PivotOptions, ToolbarApi } from '../../index';

afterEach(cleanup);

const virtuosoMock = { viewportHeight: 600, itemHeight: 32 };

const options: PivotOptions = {
  data: {
    fields: [{ uniqueName: 'region', dataType: 'string' }],
    dimensions: [{ axis: 'row', uniqueName: 'region' }],
  },
};

const withCustomTab = (icon: string) => (api: ToolbarApi) => {
  const defaults = api.getTabs();
  api.getTabs = () => [
    ...defaults,
    { id: 'custom', title: 'Custom', icon, handler: () => {} },
  ];
};

const renderPivot = (
  beforeToolbarCreated: (api: ToolbarApi) => void,
  extra: Partial<React.ComponentProps<typeof Pivot>> = {},
) =>
  render(
    <VirtuosoMockContext.Provider value={virtuosoMock}>
      <Pivot
        options={options}
        dataSource={[{ region: 'North' }]}
        beforeToolbarCreated={beforeToolbarCreated}
        width={800}
        height={600}
        {...extra}
      />
    </VirtuosoMockContext.Provider>,
  );

describe('custom toolbar icons', () => {
  test('SVG markup renders as a sanitized SVG element', async () => {
    renderPivot(
      withCustomTab(
        '<svg viewBox="0 0 24 24" onload="window.__x=1"><path d="M1 1h2" onclick="x()"/><script>x()</script></svg>',
      ),
    );
    const button = await screen.findByText('Custom');
    const svg = button.closest('button')!.querySelector('svg');
    expect(svg?.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg?.outerHTML).not.toMatch(/onload|onclick|script/);
  });
});

describe('beforeToolbarCreated', () => {
  test('is not re-run by unrelated re-renders of the pivot', async () => {
    const hook = vi.fn(withCustomTab('fields'));
    const { rerender } = renderPivot(hook);
    await screen.findByText('Custom');
    const calls = hook.mock.calls.length;
    await act(async () => {
      rerender(
        <VirtuosoMockContext.Provider value={virtuosoMock}>
          <Pivot
            options={options}
            dataSource={[{ region: 'North' }]}
            beforeToolbarCreated={hook}
            width={801}
            height={600}
          />
        </VirtuosoMockContext.Provider>,
      );
    });
    expect(hook.mock.calls.length).toBe(calls);
  });
});
