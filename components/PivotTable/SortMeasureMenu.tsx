/** Menu for picking the measure, and direction, a leaf's sort is keyed on. */
import React from 'react';
import { Box, Menu, MenuItem, Typography } from '@mui/material';
import { usePivot } from '../../context/PivotContext';
import type { InternalSort } from '../../pivot-core/PivotEngine';
import SortDirectionToggle from '../shared/SortDirectionToggle';
import type { SortToggleDirection } from '../shared/SortDirectionToggle';
import { section } from '../shared/l10n';
import type { SortMeasureRef } from '../../pivot-core/PivotEngine';
import type { SortPickerState } from './sortAxes';

interface SortMeasureMenuProps {
  picker: SortPickerState | null;
  sort: InternalSort | null;
  onDirectionChange: (direction: SortToggleDirection) => void;
  onClose: () => void;
}

/** Lets the user pick the measure, and direction, a sort is keyed on. */
export const SortMeasureMenu = function SortMeasureMenu({
  picker,
  sort,
  onDirectionChange,
  onClose,
}: SortMeasureMenuProps) {
  const { engine, localization } = usePivot();
  const tGrid = section(localization, 'grid');
  // When the picked leaf is the sorted one, its measure is marked and the
  // sort can be removed.
  const sortedHere =
    !!picker && !!sort && sort[picker.axis.keyField] === picker.key;
  const activeMeasure =
    picker && sortedHere
      ? (sort?.[picker.axis.measureField] as SortMeasureRef | null)
      : null;
  return (
    <Menu
      open={!!picker}
      anchorEl={picker?.anchorEl || null}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
    >
      <Box
        sx={{
          px: 1.5,
          py: 0.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Typography
          variant="body2"
          sx={(theme) => ({
            fontWeight: theme.typography.button.fontWeight,
            flex: 1,
          })}
        >
          {tGrid.sortByMeasure || 'Sort by measure'}
        </Typography>
        <SortDirectionToggle
          dense
          value={picker?.direction || 'desc'}
          onChange={onDirectionChange}
          AscIcon={picker?.axis.AscIcon}
          DescIcon={picker?.axis.DescIcon}
        />
      </Box>
      {picker &&
        picker.measures.map((m) => {
          const isActive =
            activeMeasure?.uniqueName === m.uniqueName &&
            activeMeasure?.aggregation === m.aggregation;
          return (
            <MenuItem
              key={`${m.uniqueName}:${m.aggregation}`}
              selected={isActive}
              onClick={() => {
                picker.axis.apply(engine, picker.key, picker.direction, {
                  uniqueName: m.uniqueName,
                  aggregation: m.aggregation,
                });
                onClose();
              }}
              sx={(theme) => ({
                fontSize: theme.typography.fontSize,
                fontWeight: isActive ? 700 : 200,
              })}
            >
              {m.caption || m.uniqueName}
            </MenuItem>
          );
        })}
      {picker && sortedHere && (
        <MenuItem
          onClick={() => {
            picker.axis.apply(engine, null, null, null);
            onClose();
          }}
          sx={(theme) => ({
            fontSize: theme.typography.fontSize,
            color: 'error.main',
            borderTop: 1,
            borderColor: 'divider',
          })}
        >
          {tGrid.removeSort || 'Remove sort'}
        </MenuItem>
      )}
    </Menu>
  );
};
