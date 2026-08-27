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
import ErrorBoundary from "./components/ErrorBoundary";
import FieldList from "./components/FieldList/FieldList";
import FormatDialog from "./components/FormatDialog/FormatDialog";
import FilterBar from "./components/FilterBar/FilterBar";
import { optionsToEngine, engineToOptions } from "./options/optionsAdapter";
import optionsPropType from "./options/optionsPropType";

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
 * AuraPivot — a configurable React pivot table.
 *
 * Props:
 *   - options:        the configuration schema (toolbar / layout / data /
 *                     format). Applied seed-on-change: re-applied only when
 *                     the object reference changes. See Library/docs/
 *                     options-guide.en.md for the full schema.
 *   - dataSource:     a plain array of row objects (data only — the schema
 *                     for those rows lives in options.data.fields).
 *   - onOptionsChange(nextOptions): fired after every in-component edit with
 *                     the complete updated `options` object.
 *   - localization / locale / theme / beforeToolbarCreated / width / height:
 *                     unchanged.
 *
 * Ref API: `ref.auraPivot.getOptions()` returns the current schema;
 * `ref.engine` is the raw PivotEngine escape hatch.
 *
 * Optional `theme` prop accepts a MUI theme object (or `(outer) => theme` for
 * partial overrides); when provided the subtree is wrapped in a
 * `<ThemeProvider>`.
 */
const Pivot = forwardRef(function Pivot(props, ref) {
  const {
    width = "100%",
    height = "100%",
    locale,
    localization: localizationProp,
    options,
    dataSource,
    onOptionsChange,
    beforeToolbarCreated,
    theme,
  } = props;

  const toolbar = options?.toolbar?.visible ?? true;

  // Loop guard: the object last handed to `onOptionsChange`. When the host
  // feeds it straight back as `options`, the inbound effect skips it.
  const lastEmittedRef = useRef(null);
  // True while an inbound apply is running, so its engine events do not
  // bounce back out through `onOptionsChange`.
  const applyingRef = useRef(false);
  const onOptionsChangeRef = useRef(onOptionsChange);
  onOptionsChangeRef.current = onOptionsChange;

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

  // Inbound: apply the `options` schema (+ `dataSource` rows) to the engine
  // whenever either object reference changes (seed-on-change model). A
  // reference-equal `options` — including the object we last emitted — is a
  // no-op, so a host that echoes `onOptionsChange` back never loops.
  useEffect(() => {
    if (options && options === lastEmittedRef.current) return;
    // FREEPLAN: reject an oversized dataset, apply config without the rows.
    if (IS_FREEPLAN && dataSource) {
      const bytes = estimateDatasetBytes(dataSource);
      if (bytes > FREEPLAN_MAX_BYTES) {
        setFreeplanBlock({ bytes, limit: FREEPLAN_MAX_BYTES });
        applyingRef.current = true;
        try {
          optionsToEngine(engine, options, undefined);
          // FREEPLAN: drill-through is always disabled regardless of intent.
          engine.setOptions({ enableDrillThrough: false });
        } finally {
          applyingRef.current = false;
        }
        setOptsTick((t) => t + 1);
        return;
      }
    }
    setFreeplanBlock(null);
    applyingRef.current = true;
    try {
      optionsToEngine(engine, options, dataSource);
      // FREEPLAN: drill-through is always disabled regardless of caller intent.
      if (IS_FREEPLAN) engine.setOptions({ enableDrillThrough: false });
    } finally {
      applyingRef.current = false;
    }
    setOptsTick((t) => t + 1);
  }, [engine, options, dataSource]);

  // Outbound: when an internal edit mutates the engine, hand the host a fresh
  // `options` object. Engine events fired during an inbound apply are ignored
  // (the host already has that state). Multiple events from one edit are
  // coalesced into a single microtask.
  useEffect(() => {
    let scheduled = false;
    let cancelled = false;
    const emit = () => {
      scheduled = false;
      // A microtask enqueued just before unmount must not fire afterwards.
      if (cancelled) return;
      const next = engineToOptions(engine);
      lastEmittedRef.current = next;
      if (typeof onOptionsChangeRef.current === "function") {
        onOptionsChangeRef.current(next);
      }
    };
    const schedule = () => {
      if (applyingRef.current) return;
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(emit);
    };
    engine.on("dataChange", schedule);
    engine.on("reportChange", schedule);
    engine.on("formatChange", schedule);
    return () => {
      cancelled = true;
      engine.off("dataChange", schedule);
      engine.off("reportChange", schedule);
      engine.off("formatChange", schedule);
    };
  }, [engine]);

  // Expose the ref API: `getOptions()` returns the current schema, `engine`
  // is the raw escape hatch.
  useImperativeHandle(
    ref,
    () => ({
      auraPivot: {
        getOptions: () => engineToOptions(engine),
      },
      engine,
    }),
    [engine],
  );

  const handleExportExcel = async () => {
    try {
      await engine.exportExcel("pivot.xlsx");
      setSnack({
        severity: "success",
        message: localization?.toolbar?.exportSuccess || "Export complete",
      });
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
            // A render-time throw inside the grid must not take the host app
            // down with it.
            <ErrorBoundary
              title={localization?.grid?.errorTitle}
              message={localization?.grid?.errorBody}
              retryLabel={localization?.buttons?.retry}
            >
              <PivotTable />
            </ErrorBoundary>
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
          measuresAxis={options?.layout?.measuresAxis}
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
  options: optionsPropType,
  dataSource: PropTypes.array,
  onOptionsChange: PropTypes.func,
  beforeToolbarCreated: PropTypes.func,
  theme: PropTypes.oneOfType([PropTypes.object, PropTypes.func]),
};

export default Pivot;
