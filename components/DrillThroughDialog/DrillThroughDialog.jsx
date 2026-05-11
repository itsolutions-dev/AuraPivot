import React, { useMemo, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Dialog,
  DialogContent,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  InputAdornment,
  Typography,
  Chip,
  Stack,
  Divider,
  alpha,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import { usePivot } from '../../context/PivotContext';
import { usePortalContainer } from '../../hooks/usePortalContainer';

/**
 * Drill-through popup. Opens when the user clicks a non-null value cell and
 * shows the subset of source rows that contributed to that aggregated value.
 *
 * The rows come from `matrix.sourceRows` (already filtered through the slice
 * filters), intersected on the clicked rowNode and colNode row indexes. Only
 * the fields actually present in the dataset metadata are rendered — no
 * synthetic date hierarchy columns (`.Year`, `.Month`, …) to keep the table
 * focused on the original record.
 */

const DrillThroughDialog = function DrillThroughDialog({
  open,
  onClose,
  title,
  rows,
  breadcrumbs,
}) {
  const { engine, localization: t, locale } = usePivot();
  const portalContainer = usePortalContainer();
  const [filterText, setFilterText] = useState('');
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [drillConfig, setDrillConfig] = useState(() =>
    engine.getDrillThroughConfig()
  );
  const [fieldOrder, setFieldOrder] = useState(() => engine.getFieldOrder());

  useEffect(() => {
    if (open) {
      setFilterText('');
      setSortBy(null);
      setSortDir('asc');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const sync = () => {
      setDrillConfig(engine.getDrillThroughConfig());
      setFieldOrder(engine.getFieldOrder());
    };
    sync();
    engine.on('dataChange', sync);
    return () => engine.off('dataChange', sync);
  }, [engine, open]);

  const columns = useMemo(() => {
    const meta = engine.getMetadata() || {};
    const dtFields = drillConfig?.fields || {};
    const isOn = (uniqueName) => {
      const v = dtFields[uniqueName];
      return v === undefined ? true : !!v;
    };
    const base = Object.entries(meta)
      .filter(([uniqueName]) => !uniqueName.includes('.'))
      .filter(([uniqueName]) => isOn(uniqueName))
      .map(([uniqueName, m]) => ({
        uniqueName,
        caption: m?.caption || uniqueName,
        type: m?.type,
      }));
    if (fieldOrder && fieldOrder.length > 0) {
      const rank = new Map(fieldOrder.map((n, i) => [n, i]));
      base.sort((a, b) => {
        const ra = rank.has(a.uniqueName) ? rank.get(a.uniqueName) : Infinity;
        const rb = rank.has(b.uniqueName) ? rank.get(b.uniqueName) : Infinity;
        return ra - rb;
      });
    }
    return base;
  }, [engine, open, drillConfig, fieldOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fixed width for left-pinned columns so cumulative `left` is computable
  // without runtime DOM measurement. Same value applied to head + body cells.
  const FROZEN_COL_WIDTH = 160;
  const frozenCount = Math.max(
    0,
    Math.min(drillConfig?.frozenCount || 0, columns.length)
  );
  const frozenStyles = (ci, isHead) => {
    if (ci >= frozenCount) return null;
    return {
      position: 'sticky',
      left: ci * FROZEN_COL_WIDTH,
      // Header frozen cells sit at the top-left intersection, so they need
      // a higher z-index than both the column-only sticky body cells and
      // the row-only sticky header cells from MUI's stickyHeader prop.
      zIndex: isHead ? 4 : 1,
      minWidth: FROZEN_COL_WIDTH,
      maxWidth: FROZEN_COL_WIDTH,
    };
  };

  const formatValue = (value, type) => {
    if (value === null || value === undefined || value === '') return '—';
    if (type === 'number' && Number.isFinite(Number(value))) {
      return new Intl.NumberFormat(locale || undefined).format(Number(value));
    }
    if (type === 'date' || type === 'time') {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleString(locale || undefined);
      }
    }
    return String(value);
  };

  const handleSort = (uniqueName) => {
    if (sortBy === uniqueName) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(uniqueName);
      setSortDir('asc');
    }
  };

  const displayedRows = useMemo(() => {
    if (!rows) return [];
    const needle = filterText.trim().toLowerCase();
    let result = rows;
    if (needle) {
      result = rows.filter((row) =>
        columns.some((c) => {
          const formatted = formatValue(row?.[c.uniqueName], c.type);
          return formatted !== '—' && formatted.toLowerCase().includes(needle);
        })
      );
    }
    if (sortBy) {
      const col = columns.find((c) => c.uniqueName === sortBy);
      const dir = sortDir === 'asc' ? 1 : -1;
      result = [...result].sort((a, b) => {
        const va = a?.[sortBy];
        const vb = b?.[sortBy];
        const aEmpty = va === null || va === undefined || va === '';
        const bEmpty = vb === null || vb === undefined || vb === '';
        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1;
        if (bEmpty) return -1;
        if (col?.type === 'number') {
          return (Number(va) - Number(vb)) * dir;
        }
        if (col?.type === 'date' || col?.type === 'time') {
          return (new Date(va).getTime() - new Date(vb).getTime()) * dir;
        }
        return (
          String(va).localeCompare(String(vb), locale || undefined, {
            numeric: true,
          }) * dir
        );
      });
    }
    return result;
  }, [rows, columns, filterText, sortBy, sortDir, locale]);

  const titleText = title || t?.drillThrough?.title || 'Detail data';
  const recordsLabel =
    displayedRows.length === 1
      ? t?.drillThrough?.record || 'record'
      : t?.drillThrough?.recordsFound || 'records';
  const isFiltered = filterText && rows?.length;
  const hasRows = rows && rows.length > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="false"
      container={portalContainer}
      PaperProps={{
        sx: (theme) => ({
          overflow: 'hidden',
          borderRadius: 3,
          border: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
          background: theme.palette.background.paper,
          boxShadow:
            theme.palette.mode === 'dark'
              ? '0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)'
              : '0 30px 80px rgba(15,23,42,0.18), 0 0 0 1px rgba(15,23,42,0.04)',
          fontFamily: theme.font?.primary || theme.typography.fontFamily,
        }),
      }}
    >
      {/* ===== Header ===== */}
      <Box
        sx={(theme) => {
          const accent = theme.palette.primary.main;
          const accent2 =
            theme.palette.secondary?.main || theme.palette.primary.dark;
          return {
            position: 'relative',
            px: { xs: 2.5, sm: 3.5 },
            pt: 2.75,
            pb: 2.25,
            borderBottom: `1px solid ${theme.palette.divider}`,
            background:
              theme.palette.mode === 'dark'
                ? `linear-gradient(135deg, ${alpha(accent, 0.14)} 0%, ${alpha(
                    accent2,
                    0.06
                  )} 60%, transparent 100%)`
                : `linear-gradient(135deg, ${alpha(accent, 0.08)} 0%, ${alpha(
                    accent2,
                    0.04
                  )} 60%, transparent 100%)`,
            overflow: 'hidden',
            '&::before': {
              content: '""',
              position: 'absolute',
              inset: 0,
              backgroundImage: `radial-gradient(circle at 0% 0%, ${alpha(
                accent,
                0.18
              )} 0, transparent 38%), radial-gradient(circle at 95% 0%, ${alpha(
                accent2,
                0.12
              )} 0, transparent 40%)`,
              pointerEvents: 'none',
            },
          };
        }}
      >
        <Stack
          direction="row"
          alignItems="flex-start"
          justifyContent="space-between"
          spacing={2}
          sx={{ position: 'relative' }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={(theme) => ({
                color: theme.palette.text.secondary,
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                fontWeight: 600,
                mb: 0.5,
              })}
            >
              <Box
                component="span"
                sx={(theme) => ({
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: theme.palette.primary.main,
                  boxShadow: (th) =>
                    `0 0 0 4px ${alpha(th.palette.primary.main, 0.18)}`,
                })}
              />
              <span>{t?.drillThrough?.eyebrow || 'Drill-through'}</span>
            </Stack>
            <Typography
              component="h2"
              sx={(theme) => ({
                fontSize: { xs: 18, sm: 22 },
                fontWeight: 700,
                letterSpacing: '-0.015em',
                lineHeight: 1.2,
                color: theme.palette.text.primary,
                fontFamily:
                  theme.font?.display ||
                  theme.font?.primary ||
                  theme.typography.fontFamily,
              })}
            >
              {titleText}
            </Typography>

            {/* Metric ribbon */}
            <Stack
              direction="row"
              spacing={2.5}
              divider={
                <Divider
                  orientation="vertical"
                  flexItem
                  sx={{ opacity: 0.4 }}
                />
              }
              sx={{ mt: 1.5 }}
            >
              <Metric
                label={t?.drillThrough?.records || 'records'}
                value={displayedRows.length.toLocaleString(locale || undefined)}
                hint={
                  isFiltered
                    ? `/ ${rows.length.toLocaleString(locale || undefined)}`
                    : null
                }
              />
              <Metric
                label={t?.drillThrough?.columns || 'columns'}
                value={columns.length}
              />
              {isFiltered ? (
                <Metric
                  label={t?.drillThrough?.filtered || 'filtered'}
                  value="•"
                  accent
                />
              ) : null}
            </Stack>

            {breadcrumbs && breadcrumbs.length > 0 && (
              <Stack
                direction="row"
                gap={0.75}
                flexWrap="wrap"
                alignItems="center"
                sx={{ mt: 1.75 }}
              >
                {breadcrumbs.map((b, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && (
                      <Box
                        component="span"
                        sx={(theme) => ({
                          color: alpha(theme.palette.text.primary, 0.35),
                          fontSize: 12,
                          lineHeight: 1,
                        })}
                      >
                        ›
                      </Box>
                    )}
                    <Chip
                      size="small"
                      sx={(theme) => ({
                        height: 24,
                        borderRadius: 999,
                        backgroundColor: alpha(
                          theme.palette.primary.main,
                          theme.palette.mode === 'dark' ? 0.16 : 0.08
                        ),
                        color: theme.palette.text.primary,
                        border: `1px solid ${alpha(
                          theme.palette.primary.main,
                          0.22
                        )}`,
                        '& .MuiChip-label': {
                          px: 1,
                          fontSize: 11.5,
                          fontWeight: 500,
                        },
                      })}
                      label={
                        b.field ? (
                          <Stack
                            direction="row"
                            alignItems="baseline"
                            spacing={0.75}
                            component="span"
                          >
                            <Box
                              component="span"
                              sx={(theme) => ({
                                color: alpha(theme.palette.text.primary, 0.55),
                                fontSize: 10.5,
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                              })}
                            >
                              {b.field}
                            </Box>
                            <Box
                              component="span"
                              sx={{ fontWeight: 600, fontSize: 12 }}
                            >
                              {b.value}
                            </Box>
                          </Stack>
                        ) : (
                          <Box
                            component="span"
                            sx={{ fontWeight: 600, fontSize: 12 }}
                          >
                            {b.value}
                          </Box>
                        )
                      }
                    />
                  </React.Fragment>
                ))}
              </Stack>
            )}
          </Box>

          <IconButton
            onClick={onClose}
            size="small"
            aria-label={t?.drillThrough?.close || 'Close'}
            sx={(theme) => ({
              flexShrink: 0,
              width: 34,
              height: 34,
              borderRadius: 2,
              border: `1px solid ${theme.palette.divider}`,
              background: alpha(theme.palette.background.default, 0.6),
              backdropFilter: 'blur(8px)',
              transition: 'transform 140ms ease, background 140ms ease',
              '&:hover': {
                background: theme.palette.action.hover,
                transform: 'rotate(90deg)',
              },
            })}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      {/* ===== Body ===== */}
      <DialogContent
        sx={{
          p: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        {!hasRows ? (
          <EmptyState t={t} />
        ) : (
          <>
            <Box
              sx={(theme) => ({
                px: { xs: 2.5, sm: 3.5 },
                py: 2,
                borderBottom: `1px solid ${theme.palette.divider}`,
                background: alpha(theme.palette.background.default, 0.5),
              })}
            >
              <TextField
                size="small"
                fullWidth
                placeholder={t?.drillThrough?.filter || 'Filter records…'}
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" sx={{ opacity: 0.55 }} />
                    </InputAdornment>
                  ),
                  endAdornment: filterText ? (
                    <InputAdornment position="end">
                      <Chip
                        size="small"
                        icon={<FilterAltOutlinedIcon sx={{ fontSize: 13 }} />}
                        label={`${displayedRows.length.toLocaleString(
                          locale || undefined
                        )} / ${rows.length.toLocaleString(locale || undefined)}`}
                        sx={(theme) => ({
                          height: 22,
                          fontSize: 11,
                          background: alpha(theme.palette.primary.main, 0.12),
                          color: theme.palette.primary.main,
                          border: 'none',
                          '& .MuiChip-icon': {
                            color: theme.palette.primary.main,
                            ml: 0.5,
                          },
                        })}
                      />
                    </InputAdornment>
                  ) : null,
                  sx: (theme) => ({
                    borderRadius: 2,
                    background: theme.palette.background.paper,
                    fontSize: 13,
                    '& fieldset': {
                      borderColor: theme.palette.divider,
                    },
                    '&:hover fieldset': {
                      borderColor: alpha(theme.palette.primary.main, 0.4),
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: theme.palette.primary.main,
                      boxShadow: `0 0 0 4px ${alpha(
                        theme.palette.primary.main,
                        0.12
                      )}`,
                    },
                  }),
                }}
              />
            </Box>

            <TableContainer
              sx={(theme) => ({
                maxHeight: '65vh',
                background: theme.palette.background.paper,
                '&::-webkit-scrollbar': { width: 10, height: 10 },
                '&::-webkit-scrollbar-thumb': {
                  background: alpha(theme.palette.text.primary, 0.18),
                  borderRadius: 8,
                  border: `2px solid ${theme.palette.background.paper}`,
                },
                '&::-webkit-scrollbar-thumb:hover': {
                  background: alpha(theme.palette.text.primary, 0.32),
                },
              })}
            >
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {columns.map((c, ci) => (
                      <TableCell
                        key={c.uniqueName}
                        sortDirection={
                          sortBy === c.uniqueName ? sortDir : false
                        }
                        sx={(theme) => ({
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          fontSize: 10.5,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: theme.palette.text.secondary,
                          background:
                            theme.palette.mode === 'dark'
                              ? alpha(theme.palette.background.default, 0.92)
                              : alpha(theme.palette.background.default, 0.85),
                          backdropFilter: 'blur(6px)',
                          borderBottom: `1px solid ${theme.palette.divider}`,
                          py: 1.25,
                          pl: ci === 0 ? { xs: 2.5, sm: 3.5 } : 1.5,
                          textAlign: c.type === 'number' ? 'right' : 'left',
                          '&:first-of-type': { borderTopLeftRadius: 0 },
                          ...(frozenStyles(ci, true) || {}),
                          // Frozen header needs an opaque background so body
                          // cells scrolling underneath don't bleed through.
                          ...(ci < frozenCount && {
                            background: theme.palette.background.paper,
                            boxShadow:
                              ci === frozenCount - 1
                                ? `1px 0 0 ${theme.palette.divider}`
                                : undefined,
                          }),
                        })}
                      >
                        <TableSortLabel
                          active={sortBy === c.uniqueName}
                          direction={
                            sortBy === c.uniqueName ? sortDir : 'asc'
                          }
                          onClick={() => handleSort(c.uniqueName)}
                          sx={{
                            fontWeight: 'inherit',
                            fontSize: 'inherit',
                            letterSpacing: 'inherit',
                            textTransform: 'inherit',
                            color: 'inherit',
                            '&.Mui-active': {
                              color: (th) => th.palette.primary.main,
                            },
                            '& .MuiTableSortLabel-icon': {
                              fontSize: 14,
                              opacity: 0.8,
                            },
                          }}
                        >
                          {c.caption}
                        </TableSortLabel>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {displayedRows.map((row, idx) => (
                    <TableRow
                      key={idx}
                      sx={(theme) => ({
                        transition: 'background 120ms ease',
                        '&:nth-of-type(odd) td': {
                          background: alpha(
                            theme.palette.text.primary,
                            theme.palette.mode === 'dark' ? 0.02 : 0.014
                          ),
                        },
                        '&:hover td': {
                          background: alpha(
                            theme.palette.primary.main,
                            theme.palette.mode === 'dark' ? 0.08 : 0.05
                          ),
                        },
                      })}
                    >
                      {columns.map((c, ci) => (
                        <TableCell
                          key={c.uniqueName}
                          sx={(theme) => ({
                            fontSize: 12.5,
                            whiteSpace: 'nowrap',
                            color: theme.palette.text.primary,
                            textAlign: c.type === 'number' ? 'right' : 'left',
                            fontVariantNumeric:
                              c.type === 'number' ? 'tabular-nums' : 'normal',
                            fontFamily:
                              c.type === 'number' ||
                              c.type === 'date' ||
                              c.type === 'time'
                                ? theme.font?.mono ||
                                  '"JetBrains Mono", ui-monospace, monospace'
                                : 'inherit',
                            borderBottom: `1px solid ${alpha(
                              theme.palette.divider,
                              0.5
                            )}`,
                            pl: ci === 0 ? { xs: 2.5, sm: 3.5 } : 1.5,
                            py: 1.1,
                            ...(frozenStyles(ci, false) || {}),
                            ...(ci < frozenCount && {
                              background: `${theme.palette.background.paper} !important`,
                              boxShadow:
                                ci === frozenCount - 1
                                  ? `1px 0 0 ${theme.palette.divider}`
                                  : undefined,
                            }),
                          })}
                        >
                          {formatValue(row?.[c.uniqueName], c.type)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {isFiltered && displayedRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        sx={{
                          textAlign: 'center',
                          py: 6,
                          color: 'text.secondary',
                          fontStyle: 'italic',
                          fontSize: 13,
                        }}
                      >
                        {t?.drillThrough?.noMatch ||
                          'No records match the filter.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Footer ribbon */}
            <Box
              sx={(theme) => ({
                px: { xs: 2.5, sm: 3.5 },
                py: 1.25,
                borderTop: `1px solid ${theme.palette.divider}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
                background: alpha(theme.palette.background.default, 0.4),
                fontSize: 11.5,
                color: theme.palette.text.secondary,
              })}
            >
              <Box component="span">
                {displayedRows.length.toLocaleString(locale || undefined)}{' '}
                {recordsLabel}
                {isFiltered
                  ? ` · ${t?.drillThrough?.of || 'of'} ${rows.length.toLocaleString(
                      locale || undefined
                    )}`
                  : ''}
              </Box>
              <Box
                component="span"
                sx={(theme) => ({
                  fontFamily:
                    theme.font?.mono ||
                    '"JetBrains Mono", ui-monospace, monospace',
                  fontSize: 10.5,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: alpha(theme.palette.text.primary, 0.5),
                })}
              >
                {sortBy ? `${sortBy} · ${sortDir}` : '—'}
              </Box>
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

function Metric({ label, value, hint, accent }) {
  return (
    <Box>
      <Typography
        component="div"
        sx={(theme) => ({
          fontSize: 9.5,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: theme.palette.text.secondary,
          fontWeight: 600,
          lineHeight: 1.1,
        })}
      >
        {label}
      </Typography>
      <Stack direction="row" alignItems="baseline" spacing={0.5}>
        <Typography
          component="span"
          sx={(theme) => ({
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: accent
              ? theme.palette.primary.main
              : theme.palette.text.primary,
            fontFamily:
              theme.font?.mono ||
              '"JetBrains Mono", ui-monospace, monospace',
            lineHeight: 1.2,
          })}
        >
          {value}
        </Typography>
        {hint && (
          <Typography
            component="span"
            sx={(theme) => ({
              fontSize: 11,
              color: alpha(theme.palette.text.primary, 0.45),
              fontFamily:
                theme.font?.mono ||
                '"JetBrains Mono", ui-monospace, monospace',
            })}
          >
            {hint}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

function EmptyState({ t }) {
  return (
    <Box
      sx={{
        py: 8,
        px: 4,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1.5,
      }}
    >
      <Box
        sx={(theme) => ({
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: alpha(theme.palette.text.primary, 0.04),
          border: `1px dashed ${theme.palette.divider}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: alpha(theme.palette.text.primary, 0.4),
        })}
      >
        <InboxOutlinedIcon />
      </Box>
      <Typography
        variant="body2"
        sx={{ fontStyle: 'italic', opacity: 0.6, maxWidth: 320 }}
      >
        {t?.drillThrough?.noRecords || 'No records.'}
      </Typography>
    </Box>
  );
}

DrillThroughDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string,
  rows: PropTypes.array,
  breadcrumbs: PropTypes.arrayOf(
    PropTypes.shape({
      field: PropTypes.string,
      value: PropTypes.string,
    })
  ),
};

export default DrillThroughDialog;
