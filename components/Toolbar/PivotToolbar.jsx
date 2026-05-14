import React, { useMemo, useRef } from "react";
import PropTypes from "prop-types";

// Build-time flag injected by rollup `build-flags` plugin. Outside the
// bundler the token stays unresolved — `typeof` guard prevents
// ReferenceError.
const IS_FREEPLAN =
  typeof __FREEPLAN__ !== "undefined" ? !!__FREEPLAN__ : false;
import {
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
} from "@mui/material";
import FilterListIcon from "@mui/icons-material/FilterList";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import TuneIcon from "@mui/icons-material/Tune";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import GridOnIcon from "@mui/icons-material/GridOn";
import { ListItemIcon, ListItemText } from "@mui/material";
import { usePivot } from "../../context/PivotContext";
import { usePortalContainer } from "../../hooks/usePortalContainer";

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
}) => [
  {
    id: "wdr-tab-fields",
    title: t?.toolbar?.fields || "Fields",
    handler: onOpenFields,
    icon: "fields",
  },
  {
    id: "wdr-tab-format",
    title: t?.toolbar?.format || "Format",
    handler: onOpenFormat,
    icon: "format",
  },
  {
    id: "wdr-tab-export",
    title: t?.toolbar?.export || "Export",
    icon: "export",
    menu: [
      {
        id: "wdr-tab-export-excel",
        title: t?.toolbar?.exportExcel || "Export to Excel",
        icon: "excel",
        handler: onExportExcel,
      },
    ],
  },
  {
    id: "wdr-tab-fullscreen",
    title: isFullscreen
      ? t?.toolbar?.exitFullscreen || "Exit Fullscreen"
      : t?.toolbar?.fullscreen || "Fullscreen",
    handler: onToggleFullscreen,
    icon: isFullscreen ? "fullscreenExit" : "fullscreen",
    iconOnly: true,
    rightGroup: true,
  },
];

const IconFor = function IconFor({ name }) {
  if (name === "fields") return <ViewColumnIcon fontSize="small" />;
  if (name === "format") return <TuneIcon fontSize="small" />;
  if (name === "export") return <FileDownloadIcon fontSize="small" />;
  if (name === "excel")
    return <GridOnIcon fontSize="small" sx={{ color: "#1D6F42" }} />;
  if (name === "filter") return <FilterListIcon fontSize="small" />;
  if (name === "fullscreen") return <FullscreenIcon fontSize="small" />;
  if (name === "fullscreenExit") return <FullscreenExitIcon fontSize="small" />;
  return null;
};

const renderIcon = (icon) => {
  if (!icon) return null;
  // Support consumer-provided SVG markup strings (auraPivot convention).
  if (typeof icon === "string" && icon.trim().startsWith("<svg")) {
    return (
      <Box
        component="span"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: icon }}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          "& svg": { width: 20, height: 20, fill: "currentColor" },
        }}
      />
    );
  }
  if (typeof icon === "string") return <IconFor name={icon} />;
  return icon;
};

const ToolbarButton = function ToolbarButton({ tab }) {
  const [anchor, setAnchor] = React.useState(null);
  const portalContainer = usePortalContainer();
  const hasMenu = Array.isArray(tab.menu) && tab.menu.length > 0;

  const handleClick = (event) => {
    if (hasMenu) {
      setAnchor(event.currentTarget);
      return;
    }
    if (typeof tab.handler === "function") tab.handler();
  };

  return (
    <>
      <Tooltip
        title={tab.title || ""}
        disableInteractive
        slotProps={{ popper: { container: portalContainer } }}
      >
        {tab.title && !tab.iconOnly ? (
          <Button
            color="primary"
            size="small"
            variant="text"
            startIcon={renderIcon(tab.icon)}
            onClick={handleClick}
            sx={{ textTransform: "none", fontWeight: 500 }}
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
          container={portalContainer}
        >
          {tab.menu.map((item) => (
            <MenuItem
              key={item.id}
              onClick={() => {
                setAnchor(null);
                if (typeof item.handler === "function") item.handler();
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

ToolbarButton.propTypes = {
  tab: PropTypes.object.isRequired,
};

const PivotToolbar = function PivotToolbar({
  beforeToolbarCreated,
  onOpenFields,
  onOpenFormat,
  onExportExcel,
  onToggleFullscreen,
  isFullscreen,
}) {
  const { localization: t, options } = usePivot();
  const handlerRef = useRef(beforeToolbarCreated);
  handlerRef.current = beforeToolbarCreated;

  const tabs = useMemo(() => {
    const defaults = buildDefaultTabs({
      onOpenFields,
      onOpenFormat,
      onExportExcel,
      onToggleFullscreen,
      isFullscreen,
      t,
    });

    // Build a auraPivot-compatible toolbar API: consumers typically
    // monkey-patch getTabs on it from within beforeToolbarCreated.
    const api = {
      getTabs: () => defaults,
    };

    if (typeof handlerRef.current === "function") {
      handlerRef.current(api);
    }

    const finalTabs =
      typeof api.getTabs === "function" ? api.getTabs() : defaults;
    const list = Array.isArray(finalTabs) ? finalTabs : defaults;

    // Visibility flags from globalProps.options (default true). Reset is
    // injected by consumers via beforeToolbarCreated under id `reset-*`.
    const isVisible = (tab) => {
      if (!tab?.id) return true;
      if (tab.id === "wdr-tab-fields")
        return options?.toolbar?.showFields !== false;
      if (tab.id === "wdr-tab-format")
        return options?.toolbar?.showFormat !== false;
      if (tab.id === "wdr-tab-export") {
        // FREEPLAN: export tab is always hidden regardless of caller intent.
        if (IS_FREEPLAN) return false;
        return options?.toolbar?.showExport !== false;
      }
      if (tab.id === "wdr-tab-fullscreen")
        return options?.toolbar?.showFullscreen !== false;
      /*       if (tab.id.startsWith('reset-'))
        return options?.toolbar?.showReset !== false; */
      return true;
    };
    return list.filter(isVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    onOpenFields,
    onOpenFormat,
    onExportExcel,
    onToggleFullscreen,
    isFullscreen,
    t,
    options,
  ]);

  const leftTabs = tabs.filter((t2) => !t2.rightGroup);
  const rightTabs = tabs.filter((t2) => !!t2.rightGroup);

  return (
    <Box
      sx={(theme) => ({
        display: "flex",
        alignItems: "center",
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

PivotToolbar.propTypes = {
  beforeToolbarCreated: PropTypes.func,
  onOpenFields: PropTypes.func,
  onOpenFormat: PropTypes.func,
  onExportExcel: PropTypes.func,
  onToggleFullscreen: PropTypes.func,
  isFullscreen: PropTypes.bool,
};

export default PivotToolbar;
