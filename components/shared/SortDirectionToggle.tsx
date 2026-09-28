import React from 'react';
import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { usePivot } from '../../context/PivotContext';
import usePortalContainer from '../../hooks/usePortalContainer';
import { section } from './l10n';

export type SortToggleDirection = 'asc' | 'desc';

interface SortDirectionToggleProps {
  value: SortToggleDirection;
  onChange: (direction: SortToggleDirection) => void;
  /** Tighter buttons for use inside a menu header. */
  dense?: boolean;
}

const DENSE_SX = {
  p: 0.25,
  lineHeight: 1,
  '&.Mui-selected svg': { color: 'primary.main' },
} as const;

/** Ascending / descending toggle pair with localized tooltips. */
const SortDirectionToggle = ({
  value,
  onChange,
  dense = false,
}: SortDirectionToggleProps): React.ReactElement => {
  const { localization } = usePivot();
  const portalContainer = usePortalContainer();
  const tGrid = section(localization, 'grid');
  const options = [
    {
      value: 'asc',
      label: tGrid.sortAsc || 'Ascending',
      Icon: ArrowUpwardIcon,
    },
    {
      value: 'desc',
      label: tGrid.sortDesc || 'Descending',
      Icon: ArrowDownwardIcon,
    },
  ] as const;
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={value}
      onChange={(_, v: SortToggleDirection | null) => v && onChange(v)}
    >
      {options.map(({ value: dir, label, Icon }) => (
        <Tooltip
          key={dir}
          title={label}
          disableInteractive
          arrow
          slotProps={{ popper: { container: portalContainer } }}
        >
          <ToggleButton
            value={dir}
            aria-label={label}
            sx={dense ? DENSE_SX : undefined}
          >
            <Icon fontSize="small" />
          </ToggleButton>
        </Tooltip>
      ))}
    </ToggleButtonGroup>
  );
};

export default SortDirectionToggle;
