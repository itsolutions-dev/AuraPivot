/**
 * Validation for the style values of a format object (`textColor`,
 * `fontSize`, …). They come from persisted, user-editable reports and end up
 * in MUI `sx`, which Emotion compiles into stylesheet rules — so a value such
 * as `red;}.x{…` would inject a page-wide CSS rule. Anything that is not a
 * plain value of the expected kind is dropped, and the default applies.
 */

import { hasOwn } from '../utils';

const COLOR = /^(#[0-9a-f]{3,8}|[a-z]+|(rgb|hsl)a?\([\d\s.,%/+-]*\))$/i;
const LENGTH = /^\d+(\.\d+)?\s*(px|pt|em|rem|%)?$/i;
const FONT_WEIGHT = /^(normal|bold|bolder|lighter|[1-9]00)$/;
// Family names, commas and quotes — none of `;{}()\:` that could end the
// declaration or open a function such as url().
const FONT_FAMILY = /^[\p{L}\p{N}\s,'"_-]*$/u;
const TEXT_ALIGN = new Set([
  'left',
  'center',
  'right',
  'justify',
  'start',
  'end',
]);

type Check = (value: unknown) => boolean;

// `''` and `null` are meaningful (reset / unset) wherever they are accepted.
const isColor: Check = (v) =>
  v === null || v === '' || (typeof v === 'string' && COLOR.test(v.trim()));

const CHECKS: Record<string, Check> = {
  textColor: isColor,
  backgroundColor: isColor,
  fontSize: (v) =>
    v === null ||
    v === '' ||
    (typeof v === 'number' && Number.isFinite(v)) ||
    (typeof v === 'string' && LENGTH.test(v.trim())),
  fontWeight: (v) =>
    (typeof v === 'number' && Number.isFinite(v)) ||
    (typeof v === 'string' && FONT_WEIGHT.test(v.trim())),
  fontFamily: (v) => typeof v === 'string' && FONT_FAMILY.test(v),
  textAlign: (v) => typeof v === 'string' && TEXT_ALIGN.has(v),
};

/** Copy of `style` without the style values that fail validation. */
export const sanitizeStyleValues = <T extends object>(style: T): T => {
  const out = { ...style } as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    if (
      hasOwn(CHECKS, key) &&
      out[key] !== undefined &&
      !CHECKS[key](out[key])
    ) {
      delete out[key];
    }
  }
  return out as T;
};
