import React, {
  forwardRef,
  useImperativeHandle,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Box,
  Snackbar,
  Alert,
  ThemeProvider,
  Typography,
} from '@mui/material';
import type { AlertColor } from '@mui/material';
import type { Theme } from '@mui/material/styles';
import PivotEngine from './pivot-core';
import type { LayoutFormat } from './pivot-core/PivotEngine';
import type {
  AuraPivotOptions,
  AuraPivotProps as SharedAuraPivotProps,
} from './pivot-core/types';
import type { LocalizationDictionary } from './localization/types';
import { PivotProvider } from './context/PivotContext';
import PivotToolbar from './components/Toolbar/PivotToolbar';
import type { ToolbarApi } from './components/Toolbar/PivotToolbar';
import PivotTable from './components/PivotTable/PivotTable';
import ErrorBoundary from './components/ErrorBoundary';
import FieldList from './components/FieldList/FieldList';
import FormatDialog from './components/FormatDialog/FormatDialog';
import FilterBar from './components/FilterBar/FilterBar';
import { optionsToEngine, engineToOptions } from './options/optionsAdapter';

/**
 * Public props. `AuraPivotProps` in pivot-core/types.ts is the single source
 * of truth for the shape; pivot-core is framework-agnostic on purpose, so the
 * three fields it can only type loosely down there (no MUI, no React, no
 * component-local types) are narrowed here, in the React layer.
 */
export interface AuraPivotProps
  extends Omit<
    SharedAuraPivotProps,
    'theme' | 'localization' | 'beforeToolbarCreated'
  > {
  /** Caption dictionary; English fallbacks are built in. */
  localization?: LocalizationDictionary;
  /** Receives the toolbar API so consumers can add / filter / reorder tabs. */
  beforeToolbarCreated?: (api: ToolbarApi) => void;
  /** MUI theme object, or `(outerTheme) => theme` for partial overrides. */
  theme?: Theme | ((outer: Theme) => Theme);
}

/** Imperative handle exposed on the component ref. */
export interface AuraPivotRef {
  auraPivot: {
    /** Returns the current `options` schema. */
    getOptions: () => AuraPivotOptions;
  };
  /** Raw engine escape hatch. */
  engine: PivotEngine;
}

interface SnackState {
  severity: AlertColor;
  message: string;
}

/**
 * Vendor-prefixed Fullscreen API. The prefixed names are real on older Safari
 * and IE; widening the standard DOM types (rather than reaching for `any`)
 * keeps the call sites checked and documents why they exist. Prefixed
 * implementations return nothing, hence `Promise<void> | undefined`.
 */
type FullscreenRequest = (
  options?: FullscreenOptions,
) => Promise<void> | undefined;
type FullscreenExit = () => Promise<void> | undefined;

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: FullscreenRequest;
  msRequestFullscreen?: FullscreenRequest;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: FullscreenExit;
  msExitFullscreen?: FullscreenExit;
};

/** Localization sections are `Record<string, unknown>` — narrow to a caption. */
const caption = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * `catch` binds `unknown` under strict mode. Duck-typed on `message` rather
 * than `instanceof Error` to keep the pre-conversion behaviour for
 * cross-realm errors and plain `{ message }` rejections.
 */
const errorMessage = (err: unknown, fallback: string): string => {
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
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
const Pivot = forwardRef<AuraPivotRef, AuraPivotProps>(function Pivot(
  props,
  ref,
) {
  const {
    width = '100%',
    height = '100%',
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
  const lastEmittedRef = useRef<AuraPivotOptions | null>(null);
  // True while an inbound apply is running, so its engine events do not
  // bounce back out through `onOptionsChange`.
  const applyingRef = useRef(false);
  const onOptionsChangeRef = useRef(onOptionsChange);
  onOptionsChangeRef.current = onOptionsChange;

  const engineRef = useRef<PivotEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new PivotEngine();
  }
  const engine: PivotEngine = engineRef.current;

  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);
  const [snack, setSnack] = useState<SnackState | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [optsTick, setOptsTick] = useState(0);
  const [layoutFormat, setLayoutFormat] = useState<LayoutFormat>(
    () => engine.getFormat()?.layout || {},
  );
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onFormat = () => setLayoutFormat(engine.getFormat()?.layout || {});
    engine.on('formatChange', onFormat);
    return () => engine.off('formatChange', onFormat);
  }, [engine]);

  const handleToggleFullscreen = () => {
    const el: FullscreenElement | null = rootRef.current;
    if (!el) return;
    const doc: FullscreenDocument | null =
      typeof document !== 'undefined' ? document : null;
    const fsEl =
      doc?.fullscreenElement ||
      doc?.webkitFullscreenElement ||
      doc?.msFullscreenElement;
    if (!fsEl) {
      const req: FullscreenRequest | undefined =
        el.requestFullscreen ||
        el.webkitRequestFullscreen ||
        el.msRequestFullscreen;
      if (req) {
        const p = req.call(el);
        if (p && typeof p.catch === 'function') {
          p.catch((err: unknown) =>
            setSnack({
              severity: 'error',
              message: errorMessage(err, 'Fullscreen error'),
            }),
          );
        }
      }
    } else {
      const exit: FullscreenExit | undefined =
        doc?.exitFullscreen ||
        doc?.webkitExitFullscreen ||
        doc?.msExitFullscreen;
      if (doc && exit) exit.call(doc);
    }
  };

  useEffect(() => {
    const handler = () => {
      const doc: FullscreenDocument = document;
      const fsEl =
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.msFullscreenElement;
      setIsFullscreen(!!fsEl && fsEl === rootRef.current);
    };
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    document.addEventListener('msfullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
      document.removeEventListener('msfullscreenchange', handler);
    };
  }, []);

  // No bundled fallback — engine treats missing keys as empty strings.
  const localization = useMemo<LocalizationDictionary>(
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
    applyingRef.current = true;
    try {
      optionsToEngine(engine, options, dataSource);
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
      if (typeof onOptionsChangeRef.current === 'function') {
        onOptionsChangeRef.current(next);
      }
    };
    const schedule = () => {
      if (applyingRef.current) return;
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(emit);
    };
    engine.on('dataChange', schedule);
    engine.on('reportChange', schedule);
    engine.on('formatChange', schedule);
    return () => {
      cancelled = true;
      engine.off('dataChange', schedule);
      engine.off('reportChange', schedule);
      engine.off('formatChange', schedule);
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
      await engine.exportExcel('pivot.xlsx');
      setSnack({
        severity: 'success',
        message:
          caption(localization?.toolbar?.exportSuccess) || 'Export complete',
      });
    } catch (err) {
      setSnack({
        severity: 'error',
        message: errorMessage(err, 'Export error'),
      });
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
          position: 'relative',
          width,
          height,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: theme.palette.background.paper,
          color: theme.palette.text.primary,
          fontFamily: theme.font?.primary || 'Inter',
          borderRadius: 2,
          overflow: 'hidden',
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
          {/* A render-time throw inside the grid must not take the host app
              down with it. */}
          <ErrorBoundary
            title={caption(localization?.grid?.errorTitle)}
            message={caption(localization?.grid?.errorBody)}
            retryLabel={caption(localization?.buttons?.retry)}
          >
            <PivotTable />
          </ErrorBoundary>
        </Box>
        {layoutFormat?.note ? (
          <Typography
            variant="caption"
            sx={(theme) => ({
              px: 2,
              py: 1,
              whiteSpace: 'pre-wrap',
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
      </Box>
      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        // No `container`: MUI v9's Snackbar is not Modal-based and declares
        // no such prop, so the value was only ever spread onto the root div
        // as an unknown DOM attribute. Re-portaling it into the fullscreen
        // element needs a different mechanism than the dialogs use.
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

export default Pivot;
