---
"aura-pivot": patch
---

Dropped the `file-saver` runtime dependency. Excel export now triggers the
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
