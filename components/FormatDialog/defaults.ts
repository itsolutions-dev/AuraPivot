// Default values: what Reset restores (the engine defaults plus the layout
// keys this dialog adds), and the style a new conditional rule starts with.

import {
  DEFAULT_DIMENSIONS_FORMAT,
  DEFAULT_GRAND_TOTALS_FORMAT,
  DEFAULT_HEADERS_FORMAT,
  DEFAULT_LAYOUT,
  DEFAULT_VALUES_FORMAT,
} from '../../pivot-core/PivotEngine';
import type { LayoutValues, RuleStyle } from './types';

// ---------------------------------------------------------------------------
// DEFAULT_RULE_STYLE
// ---------------------------------------------------------------------------

export const DEFAULT_RULE_STYLE: RuleStyle = {
  textColor: '#000000',
  backgroundColor: '#FFEB3B',
  fontWeight: 600,
  italic: false,
};

// ---------------------------------------------------------------------------
// DEFAULTS
// ---------------------------------------------------------------------------

/**
 * What Reset restores: the engine's own defaults, plus the layout keys the
 * engine leaves unset but this dialog edits.
 */
export const DEFAULTS = {
  values: DEFAULT_VALUES_FORMAT,
  headers: DEFAULT_HEADERS_FORMAT,
  grandTotals: DEFAULT_GRAND_TOTALS_FORMAT,
  dimensions: DEFAULT_DIMENSIONS_FORMAT,
  layout: {
    ...DEFAULT_LAYOUT,
    enableDrillThrough: true,
    density: 'Standard',
    title: '',
    note: '',
  } as LayoutValues,
};
