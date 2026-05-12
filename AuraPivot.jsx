import React, {
  forwardRef,
  useImperativeHandle,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import PropTypes from "prop-types";
import { Box, Snackbar, Alert, ThemeProvider, Typography } from "@mui/material";
import PivotEngine from "./pivot-core";
import { PivotProvider } from "./context/PivotContext";
import PivotToolbar from "./components/Toolbar/PivotToolbar";
import PivotTable from "./components/PivotTable/PivotTable";
import FieldList from "./components/FieldList/FieldList";
import FormatDialog from "./components/FormatDialog/FormatDialog";
import FilterBar from "./components/FilterBar/FilterBar";

/**
 * Drop-in replacement for `<Pivot>` from @auraPivot/react-auraPivot.
 *
 * Preserves:
 *   - ref.auraPivot.getReport() / .setReport()
 *   - reportChange event prop
 *   - beforeToolbarCreated event prop receiving a `{ getTabs }` API
 *   - global.options:
 *       - toolbar: { visible, showFields, showFormat, showExport, showFullscreen, showReset } — toolbar visibility
 *       - enableDrillThrough (default true) — gates the data-cell click that
 *         opens the DrillThroughDialog.
 *       - reset, export, fullscreen, format, fields (default true) — toolbar
 *         button visibility flags. Set to `false` to hide the corresponding
 *         tab from the toolbar.
 *       - formats, calculatedFields, fields (array), slides — caller-supplied
 *         data wiring. `fields` accepts an array of `{ uniqueName, caption }`;
 *         when boolean it is treated as the toolbar visibility flag.
 *   - global.dataSource.data in the auraPivot `[metadata, ...rows]` shape
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

  const toolbar = globalProps?.options?.toolbar?.visible ?? true;

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

  // Apply data / options from props whenever they change.
  useEffect(() => {
    const data = globalProps?.dataSource?.data;
    if (data) engine.setData(data);
  }, [engine, globalProps?.dataSource?.data]);

  useEffect(() => {
    const opts = globalProps?.options;
    if (!opts) return;
    const { formats, calculatedFields, fields, slides, ...display } = opts;
    // `fields` is dual-purpose: boolean → toolbar visibility, array → data
    // override list. Only forward the boolean form to engine options so the
    // toolbar can read it; the array goes through engine.setFields below.
    if (typeof fields === "boolean") display.fields = fields;
    engine.setOptions(display);
    if (formats) engine.setFormat(formats);
    if (Array.isArray(calculatedFields))
      engine.setCalculatedFields(calculatedFields);
    if (Array.isArray(fields)) engine.setFields(fields);
    // Prop-driven slice mirrors the caller's own state — silence the
    // reportChange emission to avoid feedback loops in the consumer.
    if (slides) engine.setSlice(slides, { silent: true });
    // Bump tick so context useMemo re-runs and consumers (toolbar, table)
    // re-read engine.getOptions() with the fresh values.
    setOptsTick((t) => t + 1);
  }, [engine, globalProps?.options]);

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
          <PivotTable />
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
        <FieldList open={fieldsOpen} onClose={() => setFieldsOpen(false)} />
        <FormatDialog open={formatOpen} onClose={() => setFormatOpen(false)} />
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
