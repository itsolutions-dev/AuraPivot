// The Conditional tab: the evaluation mode and the ordered, drag-reorderable
// list of rules.

import React, { useState } from 'react';

import {
  Box,
  Button,
  Divider,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { usePivot } from '../../../context/PivotContext';
import { newId } from '../../../utils/ids';
import { section } from '../../shared/l10n';
import { DEFAULT_RULE_STYLE } from '../defaults';
import { SectionLabel } from '../SectionEditor';
import type { ConditionalRule, DimensionEntry, MeasureEntry } from '../types';
import { RuleEditor } from './RuleEditor';

// ---------------------------------------------------------------------------
// ConditionalTab
// ---------------------------------------------------------------------------

interface ConditionalTabProps {
  rules: ConditionalRule[];
  setRules: (next: ConditionalRule[]) => void;
  measures: MeasureEntry[];
  dimensions?: DimensionEntry[];
  mode?: string;
  setMode?: (mode: string) => void;
}

export const ConditionalTab = function ConditionalTab({
  rules,
  setRules,
  measures,
  dimensions = [],
  mode,
  setMode,
}: ConditionalTabProps) {
  const tF = section(usePivot().localization, 'formatDialog');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const handleDragStart = (
    e: React.DragEvent<HTMLSpanElement>,
    idx: number,
  ) => {
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', String(idx));
    } catch {
      // some browsers require data to be set
    }
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, idx: number) => {
    if (dragIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (idx !== dropIndex) setDropIndex(idx);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>, idx: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === idx) {
      setDragIndex(null);
      setDropIndex(null);
      return;
    }
    const next = [...rules];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(idx, 0, moved);
    setRules(next);
    setDragIndex(null);
    setDropIndex(null);
  };
  const handleDragEnd = () => {
    setDragIndex(null);
    setDropIndex(null);
  };

  const addRule = () => {
    setRules([
      ...rules,
      {
        id: newId('r'),
        measure: undefined,
        operator: 'gt',
        value: 0,
        style: { ...DEFAULT_RULE_STYLE },
      },
    ]);
  };

  const updateRule = (idx: number, next: ConditionalRule) =>
    setRules(rules.map((r, i) => (i === idx ? next : r)));

  const removeRule = (idx: number) =>
    setRules(rules.filter((_, i) => i !== idx));

  const effectiveMode = mode === 'all' ? 'all' : 'first';
  const modeDescription =
    effectiveMode === 'all'
      ? tF.conditionalModeAllDesc ||
        'Rules are evaluated from top to bottom; every matching rule is applied — later rules override earlier ones for the properties they set.'
      : tF.conditionalModeFirstDesc ||
        'Rules are evaluated from top to bottom; the first matching rule is applied.';

  return (
    <Stack sx={{ gap: 3, pt: 1.5 }}>
      <Stack sx={{ gap: 0.75 }}>
        <SectionLabel>
          {tF.conditionalModeLabel || 'Evaluation mode'}
        </SectionLabel>
        <Select
          size="small"
          value={effectiveMode}
          onChange={(e) => setMode?.(e.target.value as string)}
        >
          <MenuItem value="first">
            {tF.conditionalModeFirst || 'Stop at the first rule matched'}
          </MenuItem>
          <MenuItem value="all">
            {tF.conditionalModeAll || 'Evaluate all the rules'}
          </MenuItem>
        </Select>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          {modeDescription}
        </Typography>
      </Stack>
      <Divider sx={{ my: 1 }} />
      <Stack direction="row" sx={{ mb: 1 }} style={{ alignItems: 'center' }}>
        <Typography variant="caption" sx={{ opacity: 0.75, flex: 1 }}>
          {tF.rulesDesc || 'Drag to reorder rules.'}
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={addRule}
          variant="outlined"
        >
          {tF.addRule || 'Add rule'}
        </Button>
      </Stack>
      {rules.length === 0 && (
        <Box
          sx={(theme) => ({
            border: `1px dashed ${theme.palette.divider}`,
            // dynamic boundary: theme.borderRadius is a custom token declared in pivot-core/types.ts
            borderRadius: theme.borderRadius,
            p: 3,
            textAlign: 'center',
            color: theme.palette.text.secondary,
            mt: 1,
          })}
        >
          <Typography variant="body2">
            {tF.noRules || 'No rules defined.'}
          </Typography>
        </Box>
      )}
      {rules.map((r, idx) => (
        <RuleEditor
          key={r.id}
          rule={r}
          index={idx}
          measures={measures}
          dimensions={dimensions}
          onChange={(next: ConditionalRule) => updateRule(idx, next)}
          onRemove={() => removeRule(idx)}
          isDragging={dragIndex === idx}
          isDropTarget={
            dropIndex === idx && dragIndex !== null && dragIndex !== idx
          }
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
        />
      ))}
    </Stack>
  );
};
