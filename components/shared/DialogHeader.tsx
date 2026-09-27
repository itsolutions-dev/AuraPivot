import React from 'react';
import { DialogTitle, IconButton, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import { usePivot } from '../../context/PivotContext';
import { section } from './l10n';

interface DialogHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  sx?: SxProps<Theme>;
}

/** Dialog title with an optional caption line and a close button. */
const DialogHeader = ({
  title,
  subtitle,
  onClose,
  sx,
}: DialogHeaderProps): React.ReactElement => {
  const { localization } = usePivot();
  const closeLabel = section(localization, 'buttons').close || 'Close';
  return (
    <DialogTitle sx={[{ pr: 6 }, ...(Array.isArray(sx) ? sx : [sx])]}>
      {title}
      {subtitle ? (
        <Typography variant="caption" component="div" sx={{ opacity: 0.7 }}>
          {subtitle}
        </Typography>
      ) : null}
      <IconButton
        onClick={onClose}
        aria-label={closeLabel}
        sx={{ position: 'absolute', top: 8, right: 8 }}
      >
        <CloseIcon />
      </IconButton>
    </DialogTitle>
  );
};

export default DialogHeader;
