/**
 * SVG sanitizer for consumer-provided toolbar icon markup.
 *
 * Toolbar tabs accept raw `<svg>…</svg>` strings, so a host can supply an
 * icon without importing a component. Icon configs can round-trip through
 * persisted reports, so the markup is untrusted.
 *
 * The markup is parsed as XML and a fresh element tree is built from it,
 * copying only allowlisted SVG elements, allowlisted attributes and text.
 * Everything else — comments, processing instructions, unknown or non-SVG
 * elements, event handlers, external references — is simply never copied.
 * The result is a DOM node for the caller to append: it is never serialized
 * and re-parsed as HTML, because the HTML parser reads comments, CDATA and
 * some tag names inside `<svg>` differently from the XML parser, which is
 * how markup that looked inert to a sanitizer comes back as live HTML.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;
const XLINK_NS = 'http://www.w3.org/1999/xlink';

// Static drawing only: no <a>, <use>, <image>, <foreignObject>, <script>,
// <style>, filters or SMIL animation (which can rewrite attributes later).
const ELEMENTS = new Set([
  'svg',
  'g',
  'defs',
  'title',
  'desc',
  'path',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'rect',
  'text',
  'tspan',
  'lineargradient',
  'radialgradient',
  'stop',
  'clippath',
  'mask',
]);

const ATTRIBUTES = new Set([
  'viewbox',
  'preserveaspectratio',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'fx',
  'fy',
  'fr',
  'dx',
  'dy',
  'd',
  'points',
  'transform',
  'id',
  'class',
  'style',
  'color',
  'display',
  'visibility',
  'opacity',
  'fill',
  'fill-opacity',
  'fill-rule',
  'clip-rule',
  'clip-path',
  'clippathunits',
  'mask',
  'maskunits',
  'maskcontentunits',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-opacity',
  'vector-effect',
  'shape-rendering',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientunits',
  'gradienttransform',
  'spreadmethod',
  'font-family',
  'font-size',
  'font-weight',
  'text-anchor',
  'dominant-baseline',
  'role',
  'focusable',
  'aria-hidden',
  'aria-label',
  'href',
]);

// References may only point inside the icon itself: `url(#id)` in paint
// and clip values, `#id` in href. Anything else could fetch a remote
// resource (tracking, requests to intranet URLs) when the icon renders.
const URL_REF = /url\s*\(/i;
const LOCAL_URL_REF = /^\s*url\(\s*['"]?#[\w-]+['"]?\s*\)\s*$/i;
const UNSAFE_STYLE = /url\s*\(|expression|@import|\\|javascript:/i;

const isSafeValue = (name: string, value: string): boolean => {
  if (name === 'href') return /^#[\w-]+$/.test(value.trim());
  if (name === 'style') return !UNSAFE_STYLE.test(value);
  return !URL_REF.test(value) || LOCAL_URL_REF.test(value);
};

// Hand-written icon strings often omit xmlns, which leaves every element in
// no namespace. Those are read as SVG too: only allowlisted names are copied,
// and the copies are always created in the SVG namespace.
const inSvgNamespace = (el: Element): boolean =>
  el.namespaceURI === SVG_NS || el.namespaceURI === null;

/**
 * Parses `markup` and returns a sanitized `<svg>` element owned by `doc`,
 * or `null` when the input is not parseable standalone SVG or the host has
 * no DOM (SSR) — callers render nothing in that case.
 */
export const sanitizeSvg = (
  markup: string,
  doc: Document | undefined = typeof document === 'undefined'
    ? undefined
    : document,
): SVGSVGElement | null => {
  if (!doc || typeof DOMParser === 'undefined') return null;
  let source: Document;
  try {
    source = new DOMParser().parseFromString(markup, 'image/svg+xml');
  } catch {
    return null;
  }
  const root = source.documentElement;
  if (
    !root ||
    !inSvgNamespace(root) ||
    root.localName !== 'svg' ||
    source.getElementsByTagName('parsererror').length > 0
  ) {
    return null;
  }

  const copy = (el: Element): Element | null => {
    if (!inSvgNamespace(el)) return null;
    if (!ELEMENTS.has(el.localName.toLowerCase())) return null;
    const out = doc.createElementNS(SVG_NS, el.localName);
    for (const attr of Array.from(el.attributes)) {
      // Plain attributes, plus xlink:href which is read as SVG 2 `href`.
      const plain = attr.namespaceURI === null;
      const xlinkHref =
        attr.namespaceURI === XLINK_NS && attr.localName === 'href';
      if (!plain && !xlinkHref) continue;
      const name = attr.localName.toLowerCase();
      if (!ATTRIBUTES.has(name) || !isSafeValue(name, attr.value)) continue;
      out.setAttribute(xlinkHref ? 'href' : attr.localName, attr.value);
    }
    el.childNodes.forEach((child) => {
      if (child.nodeType === ELEMENT_NODE) {
        const kept = copy(child as Element);
        if (kept) out.appendChild(kept);
      } else if (
        child.nodeType === TEXT_NODE ||
        child.nodeType === CDATA_SECTION_NODE
      ) {
        out.appendChild(doc.createTextNode(child.nodeValue ?? ''));
      }
    });
    return out;
  };

  return copy(root) as SVGSVGElement;
};

export default sanitizeSvg;
