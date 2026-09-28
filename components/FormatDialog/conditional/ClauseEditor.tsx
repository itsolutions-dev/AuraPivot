// One clause of a rule's expression: a dimension or measure target, an
// optional NOT, and an operator with its operand(s).

import React, { useMemo } from 'react';

import {
  Checkbox,
  FormControlLabel,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import { usePivot } from '../../../context/PivotContext';
import { section } from '../../shared/l10n';
import type { DimensionEntry, ExpressionClause, MeasureEntry } from '../types';
import { DIM_OPS, NUM_OPS, operatorLabel } from './operators';

// ---------------------------------------------------------------------------
// ClauseEditor
// ---------------------------------------------------------------------------

interface ClauseEditorProps {
  clause: ExpressionClause;
  dimensions: DimensionEntry[];
  measures: MeasureEntry[];
  onChange: (next: ExpressionClause) => void;
  onRemove: () => void;
}

export const ClauseEditor = function ClauseEditor({
  clause,
  dimensions,
  measures,
  onChange,
  onRemove,
}: ClauseEditorProps) {
  const { localization: t } = usePivot();
  const tF = section(t, 'formatDialog');
  const tFl = section(t, 'fieldsList');
  const visibleMeasures = useMemo(
    () => measures.filter((m) => !m.hidden),
    [measures],
  );
  const patch = (upd: Partial<ExpressionClause>) =>
    onChange({ ...clause, ...upd });
  const targetValue =
    clause.kind === 'dim'
      ? `dim:${clause.target || ''}`
      : `meas:${clause.target || ''}`;

  const handleTargetChange = (e: { target: { value: unknown } }) => {
    const v = String(e.target.value || '');
    if (v.startsWith('dim:')) {
      onChange({
        ...clause,
        kind: 'dim',
        target: v.slice(4),
        operator: 'equals',
        value: '',
        value2: undefined,
      });
    } else {
      onChange({
        ...clause,
        kind: 'measure',
        target: v.slice(5),
        operator: 'gt',
        value: 0,
        value2: undefined,
      });
    }
  };

  const ops = clause.kind === 'dim' ? DIM_OPS : NUM_OPS;

  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ rowGap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}
    >
      <Select
        size="small"
        value={targetValue}
        onChange={(e) => handleTargetChange(e)}
        sx={{ minWidth: 220 }}
        displayEmpty
      >
        {dimensions.length > 0 && (
          <MenuItem value="" disabled>
            <em>{tF.dimensions || 'Dimensions'}</em>
          </MenuItem>
        )}
        {dimensions.map((d) => (
          <MenuItem key={`dim:${d.uniqueName}`} value={`dim:${d.uniqueName}`}>
            {d.caption}
          </MenuItem>
        ))}
        {visibleMeasures.length > 0 && (
          <MenuItem value="" disabled>
            <em>{tFl.values || 'Measures'}</em>
          </MenuItem>
        )}
        {visibleMeasures.map((m) => (
          <MenuItem key={`meas:${m.measureKey}`} value={`meas:${m.measureKey}`}>
            {m.caption || m.uniqueName}
          </MenuItem>
        ))}
      </Select>

      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={!!clause.not}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              patch({ not: e.target.checked })
            }
          />
        }
        label={tF.exprNot || 'NOT'}
      />

      <Select
        size="small"
        value={clause.operator || ops[0]}
        onChange={(e) => patch({ operator: e.target.value as string })}
        sx={{ minWidth: 160 }}
      >
        {ops.map((op) => (
          <MenuItem key={op} value={op}>
            {operatorLabel(tF, op)}
          </MenuItem>
        ))}
      </Select>

      {clause.kind === 'dim' ? (
        <TextField
          size="small"
          value={clause.value ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            patch({ value: e.target.value })
          }
          sx={{ width: 200 }}
          // `exprValue`: the key earlier versions read (custom dictionaries).
          label={tF.value || tF['exprValue'] || 'Value'}
        />
      ) : (
        <>
          <TextField
            size="small"
            type="number"
            value={clause.value ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              patch({ value: Number(e.target.value) })
            }
            sx={{ width: 140 }}
            label={tF.ruleValue || 'Value'}
          />
          {clause.operator === 'between' && (
            <TextField
              size="small"
              type="number"
              value={clause.value2 ?? ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                patch({ value2: Number(e.target.value) })
              }
              sx={{ width: 140 }}
              label={tF.ruleValueUpperBound || 'Upper bound'}
            />
          )}
        </>
      )}

      <IconButton size="small" onClick={onRemove}>
        <DeleteOutlineIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
};
