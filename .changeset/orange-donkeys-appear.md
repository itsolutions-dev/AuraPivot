---
"aura-pivot": minor
---

Relicensed under MIT and renamed to `aura-pivot`. The build no longer
obfuscates its output and ships sourcemaps. Type declarations are now
generated from source. `react-virtuoso` is declared as a runtime
dependency and, along with `file-saver` and `@mui/icons-material`, is no
longer bundled. New `aura-pivot/theme` entry point. PropTypes removed in
favour of the shipped declarations.

Two user-visible breaks ship in this release even though it stays a minor
bump — under the new unscoped name there is no previously published
version, so there is no audience for a major:

- Toolbar tab IDs changed from `wdr-tab-*` to `aura-tab-*`. A
  `beforeToolbarCreated` handler that filters tabs by id needs to match
  the new `aura-tab-*` prefix instead.
- The package moved from a scoped name to the unscoped `aura-pivot`.
  Update the import specifier accordingly.
