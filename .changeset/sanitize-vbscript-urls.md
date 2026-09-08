---
"aurapivot": patch
---

Harden the toolbar icon SVG sanitizer against `vbscript:` URLs.

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
