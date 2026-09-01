# Library TypeScript Conversion — Design

**Date:** 2026-05-19
**Scope:** `Library/` — the `aura-pivot` package
**Status:** Approved design, ready for implementation planning

## Goal

Convert the `Library/` codebase from plain JS/JSX to TypeScript. Two equal objectives:

1. **Internal type safety** — a real typechecker (`tsc`) catching bugs during development.
2. **Shipped declarations** — emit a real `dist/index.d.ts` for npm consumers. `package.json`
   already declares `"types": "dist/index.d.ts"` but nothing generates it today.

## Decisions

| Decision            | Choice                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------- |
| Conversion strategy | Big-bang — all 30 files at once, no `allowJs`. Phased internally; not one giant commit. |
| Build tooling       | Babel strips types (`@babel/preset-typescript`); `tsc` typechecks + emits `.d.ts`.      |
| Strictness          | `strict: true` from day one. Pragmatic `any` only at dynamic boundaries.                |

## Scope

Every `.js`/`.jsx` under `Library/` converts to `.ts`/`.tsx` — 30 files, ~16.5k lines
(engine ~3.5k, React UI ~9k). **Exception:** `rollup.config.js` stays `.js` (Node config script).

`pivot-core/types.js` (JSDoc typedefs) becomes a real `types.ts` with exported `interface`s —
the type backbone every other file imports.

## Phasing

One final compiling state; work ordered so review is tractable.

1. **Tooling** — add deps (`typescript`, `@babel/preset-typescript`, `rollup-plugin-dts`,
   `@types/react`, `@types/react-dom`, `@types/file-saver`). Write `tsconfig.json` and
   `global.d.ts`.
2. **`types.ts`** — port JSDoc typedefs to exported interfaces. Add public-API types
   (`AuraPivotOptions`, `AuraPivotHandle`, the event-bus event→payload map, MUI theme
   augmentation).
3. **`pivot-core/`** — 11 files, framework-agnostic, leaf-first: data, slice, aggregation,
   matrix, format, export, then `PivotEngine.ts`.
4. **React layer** — `context/`, `hooks/`, `options/`, `theme/`, then `components/` (9 UI
   files), then `AuraPivot.tsx` + `index.ts`.
5. **Build wiring** — rollup `input` → `index.ts`; babel presets; `buildFlags` regex; resolve
   extensions; `tsc` declaration step + `rollup-plugin-dts` bundle.
6. **Consumer** — update `PresentationApp/vite.config.js` alias paths.

## Build pipeline

Two outputs, two tools. The JS bundle keeps its current shape; declarations are new.

### JS bundle — Rollup + Babel (shape unchanged)

- `rollup.config.js` `input`: `index.js` → `index.ts`.
- Babel presets: `["@babel/preset-react", "@babel/preset-typescript"]`. `preset-typescript`
  only **strips** type syntax — no typecheck, no `.d.ts`.
- Obfuscator / terser / FREEPLAN / `processShim` pipeline untouched.
- `buildFlags` transform regex `\.(jsx?|mjs)$` → `\.([jt]sx?|mjs)$`.
- `resolve` `extensions` adds `.ts`, `.tsx`.
- `strip-use-client` transform: unchanged.

### Declarations — `tsc` + rollup-plugin-dts

- `tsc -p tsconfig.json --emitDeclarationOnly --outDir dist/types` — emits per-file `.d.ts`
  **and** typechecks. This is the strict gate.
- A second small rollup config (`rollup.config.dts.js`) with `rollup-plugin-dts` bundles
  `dist/types/index.d.ts` → single `dist/index.d.ts`. Then `dist/types/` is removed.

### `package.json` scripts

```jsonc
"typecheck": "tsc --noEmit",
"build": "tsc -p tsconfig.json --emitDeclarationOnly --outDir dist/types && rollup -c && rollup -c rollup.config.dts.js"
```

`build:freeplan` / `build:freeplan2` gain the same `tsc` prefix. A typecheck failure aborts
the build — strict is enforced at build time.

### tsconfig.json

`strict: true`, `jsx: "react-jsx"`, `moduleResolution: "bundler"`, `declaration: true`,
`target: "ES2020"`, `lib: ["ES2020", "DOM"]`, `skipLibCheck: true` (silences MUI/exceljs
`.d.ts` noise). `noEmit` is **not** set in tsconfig — it conflicts with `--emitDeclarationOnly`.
Emit mode is chosen per-script on the CLI instead: `typecheck` passes `--noEmit`, `build`
passes `--emitDeclarationOnly`.

## Typing the hard parts

**Event bus** (`PivotEngine` `on`/`off`/`_emit`) — a string-union event type with generic
`on<K extends EngineEvent>`. No loose `string` event names. Event names are camelCase in the
existing code:

```ts
type EngineEvent = "dataChange" | "reportChange" | "formatChange";
```

**`AuraPivotOptions`** — a real exported interface for the `options` prop, the most
consumer-facing type in the shipped `.d.ts`. Derived from `options/optionsSchema.js` and the
options-guide docs. `options/optionsAdapter.js` is typed against it.

**`AuraPivotHandle`** — explicit interface for the `forwardRef` / `useImperativeHandle` ref
surface (`ref.auraPivot.getOptions()`, `ref.engine`). Exported, part of the public API.

**`prop-types` / `optionsPropType.js`** — kept. Runtime validation still earns value:
`<AuraPivot>` is consumed by plain-JS apps (PresentationApp is JS). TS types and prop-types
coexist; they are not unified.

**MUI theme augmentation** — `declare module "@mui/material/styles"` for the custom tokens
components read (`theme.font?.primary`, the pastel palette, dark-mode tokens). Without it,
every custom-token access errors.

**FREEPLAN build tokens** — `global.d.ts` declares the magic identifiers replaced at build
time: `__FREEPLAN__: boolean`, `__FREEPLAN_MAX_BYTES__: number`, `__FREEPLAN_INFO_URL__:
string`, `__FREEPLAN_WATERMARK_ICON__: string`. `tsc` sees the declarations; rollup replaces
the identifiers.

**Pragmatic `any`** — allowed only at genuinely dynamic boundaries: raw incoming `dataSource`
rows before normalization, the raw `options` object before validation. Everything downstream
is typed. Each `any` carries an inline comment explaining why.

## Consumer impact — PresentationApp

`PresentationApp/vite.config.js` aliases the Library source directly. After conversion:

- `libEntry` non-FREEPLAN branch: `AuraPivot.jsx` → `AuraPivot.tsx`.
- `aura-pivot/theme` alias: `theme/swatches.js` → `theme/swatches.ts`.
- The `aura-pivot/locales/*` alias points at the `localization/` JSON dir — unaffected.
- The FREEPLAN branch points at `dist/index.esm.js` — unaffected.

Vite/esbuild handles `.ts`/`.tsx` natively, so PresentationApp itself (plain JS) needs no
other change.

## Out of scope

- Converting PresentationApp or AdminApp to TypeScript.
- Replacing `prop-types` runtime validation with TS-only types.
- Refactoring engine/UI architecture beyond what typing requires.
- Adding a test suite (none exists today).

## Success criteria

- `npm run typecheck` passes with `strict: true`.
- `npm run build` produces `dist/index.js`, `dist/index.esm.js`, and a single bundled
  `dist/index.d.ts`.
- `npm run build:freeplan` still produces a working obfuscated bundle.
- PresentationApp dev server and build run unchanged against the converted source.
