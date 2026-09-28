/** Header cells of the pivot grid: dimension chips, leaf headers, sort arrow. */
import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import usePortalContainer from '../../hooks/usePortalContainer';
import type { CellStyle } from '../../pivot-core/format/CellFormatter';
import type { Theme } from '@mui/material/styles';
import type { InternalSlice } from '../../pivot-core/PivotEngine';
import { headerBg, justifyFor, scaleFontSize } from './layout';
import type { DensityConfig } from './layout';
import type { LeafSort } from './sortAxes';

interface DimensionHeaderCellProps {
  dims?: InternalSlice['rows'];
  captionFor: (uniqueName: string) => string;
  activeFilters: Set<string>;
  onOpen: (uniqueName: string) => void;
  style?: Partial<CellStyle> | null;
  density: DensityConfig;
}

export const DimensionHeaderCell = function DimensionHeaderCell({
  dims,
  captionFor,
  activeFilters,
  onOpen,
  style,
  density: d,
}: DimensionHeaderCellProps) {
  const justify = justifyFor(style?.textAlign || 'left');
  if (!dims || dims.length === 0) {
    // An axis without dimensions still paints its share of the header row.
    return (
      <Box
        sx={(theme) => ({
          px: d.headerPaddingX,
          py: d.headerPaddingY,
          minHeight: d.headerCellMinHeight,
          opacity: 0.7,
          backgroundColor: style?.backgroundColor || headerBg(theme),
        })}
      />
    );
  }
  return (
    <Box
      sx={(theme) => ({
        px: '6px',
        py: '3px',
        minHeight: d.headerCellMinHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: justify,
        gap: 0.5,
        flexWrap: 'wrap',
        backgroundColor: style?.backgroundColor || headerBg(theme),
      })}
    >
      {dims.map((dim) => {
        const active = activeFilters.has(dim.uniqueName);
        return (
          <Box
            key={dim.uniqueName}
            sx={(theme) => ({
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              px: '6px',
              py: '1px',
              borderRadius: theme.shape.borderRadius,
              border: `1px solid ${
                active ? theme.palette.primary.main : theme.palette.divider
              }`,
              backgroundColor: active
                ? theme.palette.action.selected
                : theme.palette.background.paper,
              color: active
                ? theme.palette.primary.main
                : style?.color || theme.palette.text.secondary,
              fontFamily: style?.fontFamily || 'inherit',
              fontWeight: style?.fontWeight || 600,
              fontSize: scaleFontSize(
                style?.fontSize,
                d.headerFontSizeRate,
                theme.typography.body2.fontSize,
              ),
              fontStyle: style?.fontStyle || 'normal',
              whiteSpace: 'nowrap',
            })}
          >
            {active && (
              <FilterAltIcon
                sx={(theme) => ({
                  fontSize: theme.typography.button.fontSize,
                  color: 'primary.main',
                  mr: '2px',
                })}
              />
            )}
            <span>{captionFor(dim.uniqueName)}</span>
            <IconButton
              size="small"
              onClick={() => onOpen(dim.uniqueName)}
              sx={(theme) => ({
                p: 0,
                ml: '2px',
                width: 16,
                height: 16,
                '& svg': { fontSize: theme.typography.button.fontSize },
              })}
            >
              <SettingsIcon fontSize="inherit" />
            </IconButton>
          </Box>
        );
      })}
    </Box>
  );
};

interface HeaderCellProps {
  children?: React.ReactNode;
  primary?: boolean;
  style?: Partial<CellStyle> | null;
  density: DensityConfig;
  /** Set on sortable headers: clicks call `onClick` and an arrow shows. */
  sort?: LeafSort;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  action?: React.ReactNode;
  prefix?: React.ReactNode;
}

export const HeaderCell = function HeaderCell({
  children,
  primary,
  style,
  density: d,
  sort,
  onClick,
  action,
  prefix,
}: HeaderCellProps) {
  const sortable = !!sort;
  const align = style?.textAlign || 'left';
  return (
    <Box
      onClick={sortable ? onClick : undefined}
      sx={(theme) => ({
        px: d.headerPaddingX,
        py: d.headerPaddingY,
        minHeight: d.headerCellMinHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: justifyFor(align),
        gap: 0.25,
        cursor: sortable ? 'pointer' : 'default',
        userSelect: 'none',
        backgroundColor: style?.backgroundColor || headerBg(theme),
        fontFamily: style?.fontFamily || 'inherit',
        fontWeight: style?.fontWeight || 600,
        fontStyle: style?.fontStyle || 'normal',
        color:
          style?.color ||
          (primary ? theme.palette.primary.main : theme.palette.text.secondary),
        fontSize: scaleFontSize(
          style?.fontSize,
          d.headerFontSizeRate,
          theme.typography.body2.fontSize,
        ),
        letterSpacing: 0.3,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        transition: 'background-color 120ms ease',
        '&:hover': sortable
          ? {
              backgroundColor: theme.palette.action.hover,
            }
          : undefined,
      })}
    >
      {prefix}
      <Box
        component="span"
        sx={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          textAlign: align,
        }}
      >
        {children}
      </Box>
      {sort && <SortIndicator {...sort} variant="subtitle2" />}
      {action && (
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center' }}>
          {action}
        </Box>
      )}
    </Box>
  );
};

interface SortIndicatorProps extends LeafSort {
  /** Typography variant whose font size the arrow takes. */
  variant: 'subtitle2' | 'body2';
}

/** Active-sort arrow with a tooltip naming the criteria, or a faded hint. */
export const SortIndicator = function SortIndicator({
  axis,
  direction,
  tooltip,
  variant,
}: SortIndicatorProps) {
  const portalContainer = usePortalContainer();
  const iconSx = (theme: Theme) => ({
    fontSize: theme.typography[variant].fontSize,
    flexShrink: 0,
  });
  if (!direction) {
    const { IdleIcon } = axis;
    return <IdleIcon sx={(theme) => ({ ...iconSx(theme), opacity: 0.2 })} />;
  }
  const Icon =
    direction === 'asc'
      ? axis.AscIcon
      : direction === 'desc'
        ? axis.DescIcon
        : null;
  if (!Icon) return null;
  return (
    <Tooltip
      title={tooltip}
      disableInteractive
      arrow
      slotProps={{ popper: { container: portalContainer } }}
    >
      <Icon sx={(theme) => ({ ...iconSx(theme), color: 'primary.main' })} />
    </Tooltip>
  );
};
