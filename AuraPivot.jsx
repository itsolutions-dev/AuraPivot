import React, {
  forwardRef,
  useImperativeHandle,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import PropTypes from "prop-types";
import {
  Box,
  Snackbar,
  Alert,
  ThemeProvider,
  Typography,
  Link,
} from "@mui/material";
import PivotEngine from "./pivot-core";
import { PivotProvider } from "./context/PivotContext";
import PivotToolbar from "./components/Toolbar/PivotToolbar";
import PivotTable from "./components/PivotTable/PivotTable";
import FieldList from "./components/FieldList/FieldList";
import FormatDialog from "./components/FormatDialog/FormatDialog";
import FilterBar from "./components/FilterBar/FilterBar";

// Build-time flags injected by rollup `build-flags` plugin. The `typeof`
// guards keep the source runnable outside the bundler (tests, sibling-package
// resolver) where the tokens stay unresolved.
const IS_FREEPLAN =
  typeof __FREEPLAN__ !== "undefined" ? !!__FREEPLAN__ : false;
const FREEPLAN_MAX_BYTES =
  typeof __FREEPLAN_MAX_BYTES__ !== "undefined"
    ? __FREEPLAN_MAX_BYTES__
    : 1024 * 1024;
const FREEPLAN_INFO_URL =
  typeof __FREEPLAN_INFO_URL__ !== "undefined"
    ? __FREEPLAN_INFO_URL__
    : "https://aurapivot.web.app";
const FREEPLAN_WATERMARK_ICON =
  typeof __FREEPLAN_WATERMARK_ICON__ !== "undefined"
    ? __FREEPLAN_WATERMARK_ICON__
    : "";

const estimateDatasetBytes = (data) => {
  try {
    const json = JSON.stringify(data);
    if (typeof Blob === "function") return new Blob([json]).size;
    // Fallback: rough UTF-8 byte count for non-browser hosts.
    return unescape(encodeURIComponent(json)).length;
  } catch {
    return 0;
  }
};

/**
 * Drop-in replacement for `<Pivot>` from @auraPivot/react-auraPivot.
 *
 * Preserves:
 *   - ref.auraPivot.getReport() / .setReport()
 *   - reportChange event prop
 *   - beforeToolbarCreated event prop receiving a `{ getTabs }` API
 *   - global.toolbar: { visible, showFields, showFormat, showExport, showFullscreen, showReset } — toolbar visibility
 *   - global.reset, global.export, global.fullscreen, global.format,
 *     global.fields (default true) — toolbar button visibility flags. Set to
 *     `false` to hide the corresponding tab from the toolbar.
 *   - global.formats, global.calculatedFields, global.fields (array),
 *     global.slides — caller-supplied data wiring. `fields` accepts an array
 *     of `{ uniqueName, caption }`; when boolean it is treated as the toolbar
 *     visibility flag.
 *   - global.layout — { density, alternateRows, enableDrillThrough,
 *     totalsRowsPosition, totalsColumnsPosition, title, notes }. Routed to
 *     setFormat (format concern). `totalsRowsPosition` /
 *     `totalsColumnsPosition` accept "before" | "after" | "none".
 *     `enableDrillThrough` (default true) gates the data-cell click that
 *     opens the DrillThroughDialog; it is also mirrored into engine options
 *     so the grid and the FormatDialog stay in sync.
 *   - global.dataSource.data in the auraPivot `[metadata, ...rows]` shape
 *   - global.fields.measuresAxis ("rows" | "columns") — which axis the
 *     Measures pseudo-field sits on.
 *
 * Optional `theme` prop accepts a MUI theme object (or a function `(outer) =>
 * theme` for partial overrides). When provided the entire pivot subtree is
 * wrapped in a `<ThemeProvider>`, isolating its look from the host theme.
 * When omitted the component inherits the ambient MUI theme.
 */
const Pivot = forwardRef(function Pivot(props, ref) {
  const {
    width = "100%",
    height = "100%",
    locale,
    localization: localizationProp,
    global: globalProps,
    reportChange,
    beforeToolbarCreated,
    theme,
  } = props;

  const toolbar = globalProps?.toolbar?.visible ?? true;

  const engineRef = useRef(null);
  if (engineRef.current === null) {
    engineRef.current = new PivotEngine();
  }
  const engine = engineRef.current;

  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);
  const [snack, setSnack] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [optsTick, setOptsTick] = useState(0);
  const [freeplanBlock, setFreeplanBlock] = useState(null);
  const [layoutFormat, setLayoutFormat] = useState(
    () => engine.getFormat()?.layout || {},
  );
  const rootRef = useRef(null);

  useEffect(() => {
    const onFormat = () => setLayoutFormat(engine.getFormat()?.layout || {});
    engine.on("formatChange", onFormat);
    return () => engine.off("formatChange", onFormat);
  }, [engine]);

  const handleToggleFullscreen = () => {
    const el = rootRef.current;
    if (!el) return;
    const doc = typeof document !== "undefined" ? document : null;
    const fsEl =
      doc?.fullscreenElement ||
      doc?.webkitFullscreenElement ||
      doc?.msFullscreenElement;
    if (!fsEl) {
      const req =
        el.requestFullscreen ||
        el.webkitRequestFullscreen ||
        el.msRequestFullscreen;
      if (req) {
        const p = req.call(el);
        if (p && typeof p.catch === "function") {
          p.catch((err) =>
            setSnack({
              severity: "error",
              message: err?.message || "Fullscreen error",
            }),
          );
        }
      }
    } else {
      const exit =
        doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
      if (exit) exit.call(doc);
    }
  };

  useEffect(() => {
    const handler = () => {
      const fsEl =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement;
      setIsFullscreen(!!fsEl && fsEl === rootRef.current);
    };
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    document.addEventListener("msfullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
      document.removeEventListener("msfullscreenchange", handler);
    };
  }, []);

  // No bundled fallback — engine treats missing keys as empty strings.
  const localization = useMemo(
    () => localizationProp || {},
    [localizationProp],
  );

  // Push the localized month / weekday names to the engine so that the
  // DateHierarchyExpander builds captions in the active language. Must run
  // BEFORE the setData effect so the first expansion uses the right labels.
  useEffect(() => {
    engine.setDateLocalization(localization?.dates);
  }, [engine, localization?.dates]);

  // Push the full localization dictionary so the engine can emit
  // localized captions (grand-total label, measure captions).
  useEffect(() => {
    engine.setLocalization(localization);
  }, [engine, localization]);

  // Apply data / options from props whenever they change. Under FREEPLAN the
  // dataset must fit within FREEPLAN_MAX_BYTES; if it doesn't, skip setData
  // and render the upgrade panel instead.
  useEffect(() => {
    const data = globalProps?.dataSource?.data;
    if (!data) {
      setFreeplanBlock(null);
      return;
    }
    if (IS_FREEPLAN) {
      const bytes = estimateDatasetBytes(data);
      if (bytes > FREEPLAN_MAX_BYTES) {
        setFreeplanBlock({ bytes, limit: FREEPLAN_MAX_BYTES });
        return;
      }
    }
    setFreeplanBlock(null);
    engine.setData(data);
  }, [engine, globalProps?.dataSource?.data]);

  useEffect(() => {
    if (!globalProps) return;
    const { formats, layout, calculatedFields, fields, slides, ...display } =
      globalProps;
    // `dataSource` is consumed by the setData effect above — drop it so it
    // never leaks into engine.setOptions.
    delete display.dataSource;
    // `fields` is dual-purpose: boolean → toolbar visibility, array → data
    // override list. Only forward the boolean form to engine options so the
    // toolbar can read it; the array goes through engine.setFields below.
    if (typeof fields === "boolean") display.fields = fields;
    // `enableDrillThrough` lives under `layout` (the FormatDialog edits it
    // there) but the grid gates the drill-through click on engine options —
    // mirror the layout value into options so both surfaces stay in sync.
    if (layout && layout.enableDrillThrough !== undefined) {
      display.enableDrillThrough = layout.enableDrillThrough;
    }
    // FREEPLAN: drillthrough is always disabled regardless of caller intent.
    if (IS_FREEPLAN) display.enableDrillThrough = false;
    engine.setOptions(display);
    if (formats) engine.setFormat(formats);
    // `layout` (density, alternating rows, totals placement) is a format
    // concern — MatrixComputer reads format.layout — so route it through
    // setFormat. `totalsRowsPosition` / `totalsColumnsPosition` accept
    // "before" | "after" | "none".
    if (layout) engine.setFormat({ layout });
    if (Array.isArray(calculatedFields))
      engine.setCalculatedFields(calculatedFields);
    if (Array.isArray(fields)) engine.setFields(fields);
    // Prop-driven slice mirrors the caller's own state — silence the
    // reportChange emission to avoid feedback loops in the consumer.
    if (slides) engine.setSlice(slides, { silent: true });
    // Bump tick so context useMemo re-runs and consumers (toolbar, table)
    // re-read engine.getOptions() with the fresh values.
    setOptsTick((t) => t + 1);
  }, [engine, globalProps]);

  // Wire the reportChange event through to the caller prop.
  useEffect(() => {
    if (typeof reportChange !== "function") return undefined;
    const handler = () => reportChange();
    engine.on("reportChange", handler);
    return () => engine.off("reportChange", handler);
  }, [engine, reportChange]);

  // Expose the legacy ref API.
  useImperativeHandle(
    ref,
    () => ({
      auraPivot: {
        getReport: () => engine.getReport(),
        setReport: (report) => engine.setReport(report),
      },
      // Also expose the raw engine for consumers that want richer access.
      engine,
    }),
    [engine],
  );

  const handleExportExcel = async () => {
    try {
      await engine.exportExcel("pivot.xlsx");
    } catch (err) {
      setSnack({ severity: "error", message: err?.message || "Export error" });
    }
  };

  // Push the caller-provided locale to the engine so matrix-level code
  // (MatrixComputer, TreeBuilder) can use it for localeCompare / Intl calls.
  useEffect(() => {
    engine.setLocale(locale);
  }, [engine, locale]);

  const contextValue = useMemo(
    () => ({
      engine,
      localization,
      // Locale threaded through the context for React consumers (FilterBar,
      // DrillThroughDialog, DimensionFilterDialog …). `undefined` means
      // "defer to the browser default" — Intl APIs handle that natively.
      locale: locale || undefined,
      options: engine.getOptions(),
      // Expose the fullscreen root + flag so overlays (Dialog/Menu/Popover/
      // Snackbar/Tooltip) can re-portal inside the fullscreen element.
      // Without this, body-portaled overlays render behind the Fullscreen-API
      // top-layer.
      fullscreenRef: rootRef,
      isFullscreen,
    }),
    [engine, localization, locale, isFullscreen, optsTick],
  );

  const content = (
    <PivotProvider value={contextValue}>
      <Box
        ref={rootRef}
        sx={(theme) => ({
          position: "relative",
          width,
          height,
          display: "flex",
          flexDirection: "column",
          backgroundColor: theme.palette.background.paper,
          color: theme.palette.text.primary,
          fontFamily: theme.font?.primary || "Inter",
          borderRadius: 2,
          overflow: "hidden",
          border: `1px solid ${theme.palette.divider}`,
        })}
      >
        {layoutFormat?.title ? (
          <Typography
            variant="h6"
            sx={(theme) => ({
              px: 2,
              pt: 1.5,
              pb: 1,
              fontWeight: 600,
              color: theme.palette.text.primary,
              borderBottom: `1px solid ${theme.palette.divider}`,
            })}
          >
            {layoutFormat.title}
          </Typography>
        ) : null}
        {toolbar && (
          <PivotToolbar
            beforeToolbarCreated={beforeToolbarCreated}
            onOpenFields={() => setFieldsOpen(true)}
            onOpenFormat={() => setFormatOpen(true)}
            onExportExcel={handleExportExcel}
            onToggleFullscreen={handleToggleFullscreen}
            isFullscreen={isFullscreen}
          />
        )}
        <FilterBar />
        <Box sx={{ flex: 1, minHeight: 0 }}>
          {freeplanBlock ? (
            <Alert severity="warning" sx={{ m: 2 }} variant="outlined">
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {localization?.freeplan?.title ||
                  "Dataset too large for the free plan"}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {localization?.freeplan?.body ||
                  `This build limits the dataset to ${Math.round(
                    freeplanBlock.limit / 1024,
                  )} KB. Current dataset is ~${Math.round(
                    freeplanBlock.bytes / 1024,
                  )} KB.`}{" "}
                <Link
                  href={FREEPLAN_INFO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {localization?.freeplan?.cta ||
                    "Upgrade on aurapivot.web.app"}
                </Link>
              </Typography>
            </Alert>
          ) : (
            <PivotTable />
          )}
        </Box>
        {layoutFormat?.note ? (
          <Typography
            variant="caption"
            sx={(theme) => ({
              px: 2,
              py: 1,
              whiteSpace: "pre-wrap",
              color: theme.palette.text.secondary,
              borderTop: `1px solid ${theme.palette.divider}`,
            })}
          >
            {layoutFormat.note}
          </Typography>
        ) : null}
        <FieldList
          open={fieldsOpen}
          onClose={() => setFieldsOpen(false)}
          measuresAxis={globalProps?.fields?.measuresAxis}
        />
        <FormatDialog open={formatOpen} onClose={() => setFormatOpen(false)} />
        {IS_FREEPLAN && (
          <Box
            component="a"
            href={FREEPLAN_INFO_URL}
            target="_blank"
            rel="noopener noreferrer"
            title={FREEPLAN_INFO_URL}
            sx={{
              position: "absolute",
              right: 8,
              bottom: 8,
              zIndex: 1200,
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              px: 1,
              py: 0.5,
              borderRadius: 1,
              fontSize: 11,
              lineHeight: 1,
              textDecoration: "none",
              color: "text.secondary",
              backgroundColor: "rgba(255,255,255,0.75)",
              backdropFilter: "blur(4px)",
              border: "1px solid",
              borderColor: "divider",
              opacity: 0.85,
              pointerEvents: "auto",
              "&:hover": { opacity: 1 },
            }}
          >
            {FREEPLAN_WATERMARK_ICON ? (
              <Box
                component="img"
                src={FREEPLAN_WATERMARK_ICON}
                alt=""
                sx={{ width: 16, height: 16, display: "block" }}
              />
            ) : null}
            <span>aurapivot.web.app</span>
          </Box>
        )}
      </Box>
      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        // Re-portal inside the fullscreen element when active, otherwise the
        // snackbar is hidden by the Fullscreen API top-layer.
        container={isFullscreen ? rootRef.current : undefined}
      >
        {snack ? (
          <Alert severity={snack.severity} onClose={() => setSnack(null)}>
            {snack.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </PivotProvider>
  );

  return theme ? (
    <ThemeProvider theme={theme}>{content}</ThemeProvider>
  ) : (
    content
  );
});

Pivot.propTypes = {
  width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  locale: PropTypes.string,
  localization: PropTypes.object,
  global: PropTypes.object,
  reportChange: PropTypes.func,
  beforeToolbarCreated: PropTypes.func,
  theme: PropTypes.oneOfType([PropTypes.object, PropTypes.func]),
};

export default Pivot;
