/**
 * Localization dictionary — nested sections of caption strings. Ships
 * unbundled: import one from `@its/aura-pivot/locales/en.json` /
 * `…/locales/it.json` or supply your own object with the same shape.
 */
export interface LocalizationDictionary {
  fieldsList?: Record<string, unknown>;
  grid?: Record<string, unknown>;
  aggregations?: Record<string, unknown>;
  buttons?: Record<string, unknown>;
  toolbar?: Record<string, unknown>;
  filterBar?: Record<string, unknown>;
  filterEditor?: Record<string, unknown>;
  dimensionFilter?: Record<string, unknown>;
  drillThrough?: Record<string, unknown>;
  calculatedField?: Record<string, unknown>;
  formatDialog?: Record<string, unknown>;
  /** Month / weekday names and date-related labels. */
  dates?: Record<string, unknown>;
  [section: string]: unknown;
}
