/**
 * Minimal SVG sanitizer for consumer-provided toolbar icon markup.
 *
 * Toolbar tabs accept raw `<svg>…</svg>` strings (legacy WebDataRocks
 * convention) which are injected via `dangerouslySetInnerHTML`. Icon configs
 * frequently round-trip through persisted/shared report configurations, so
 * the markup cannot be trusted: this strips every script-execution vector
 * while leaving presentational SVG intact.
 *
 * Removed:
 *   - elements that can execute or embed active content
 *     (`script`, `foreignObject`, `iframe`, `object`, `embed`, `use`)
 *   - all `on*` event-handler attributes
 *   - `href` / `xlink:href` values with a `javascript:` or `data:` scheme
 *
 * Returns the serialized sanitized markup, or `null` when the input is not
 * parseable standalone SVG (callers should render nothing in that case).
 */

const FORBIDDEN_ELEMENTS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'use',
]);

const URL_ATTRIBUTES = new Set(['href', 'xlink:href']);

const hasUnsafeScheme = (value: string): boolean => {
  const v = value.trim().toLowerCase();
  return v.startsWith('javascript:') || v.startsWith('data:');
};

export const sanitizeSvgMarkup = (markup: string): string | null => {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    // Non-browser host (SSR): no safe way to parse — render nothing.
    return null;
  }
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  } catch {
    return null;
  }
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg') return null;
  if (doc.querySelector('parsererror') || root.querySelector('parsererror')) {
    return null;
  }

  const sanitizeElement = (el: Element): void => {
    // Snapshot children first — removal mutates the live list.
    for (const child of Array.from(el.children)) {
      if (FORBIDDEN_ELEMENTS.has(child.nodeName.toLowerCase())) {
        child.remove();
      } else {
        sanitizeElement(child);
      }
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
      } else if (URL_ATTRIBUTES.has(name) && hasUnsafeScheme(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  };

  sanitizeElement(root);
  try {
    return new XMLSerializer().serializeToString(root);
  } catch {
    return null;
  }
};

export default sanitizeSvgMarkup;
