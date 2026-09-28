# aurapivot

## 2.6.0

### Minor Changes

- [#22](https://github.com/itsolutions-dev/AuraPivot/pull/22) [`d907b87`](https://github.com/itsolutions-dev/AuraPivot/commit/d907b873717b685aec0e4a10ea387a28bf3e821b) Thanks [@adribusc](https://github.com/adribusc)! - Security hardening, a working CommonJS build, and a round of bug fixes and
  simplification across the engine and the UI.

  **Security.** Toolbar icon SVG markup is rebuilt from an allowlist of
  elements and attributes and mounted as a DOM node; the previous sanitizer's
  output was re-parsed as HTML, and comments, processing instructions or a
  `java&[#9](https://github.com/itsolutions-dev/AuraPivot/issues/9);script:` href in the markup ran script in Chromium. Icons keep
  drawing with `currentColor`; `<a>`, `<image>`, `<use>`, `<style>`, filters
  and references outside the icon are dropped. Format style values (colors,
  font family/size/weight, alignment) from `options.format` are validated,
  since they reach the stylesheet as CSS text. Field captions can no longer
  write to `Object.prototype`, persisted aggregation names such as `valueOf`
  no longer crash the grid, formulas are bounded in length and nesting, and
  Excel export writes only strings and numbers.

  **Behavior changes to know about.**

  - Importing the package no longer defines `globalThis.process` or
    `globalThis.__AURA_PIVOT_BUILD__`.
  - Blank members are captioned from `grid.blankMember` (English `(blank)`)
    instead of a hard-coded `(vuoto)`.
  - A measure saved with the aggregation `distinctCount` now computes a
    distinct count; it was silently computed as a plain count.
  - A formula's resolved negative value keeps its sign under `^`, and dataset
    keys that are numbers, `AND`/`OR`/`NOT` or function names are no longer
    substituted into formulas as field references.

  **Fixes.** The CommonJS entry renders (it handed an icon module wrapper to
  React as a component). The Format dialog's drill-through toggle takes
  effect, its tab labels are translated and Reset restores the real defaults.
  Dialogs, menus, dropdowns, tooltips and the export message stay visible in
  fullscreen. The per-field filter dialog keeps an existing exclude, range or
  search predicate instead of deleting it on Apply. One-member filters open
  with their member selected. A reordered hidden measure stays hidden.
  Nineteen captions that were missing from the shipped dictionaries are added
  in English and Italian.

  **Performance.** An `options` apply recomputes the matrix once instead of
  once per setter (new `engine.batch()`), filters are compiled once per
  apply rather than per row, and calculated fields are parsed once per matrix
  instead of once per cell.

## 2.5.1

### Patch Changes

- [`3b203e0`](https://github.com/itsolutions-dev/AuraPivot/commit/3b203e0f285b4eae4c18e7a7fe2e3923282cbcc8) Thanks [@claude](https://github.com/claude)! - Harden the toolbar icon SVG sanitizer against `vbscript:` URLs.

  Toolbar tabs accept raw `<svg>…</svg>` markup from the host, so
  `sanitizeSvgMarkup` treats that markup as untrusted. Its scheme check on
  `href` and `xlink:href` rejected `javascript:` and `data:` but let
  `vbscript:` through — the incomplete-URL-scheme-check case CodeQL flags.
  The check now rejects all three.

  Practical exposure was low: `vbscript:` is only ever executed by legacy
  Internet Explorer, which is outside the supported browser range, so no
  supported host could run the payload. The gap is closed regardless, since
  the sanitizer's contract is that it blocks active-content schemes rather
  than the subset that happens to be exploitable today.

  Also picks up `@mui/icons-material` 9.4.0 and `react-virtuoso` 4.18.13 in
  the runtime dependency ranges.

## 2.5.0

### Minor Changes

- [`855071a`](https://github.com/itsolutions-dev/AuraPivot/commit/855071abcdc58735cbc619aec962b6c508063cae) Thanks [@adribusc](https://github.com/adribusc)! - Relicensed under MIT and renamed to `aurapivot`. The build no longer
  obfuscates its output and ships sourcemaps. Type declarations are now
  generated from source. `react-virtuoso` is declared as a runtime
  dependency and, along with `file-saver` and `@mui/icons-material`, is no
  longer bundled. New `aurapivot/theme` entry point. PropTypes removed in
  favour of the shipped declarations.

  Two user-visible breaks ship in this release even though it stays a minor
  bump — under the new unscoped name there is no previously published
  version, so there is no audience for a major:

  - Toolbar tab IDs changed from `wdr-tab-*` to `aura-tab-*`. A
    `beforeToolbarCreated` handler that filters tabs by id needs to match
    the new `aura-tab-*` prefix instead.
  - The package moved from a scoped name to the unscoped `aurapivot`.
    Update the import specifier accordingly.

### Patch Changes

- [`68f62bf`](https://github.com/itsolutions-dev/AuraPivot/commit/68f62bf24b2ffc26832e5d465432c41836d1f476) Thanks [@adribusc](https://github.com/adribusc)! - Fixed the type declarations for CommonJS consumers. `package.json` declares
  `type: module`, so the single `dist/index.d.ts` the `types` key pointed at was
  read as ESM declarations — while the `require` condition resolved to the
  CommonJS `dist/index.cjs`. TypeScript on `moduleResolution: node16` or
  `nodenext` saw types claiming ESM over CommonJS JavaScript and refused to
  compile ("masquerading as ESM"). Both entry points now ship declarations under
  each extension, `.d.ts` paired with the ESM condition and `.d.cts` with the
  CommonJS one. `publint` and `@arethetypeswrong/cli` are clean on `aurapivot`
  and `aurapivot/theme` across node10, node16 from CJS, node16 from ESM and
  bundler resolution.

  No API change: the same declarations are emitted twice, only the extension
  differs.

- [`855071a`](https://github.com/itsolutions-dev/AuraPivot/commit/855071abcdc58735cbc619aec962b6c508063cae) Thanks [@adribusc](https://github.com/adribusc)! - Dropped the `file-saver` runtime dependency. Excel export now triggers the
  download with an object URL and a synthetic `<a download>` — the same six
  lines of DOM the package was pulling a dependency for, minus its CJS/ESM
  named-export footgun. No API change; the `dependencies` list shrinks by one.

  Internal cleanup with no behaviour change: the two mirrored axis-sort blocks
  in `MatrixComputer` collapse into one helper (now covered by
  `MatrixComputer.sort.test.ts`), `distinctValuesFor` lives once in
  `FilterEngine` instead of being copy-pasted into `FilterBar` and
  `DimensionFilterDialog`, and `PivotTable` indexes `matrix.cells` once per
  matrix instead of linear-scanning the whole map for every rendered cell —
  that lookup was quadratic on wide grids.
