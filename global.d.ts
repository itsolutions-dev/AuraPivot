// Build-time tokens replaced by the rollup `build-flags` plugin.
// Declared so `tsc` accepts the source in its pre-replacement form.

// ---------------------------------------------------------------------------
// MUI theme augmentation — custom tokens consumed across the component layer.
// Lives in global.d.ts (ambient) so every .tsx file sees it without needing
// to side-effect-import pivot-core/types.
// ---------------------------------------------------------------------------
import '@mui/material/styles';

declare module '@mui/material/styles' {
  interface Theme {
    font?: { primary?: string; mono?: string; display?: string };
    /** Custom border-radius token (unitless number, like shape.borderRadius). */
    borderRadius?: number;
  }
  interface ThemeOptions {
    font?: { primary?: string; mono?: string; display?: string };
    borderRadius?: number;
  }
  interface Palette {
    tertiary?: PaletteColor;
  }
  interface PaletteOptions {
    tertiary?: PaletteColorOptions;
  }
}

declare global {
  // Minimal `process` shape for dev/prod gating (NODE_ENV). Bundlers inline
  // it; the runtime guard handles hosts without process. Declared here to
  // avoid pulling all of @types/node into a browser library.
  const process:
    | { env?: { NODE_ENV?: string; [key: string]: string | undefined } }
    | undefined;
}
