/**
 * Pivot grid layout: column sizes, density presets, font scaling, header and
 * row background tints, and the axis-key helpers.
 */
import { darken, lighten } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import type { AxisLeaf } from '../../pivot-core/matrix/MatrixComputer';

// Theme palettes built from a full color object carry numeric shades
// (100..900) at runtime, but MUI's PaletteColor type only declares
// light/main/dark. Themes built from { main } alone return undefined and
// every caller falls back.
const primaryShade = (primary: unknown, key: number): string | undefined =>
  (primary as Record<number, string | undefined>)[key];

/** Default header background: a light primary tint, a deep one in dark mode. */
export const headerBg = (theme: Theme): string | undefined =>
  primaryShade(
    theme.palette.primary,
    theme.palette.mode === 'dark' ? 900 : 100,
  );

/** Flex justification matching a text alignment. */
export const justifyFor = (align: string): string =>
  align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';

/** An axis key without its "||M:<measure>" variant suffix. */
export const baseKey = (key: string): string => String(key).split('||M:')[0];

/** Key of a row/column pair in the `cellsByBase` index. */
export const cellBaseKey = (rowKey: string, colKey: string): string =>
  `${baseKey(rowKey)}::${baseKey(colKey)}`;

// With the Measures field on rows each tree node is rendered once per
// measure; `nodeKey` names the underlying tree node, which owns the
// expansion state.
export const nodeKeyOf = (leaf: AxisLeaf): string => leaf.nodeKey || leaf.key;

export const INDENT_PX = 16;
export const CELL_MIN_WIDTH = 96;
export const CHEVRON_COL_WIDTH = 32;
export const LABEL_COL_WIDTH = 240;

const DENSITY = {
  Compact: {
    rowHeight: 20,
    rowPaddingY: '1px',
    rowLineHeight: '18px',
    bodyFontSizeRate: 0.85,
    bodyPaddingX: '8px',
    headerRowHeight: 36,
    headerCellMinHeight: 22,
    headerFontSizeRate: 0.85,
    headerPaddingY: '2px',
    headerPaddingX: '8px',
  },
  Standard: {
    rowHeight: 24,
    rowPaddingY: '2px',
    rowLineHeight: '20px',
    bodyFontSizeRate: 1,
    bodyPaddingX: '10px',
    headerRowHeight: 48,
    headerCellMinHeight: 26,
    headerFontSizeRate: 1,
    headerPaddingY: '4px',
    headerPaddingX: '10px',
  },
  Comfortable: {
    rowHeight: 32,
    rowPaddingY: '6px',
    rowLineHeight: '20px',
    bodyFontSizeRate: 1.25,
    bodyPaddingX: '12px',
    headerRowHeight: 56,
    headerCellMinHeight: 32,
    headerFontSizeRate: 1.25,
    headerPaddingY: '8px',
    headerPaddingX: '12px',
  },
};
export type DensityConfig = (typeof DENSITY)[keyof typeof DENSITY];
export const resolveDensity = (key?: string | null): DensityConfig =>
  DENSITY[key as keyof typeof DENSITY] || DENSITY.Standard;

// Scale a CSS fontSize value ("13px" | "0.9rem" | 13) by a numeric rate.
// Returns a CSS string with the original unit (defaults to px) or undefined
// when no input is provided so the caller can fall back to its own default.
export const scaleFontSize = (
  raw: string | number | null | undefined,
  rate = 1,
  fallback?: string | number,
): string | undefined => {
  const r = typeof rate === 'number' && rate > 0 ? rate : 1;
  if (raw == null || raw === '') {
    return fallback != null ? scaleFontSize(fallback, r) : undefined;
  }
  if (typeof raw === 'number') return `${raw * r}px`;
  const m = String(raw).match(/^([\d.]+)\s*([a-z%]*)$/i);
  if (!m) return String(raw);
  const n = parseFloat(m[1]);
  const unit = m[2] || 'px';
  return `${n * r}${unit}`;
};

export const SHADE_AMOUNT = [0, 0.04, 0.08, 0.12];

// darken/lighten throw on colors they cannot parse (CSS variables, named
// colors); those are left untouched.
const safeTint = (
  tint: typeof darken,
  color: string,
  amount: number,
): string => {
  try {
    return tint(color, amount);
  } catch {
    return color;
  }
};

export const safeDarken = (color: string, amount: number): string =>
  safeTint(darken, color, amount);

const tintForMode = (color: string, amount: number, mode: string) =>
  !color || !amount
    ? color
    : safeTint(mode === 'dark' ? lighten : darken, color, amount);

const GRAND_TOTAL_TINT = 0.18;

/** Striped-row and grand-total background tints for the current theme. */
export const rowTints = (
  theme: Theme,
  shade: number | undefined,
): { stripedBg: string; grandTotalBg: string } => {
  const basePaper = theme.palette.background.paper;
  return {
    stripedBg: tintForMode(
      basePaper,
      SHADE_AMOUNT[Math.max(0, Math.min(3, shade || 0))],
      theme.palette.mode,
    ),
    grandTotalBg: tintForMode(basePaper, GRAND_TOTAL_TINT, theme.palette.mode),
  };
};
