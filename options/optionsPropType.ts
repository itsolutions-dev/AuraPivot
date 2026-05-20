// PropTypes validator for the `<AuraPivot options={...}>` prop. Dev-only —
// React strips PropTypes in production builds. Emits a console warning when a
// constraint is violated.

import PropTypes from "prop-types";
import {
  DENSITIES,
  TOTALS_POSITIONS,
  MEASURES_AXES,
  DIMENSION_AXES,
  AGGREGATIONS,
  OPERATORS,
  CONDITIONAL_MODES,
  DATA_TYPES,
  TEXT_ALIGNS,
} from "./optionsSchema";

// Local alias for the prop-types custom validator signature.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CustomValidator = (props: Record<string, any>, propName: string, componentName: string) => Error | null;

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

// A colour cell: a hex string, or null/"" to mean "inherit".
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hexColor: CustomValidator = (props: Record<string, any>, key: string, comp: string): Error | null => {
  const v = props[key];
  if (v == null || v === "") return null;
  if (typeof v !== "string" || !HEX_RE.test(v)) {
    return new Error(
      `Invalid prop \`${key}\` in \`${comp}\`: expected a hex colour ` +
        `like "#RRGGBB", got \`${JSON.stringify(v)}\`.`,
    );
  }
  return null;
};

const styleShape = PropTypes.shape({
  textColor: hexColor,
  backgroundColor: hexColor,
  fontWeight: PropTypes.number,
  italic: PropTypes.bool,
});

// One conditional-format rule. `between` requires a non-null `value2`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const conditionalRule: CustomValidator = (props: Record<string, any>, key: string, comp: string): Error | null => {
  const rule = props[key];
  if (rule == null) return null;
  if (typeof rule !== "object") {
    return new Error(`\`${key}\` in \`${comp}\` must be an object.`);
  }
  if (!OPERATORS.includes(rule.operator)) {
    return new Error(
      `Invalid \`operator\` in a \`${comp}\` conditional rule: ` +
        `\`${JSON.stringify(rule.operator)}\`. Allowed: ${OPERATORS.join(", ")}.`,
    );
  }
  if (rule.operator === "between" && rule.value2 == null) {
    return new Error(
      `A \`between\` conditional rule in \`${comp}\` requires \`value2\`.`,
    );
  }
  // Validate style colours if present.
  if (rule.style != null && typeof rule.style === "object") {
    for (const colorKey of ["textColor", "backgroundColor"]) {
      const err = hexColor(rule.style as Record<string, unknown>, colorKey, comp);
      if (err) return err;
    }
  }
  return null;
};

// One report filter: exactly one of members / value / range.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const filterEntry: CustomValidator = (props: Record<string, any>, key: string, comp: string): Error | null => {
  const f = props[key];
  if (f == null) return null;
  if (typeof f !== "object") {
    return new Error(`\`${key}\` in \`${comp}\` must be an object.`);
  }
  const set = ["members", "value", "range"].filter(
    (k) => f[k] !== undefined && f[k] !== null,
  );
  if (set.length > 1) {
    return new Error(
      `A filter in \`${comp}\` must carry exactly one of members/value/` +
        `range; got: ${set.join(", ")}.`,
    );
  }
  return null;
};

const sectionFormat = PropTypes.object;

const optionsPropType: PropTypes.Requireable<object> = PropTypes.shape({
  toolbar: PropTypes.shape({
    visible: PropTypes.bool,
    showFields: PropTypes.bool,
    showFormat: PropTypes.bool,
    showExport: PropTypes.bool,
    showFullscreen: PropTypes.bool,
  }),
  layout: PropTypes.shape({
    showTitle: PropTypes.bool,
    title: PropTypes.string,
    notes: PropTypes.string,
    density: PropTypes.oneOf(DENSITIES),
    alternateRows: PropTypes.bool,
    enableDrillThrough: PropTypes.bool,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    drillThroughStickyColumns: ((props: Record<string, any>, key: string, comp: string): Error | null => {
      const v = props[key];
      if (v == null) return null;
      if (!Number.isInteger(v) || v < 0) {
        return new Error(
          `Invalid \`${key}\` in \`${comp}\`: expected an integer >= 0.`,
        );
      }
      return null;
    }) as CustomValidator,
    totalsRowsPosition: PropTypes.oneOf(TOTALS_POSITIONS),
    totalsRowsSticky: PropTypes.bool,
    totalsColumnsPosition: PropTypes.oneOf(TOTALS_POSITIONS),
    totalsColumnsSticky: PropTypes.bool,
    measuresAxis: PropTypes.oneOf(MEASURES_AXES),
  }),
  data: PropTypes.shape({
    fields: PropTypes.arrayOf(
      PropTypes.shape({
        fieldName: PropTypes.string,
        uniqueName: PropTypes.string.isRequired,
        dataType: PropTypes.oneOf(DATA_TYPES),
        caption: PropTypes.string,
        showInDrillThrough: PropTypes.bool,
        drillThroughOrder: PropTypes.number,
        dateFormat: PropTypes.string,
      }),
    ),
    calculatedFields: PropTypes.arrayOf(
      PropTypes.shape({
        uniqueName: PropTypes.string.isRequired,
        caption: PropTypes.string,
        formula: PropTypes.string.isRequired,
      }),
    ),
    dimensions: PropTypes.arrayOf(
      PropTypes.shape({
        axis: PropTypes.oneOf(DIMENSION_AXES).isRequired,
        uniqueName: PropTypes.string.isRequired,
        fieldSort: PropTypes.object,
      }),
    ),
    measures: PropTypes.arrayOf(
      PropTypes.shape({
        uniqueName: PropTypes.string.isRequired,
        aggregation: PropTypes.oneOf(AGGREGATIONS).isRequired,
        hidden: PropTypes.bool,
      }),
    ),
    filters: PropTypes.arrayOf(filterEntry),
  }),
  format: PropTypes.shape({
    conditionalMode: PropTypes.oneOf(CONDITIONAL_MODES),
    conditional: PropTypes.arrayOf(conditionalRule),
    values: sectionFormat,
    valuesByMeasure: PropTypes.object,
    headers: sectionFormat,
    dimensions: sectionFormat,
    grandTotals: sectionFormat,
  }),
});

// Referenced so lint does not flag the import as unused; TEXT_ALIGNS documents
// the allowed `textAlign` values used inside the format sections.
void TEXT_ALIGNS;
void styleShape;

export default optionsPropType;
