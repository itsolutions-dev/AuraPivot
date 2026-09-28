// The expression editor opened from a rule: an AND / OR list of clauses,
// edited as a draft and handed back on Apply.

import { useState } from 'react';

import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { usePivot } from '../../../context/PivotContext';
import { usePortalContainer } from '../../../hooks/usePortalContainer';
import { newId } from '../../../utils/ids';
import DialogHeader from '../../shared/DialogHeader';
import { section } from '../../shared/l10n';
import { withOpenSession } from '../../shared/useOpenSession';
import type {
  DimensionEntry,
  Expression,
  ExpressionClause,
  MeasureEntry,
} from '../types';
import { ClauseEditor } from './ClauseEditor';

// ---------------------------------------------------------------------------
// ExpressionDialog
// ---------------------------------------------------------------------------

interface ExpressionDialogProps {
  open: boolean;
  onClose: () => void;
  value?: Expression | null;
  onChange: (next: Expression) => void;
  dimensions: DimensionEntry[];
  measures: MeasureEntry[];
}

const ExpressionDialogBody = function ExpressionDialogBody({
  open,
  onClose,
  value,
  onChange,
  dimensions,
  measures,
}: ExpressionDialogProps) {
  const { localization: t } = usePivot();
  const tF = section(t, 'formatDialog');
  const tB = section(t, 'buttons');
  const portalContainer = usePortalContainer();
  // Seeded once per open (see withOpenSession below). `value` only changes
  // through this dialog's own Apply, which also closes it.
  const [draft, setDraft] = useState<Expression>(
    () => value || { join: 'and', clauses: [] },
  );

  const addClause = () => {
    const firstDim = dimensions[0];
    const firstMeasure = measures.find((m) => !m.hidden);
    const newClause: ExpressionClause | null = firstDim
      ? {
          id: newId('c'),
          target: firstDim.uniqueName,
          kind: 'dim',
          operator: 'equals',
          value: '',
          not: false,
        }
      : firstMeasure
        ? {
            id: newId('c'),
            target: firstMeasure.measureKey,
            kind: 'measure',
            operator: 'gt',
            value: 0,
            not: false,
          }
        : null;
    if (!newClause) return;
    setDraft({ ...draft, clauses: [...draft.clauses, newClause] });
  };

  const updateClause = (idx: number, next: ExpressionClause) =>
    setDraft({
      ...draft,
      clauses: draft.clauses.map((c, i) => (i === idx ? next : c)),
    });

  const removeClause = (idx: number) =>
    setDraft({
      ...draft,
      clauses: draft.clauses.filter((_, i) => i !== idx),
    });

  const apply = () => {
    onChange(draft);
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
      <DialogHeader
        title={tF.expression || 'Expression'}
        subtitle={
          tF.expressionSubtitle ||
          'Combine clauses on dimensions and measures. The expression is evaluated per cell; the rule fires when it returns true.'
        }
        onClose={onClose}
      />
      <DialogContent dividers sx={{ px: 3, py: 3 }}>
        <Stack sx={{ gap: 2.5 }}>
          <Stack direction="row" spacing={2} style={{ alignItems: 'center' }}>
            <Typography variant="caption" sx={{ opacity: 0.75 }}>
              {tF.expressionJoin || 'Combine clauses with'}
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={draft.join || 'and'}
              onChange={(_, v: string | null) =>
                v && setDraft({ ...draft, join: v as 'and' | 'or' })
              }
            >
              <ToggleButton value="and" sx={{ textTransform: 'none' }}>
                {tF.exprAnd || 'AND'}
              </ToggleButton>
              <ToggleButton value="or" sx={{ textTransform: 'none' }}>
                {tF.exprOr || 'OR'}
              </ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ flex: 1 }} />
            <Button
              size="small"
              startIcon={<AddIcon />}
              variant="outlined"
              onClick={addClause}
            >
              {tF.addClause || 'Add clause'}
            </Button>
          </Stack>
          {draft.clauses.length === 0 && (
            <Box
              sx={(theme) => ({
                border: `1px dashed ${theme.palette.divider}`,
                borderRadius: 2,
                p: 3,
                textAlign: 'center',
                color: theme.palette.text.secondary,
              })}
            >
              <Typography variant="body2">
                {tF.noClauses || 'No clauses defined.'}
              </Typography>
            </Box>
          )}
          {draft.clauses.map((c, idx) => (
            <ClauseEditor
              key={c.id}
              clause={c}
              dimensions={dimensions}
              measures={measures}
              onChange={(next) => updateClause(idx, next)}
              onRemove={() => removeClause(idx)}
            />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose}>{tB.cancel || 'Cancel'}</Button>
        <Button onClick={apply} variant="contained">
          {tB.apply || 'Apply'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

/** Remounted on every open, so Cancel drops the draft. */
export const ExpressionDialog = withOpenSession(ExpressionDialogBody);
