// Shared shapes of the Format dialog: the cell-style and layout sections it
// drafts, conditional rules with their expression clauses, and the measure /
// dimension entries its pickers list.

import type {
  CellStyleFormat,
  LayoutFormat,
} from '../../pivot-core/PivotEngine';

// ---------------------------------------------------------------------------
// Shared style-section shape used for values / headers / dimensions / totals
// ---------------------------------------------------------------------------

export type SectionValues = CellStyleFormat;

// ---------------------------------------------------------------------------
// Conditional-rule related shapes
// ---------------------------------------------------------------------------

export interface RuleStyle {
  textColor?: string;
  backgroundColor?: string;
  fontWeight?: number;
  italic?: boolean;
  fontSize?: number | string;
  fontFamily?: string;
  textAlign?: string;
}

export interface ExpressionClause {
  id?: string;
  kind?: 'dim' | 'measure';
  target?: string;
  operator?: string;
  value?: string | number;
  value2?: string | number;
  not?: boolean;
}

export interface Expression {
  join?: 'and' | 'or';
  clauses: ExpressionClause[];
}

export interface ConditionalRule {
  id?: string;
  measure?: string;
  operator?: string;
  value?: number | string;
  value2?: number | string;
  valueKind?: string;
  value2Kind?: string;
  valueRef?: string;
  value2Ref?: string;
  mode?: string;
  style?: RuleStyle;
  expression?: Expression;
}

// ---------------------------------------------------------------------------
// Measure entry used internally in the dialog
// ---------------------------------------------------------------------------

export interface MeasureEntry {
  uniqueName: string;
  aggregation: string;
  measureKey: string;
  caption: string;
  hidden: boolean;
}

export interface DimensionEntry {
  uniqueName: string;
  caption: string;
}

// ---------------------------------------------------------------------------
// Layout state shape
// ---------------------------------------------------------------------------

/** The engine's layout section, plus the keys this dialog also stores there. */
export interface LayoutValues extends LayoutFormat {
  enableDrillThrough?: boolean;
  density?: string;
}
