# aurapivot

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
