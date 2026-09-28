// Rows of the "All fields" palette and their inline action buttons.
import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { usePivot } from '../../context/PivotContext';
import { section } from '../shared/l10n';
import { startDrag } from './sliceEdits';

// ---------------------------------------------------------------------------
// Rows of the "All fields" palette
// ---------------------------------------------------------------------------

interface RowActionProps {
  /** Tooltip; MUI also makes it the button's accessible name. */
  title?: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  color?: string;
  children: React.ReactNode;
}

/**
 * Compact icon button on a palette row or a chip. The click stops at the
 * button, so it never reaches the draggable row or chip around it.
 */
export const RowAction = function RowAction({
  title,
  onClick,
  color,
  children,
}: RowActionProps): React.ReactElement {
  const button = (
    <IconButton
      size="small"
      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        onClick(e);
      }}
      sx={(theme) => ({
        p: '2px',
        '& svg': { fontSize: theme.typography.fontSize },
        color,
      })}
    >
      {children}
    </IconButton>
  );
  return title ? <Tooltip title={title}>{button}</Tooltip> : button;
};

interface PaletteRowProps {
  uniqueName: string;
  /** Already on rows, columns or filters: listed, but not draggable again. */
  used: boolean;
  /** Defaults to `!used`. A row that cannot be dragged is dimmed. */
  draggable?: boolean;
  /** Controls placed before the drag handle. */
  leading?: React.ReactNode;
  dropProps?: Pick<
    React.HTMLAttributes<HTMLDivElement>,
    'onDragOver' | 'onDrop'
  >;
  sx?: SxProps<Theme>;
  children: React.ReactNode;
}

/** One "All fields" row, a drag source for the zones. */
export const PaletteRow = function PaletteRow({
  uniqueName,
  used,
  draggable = !used,
  leading,
  dropProps,
  sx,
  children,
}: PaletteRowProps): React.ReactElement {
  const tFL = section(usePivot().localization, 'fieldsList');
  return (
    <Tooltip
      title={
        used
          ? tFL.fieldUsedTooltip ||
            'Field already used — remove it from rows/columns/filters to drag it elsewhere'
          : ''
      }
      disableHoverListener={!used}
      disableFocusListener={!used}
    >
      <Box
        draggable={draggable}
        onDragStart={
          draggable
            ? (e: React.DragEvent<HTMLDivElement>) =>
                startDrag(e, { source: 'all', uniqueName })
            : undefined
        }
        {...dropProps}
        style={{ alignItems: 'center' }}
        sx={[
          (theme) => ({
            display: 'flex',
            gap: 0.5,
            cursor: draggable ? 'grab' : 'default',
            py: 0.5,
            borderRadius: 1.5,
            backgroundColor: theme.palette.action.hover,
            border: '1px solid transparent',
            opacity: draggable ? 1 : 0.55,
            '&:hover': { backgroundColor: theme.palette.action.selected },
          }),
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        {leading}
        {draggable ? (
          <DragIndicatorIcon fontSize="small" sx={{ opacity: 0.5 }} />
        ) : (
          <Box sx={{ width: 20 }} />
        )}
        {children}
      </Box>
    </Tooltip>
  );
};
