---
"aura-pivot": patch
---

Fixed the type declarations for CommonJS consumers. `package.json` declares
`type: module`, so the single `dist/index.d.ts` the `types` key pointed at was
read as ESM declarations — while the `require` condition resolved to the
CommonJS `dist/index.cjs`. TypeScript on `moduleResolution: node16` or
`nodenext` saw types claiming ESM over CommonJS JavaScript and refused to
compile ("masquerading as ESM"). Both entry points now ship declarations under
each extension, `.d.ts` paired with the ESM condition and `.d.cts` with the
CommonJS one. `publint` and `@arethetypeswrong/cli` are clean on `aura-pivot`
and `aura-pivot/theme` across node10, node16 from CJS, node16 from ESM and
bundler resolution.

No API change: the same declarations are emitted twice, only the extension
differs.
