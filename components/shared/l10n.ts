import type PivotEngine from '../../pivot-core/PivotEngine';
import { aggregationLabel } from '../../pivot-core/aggregation/labels';

export { aggregationLabel };

/**
 * One section of the localization dictionary (`grid`, `buttons`, …) as a map
 * of captions. Missing sections read as empty, so call sites can write
 * `tGrid.total || 'Total'` without guarding.
 */
export const section = (t: unknown, name: string): Record<string, string> => {
  const value = (t as Record<string, unknown> | null | undefined)?.[name];
  return value && typeof value === 'object'
    ? (value as Record<string, string>)
    : {};
};

/**
 * "<field caption> (<aggregation>)" — the label a measure gets in pickers
 * where the same field can appear once per aggregation. A calculated field's
 * own caption wins over the dataset metadata, as it does in the engine.
 */
export const measureCaption = (
  engine: PivotEngine,
  measure: { uniqueName: string; aggregation: string },
  t: unknown,
): string => {
  const calc = engine
    .getCalculatedFields()
    .find((f) => f.uniqueName === measure.uniqueName);
  const base =
    calc?.caption ||
    engine.getMetadata()[measure.uniqueName]?.caption ||
    measure.uniqueName;
  return `${base} (${aggregationLabel(t, measure.aggregation)})`;
};
