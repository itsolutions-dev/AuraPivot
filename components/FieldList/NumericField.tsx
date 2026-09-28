// Compact numeric input with step buttons.
import React from 'react';
import {
  IconButton,
  FormControl,
  FormHelperText,
  InputAdornment,
  InputLabel,
  OutlinedInput,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';

// ---------------------------------------------------------------------------
// NumericField
// ---------------------------------------------------------------------------

interface NumericFieldProps {
  value?: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  helperText?: string;
  size?: 'small' | 'medium';
  fullWidth?: boolean;
}

/**
 * Self-contained numeric input modeled after the Material UI NumberField recipe.
 * Uses only primitives already shipped by `@mui/material` (no Base UI dep) so
 * the library keeps its existing peer-dependency surface. Renders as an
 * OutlinedInput flanked by two IconButton adornments; the native browser spin
 * buttons are hidden so increment / decrement are driven exclusively by the
 * adornment buttons (consistent visuals across browsers).
 */
export const NumericField = function NumericField({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  helperText,
  size = 'small',
  fullWidth = false,
}: NumericFieldProps): React.ReactElement {
  const clamp = (raw: number): number => {
    let n = Number.isFinite(raw) ? raw : 0;
    if (Number.isFinite(min)) n = Math.max(min!, n);
    if (Number.isFinite(max)) n = Math.min(max!, n);
    return n;
  };
  const commit = (next: number) => onChange?.(clamp(next));
  const current = Number.isFinite(value) ? value! : 0;

  return (
    <FormControl size={size} fullWidth={fullWidth} variant="outlined">
      {label && <InputLabel shrink>{label}</InputLabel>}
      <OutlinedInput
        size={size}
        value={current}
        notched={!!label}
        label={label}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const v = parseFloat(e.target.value);
          commit(Number.isFinite(v) ? v : 0);
        }}
        startAdornment={
          <InputAdornment position="start">
            <IconButton
              size="small"
              aria-label="decrement"
              disabled={Number.isFinite(min) && current <= min!}
              onClick={() => commit(current - step)}
              sx={(theme) => ({
                borderRadius: 1.5,
                color: theme.palette.text.secondary,
                '&:hover': {
                  color: theme.palette.primary.main,
                  backgroundColor: theme.palette.action.hover,
                },
              })}
            >
              <RemoveIcon fontSize="small" />
            </IconButton>
          </InputAdornment>
        }
        endAdornment={
          <InputAdornment position="end">
            <IconButton
              size="small"
              aria-label="increment"
              disabled={Number.isFinite(max) && current >= max!}
              onClick={() => commit(current + step)}
              sx={(theme) => ({
                borderRadius: 1.5,
                color: theme.palette.text.secondary,
                '&:hover': {
                  color: theme.palette.primary.main,
                  backgroundColor: theme.palette.action.hover,
                },
              })}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </InputAdornment>
        }
        inputProps={{
          inputMode: 'numeric',
          style: {
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 600,
            MozAppearance: 'textfield',
          },
        }}
        sx={{
          '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button':
            {
              WebkitAppearance: 'none',
              margin: 0,
            },
        }}
      />
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
    </FormControl>
  );
};
