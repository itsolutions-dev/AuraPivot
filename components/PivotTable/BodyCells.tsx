/**
 * Body cells of the pivot grid: expand chevron, row label and value cell,
 * with the value cell's error and hidden-measures tooltips.
 */
import React from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import { usePivot } from '../../context/PivotContext';
import type { CellStyle } from '../../pivot-core/format/CellFormatter';
import type { Theme } from '@mui/material/styles';
import type { SystemStyleObject } from '@mui/system';
import { section } from '../shared/l10n';
import {
  SHADE_AMOUNT,
  headerBg,
  justifyFor,
  rowTints,
  safeDarken,
  scaleFontSize,
} from './layout';
import type { DensityConfig } from './layout';
import type { LeafSort } from './sortAxes';
import { SortIndicator } from './HeaderCells';

/** One entry of the hidden-measures hover tooltip. */
export interface HiddenMeasureItem {
  uniqueName: string;
  caption: string;
  aggregation: string;
  formatted: string;
}

interface ChevronCellProps {
  show?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  isGrandTotal?: boolean;
  isTotal?: boolean;
  shade?: number;
  density: DensityConfig;
  indent?: number;
}

export const ChevronCell = function ChevronCell({
  show,
  expanded,
  onToggle,
  isGrandTotal,
  isTotal,
  shade,
  density: d,
  indent,
}: ChevronCellProps) {
  return (
    <Box
      sx={(theme) => {
        const { stripedBg, grandTotalBg } = rowTints(theme, shade);
        return {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingLeft: `${(indent || 0) + 7}px`,
          width: '100%',
          height: '100%',
          minHeight: d.rowHeight,
          backgroundColor: show
            ? isGrandTotal
              ? grandTotalBg
              : isTotal
                ? theme.palette.action.selected
                : stripedBg
            : 'transparent',
        };
      }}
    >
      {show && (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
          sx={(theme) => ({
            p: 0,
            width: 18,
            height: 18,
            '& svg': { fontSize: theme.typography.body2.fontSize },
            backgroundColor: headerBg(theme),
          })}
        >
          {expanded ? (
            <ExpandMoreIcon fontSize="inherit" />
          ) : (
            <ChevronRightIcon fontSize="inherit" />
          )}
        </IconButton>
      )}
    </Box>
  );
};

interface BodyLabelCellProps {
  indent: number;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  caption?: React.ReactNode;
  onToggleChildren?: () => void;
  childrenExpanded?: boolean;
  style?: Partial<CellStyle> | null;
  shade?: number;
  density: DensityConfig;
  sort: LeafSort;
  onSortClick: (e: React.MouseEvent<HTMLElement>) => void;
}

export const BodyLabelCell = function BodyLabelCell({
  indent,
  isTotal,
  isGrandTotal,
  caption,
  onToggleChildren,
  childrenExpanded,
  style,
  shade,
  density: d,
  sort,
  onSortClick,
}: BodyLabelCellProps) {
  const { localization } = usePivot();
  const tGrid = section(localization, 'grid');
  return (
    <Box
      onClick={onSortClick}
      sx={(theme) => {
        const { stripedBg, grandTotalBg } = rowTints(theme, shade);
        return {
          display: 'flex',
          alignItems: 'center',
          gap: 0.25,
          paddingLeft: `${indent + 4}px`,
          paddingRight: '8px',
          paddingTop: d.rowPaddingY,
          paddingBottom: d.rowPaddingY,
          minHeight: d.rowHeight,
          height: d.rowHeight,
          lineHeight: d.rowLineHeight,
          fontFamily: style?.fontFamily || 'inherit',
          fontSize: scaleFontSize(
            style?.fontSize,
            d.bodyFontSizeRate,
            theme.typography.body2.fontSize,
          ),
          fontStyle: style?.fontStyle || 'normal',
          fontWeight: isGrandTotal
            ? style?.fontWeight || 700
            : isTotal
              ? 700
              : style?.fontWeight || 500,
          backgroundColor:
            style?.backgroundColor ||
            (isGrandTotal
              ? grandTotalBg
              : isTotal
                ? theme.palette.action.selected
                : stripedBg),
          color: style?.color || theme.palette.text.primary,
          textAlign: style?.textAlign || 'left',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background-color 120ms ease',
          '&:hover': { backgroundColor: theme.palette.action.hover },
          // User-configured format values (textAlign, fontWeight) are plain
          // strings - cast at the dynamic-style boundary.
        } as SystemStyleObject<Theme>;
      }}
    >
      <Box
        component="span"
        sx={{
          flex: '1 1 auto',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {caption}
      </Box>
      <SortIndicator {...sort} variant="body2" />
      {onToggleChildren && (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onToggleChildren();
          }}
          title={
            tGrid.expandCollapseChildren || 'Expand / Collapse level below'
          }
          sx={(theme) => ({
            p: 0,
            ml: 0.5,
            flexShrink: 0,
            width: 16,
            height: 16,
            opacity: 0.55,
            '&:hover': { opacity: 1 },
            '& svg': { fontSize: theme.typography.body2.fontSize },
          })}
        >
          {childrenExpanded ? (
            <UnfoldLessIcon fontSize="inherit" />
          ) : (
            <UnfoldMoreIcon fontSize="inherit" />
          )}
        </IconButton>
      )}
    </Box>
  );
};

/** Slots that restyle a Tooltip as a bordered paper card. */
const cardTooltipSlotProps = (borderColor: string, maxWidth: number) => ({
  tooltip: {
    sx: {
      bgcolor: 'background.paper',
      color: 'text.primary',
      border: 1,
      borderColor,
      boxShadow: 3,
      p: 1,
      maxWidth,
    },
  },
  arrow: { sx: { color: 'background.paper' } },
});

const TooltipHeading = function TooltipHeading({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return (
    <Typography
      variant="caption"
      sx={(theme) => ({
        display: 'block',
        fontWeight: theme.typography.h2.fontWeight,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
        color,
        mb: 0.5,
      })}
    >
      {children}
    </Typography>
  );
};

interface HiddenMeasuresListProps {
  label?: string;
  getItems: () => HiddenMeasureItem[];
}

// Rendered only while its tooltip is open, so the hidden measures are
// formatted on hover rather than for every visible cell on every render.
const HiddenMeasuresList = function HiddenMeasuresList({
  label,
  getItems,
}: HiddenMeasuresListProps) {
  return (
    <Box sx={{ minWidth: 200 }}>
      <TooltipHeading color="primary.main">{label}</TooltipHeading>
      <Box
        component="dl"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0.25,
          m: 0,
          '& dt,& dd': { m: 0 },
        }}
      >
        {getItems().map((it, i) => (
          <Box
            key={`${it.uniqueName}:${it.aggregation}`}
            sx={(theme) => ({
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'baseline',
              gap: 1.5,
              py: 0.25,
              borderTop:
                i === 0 ? 'none' : `1px dashed ${theme.palette.divider}`,
            })}
          >
            <Typography
              component="dt"
              variant="caption"
              sx={(theme) => ({
                flex: 1,
                minWidth: 0,
                textAlign: 'left',
                opacity: 0.8,
                fontWeight: theme.typography.subtitle1.fontWeight,
              })}
            >
              {it.caption}
            </Typography>
            <Typography
              component="dd"
              variant="body2"
              sx={(theme) => ({
                flexShrink: 0,
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: theme.typography.h2.fontWeight,
                color: 'text.primary',
              })}
            >
              {it.formatted}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

interface BodyValueCellProps {
  children?: React.ReactNode;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  style?: Partial<CellStyle> | null;
  shade?: number;
  density: DensityConfig;
  clickable?: boolean;
  onClick?: () => void;
  /** Set when the slice hides measures; called only once the tooltip opens. */
  getHiddenMeasureItems?: () => HiddenMeasureItem[];
  hiddenMeasuresLabel?: string;
  error?: string | null;
  errorLabel?: string;
}

export const BodyValueCell = function BodyValueCell({
  children,
  isTotal,
  isGrandTotal,
  style,
  shade,
  density: d,
  clickable,
  onClick,
  getHiddenMeasureItems,
  hiddenMeasuresLabel,
  error,
  errorLabel,
}: BodyValueCellProps) {
  const ruleBg = style?.backgroundColor;
  const ruleColor = style?.color;
  const shadeAmt = SHADE_AMOUNT[Math.max(0, Math.min(3, shade || 0))];
  // Grand totals: use user-defined colors verbatim — the user picks them in
  // the dedicated tab and expects them to show as-is. Subtotals still get a
  // small darken against their section color so they stand out from the
  // surrounding data.
  const effectiveBg = ruleBg
    ? isGrandTotal
      ? ruleBg
      : isTotal
        ? safeDarken(ruleBg, 0.25)
        : shadeAmt > 0
          ? safeDarken(ruleBg, shadeAmt + 0.05)
          : ruleBg
    : null;
  const effectiveColor = ruleColor
    ? isGrandTotal
      ? ruleColor
      : isTotal
        ? safeDarken(ruleColor, 0.25)
        : ruleColor
    : null;
  const cellBox = (
    <Box
      onClick={clickable ? onClick : undefined}
      sx={(theme) => {
        const { stripedBg, grandTotalBg } = rowTints(theme, shade);
        return {
          px: d.bodyPaddingX,
          py: d.rowPaddingY,
          minHeight: d.rowHeight,
          height: d.rowHeight,
          lineHeight: d.rowLineHeight,
          fontFamily: style?.fontFamily || 'inherit',
          fontSize: scaleFontSize(
            style?.fontSize,
            d.bodyFontSizeRate,
            theme.typography.body2.fontSize,
          ),
          fontStyle: style?.fontStyle || 'normal',
          textAlign: style?.textAlign || 'right',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: style?.fontWeight ?? (isTotal ? 700 : 400),
          cursor: clickable ? 'pointer' : 'default',
          backgroundColor:
            effectiveBg ||
            (isGrandTotal
              ? grandTotalBg
              : isTotal
                ? theme.palette.action.selected
                : shadeAmt > 0
                  ? stripedBg
                  : 'transparent'),
          color: effectiveColor || theme.palette.text.primary,
          transition: 'background-color 80ms ease',
          '&:hover': clickable
            ? {
                backgroundColor: effectiveBg
                  ? safeDarken(effectiveBg, 0.1)
                  : theme.palette.action.focus,
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
              }
            : undefined,
          // Same dynamic-style boundary cast as BodyLabelCell.
        } as SystemStyleObject<Theme>;
      }}
    >
      {error ? (
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            width: '100%',
            justifyContent: justifyFor(style?.textAlign || 'right', 'flex-end'),
          }}
        >
          <span>{children}</span>
          <ErrorOutlineIcon
            sx={(theme) => ({
              fontSize: theme.typography.body2.fontSize,
              color: 'error.main',
              flexShrink: 0,
            })}
          />
        </Box>
      ) : (
        children
      )}
    </Box>
  );
  if (error) {
    return (
      <Tooltip
        arrow
        placement="top"
        enterDelay={150}
        leaveDelay={50}
        slotProps={cardTooltipSlotProps('error.main', 360)}
        title={
          <Box>
            <TooltipHeading color="error.main">{errorLabel}</TooltipHeading>
            <Typography
              variant="body2"
              sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            >
              {error}
            </Typography>
          </Box>
        }
      >
        {cellBox}
      </Tooltip>
    );
  }
  if (!getHiddenMeasureItems) return cellBox;
  return (
    <Tooltip
      arrow
      placement="top"
      enterDelay={250}
      leaveDelay={50}
      slotProps={cardTooltipSlotProps('divider', 320)}
      title={
        <HiddenMeasuresList
          label={hiddenMeasuresLabel}
          getItems={getHiddenMeasureItems}
        />
      }
    >
      {cellBox}
    </Tooltip>
  );
};
