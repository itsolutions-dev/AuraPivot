import React, { useEffect, useMemo, useRef, useState } from 'react';

// Build-time flag injected by rollup `build-flags` plugin. Outside the
// bundler the token stays unresolved — `typeof` guard prevents
// ReferenceError.
declare const __FREEPLAN__: boolean | undefined;
const IS_FREEPLAN =
  typeof __FREEPLAN__ !== 'undefined' ? !!__FREEPLAN__ : false;
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
  Stack,
  Chip,
  Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { usePivot } from '../../context/PivotContext';
import { usePortalContainer } from '../../hooks/usePortalContainer';
import { parseFormulaExpression } from '../../pivot-core/matrix/FormulaEvaluator';

/**
 * Dialog to create or edit a calculated field.
 *
 * Formula syntax (mirrors WebDataRocks):
 *   sum("fieldName")     count("fieldName")     avg("fieldName")
 *   min("fieldName")     max("fieldName")       distinctcount("fieldName")
 *   runningSum("fieldName")     // progressive cumulative total
 *   IF(cond, then, else)        ABS(x)         MIN(a, b, ...)        MAX(a, b, ...)
 *   AND, OR                     ^ (power)      arithmetic + - * / =
 *
 * The formula is evaluated per (row × col) cell with field references
 * resolving to the pre-aggregated value at that intersection.
 */

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface CalculatedField {
  uniqueName: string;
  caption?: string;
  formula?: string;
}

interface AvailableField {
  uniqueName: string;
  caption?: string;
  isCalculated?: boolean;
  type?: string;
}

interface MeasureEntry {
  uniqueName: string;
  aggregation: string;
  isCalculated: boolean;
  caption: string;
}

interface ButtonGroupDef {
  title: string;
  buttons: ButtonDef[];
}

interface ButtonDef {
  label: string;
  insert: string;
  cursorOffset?: number;
  tooltip?: string;
  clear?: boolean;
  backspace?: boolean;
  variant?: 'danger' | 'muted' | 'op';
}

interface FormulaToken {
  type: 'text' | 'field';
  value?: string;
  uniqueName?: string;
}

// ---------------------------------------------------------------------------
// Props interfaces
// ---------------------------------------------------------------------------

export interface CalculatedFieldDialogProps {
  open: boolean;
  onClose: () => void;
  editField?: CalculatedField | null; // null → create mode, object → edit mode
}

interface CalculatorProps {
  title: string;
  onInsert: (text: string, cursorOffset?: number) => void;
  onClear?: () => void;
  onBackspace?: () => void;
}

// ---------------------------------------------------------------------------
// Calculator key definitions
// ---------------------------------------------------------------------------

const CALCULATOR_KEYS: ButtonDef[] = [
  { label: 'C', insert: '', clear: true, variant: 'danger' },
  { label: '(', insert: '(' },
  { label: ')', insert: ')' },
  { label: '⌫', insert: '', backspace: true, variant: 'muted' },
  { label: '7', insert: '7' },
  { label: '8', insert: '8' },
  { label: '9', insert: '9' },
  { label: '÷', insert: ' / ', variant: 'op' },
  { label: '4', insert: '4' },
  { label: '5', insert: '5' },
  { label: '6', insert: '6' },
  { label: '×', insert: ' * ', variant: 'op' },
  { label: '1', insert: '1' },
  { label: '2', insert: '2' },
  { label: '3', insert: '3' },
  { label: '−', insert: ' - ', variant: 'op' },
  { label: '0', insert: '0' },
  { label: '.', insert: '.' },
  { label: '^', insert: ' ^ ', variant: 'op' },
  { label: '+', insert: ' + ', variant: 'op' },
];

// ---------------------------------------------------------------------------
// Calculator sub-component
// ---------------------------------------------------------------------------

const Calculator = function Calculator({
  title,
  onInsert,
  onClear,
  onBackspace,
}: CalculatorProps): React.ReactElement {
  return (
    <Box style={{ flex: 1 }}>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 600,
          opacity: 0.75,
          letterSpacing: 0.4,
          display: 'block',
          mb: 0.5,
        }}
      >
        {title}
      </Typography>
      <Box
        sx={(theme) => ({
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 0.5,
          p: 0.75,
          borderRadius: 1,
          border: `1px solid ${theme.palette.divider}`,
          backgroundColor: theme.palette.action.hover,
          maxWidth: 280,
        })}
      >
        {CALCULATOR_KEYS.map((k) => {
          const handleClick = () => {
            if (k.clear) {
              onClear?.();
              return;
            }
            if (k.backspace) {
              onBackspace?.();
              return;
            }
            onInsert(k.insert, k.cursorOffset || 0);
          };
          const isOp = k.variant === 'op';
          const isDanger = k.variant === 'danger';
          const isMuted = k.variant === 'muted';
          return (
            <Button
              key={k.label}
              size="small"
              variant={isOp ? 'contained' : 'outlined'}
              color={isOp ? 'primary' : isDanger ? 'error' : 'inherit'}
              onClick={handleClick}
              sx={(theme) => ({
                minWidth: 0,
                height: 36,
                px: 0,
                fontFamily: 'monospace',
                fontSize: theme.typography.button.fontSize,
                fontWeight: theme.typography.button.fontWeight,
                textTransform: 'none',
                backgroundColor: isOp
                  ? undefined
                  : isMuted
                    ? theme.palette.background.default
                    : theme.palette.background.paper,
              })}
            >
              {k.label}
            </Button>
          );
        })}
      </Box>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const CalculatedFieldDialog = function CalculatedFieldDialog({
  open,
  onClose,
  editField, // null → create mode, object → edit mode
}: CalculatedFieldDialogProps): React.ReactElement {
  const { engine, localization: t } = usePivot();
  const portalContainer = usePortalContainer();

  // dynamic boundary: localization is Record<string,unknown>
  const tCalc = (t as Record<string, Record<string, string>>)?.calculatedField ?? {};
  const tButtons = (t as Record<string, Record<string, string>>)?.buttons ?? {};
  const tAgg = (t as Record<string, Record<string, unknown>>)?.aggregations ?? {};

  const buttonGroups = useMemo<ButtonGroupDef[]>(
    () => [
      {
        title: tCalc.groupComparison || 'Comparison / Logic',
        buttons: [
          { label: '=', insert: ' == ' },
          { label: '==', insert: ' == ' },
          { label: '!=', insert: ' != ' },
          { label: '>', insert: ' > ' },
          { label: '<', insert: ' < ' },
          { label: '>=', insert: ' >= ' },
          { label: '<=', insert: ' <= ' },
          { label: 'AND', insert: ' AND ' },
          { label: 'OR', insert: ' OR ' },
        ],
      },
      {
        title: tCalc.groupFunctions || 'Functions',
        buttons: [
          // FREEPLAN: IF() is removed from the picker. Evaluation still
          // throws if a formula references it manually (MatrixComputer).
          ...(IS_FREEPLAN
            ? []
            : [
                {
                  label: 'IF',
                  insert: 'IF(, , )',
                  cursorOffset: -5,
                  tooltip:
                    tCalc.tooltipIF ||
                    'IF(condition, value_if_true, value_if_false)',
                },
              ]),
          {
            label: 'ABS',
            insert: 'ABS()',
            cursorOffset: -1,
            tooltip: tCalc.tooltipABS || 'Absolute value',
          },
          {
            label: 'MIN',
            insert: 'MIN(, )',
            cursorOffset: -3,
            tooltip:
              tCalc.tooltipMIN ||
              'Minimum of two or more numbers',
          },
          {
            label: 'MAX',
            insert: 'MAX(, )',
            cursorOffset: -3,
            tooltip:
              tCalc.tooltipMAX ||
              'Maximum of two or more numbers',
          },
        ],
      },
      {
        title:
          tCalc.groupAggregations || 'Aggregations & Running',
        buttons: [
          {
            label: 'sum( )',
            insert: 'sum("")',
            cursorOffset: -2,
            tooltip: tCalc.tooltipSUM || 'Sum of a field',
          },
          {
            label: 'count( )',
            insert: 'count("")',
            cursorOffset: -2,
            tooltip: tCalc.tooltipCOUNT || 'Record count',
          },
          {
            label: 'avg( )',
            insert: 'avg("")',
            cursorOffset: -2,
            tooltip: tCalc.tooltipAVG || 'Average of a field',
          },
          {
            label: 'min( )',
            insert: 'min("")',
            cursorOffset: -2,
            tooltip:
              tCalc.tooltipMINField || 'Minimum of the field',
          },
          {
            label: 'max( )',
            insert: 'max("")',
            cursorOffset: -2,
            tooltip:
              tCalc.tooltipMAXField || 'Maximum of the field',
          },
          {
            label: 'Σ progressivo',
            insert: 'runningSum("")',
            cursorOffset: -2,
            tooltip:
              tCalc.tooltipRunningSum ||
              'Running (cumulative) sum of the field over visible rows',
          },
        ],
      },
      {
        title: tCalc.groupConstants || 'Constants',
        buttons: [
          {
            label: 'NULL',
            insert: ' null ',
            tooltip: tCalc.tooltipNULL || 'Null value',
          },
          {
            label: 'EMPTY',
            insert: "''",
            tooltip: tCalc.tooltipEMPTY || 'Empty string',
          },
        ],
      },
    ],
    [t],  // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [caption, setCaption] = useState<string>('');
  const [formula, setFormula] = useState<string>('');
  const [error, setError] = useState<string>('');
  const formulaRef = useRef<HTMLDivElement | null>(null);

  const availableFields = (engine.getAvailableFields() as AvailableField[]).filter(
    (f) =>
      f.uniqueName !== 'Measures' && !f.isCalculated && f.type === 'number',
  );

  const fieldByName = useMemo<Map<string, AvailableField>>(() => {
    const map = new Map<string, AvailableField>();
    availableFields.forEach((f) => map.set(f.uniqueName, f));
    return map;
    // availableFields is recomputed each render from engine; stable for this dialog lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableFields.length]);

  // Measures currently placed in the slice, one entry per aggregation. The
  // user can click these chips to insert the matching aggregation call
  // (e.g. `sum("revenue")`) directly into the formula — the caption shows
  // the aggregation in parentheses so two entries of the same field remain
  // disambiguated.
  const aggLabelLocal = (a: string): string => {
    const wdrKey = ({ distinctcount: 'distinctCount', avg: 'average' } as Record<string, string>)[a] || a;
    const raw = tAgg[a] ?? tAgg[wdrKey];
    if (raw && typeof raw === 'object') return (raw as Record<string, string>).caption || a;
    return (raw as string) || a;
  };

  const availableMeasures = useMemo<MeasureEntry[]>(() => {
    const slice = (engine.getSlice as () => Record<string, unknown>)?.() || {};
    const meta = (engine.getMetadata as () => Record<string, { caption?: string }>)?.() || {};
    const calcMap = new Map<string, { uniqueName: string; caption?: string }>(
      ((engine.getCalculatedFields as () => { uniqueName: string; caption?: string }[])?.() || []).map((f) => [f.uniqueName, f]),
    );
    return ((slice.measures as { uniqueName: string; aggregation: string }[]) || []).map((m) => {
      const base =
        meta[m.uniqueName]?.caption ||
        calcMap.get(m.uniqueName)?.caption ||
        m.uniqueName;
      return {
        uniqueName: m.uniqueName,
        aggregation: m.aggregation,
        isCalculated: calcMap.has(m.uniqueName),
        caption: `${base} (${aggLabelLocal(m.aggregation)})`,
      };
    });
    // Rebuild whenever the dialog re-renders; cheap + engine holds truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, t]);

  const insertMeasureRef = (m: MeasureEntry) => {
    // Calculated fields are inserted as bare chip references (the formula
    // engine resolves them to the stored formula); regular measures become
    // an aggregation call on the underlying field.
    if (m.isCalculated || m.aggregation === 'formula') {
      insertFieldRef(m.uniqueName);
      return;
    }
    insertSnippet(`${m.aggregation}("${m.uniqueName}")`);
  };

  /**
   * Tokenize a formula string into runs of plain text and field references
   * (whenever a known uniqueName appears on word boundaries). Longer names
   * are matched first so "revenueGross" doesn't get chopped to "revenue".
   */
  const tokenizeFormula = (f: string): FormulaToken[] => {
    if (!f) return [];
    const names = Array.from(fieldByName.keys()).sort(
      (a, b) => b.length - a.length,
    );
    const isBoundary = (c: string | undefined) => !c || /[^\w]/.test(c);
    const out: FormulaToken[] = [];
    let buf = '';
    let i = 0;
    while (i < f.length) {
      let matched: string | null = null;
      for (const name of names) {
        if (f.substr(i, name.length) !== name) continue;
        if (!isBoundary(f[i - 1]) || !isBoundary(f[i + name.length])) continue;
        matched = name;
        break;
      }
      if (matched) {
        if (buf) {
          out.push({ type: 'text', value: buf });
          buf = '';
        }
        out.push({ type: 'field', uniqueName: matched });
        i += matched.length;
      } else {
        buf += f[i];
        i++;
      }
    }
    if (buf) out.push({ type: 'text', value: buf });
    return out;
  };

  const buildChip = (field: { uniqueName: string; caption?: string }): HTMLSpanElement => {
    const span = document.createElement('span');
    span.className = 'pv-calc-chip';
    span.setAttribute('contenteditable', 'false');
    span.setAttribute('draggable', 'true');
    span.setAttribute('data-un', field.uniqueName);

    const label = document.createElement('span');
    label.className = 'pv-calc-chip-label';
    label.textContent = field.caption || field.uniqueName;
    span.appendChild(label);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'pv-calc-chip-remove';
    close.setAttribute('contenteditable', 'false');
    close.setAttribute('tabindex', '-1');
    close.setAttribute('aria-label', 'Remove');
    close.textContent = '×';
    close.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    close.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      span.remove();
      setFormula(serializeBox());
      setError('');
    });
    span.appendChild(close);

    span.addEventListener('dragstart', (e) => {
      e.dataTransfer!.setData('application/x-pv-field', field.uniqueName);
      e.dataTransfer!.setData('text/plain', field.uniqueName);
      e.dataTransfer!.effectAllowed = 'move';
      span.setAttribute('data-dragging', '1');
    });
    span.addEventListener('dragend', () => {
      span.removeAttribute('data-dragging');
    });
    return span;
  };

  const caretRangeFromPoint = (x: number, y: number): Range | null => {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((document as any).caretPositionFromPoint) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pos = (document as any).caretPositionFromPoint(x, y);
      if (pos) {
        const r = document.createRange();
        r.setStart(pos.offsetNode, pos.offset);
        r.collapse(true);
        return r;
      }
    }
    return null;
  };

  const handleFormulaDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('application/x-pv-field')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleFormulaDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('application/x-pv-field')) return;
    e.preventDefault();
    const un = e.dataTransfer.getData('application/x-pv-field');
    const box = formulaRef.current;
    if (!un || !box) return;
    const range = caretRangeFromPoint(e.clientX, e.clientY);
    if (!range || !box.contains(range.commonAncestorContainer)) return;
    const dragging = box.querySelector('[data-dragging="1"]');
    if (dragging) dragging.remove();
    const field = fieldByName.get(un) || { uniqueName: un, caption: un };
    const chip = buildChip(field);
    range.insertNode(chip);
    const after = document.createRange();
    after.setStartAfter(chip);
    after.collapse(true);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(after);
    }
    setFormula(serializeBox());
    setError('');
  };

  const renderFormulaToBox = (f: string) => {
    const box = formulaRef.current;
    if (!box) return;
    box.innerHTML = '';
    const tokens = tokenizeFormula(f);
    tokens.forEach((tk) => {
      if (tk.type === 'text') {
        box.appendChild(document.createTextNode(tk.value || ''));
      } else {
        const field = fieldByName.get(tk.uniqueName!) || {
          uniqueName: tk.uniqueName!,
          caption: tk.uniqueName,
        };
        box.appendChild(buildChip(field));
      }
    });
  };

  /**
   * Read the contentEditable box and rebuild the formula string: plain text
   * nodes contribute their text verbatim, chip spans contribute their
   * `data-un` (the field uniqueName), line breaks become '\n'.
   */
  const serializeBox = (): string => {
    const box = formulaRef.current;
    if (!box) return '';
    const walk = (node: Node): string => {
      let out = '';
      node.childNodes.forEach((n) => {
        if (n.nodeType === 3) {
          out += n.textContent;
        } else if (n.nodeType === 1) {
          const el = n as Element;
          if (el.tagName === 'BR') {
            out += '\n';
          } else if (el.classList?.contains('pv-calc-chip')) {
            out += el.getAttribute('data-un') || '';
          } else {
            out += walk(n);
          }
        }
      });
      return out;
    };
    return walk(box);
  };

  useEffect(() => {
    if (!open) return;
    const initialFormula = editField?.formula || '';
    setCaption(editField?.caption || '');
    setFormula(initialFormula);
    setError('');
    // Defer so the box ref is bound after Dialog mounts.
    setTimeout(() => renderFormulaToBox(initialFormula), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editField]);

  const focusBoxAtEnd = (): { sel: Selection; range: Range } | null => {
    const box = formulaRef.current;
    if (!box) return null;
    box.focus();
    const sel = window.getSelection();
    if (!sel) return null;
    const range = document.createRange();
    range.selectNodeContents(box);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    return { sel, range };
  };

  const getCaretRange = (): { sel: Selection; range: Range } | null => {
    const box = formulaRef.current;
    if (!box) return null;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (box.contains(range.commonAncestorContainer)) return { sel, range };
    }
    return focusBoxAtEnd();
  };

  /**
   * Inserts raw text at the caret. `cursorOffset` (negative) moves the caret
   * back inside the inserted snippet — used by operator buttons like `sum("")`
   * that want the caret between the quotes.
   */
  const insertSnippet = (text: string, cursorOffset = 0) => {
    const ctx = getCaretRange();
    if (!ctx) return;
    const { sel, range } = ctx;
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    const caretIdx = Math.max(
      0,
      Math.min(text.length + cursorOffset, text.length),
    );
    const newRange = document.createRange();
    newRange.setStart(node, caretIdx);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    setFormula(serializeBox());
    setError('');
  };

  const clearFormula = () => {
    const box = formulaRef.current;
    if (box) box.innerHTML = '';
    setFormula('');
    setError('');
    focusBoxAtEnd();
  };

  const backspaceAtCaret = () => {
    const box = formulaRef.current;
    if (!box) return;
    const ctx = getCaretRange();
    if (!ctx) return;
    const { sel, range } = ctx;
    if (!range.collapsed) {
      range.deleteContents();
    } else {
      const back = document.createRange();
      back.setStart(box, 0);
      back.setEnd(range.endContainer, range.endOffset);
      const frag = back.cloneContents();
      if (!frag.lastChild) return;
      const last = frag.lastChild;
      // Chip span or element: remove whole node. Text: strip one char.
      if (last.nodeType === 1) {
        const prev = range.endContainer.previousSibling;
        if (prev) prev.remove();
        else if (
          range.endContainer.nodeType === 1 &&
          range.endContainer.childNodes.length > 0 &&
          range.endOffset > 0
        ) {
          range.endContainer.removeChild(
            range.endContainer.childNodes[range.endOffset - 1],
          );
        }
      } else {
        if (range.endOffset > 0) {
          const txt = range.endContainer.textContent || '';
          range.endContainer.textContent =
            txt.slice(0, range.endOffset - 1) + txt.slice(range.endOffset);
          const nr = document.createRange();
          nr.setStart(range.endContainer, range.endOffset - 1);
          nr.collapse(true);
          sel.removeAllRanges();
          sel.addRange(nr);
        } else {
          const prev = range.endContainer.previousSibling;
          if (prev) prev.remove();
        }
      }
    }
    setFormula(serializeBox());
    setError('');
  };

  const insertFieldRef = (uniqueName: string) => {
    const field = fieldByName.get(uniqueName) || {
      uniqueName,
      caption: uniqueName,
    };
    const ctx = getCaretRange();
    if (!ctx) return;
    const { sel, range } = ctx;
    range.deleteContents();
    const chip = buildChip(field);
    range.insertNode(chip);
    const newRange = document.createRange();
    newRange.setStartAfter(chip);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    setFormula(serializeBox());
    setError('');
  };

  const validateFormula = (f: string): string | null => {
    try {
      const patched = f.replace(
        /\b(sum|count|avg|min|max|distinctcount|runningsum|running)\s*\(\s*"([^"]+)"\s*\)/gi,
        '0',
      );
      // Syntax-only check via the safe parser — `^`, AND/OR and IF/ABS/MIN/
      // MAX are part of its grammar; bare field identifiers are tolerated.
      parseFormulaExpression(patched);
      return null;
    } catch (e) {
      return `${tCalc.invalidFormula || 'Invalid formula'}: ${(e as Error).message}`;
    }
  };

  const handleSave = () => {
    if (!caption.trim()) {
      setError(
        tCalc.errorNameRequired || 'Field name is required.',
      );
      return;
    }
    if (!formula.trim()) {
      setError(
        tCalc.errorFormulaRequired || 'Formula is required.',
      );
      return;
    }
    const formulaError = validateFormula(formula);
    if (formulaError) {
      setError(formulaError);
      return;
    }

    if (editField) {
      (engine.updateCalculatedField as (un: string, upd: { caption: string; formula: string }) => void)(
        editField.uniqueName,
        { caption: caption.trim(), formula: formula.trim() },
      );
    } else {
      (engine.addCalculatedField as (f: { caption: string; formula: string }) => void)({
        caption: caption.trim(),
        formula: formula.trim(),
      });
    }
    onClose?.();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      container={portalContainer}
    >
      <DialogTitle sx={{ pr: 6 }}>
        {editField
          ? tCalc.editTitle || 'Edit calculated field'
          : tCalc.createTitle || 'Add calculated field'}
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', top: 8, right: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField
            label={tCalc.nameLabel || 'Field name'}
            value={caption}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setCaption(e.target.value);
              setError('');
            }}
            size="small"
            fullWidth
            autoFocus
          />

          <Box>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                opacity: 0.75,
                letterSpacing: 0.4,
                display: 'block',
                mb: 0.5,
              }}
            >
              {tCalc.formulaLabel || 'Formula'}
            </Typography>
            <Box
              ref={formulaRef}
              contentEditable
              suppressContentEditableWarning
              onInput={() => {
                setFormula(serializeBox());
                setError('');
              }}
              onDragOver={handleFormulaDragOver}
              onDrop={handleFormulaDrop}
              data-placeholder={
                tCalc.formulaPlaceholder ||
                'Example: sum("revenue") / count("orders") * 100'
              }
              sx={(theme) => ({
                minHeight: 72,
                maxHeight: 220,
                overflowY: 'auto',
                px: 1.25,
                py: 1,
                fontFamily: 'monospace',
                fontSize: theme.typography.body2.fontSize,
                lineHeight: 1.6,
                borderRadius: 1,
                border: `1px solid ${theme.palette.divider}`,
                outline: 'none',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                '&:focus-within, &:focus': {
                  borderColor: theme.palette.primary.main,
                  boxShadow: `0 0 0 1px ${theme.palette.primary.main}`,
                },
                '&:empty::before': {
                  content: 'attr(data-placeholder)',
                  color: theme.palette.text.disabled,
                  pointerEvents: 'none',
                },
                '& .pv-calc-chip': {
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  margin: '0 2px',
                  padding: '0 4px 0 8px',
                  height: 22,
                  lineHeight: '22px',
                  borderRadius: 11,
                  backgroundColor: theme.palette.tertiary?.main
                    ? (theme.palette.tertiary.main + '22')
                    : (theme.palette.primary.main + '22'),
                  border: `1px solid ${
                    theme.palette.tertiary?.main ||
                    theme.palette.primary.main
                  }66`,
                  color:
                    theme.palette.tertiary?.main ||
                    theme.palette.primary.main,
                  fontFamily: theme.typography.fontFamily || 'inherit',
                  fontSize: theme.typography.caption.fontSize,
                  fontWeight: theme.typography.caption.fontWeight,
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                  verticalAlign: 'baseline',
                  cursor: 'grab',
                  '&:active': { cursor: 'grabbing' },
                },
                '& .pv-calc-chip[data-dragging="1"]': {
                  opacity: 0.5,
                },
                '& .pv-calc-chip-label': {
                  pointerEvents: 'none',
                },
                '& .pv-calc-chip-remove': {
                  appearance: 'none',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  margin: 0,
                  width: 14,
                  height: 14,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: theme.typography.caption.fontSize,
                  lineHeight: 1,
                  fontWeight: theme.typography.h2.fontWeight,
                  color: theme.palette.primary.main,
                  opacity: 0.65,
                  '&:hover': {
                    opacity: 1,
                    backgroundColor: theme.palette.primary.main + '33',
                  },
                },
              })}
            />
            {error && (
              <Typography
                variant="caption"
                color="error"
                sx={{ mt: 0.5, display: 'block' }}
              >
                {error}
              </Typography>
            )}
          </Box>

          <Box
            style={{ display: 'flex', marginBottom: 16 }}
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'auto 1fr' },
              gap: 2,
              alignItems: 'start',
            }}
          >
            <Calculator
              title={tCalc.groupArithmetic || 'Arithmetic'}
              onInsert={insertSnippet}
              onClear={clearFormula}
              onBackspace={backspaceAtCaret}
            />

            <Stack spacing={1.5}>
              {buttonGroups.map((group) => (
                <Box key={group.title}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      opacity: 0.75,
                      letterSpacing: 0.4,
                      display: 'block',
                      mb: 0.5,
                    }}
                  >
                    {group.title}
                  </Typography>
                  <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
                    {group.buttons.map((b) => {
                      const btn = (
                        <Button
                          key={b.label}
                          size="small"
                          variant="outlined"
                          onClick={() =>
                            insertSnippet(b.insert, b.cursorOffset || 0)
                          }
                          sx={(theme) => ({
                            minWidth: 36,
                            height: 28,
                            px: 1,
                            fontFamily: 'monospace',
                            fontSize: theme.typography.caption.fontSize,
                            textTransform: 'none',
                          })}
                        >
                          {b.label}
                        </Button>
                      );
                      return b.tooltip ? (
                        <Tooltip key={b.label} title={b.tooltip}>
                          <span>{btn}</span>
                        </Tooltip>
                      ) : (
                        btn
                      );
                    })}
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Box>

          {availableFields.length > 0 && (
            <Box>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  opacity: 0.75,
                  letterSpacing: 0.4,
                  display: 'block',
                  mb: 0.5,
                }}
              >
                {tCalc.availableFields ||
                  'Available numeric fields — click to insert into the formula'}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {availableFields.map((f) => (
                  <Chip
                    key={f.uniqueName}
                    label={f.caption}
                    size="small"
                    onClick={() => insertFieldRef(f.uniqueName)}
                    sx={(theme) => ({
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontSize: theme.typography.caption.fontSize,
                    })}
                  />
                ))}
              </Box>
            </Box>
          )}

          {availableMeasures.length > 0 && (
            <Box>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  opacity: 0.75,
                  letterSpacing: 0.4,
                  display: 'block',
                  mb: 0.5,
                }}
              >
                {tCalc.availableMeasures ||
                  'Available measures — click to insert into the formula'}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {availableMeasures.map((m, i) => (
                  <Chip
                    key={`${m.uniqueName}:${m.aggregation}:${i}`}
                    label={m.caption}
                    size="small"
                    onClick={() => insertMeasureRef(m)}
                    sx={(theme) => ({
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontSize: theme.typography.caption.fontSize,
                    })}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Stack>
      </DialogContent>

      <DialogActions style={{ padding: '16px' }}>
        <Button onClick={onClose}>{tButtons.cancel || 'Cancel'}</Button>
        <Button onClick={handleSave} variant="contained">
          {editField
            ? tButtons.saveChanges || 'Save changes'
            : tButtons.create || 'Create field'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CalculatedFieldDialog;
