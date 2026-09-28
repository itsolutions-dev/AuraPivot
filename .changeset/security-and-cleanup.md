---
"aurapivot": minor
---

Security hardening, a working CommonJS build, and a round of bug fixes and
simplification across the engine and the UI.

**Security.** Toolbar icon SVG markup is rebuilt from an allowlist of
elements and attributes and mounted as a DOM node; the previous sanitizer's
output was re-parsed as HTML, and comments, processing instructions or a
`java&#9;script:` href in the markup ran script in Chromium. Icons keep
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
Sort menus and tooltips stay visible in fullscreen. One-member filters open
with their member selected. A reordered hidden measure stays hidden.
Nineteen captions that were missing from the shipped dictionaries are added
in English and Italian.

**Performance.** An `options` apply recomputes the matrix once instead of
once per setter (new `engine.batch()`), filters are compiled once per
apply rather than per row, and calculated fields are parsed once per matrix
instead of once per cell.
