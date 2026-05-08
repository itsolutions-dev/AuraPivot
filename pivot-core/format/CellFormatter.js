/**
 * Resolves the effective visual style for a value cell given:
 *   - the engine's general format (font, colors, alignment, number format)
 *   - the ordered list of conditional formatting rules
 *
 * Conditional rule shape:
 *   {
 *     id: string,
 *     measure?: string,     // uniqueName; if omitted the rule applies to any measure
 *     operator: 'gt'|'gte'|'lt'|'lte'|'eq'|'neq'|'between',
 *     value: number,
 *     value2?: number,      // only used by 'between'
 *     style: {
 *       textColor?: string,
 *       backgroundColor?: string,
 *       fontWeight?: number|string,
 *       italic?: boolean,
 *     }
 *   }
 *
 * The first matching rule wins.
 */

const resolveOperand = (kind, constVal, measureRef, getMeasureValue) => {
  if (kind === 'measure') {
    if (!measureRef || typeof getMeasureValue !== 'function') return NaN;
    const resolved = getMeasureValue(measureRef);
    return Number.isFinite(resolved) ? Number(resolved) : NaN;
  }
  return Number(constVal);
};

const cmpString = (operator, value, target) => {
  const a = value === null || value === undefined ? '' : String(value);
  const b = target === null || target === undefined ? '' : String(target);
  switch (operator) {
    case 'equals':
      return a === b;
    case 'startsWith':
      return a.startsWith(b);
    case 'endsWith':
      return a.endsWith(b);
    case 'contains':
      return a.indexOf(b) !== -1;
    default:
      return false;
  }
};

const cmpNumeric = (operator, value, target, target2) => {
  if (!Number.isFinite(value)) return false;
  if (!Number.isFinite(target)) return false;
  switch (operator) {
    case 'gt':
      return value > target;
    case 'gte':
      return value >= target;
    case 'lt':
      return value < target;
    case 'lte':
      return value <= target;
    case 'eq':
      return value === target;
    case 'neq':
      return value !== target;
    case 'between':
      if (!Number.isFinite(target2)) return false;
      return (
        value >= Math.min(target, target2) &&
        value <= Math.max(target, target2)
      );
    default:
      return false;
  }
};

const evaluateClause = (clause, cellValue, getMeasureValue, dimensionValues) => {
  if (!clause) return false;
  let result;
  if (clause.kind === 'dim') {
    const dv = dimensionValues ? dimensionValues[clause.target] : undefined;
    result = cmpString(clause.operator, dv, clause.value);
  } else {
    const ref = clause.target;
    let raw;
    if (!ref || ref === '__current__') {
      raw = cellValue;
    } else if (typeof getMeasureValue === 'function') {
      raw = getMeasureValue(ref);
    } else {
      raw = null;
    }
    result = cmpNumeric(
      clause.operator,
      Number(raw),
      Number(clause.value),
      Number(clause.value2)
    );
  }
  return clause.not ? !result : result;
};

const evaluateExpression = (
  expression,
  cellValue,
  getMeasureValue,
  dimensionValues
) => {
  if (!expression || !Array.isArray(expression.clauses)) return false;
  if (expression.clauses.length === 0) return false;
  const join = expression.join === 'or' ? 'or' : 'and';
  const results = expression.clauses.map((c) =>
    evaluateClause(c, cellValue, getMeasureValue, dimensionValues)
  );
  return join === 'or' ? results.some(Boolean) : results.every(Boolean);
};

const evaluate = (rule, value, getMeasureValue, dimensionValues) => {
  if (rule.operator === 'expression') {
    return evaluateExpression(
      rule.expression,
      value,
      getMeasureValue,
      dimensionValues
    );
  }
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return false;
  }
  const v = resolveOperand(
    rule.valueKind,
    rule.value,
    rule.valueRef,
    getMeasureValue
  );
  const v2 = resolveOperand(
    rule.value2Kind,
    rule.value2,
    rule.value2Ref,
    getMeasureValue
  );
  return cmpNumeric(rule.operator, value, v, v2);
};

/**
 * Pick the section of the format object matching the requested scope:
 *   - 'values'     → data cells (numeric results of aggregations)
 *   - 'headers'    → column header cells
 *   - 'dimensions' → row label / dimension cells
 * Falls back to the legacy `general` key for back-compat.
 */
const pickSection = (format, scope, measureKey) => {
  if (!format) return null;
  if (scope === 'headers') return format.headers || format.general || null;
  if (scope === 'dimensions')
    return format.dimensions || format.general || null;
  if (scope === 'grandTotals')
    return format.grandTotals || format.headers || format.general || null;
  return getValuesSection(format, measureKey);
};

/**
 * Return the effective "values" section for a given measureKey, merging the
 * per-measure override (if any) over the default values section. The measure
 * uniqueName is extracted from the `<uniqueName>:<aggregation>` measureKey.
 */
export const getValuesSection = (format, measureKey) => {
  if (!format) return null;
  const base = format.values || format.general || {};
  if (!measureKey) return base;
  const byMeasure = format.valuesByMeasure || {};
  const byKey = byMeasure[measureKey];
  return byKey ? { ...base, ...byKey } : base;
};

export const resolveCellStyle = ({
  format,
  cell,
  measureKey,
  scope = 'values',
  getMeasureValue,
  dimensionValues,
}) => {
  if (!format) return null;
  const section = pickSection(format, scope, measureKey);
  const { conditional, conditionalMode } = format;
  const mode = conditionalMode === 'all' ? 'all' : 'first';

  const baseStyle = {
    fontFamily: section?.fontFamily || 'inherit',
    fontSize: section?.fontSize ? `${section.fontSize}px` : '13px',
    fontWeight: section?.fontWeight || 400,
    fontStyle: section?.italic ? 'italic' : 'normal',
    color: section?.textColor || undefined,
    backgroundColor: section?.backgroundColor || undefined,
    textAlign: section?.textAlign || (scope === 'values' ? 'right' : 'left'),
  };

  // Conditional rules only apply to data/value cells.
  if (scope !== 'values') return baseStyle;
  if (!conditional || conditional.length === 0) return baseStyle;
  // Expression rules can match cells without numeric data; non-expression
  // rules need a live cell value to compare against.
  const cellValue = cell?.value;

  const matches = (r) => {
    if (!r) return false;
    if (r.operator !== 'expression' && !cell) return false;
    if (r.measure && measureKey) {
      const stored = String(r.measure);
      // `measureKey` has the shape `uniqueName:agg`. If the rule target
      // carries a colon it's a full measureKey — require an exact match to
      // scope the rule to one aggregation. Otherwise it's a legacy
      // uniqueName target and applies to every aggregation of that field.
      if (stored.includes(':')) {
        if (stored !== measureKey) return false;
      } else if (!measureKey.startsWith(`${stored}:`)) {
        return false;
      }
    }
    return evaluate(r, cellValue, getMeasureValue, dimensionValues);
  };

  // Unified walk: apply each matching rule in order, stop when a matching
  // rule's effective mode is 'first'. A rule's own `mode` ('first' | 'all')
  // overrides the global mode; `'inherit'` (or missing) falls back to it.
  let style = { ...baseStyle };
  let matched = false;
  for (const r of conditional) {
    if (!matches(r)) continue;
    matched = true;
    style = {
      ...style,
      color: r.style?.textColor || style.color,
      backgroundColor: r.style?.backgroundColor || style.backgroundColor,
      fontWeight: r.style?.fontWeight ?? style.fontWeight,
      fontStyle: r.style?.italic ? 'italic' : style.fontStyle,
    };
    const ruleMode =
      r.mode && r.mode !== 'inherit' ? r.mode : mode;
    if (ruleMode === 'first') break;
  }
  return matched ? style : baseStyle;
};

const getBrowserLocale = () =>
  (typeof navigator !== 'undefined' && navigator.language) || 'en-US';

const getSystemSeparators = () => {
  try {
    const parts = new Intl.NumberFormat(getBrowserLocale()).formatToParts(
      12345.6
    );
    return {
      group: parts.find((p) => p.type === 'group')?.value || ',',
      decimal: parts.find((p) => p.type === 'decimal')?.value || '.',
    };
  } catch (e) {
    return { group: ',', decimal: '.' };
  }
};

const LOCALE_CURRENCY = {
  'en-US': '$',
  'en-CA': '$',
  'en-GB': '£',
  'en-AU': '$',
  it: '€',
  'it-IT': '€',
  de: '€',
  'de-DE': '€',
  fr: '€',
  'fr-FR': '€',
  es: '€',
  'es-ES': '€',
  'pt-PT': '€',
  'pt-BR': 'R$',
  ja: '¥',
  'ja-JP': '¥',
};

const getSystemCurrency = () => {
  const locale = getBrowserLocale();
  if (LOCALE_CURRENCY[locale]) return LOCALE_CURRENCY[locale];
  const short = locale.split('-')[0];
  return LOCALE_CURRENCY[short] || '$';
};

/**
 * Format a numeric value according to the section's display options.
 *
 * Recognized options:
 *   - thousandSeparator:  'System' | 'None' | '.' | ','         (default 'System')
 *   - decimalSeparator:   'System' | '.' | ','                  (default 'System')
 *   - numberOfDecimals:   'Default' | 1..9                      ('Default' = no rounding)
 *   - currencySymbol:     'None' | 'System' | '$' | '€' | '£' | 'Other'
 *   - currencyOther:      string (used when currencySymbol === 'Other')
 *   - currencyAlignment:  'Left' | 'Right'                      (default 'Left')
 *   - nullValue:          string shown for null / non-finite values
 *   - percentage:         boolean — value is multiplied by 100 and suffixed with %
 *
 * The legacy flags (thousandsSeparator bool, decimalPlaces, currencySymbol as a
 * plain string) are still honored for back-compat with saved formats.
 */
export const formatNumberWithFormat = (value, section) => {
  const s = section || {};
  const nullText = s.nullValue ?? '';
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return nullText;
  }

  const sys = getSystemSeparators();

  const thOpt =
    s.thousandSeparator !== undefined
      ? s.thousandSeparator
      : s.thousandsSeparator === false
        ? 'None'
        : s.thousandsSeparator === true
          ? 'System'
          : 'System';
  const decOpt = s.decimalSeparator ?? 'System';

  const groupSep =
    thOpt === 'System' ? sys.group : thOpt === 'None' ? '' : thOpt;
  const decimalSep = decOpt === 'System' ? sys.decimal : decOpt;

  const numDecimals =
    s.numberOfDecimals !== undefined ? s.numberOfDecimals : s.decimalPlaces;

  let displayValue = s.percentage ? value * 100.0 : value;

  let intPart;
  let fracPart;
  if (
    numDecimals === 'Default' ||
    numDecimals === undefined ||
    numDecimals === null ||
    numDecimals === ''
  ) {
    const str = String(displayValue);
    const parts = str.split('.');
    intPart = parts[0];
    fracPart = parts[1] || '';
  } else {
    const d = Math.max(0, Math.min(9, Number(numDecimals)));
    const fixed = displayValue.toFixed(d);
    const parts = fixed.split('.');
    intPart = parts[0];
    fracPart = parts[1] || '';
  }

  const negative = intPart.startsWith('-');
  if (negative) intPart = intPart.slice(1);

  if (groupSep) {
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, groupSep);
  }

  let out = fracPart ? `${intPart}${decimalSep}${fracPart}` : intPart;
  if (negative) out = `-${out}`;
  if (s.percentage) out = `${out}%`;

  const currencyOpt =
    s.currencySymbol === undefined || s.currencySymbol === null
      ? 'None'
      : s.currencySymbol;

  if (currencyOpt && currencyOpt !== 'None' && currencyOpt !== '') {
    let symbol;
    if (currencyOpt === 'System') symbol = getSystemCurrency();
    else if (currencyOpt === 'Other') symbol = s.currencyOther || '';
    else symbol = currencyOpt;
    if (symbol) {
      const align = s.currencyAlignment === 'Right' ? 'Right' : 'Left';
      out = align === 'Right' ? `${out} ${symbol}` : `${symbol} ${out}`;
    }
  }

  return out;
};
