// One conditional rule as an accordion: measure, operator and operands (or
// an expression), evaluation mode and style, with its operand editor and
// style preview chip.

import React, { useMemo, useState } from 'react';

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Divider,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { usePivot } from '../../../context/PivotContext';
import { section } from '../../shared/l10n';
import { SectionEditor, SectionLabel } from '../SectionEditor';
import type {
  ConditionalRule,
  DimensionEntry,
  Expression,
  MeasureEntry,
  RuleStyle,
  SectionValues,
} from '../types';
import { ExpressionDialog } from './ExpressionDialog';
import {
  OPERATORS,
  RULE_OPS,
  findMeasure,
  operatorLabel,
  refersTo,
} from './operators';

// ---------------------------------------------------------------------------
// OperandEditor
// ---------------------------------------------------------------------------

interface OperandEditorProps {
  kind?: string;
  value?: number | string;
  measureRef?: string;
  label: string;
  measures: MeasureEntry[];
  /** Measures the operand may reference: all but the rule's own. */
  candidates: MeasureEntry[];
  canReferenceMeasure: boolean;
  onKindChange: (kind: string) => void;
  onValueChange: (value: number) => void;
  onMeasureRefChange: (ref: string) => void;
}

/** One side of a comparison: a constant, or another measure of the cell. */
const OperandEditor = function OperandEditor({
  kind,
  value,
  measureRef,
  label,
  measures,
  candidates,
  canReferenceMeasure,
  onKindChange,
  onValueChange,
  onMeasureRefChange,
}: OperandEditorProps) {
  const tF = section(usePivot().localization, 'formatDialog');
  const isMeasure = (kind || 'constant') === 'measure';
  return (
    <>
      <Select
        size="small"
        value={kind || 'constant'}
        onChange={(e) => onKindChange(e.target.value as string)}
        sx={{ width: 120, flexShrink: 0 }}
      >
        <MenuItem value="constant">
          {tF.ruleValueConstant || 'Constant'}
        </MenuItem>
        {canReferenceMeasure && (
          <MenuItem value="measure">
            {tF.ruleValueMeasure || 'Measure'}
          </MenuItem>
        )}
      </Select>

      {isMeasure ? (
        <Select
          size="small"
          value={findMeasure(measures, measureRef)?.measureKey || ''}
          onChange={(e) => onMeasureRefChange(e.target.value as string)}
          displayEmpty
          sx={{ width: 220, flexShrink: 0 }}
        >
          <MenuItem value="" disabled>
            <em>{tF.selectMeasure || 'Select measure'}</em>
          </MenuItem>
          {candidates.map((m) => (
            <MenuItem key={m.measureKey} value={m.measureKey}>
              {m.caption || m.uniqueName}
            </MenuItem>
          ))}
        </Select>
      ) : (
        <TextField
          size="small"
          type="number"
          value={value ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onValueChange(Number(e.target.value))
          }
          sx={{ width: 160, flexShrink: 0 }}
          label={label}
        />
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// RulePreview
// ---------------------------------------------------------------------------

interface RulePreviewProps {
  style?: RuleStyle;
  sx?: SxProps<Theme>;
}

/** A "preview" chip rendered in the rule's style. */
const RulePreview = function RulePreview({ style = {}, sx }: RulePreviewProps) {
  const tF = section(usePivot().localization, 'formatDialog');
  return (
    <Box
      sx={[
        (theme) => ({
          fontFamily: style.fontFamily || 'inherit',
          fontSize: style.fontSize || theme.typography.caption.fontSize || 13,
          fontWeight: style.fontWeight || 400,
          fontStyle: style.italic ? 'italic' : 'normal',
          color: style.textColor || 'inherit',
          backgroundColor: style.backgroundColor || 'transparent',
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {tF.preview || 'preview'}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// RuleEditor
// ---------------------------------------------------------------------------

interface RuleEditorProps {
  rule: ConditionalRule;
  measures: MeasureEntry[];
  dimensions?: DimensionEntry[];
  onChange: (next: ConditionalRule) => void;
  onRemove: () => void;
  index: number;
  isDragging?: boolean;
  isDropTarget?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLSpanElement>, idx: number) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>, idx: number) => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>, idx: number) => void;
  onDragEnd?: () => void;
}

export const RuleEditor = function RuleEditor({
  rule,
  measures,
  dimensions = [],
  onChange,
  onRemove,
  index,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: RuleEditorProps) {
  const tF = section(usePivot().localization, 'formatDialog');
  const patch = (upd: Partial<ConditionalRule>) =>
    onChange({ ...rule, ...upd });
  const [exprOpen, setExprOpen] = useState(false);
  const isExpression = rule.operator === 'expression';
  const visibleMeasures = useMemo(
    () => measures.filter((m) => !m.hidden),
    [measures],
  );
  const otherMeasures = useMemo(
    () => measures.filter((m) => !refersTo(rule.measure, m)),
    [measures, rule.measure],
  );
  const measureCompareAvailable = !!rule.measure && otherMeasures.length > 0;

  const measureLabel = rule.measure
    ? findMeasure(measures, rule.measure)?.caption || rule.measure
    : tF.allMeasures || 'All measures';
  const opSym = OPERATORS[rule.operator || 'gt']?.symbol;
  const formatOperand = (
    kind: string | undefined,
    val: unknown,
    ref: string | undefined,
  ) => {
    if (kind === 'measure') {
      if (!ref) return '?';
      return `[${findMeasure(measures, ref)?.caption || ref}]`;
    }
    return `${val ?? '?'}`;
  };
  const expressionSummary = (() => {
    const n = rule.expression?.clauses?.length || 0;
    const join = (rule.expression?.join || 'and').toUpperCase();
    if (n === 0) return tF.noClauses || 'no clauses';
    return `${n} ${
      n === 1 ? tF.clauseOne || 'clause' : tF.clauseMany || 'clauses'
    } (${join})`;
  })();
  const exprRight = isExpression
    ? expressionSummary
    : rule.operator === 'between'
      ? `[${formatOperand(rule.valueKind, rule.value, rule.valueRef)}, ${formatOperand(rule.value2Kind, rule.value2, rule.value2Ref)}]`
      : formatOperand(rule.valueKind, rule.value, rule.valueRef);
  const ruleTitle = `${measureLabel} ${opSym} ${exprRight}`;

  return (
    <Accordion
      disableGutters
      onDragOver={(e: React.DragEvent<HTMLDivElement>) =>
        onDragOver?.(e, index)
      }
      onDrop={(e: React.DragEvent<HTMLDivElement>) => onDrop?.(e, index)}
      sx={(theme) => ({
        border: `1px solid ${
          isDropTarget ? theme.palette.primary.main : theme.palette.divider
        }`,
        borderRadius: 2,
        opacity: isDragging ? 0.4 : 1,
        '&:before': { display: 'none' },
      })}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2 }}>
        <Stack
          direction="row"
          style={{ alignItems: 'center' }}
          spacing={1.5}
          sx={{ width: '100%' }}
        >
          <Box
            component="span"
            draggable
            onDragStart={(e: React.DragEvent<HTMLSpanElement>) =>
              onDragStart?.(e, index)
            }
            onDragEnd={onDragEnd}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            style={{ alignItems: 'center' }}
            sx={{
              display: 'inline-flex',
              cursor: 'grab',
              color: 'text.secondary',
              '&:active': { cursor: 'grabbing' },
            }}
            title={tF.dragToReorder || 'Drag to reorder'}
          >
            <DragIndicatorIcon fontSize="small" />
          </Box>
          <Typography
            variant="caption"
            sx={{ opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}
          >
            #{index + 1}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
            {ruleTitle}
          </Typography>
          <RulePreview
            style={rule.style}
            sx={{ px: 1, py: 0.25, borderRadius: 0.5 }}
          />
          <IconButton
            size="small"
            component="span"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 2.5, py: 2.5 }}>
        <Stack direction="column" spacing={2.5}>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ flexWrap: 'wrap', alignItems: 'center' }}
          >
            <Select
              size="small"
              value={findMeasure(measures, rule.measure)?.measureKey || ''}
              onChange={(e) => {
                const nextMeasure = (e.target.value as string) || undefined;
                const upd: Partial<ConditionalRule> = { measure: nextMeasure };
                const remaining = visibleMeasures.filter(
                  (m) => m.measureKey !== nextMeasure,
                );
                const canCompare = !!nextMeasure && remaining.length > 0;
                if (!canCompare) {
                  if (rule.valueKind === 'measure') {
                    upd.valueKind = 'constant';
                    upd.valueRef = undefined;
                  }
                  if (rule.value2Kind === 'measure') {
                    upd.value2Kind = 'constant';
                    upd.value2Ref = undefined;
                  }
                } else {
                  if (rule.valueRef === nextMeasure) upd.valueRef = undefined;
                  if (rule.value2Ref === nextMeasure) upd.value2Ref = undefined;
                }
                patch(upd);
              }}
              displayEmpty
              sx={{ width: 220, flexShrink: 0 }}
            >
              <MenuItem value="">
                <em>{tF.allMeasures || 'All measures'}</em>
              </MenuItem>
              {visibleMeasures.map((m) => (
                <MenuItem key={m.measureKey} value={m.measureKey}>
                  {m.caption || m.uniqueName}
                </MenuItem>
              ))}
            </Select>

            <Select
              size="small"
              value={rule.operator || 'gt'}
              onChange={(e) => patch({ operator: e.target.value as string })}
              sx={{ width: 180, flexShrink: 0 }}
            >
              {RULE_OPS.map((op) => (
                <MenuItem key={op} value={op}>
                  {operatorLabel(tF, op)}
                </MenuItem>
              ))}
            </Select>

            {!isExpression && (
              <OperandEditor
                kind={rule.valueKind}
                value={rule.value}
                measureRef={rule.valueRef}
                label={tF.ruleValue || 'Value'}
                onKindChange={(valueKind) => patch({ valueKind })}
                onValueChange={(value) => patch({ value })}
                onMeasureRefChange={(valueRef) => patch({ valueRef })}
                measures={measures}
                candidates={otherMeasures}
                canReferenceMeasure={measureCompareAvailable}
              />
            )}

            {isExpression && (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setExprOpen(true)}
                >
                  {tF.editExpression || 'Edit expression'}
                </Button>
                <Typography variant="caption" sx={{ opacity: 0.75 }}>
                  {expressionSummary}
                </Typography>
              </>
            )}
          </Stack>

          {rule.operator === 'between' && !isExpression && (
            <Stack direction="row" spacing={1} style={{ alignItems: 'center' }}>
              <Typography
                variant="body2"
                sx={{
                  width: 408,
                  flexShrink: 0,
                  opacity: 0.75,
                  textAlign: 'right',
                  pr: 1,
                }}
              >
                {tF.ruleValueAnd || 'and'}
              </Typography>
              <OperandEditor
                kind={rule.value2Kind}
                value={rule.value2}
                measureRef={rule.value2Ref}
                label={tF.ruleValueUpperBound || 'Upper bound'}
                onKindChange={(value2Kind) => patch({ value2Kind })}
                onValueChange={(value2) => patch({ value2 })}
                onMeasureRefChange={(value2Ref) => patch({ value2Ref })}
                measures={measures}
                candidates={otherMeasures}
                canReferenceMeasure={measureCompareAvailable}
              />
            </Stack>
          )}
        </Stack>

        <Stack
          direction="row"
          spacing={1.5}
          style={{ alignItems: 'center' }}
          sx={{ mt: 2 }}
        >
          <SectionLabel>
            {tF.conditionalModeLabel || 'Evaluation mode'}
          </SectionLabel>
          <Select
            size="small"
            value={rule.mode || 'inherit'}
            onChange={(e) => patch({ mode: e.target.value as string })}
            sx={{ width: 180, flexShrink: 0 }}
          >
            <MenuItem value="inherit">
              {tF.conditionalModeInherit || 'Inherit'}
            </MenuItem>
            <MenuItem value="first">
              {tF.conditionalModeFirst || 'Stop at the first rule matched'}
            </MenuItem>
            <MenuItem value="all">
              {tF.conditionalModeAll || 'Evaluate all the rules'}
            </MenuItem>
          </Select>
        </Stack>

        <Divider sx={{ my: 1 }} />

        <SectionEditor
          section={(rule.style || {}) as SectionValues}
          setSection={(next: SectionValues) =>
            onChange({ ...rule, style: next as RuleStyle })
          }
        />

        <Stack direction="row" sx={{ mt: 2 }}>
          <Box sx={{ flex: 1 }} />
          <RulePreview
            style={rule.style}
            sx={{
              px: 1.5,
              py: 0.5,
              borderRadius: 1,
              textAlign: rule.style?.textAlign || 'left',
              fontVariantNumeric: 'tabular-nums',
            }}
          />
        </Stack>
      </AccordionDetails>
      <ExpressionDialog
        open={exprOpen}
        onClose={() => setExprOpen(false)}
        value={rule.expression}
        onChange={(next: Expression) => patch({ expression: next })}
        dimensions={dimensions}
        measures={measures}
      />
    </Accordion>
  );
};
