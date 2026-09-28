// The comparison operators offered by rules and expression clauses, and how
// a stored measure reference resolves to one of the slice's measures.

import { hasOwn } from '../../../pivot-core/utils';
import { section } from '../../shared/l10n';
import type { MeasureEntry } from '../types';

// ---------------------------------------------------------------------------
// Operators and measure references
// ---------------------------------------------------------------------------

interface OperatorDef {
  /** Short form in a rule's summary line; text matches never appear there. */
  symbol?: string;
  /** Flat `formatDialog` key; without one, `formatDialog.operators.<op>`. */
  l10nKey?: string;
  fallback: string;
}

export const OPERATORS: Record<string, OperatorDef> = {
  gt: { symbol: '>', fallback: 'Greater than (>)' },
  gte: { symbol: '≥', fallback: 'Greater or equal (≥)' },
  lt: { symbol: '<', fallback: 'Less than (<)' },
  lte: { symbol: '≤', fallback: 'Less or equal (≤)' },
  eq: { symbol: '=', fallback: 'Equal (=)' },
  neq: { symbol: '≠', fallback: 'Not equal (≠)' },
  // The summary shows its operands as an interval.
  between: { symbol: '∈', fallback: 'Between' },
  expression: { symbol: 'ƒ(x)', fallback: 'Expression' },
  equals: { l10nKey: 'exprEquals', fallback: 'Equals' },
  startsWith: { l10nKey: 'exprStartsWith', fallback: 'Starts with' },
  endsWith: { l10nKey: 'exprEndsWith', fallback: 'Ends with' },
  contains: { l10nKey: 'exprContains', fallback: 'Contains' },
};

export const DIM_OPS = ['equals', 'startsWith', 'endsWith', 'contains'];
export const NUM_OPS = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between'];
/** A rule can also delegate its condition to an expression. */
export const RULE_OPS = [...NUM_OPS, 'expression'];

/** The definition of a stored operator key; a persisted rule may carry any. */
export const operatorDef = (op: string | undefined): OperatorDef | undefined =>
  op && hasOwn(OPERATORS, op) ? OPERATORS[op] : undefined;

export const operatorLabel = (
  tF: Record<string, string>,
  op: string,
): string => {
  const def = operatorDef(op);
  if (!def) return String(op);
  const caption = def.l10nKey ? tF[def.l10nKey] : section(tF, 'operators')[op];
  return caption || def.fallback;
};

/**
 * Whether a stored measure reference (a rule's `measure`, `valueRef`, …)
 * points at `m`. References are measure keys; ones saved before measure keys
 * existed hold the bare uniqueName, which still matches.
 */
export const refersTo = (ref: string | undefined, m: MeasureEntry): boolean =>
  !!ref &&
  (ref === m.measureKey ||
    (!String(ref).includes(':') && ref === m.uniqueName));

export const findMeasure = (
  measures: MeasureEntry[],
  ref: string | undefined,
): MeasureEntry | undefined => measures.find((m) => refersTo(ref, m));
