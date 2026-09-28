// One drop zone of the field list (filters, rows, columns or values).
import React, { useState } from 'react';
import { Box, Typography, Stack } from '@mui/material';
import type { ZoneId, ZoneField, DragPayload } from './types';
import { startDrag, readDragPayload } from './sliceEdits';

/**
 * Stable React key for a slice entry. The measures zone may hold the same
 * field several times with different aggregations, so the aggregation is
 * part of the identity — never the array index, since every zone is
 * drag-reorderable.
 */
const chipKey = (item: ZoneField): string =>
  item.aggregation ? `${item.uniqueName}:${item.aggregation}` : item.uniqueName;

// ---------------------------------------------------------------------------
// DropZone
// ---------------------------------------------------------------------------

interface DropZoneProps {
  zone: ZoneId;
  /** The whole zone array, Measures anchor included. */
  items: ZoneField[];
  label: string;
  dropHint: string;
  onDrop: (
    zone: ZoneId,
    payload: DragPayload,
    targetIdx: number | null,
  ) => void;
  renderItem: (item: ZoneField, idx: number) => React.ReactNode;
}

export const DropZone = function DropZone({
  zone,
  items,
  label,
  dropHint,
  onDrop,
  renderItem,
}: DropZoneProps): React.ReactElement {
  const [over, setOver] = useState<boolean>(false);

  // `targetIdx` is the chip dropped on (insert before it), or null for the
  // zone background (append).
  const drop = (e: React.DragEvent, targetIdx: number | null) => {
    e.preventDefault();
    setOver(false);
    const payload = readDragPayload(e);
    if (payload) onDrop(zone, payload, targetIdx);
  };

  // The Measures anchor gets no chip (the "Show totals" toggle places it)
  // but keeps its slot, so chip indices match the zone array the slice
  // edits address.
  const isEmpty = items.every((item) => item.uniqueName === 'Measures');

  return (
    <Box
      onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: React.DragEvent<HTMLDivElement>) => drop(e, null)}
      sx={(theme) => ({
        borderRadius: 2,
        border: `1px dashed ${
          over ? theme.palette.primary.main : theme.palette.divider
        }`,
        backgroundColor: over
          ? theme.palette.action.hover
          : theme.palette.background.default,
        p: 1.5,
        minHeight: 96,
        transition: 'all 150ms ease',
      })}
    >
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, opacity: 0.75, letterSpacing: 0.5 }}
      >
        {label}
      </Typography>
      <Stack direction="row" sx={{ gap: 0, flexWrap: 'wrap', mt: 0.75 }}>
        {isEmpty && (
          <Typography
            variant="body2"
            sx={{ opacity: 0.5, fontStyle: 'italic' }}
          >
            {dropHint}
          </Typography>
        )}
        {items.map((item, idx) =>
          item.uniqueName === 'Measures' ? null : (
            // Each chip is both a drag source (to move to another zone) and
            // a drop target (to reorder / insert at a specific position).
            <Box
              key={chipKey(item)}
              draggable
              onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
                e.stopPropagation();
                startDrag(e, {
                  source: zone,
                  uniqueName: item.uniqueName,
                  idx,
                });
              }}
              onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e: React.DragEvent<HTMLDivElement>) => {
                e.stopPropagation();
                drop(e, idx);
              }}
              sx={{
                cursor: 'grab',
                mr: '4px',
                mt: '4px',
                '&:active': { cursor: 'grabbing' },
              }}
            >
              {renderItem(item, idx)}
            </Box>
          ),
        )}
      </Stack>
    </Box>
  );
};
