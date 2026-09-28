import React, { useMemo, useState } from 'react';
import {
  Box,
  Checkbox,
  FormControlLabel,
  TextField,
  Typography,
} from '@mui/material';

interface MemberChecklistProps {
  /** Distinct values of the field, in display order. */
  values: readonly unknown[];
  /** Selected values, compared as strings. */
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** Radio-like picking: a click selects only that value, no "Select all". */
  single?: boolean;
  /** A localization section with `search`, `selectAll` and `noValues`. */
  labels: Record<string, string>;
  maxHeight: number;
}

/**
 * Searchable checkbox list of a field's members with a "Select all" row.
 * The search only narrows what is shown: values hidden by it keep their
 * selection.
 */
const MemberChecklist = ({
  values,
  selected,
  onChange,
  single = false,
  labels,
  maxHeight,
}: MemberChecklistProps): React.ReactElement => {
  const [search, setSearch] = useState('');
  const visible = useMemo(() => {
    const needle = search.toLowerCase();
    return values
      .map(String)
      .filter((v) => !needle || v.toLowerCase().includes(needle));
  }, [values, search]);

  // "Select all" acts on the visible values only, so its checked and
  // indeterminate states describe those too. Counting selections hidden by
  // the search would show a mixed box whose click then selects everything
  // visible, which is what an unchecked box announces.
  const visibleSelected = visible.filter((v) => selected.has(v)).length;
  const allChecked = visible.length > 0 && visibleSelected === visible.length;

  const toggleOne = (value: string) => {
    if (single) {
      onChange(new Set([value]));
      return;
    }
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  const toggleAll = () => {
    const next = new Set(selected);
    visible.forEach((v) => {
      if (allChecked) next.delete(v);
      else next.add(v);
    });
    onChange(next);
  };

  return (
    <>
      <TextField
        size="small"
        fullWidth
        placeholder={labels.search || 'Search…'}
        value={search}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setSearch(e.target.value)
        }
        sx={{ mb: 1 }}
      />
      <Box
        sx={(theme) => ({
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 1,
          maxHeight,
          overflowY: 'auto',
          p: 0.5,
        })}
      >
        {!single && visible.length > 0 && (
          <FormControlLabel
            sx={{ pl: 1 }}
            control={
              <Checkbox
                size="small"
                checked={allChecked}
                indeterminate={!allChecked && visibleSelected > 0}
                onChange={toggleAll}
              />
            }
            label={
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                {labels.selectAll || 'Select all'} ({visible.length})
              </Typography>
            }
          />
        )}
        {visible.map((v) => (
          <FormControlLabel
            key={v}
            sx={{ pl: 1, display: 'flex' }}
            control={
              <Checkbox
                size="small"
                checked={selected.has(v)}
                onChange={() => toggleOne(v)}
              />
            }
            label={<Typography variant="body2">{v}</Typography>}
          />
        ))}
        {visible.length === 0 && (
          <Typography
            variant="caption"
            sx={{ p: 1, display: 'block', opacity: 0.6, fontStyle: 'italic' }}
          >
            {labels.noValues || 'No values.'}
          </Typography>
        )}
      </Box>
    </>
  );
};

export default MemberChecklist;
