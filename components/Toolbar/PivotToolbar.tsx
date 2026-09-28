import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  Box,
  Button,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import TuneIcon from '@mui/icons-material/Tune';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import GridOnIcon from '@mui/icons-material/GridOn';
import { usePivot } from '../../context/PivotContext';
import { section } from '../shared/l10n';
import { sanitizeSvg } from './sanitizeSvg';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

export interface TabMenuItem {
  id: string;
  title: string;
  icon?: string | React.ReactNode;
  handler?: () => void;
  cursorOffset?: number;
  tooltip?: string;
}

export interface TabDef {
  id: string;
  title: string;
  handler?: () => void;
  icon?: string | React.ReactNode;
  iconOnly?: boolean;
  rightGroup?: boolean;
  menu?: TabMenuItem[];
}

export interface ToolbarApi {
  getTabs: () => TabDef[];
}

// ---------------------------------------------------------------------------
// Props interfaces
// ---------------------------------------------------------------------------

export interface PivotToolbarProps {
  beforeToolbarCreated?: (api: ToolbarApi) => void;
  onOpenFields?: () => void;
  onOpenFormat?: () => void;
  onExportExcel?: () => void;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
}

interface ToolbarButtonProps {
  tab: TabDef;
}

interface IconForProps {
  name: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Default toolbar tab definitions. IDs match the auraPivot schema so the
 * consumer's beforeToolbarCreated handler can filter/override them with the
 * same code it used before the migration.
 */
const buildDefaultTabs = ({
  onOpenFields,
  onOpenFormat,
  onExportExcel,
  onToggleFullscreen,
  isFullscreen,
  t,
}: Omit<PivotToolbarProps, 'beforeToolbarCreated'> & {
  t: Record<string, unknown>;
}): TabDef[] => {
  const tb = section(t, 'toolbar');
  return [
    {
      id: 'aura-tab-fields',
      title: tb.fields || 'Fields',
      handler: onOpenFields,
      icon: 'fields',
    },
    {
      id: 'aura-tab-format',
      title: tb.format || 'Format',
      handler: onOpenFormat,
      icon: 'format',
    },
    {
      id: 'aura-tab-export',
      title: tb.export || 'Export',
      icon: 'export',
      menu: [
        {
          id: 'aura-tab-export-excel',
          title: tb.exportExcel || 'Export to Excel',
          icon: 'excel',
          handler: onExportExcel,
        },
      ],
    },
    {
      id: 'aura-tab-fullscreen',
      title: isFullscreen
        ? tb.exitFullscreen || 'Exit Fullscreen'
        : tb.fullscreen || 'Fullscreen',
      handler: onToggleFullscreen,
      icon: isFullscreen ? 'fullscreenExit' : 'fullscreen',
      iconOnly: true,
      rightGroup: true,
    },
  ];
};

const IconFor = function IconFor({
  name,
}: IconForProps): React.ReactElement | null {
  if (name === 'fields') return <ViewColumnIcon fontSize="small" />;
  if (name === 'format') return <TuneIcon fontSize="small" />;
  if (name === 'export') return <FileDownloadIcon fontSize="small" />;
  if (name === 'excel')
    return <GridOnIcon fontSize="small" sx={{ color: '#1D6F42' }} />;
  if (name === 'filter') return <FilterListIcon fontSize="small" />;
  if (name === 'fullscreen') return <FullscreenIcon fontSize="small" />;
  if (name === 'fullscreenExit') return <FullscreenExitIcon fontSize="small" />;
  return null;
};

/**
 * Consumer-provided `<svg>` markup (auraPivot convention). The sanitized
 * result is a DOM node appended as-is: markup is never handed to the HTML
 * parser, which is what made serialized-then-reinjected SVG exploitable.
 */
const SvgMarkupIcon = function SvgMarkupIcon({
  markup,
}: {
  markup: string;
}): React.ReactElement {
  const attach = useCallback(
    (host: HTMLSpanElement | null) => {
      if (!host) return;
      const svg = sanitizeSvg(markup, host.ownerDocument);
      host.replaceChildren(...(svg ? [svg] : []));
    },
    [markup],
  );
  return (
    <Box
      component="span"
      ref={attach}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        '& svg': { width: 20, height: 20, fill: 'currentColor' },
      }}
    />
  );
};

const renderIcon = (
  icon: string | React.ReactNode | undefined,
): React.ReactNode => {
  if (!icon) return null;
  if (typeof icon === 'string' && icon.trim().startsWith('<svg')) {
    return <SvgMarkupIcon markup={icon} />;
  }
  if (typeof icon === 'string') return <IconFor name={icon} />;
  return icon;
};

const ToolbarButton = function ToolbarButton({
  tab,
}: ToolbarButtonProps): React.ReactElement {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const hasMenu = Array.isArray(tab.menu) && tab.menu.length > 0;

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (hasMenu) {
      setAnchor(event.currentTarget);
      return;
    }
    if (typeof tab.handler === 'function') tab.handler();
  };

  return (
    <>
      <Tooltip title={tab.title || ''} disableInteractive>
        {tab.title && !tab.iconOnly ? (
          <Button
            color="primary"
            size="small"
            variant="text"
            startIcon={renderIcon(tab.icon)}
            onClick={handleClick}
            sx={{ textTransform: 'none', fontWeight: 500 }}
          >
            {tab.title}
          </Button>
        ) : (
          <IconButton color="primary" size="small" onClick={handleClick}>
            {renderIcon(tab.icon)}
          </IconButton>
        )}
      </Tooltip>
      {hasMenu && (
        <Menu
          anchorEl={anchor}
          open={Boolean(anchor)}
          onClose={() => setAnchor(null)}
        >
          {tab.menu!.map((item) => (
            <MenuItem
              key={item.id}
              onClick={() => {
                setAnchor(null);
                if (typeof item.handler === 'function') item.handler();
              }}
            >
              {item.icon ? (
                <ListItemIcon sx={{ minWidth: 32 }}>
                  {renderIcon(item.icon)}
                </ListItemIcon>
              ) : null}
              <ListItemText primary={item.title} />
            </MenuItem>
          ))}
        </Menu>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const PivotToolbar = function PivotToolbar({
  beforeToolbarCreated,
  onOpenFields,
  onOpenFormat,
  onExportExcel,
  onToggleFullscreen,
  isFullscreen,
}: PivotToolbarProps): React.ReactElement {
  const { localization: t, options } = usePivot();

  // Latest-ref for the consumer hook: it is nearly always an inline arrow, so
  // depending on its identity would re-run the effect below on every render.
  const handlerRef = useRef(beforeToolbarCreated);
  useEffect(() => {
    handlerRef.current = beforeToolbarCreated;
  });

  // The tab handlers must be stable (AuraPivot memoizes them): a new
  // identity rebuilds the tabs and re-runs the consumer hook below.
  const defaultTabs = useMemo(
    () =>
      buildDefaultTabs({
        onOpenFields,
        onOpenFormat,
        onExportExcel,
        onToggleFullscreen,
        isFullscreen,
        t,
      }),
    [
      onOpenFields,
      onOpenFormat,
      onExportExcel,
      onToggleFullscreen,
      isFullscreen,
      t,
    ],
  );

  // `beforeToolbarCreated` is consumer code that may mutate the DOM or call
  // setState on the host, so it cannot run during render (a useMemo body can
  // be re-run or thrown away at React's discretion). Run it as an effect and
  // re-render with whatever it produced; the first paint shows the defaults.
  const [customTabs, setCustomTabs] = useState<TabDef[] | null>(null);

  useEffect(() => {
    if (typeof handlerRef.current !== 'function') {
      setCustomTabs(null);
      return;
    }
    // auraPivot-compatible toolbar API: consumers typically monkey-patch
    // getTabs on it from within beforeToolbarCreated.
    const api: ToolbarApi = {
      getTabs: () => defaultTabs,
    };
    handlerRef.current(api);
    const finalTabs =
      typeof api.getTabs === 'function' ? api.getTabs() : defaultTabs;
    setCustomTabs(Array.isArray(finalTabs) ? finalTabs : defaultTabs);
  }, [defaultTabs]);

  const tabs = useMemo(() => {
    const list = customTabs ?? defaultTabs;

    // Built-in tabs honour options.toolbar.show* (default true); tabs added
    // through beforeToolbarCreated are always shown.
    const isVisible = (tab: TabDef): boolean => {
      if (!tab?.id) return true;
      if (tab.id === 'aura-tab-fields')
        return options?.toolbar?.showFields !== false;
      if (tab.id === 'aura-tab-format')
        return options?.toolbar?.showFormat !== false;
      if (tab.id === 'aura-tab-export')
        return options?.toolbar?.showExport !== false;
      if (tab.id === 'aura-tab-fullscreen')
        return options?.toolbar?.showFullscreen !== false;
      return true;
    };
    return list.filter(isVisible);
  }, [customTabs, defaultTabs, options]);

  const leftTabs = tabs.filter((t2) => !t2.rightGroup);
  const rightTabs = tabs.filter((t2) => !!t2.rightGroup);

  return (
    <Box
      sx={(theme) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.5,
        borderBottom: `1px solid ${theme.palette.divider}`,
        backgroundColor: theme.palette.background.paper,
        minHeight: 44,
      })}
    >
      {leftTabs.map((tab) => (
        <ToolbarButton key={tab.id} tab={tab} />
      ))}
      <Box sx={{ flex: 1 }} />
      {rightTabs.map((tab) => (
        <ToolbarButton key={tab.id} tab={tab} />
      ))}
    </Box>
  );
};

export default PivotToolbar;
