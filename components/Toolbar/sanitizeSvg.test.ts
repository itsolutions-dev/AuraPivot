// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { sanitizeSvg } from './sanitizeSvg';

/** Sanitized output as markup, for assertions. */
const clean = (markup: string): string | null =>
  sanitizeSvg(markup)?.outerHTML ?? null;

describe('sanitizeSvg', () => {
  test('passes a clean icon through with content intact', () => {
    const out = clean(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="currentColor"/></svg>',
    );
    expect(out).toContain('<path');
    expect(out).toContain('d="M0 0h24v24H0z"');
    expect(out).toContain('viewBox="0 0 24 24"');
    expect(out).toContain('fill="currentColor"');
  });

  test('returns an SVG element owned by the page document', () => {
    const svg = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(svg?.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg?.ownerDocument).toBe(document);
  });

  test('strips event handler attributes at every depth', () => {
    const out = clean(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="4" onclick="steal()"/></svg>',
    );
    expect(out).not.toMatch(/onload|onclick/);
    expect(out).toContain('r="4"');
  });

  test.each([
    ['script', '<script>alert(1)</script>'],
    ['foreignObject', '<foreignObject><body onload="x()"/></foreignObject>'],
    ['style', '<style>@import url(http://evil/x.css);</style>'],
    ['use', '<use href="#x"/>'],
    ['image', '<image href="https://evil/track.png"/>'],
    ['a', '<a href="https://evil"><rect/></a>'],
    ['set', '<set attributeName="href" to="javascript:alert(1)"/>'],
    ['animate', '<animate attributeName="href" values="javascript:x"/>'],
  ])('drops <%s>', (_, inner) => {
    const out = clean(
      `<svg xmlns="http://www.w3.org/2000/svg">${inner}<rect/></svg>`,
    );
    expect(out).not.toMatch(
      /script|foreignObject|style|<use|<image|<a |<set|<animate|evil/i,
    );
    expect(out).toContain('<rect');
  });

  test('drops elements that the HTML parser would lift out of <svg>', () => {
    const out = clean(
      '<svg xmlns="http://www.w3.org/2000/svg"><img src="x" onerror="alert(1)"/><div>x</div><rect/></svg>',
    );
    expect(out).not.toMatch(/<img|<div|onerror/);
  });

  test('drops elements outside the SVG namespace', () => {
    const out = clean(
      '<svg xmlns="http://www.w3.org/2000/svg"><h:img xmlns:h="http://www.w3.org/1999/xhtml" src="x"/><rect/></svg>',
    );
    expect(out).not.toContain('img');
  });

  // Each of these reads as inert to an XML parser but, serialized and
  // re-parsed as HTML, breaks out into a live <img onerror>. (Parsers that
  // reject PIs or CDATA here yield null, which is just as safe.)
  test.each([
    ['comment', '<!--><img src=x onerror=alert(1)>-->'],
    ['processing instruction', '<?x ><img src=x onerror=alert(1)>?>'],
    ['CDATA', '<text><![CDATA[</text><img src=x onerror=alert(1)>]]></text>'],
  ])('drops %s markup', (_, inner) => {
    const out = clean(`<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`);
    expect(out ?? '').not.toMatch(/<img|<!--|<\?|<!\[CDATA/);
  });

  test('copies only element and text nodes', () => {
    const svg = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><!-- c --><rect/>t</svg>',
    );
    expect(Array.from(svg!.childNodes).map((n) => n.nodeType)).toEqual([1, 3]);
  });

  test.each([
    'javascript:alert(1)',
    'java&#9;script:alert(1)',
    'java&#10;script:alert(1)',
    ' JAVASCRIPT:alert(1)',
    'data:text/html,x',
    'https://evil.example/',
  ])('drops href=%j, keeping only in-icon references', (href) => {
    const out = clean(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><linearGradient id="a" href="${href}" xlink:href="${href}"/></svg>`,
    );
    expect(out).not.toContain('href');
  });

  test('keeps local gradient references, drops remote ones', () => {
    const out = clean(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
        '<linearGradient id="g"/><linearGradient id="h" xlink:href="#g"/>' +
        '<rect fill="url(#g)"/><circle fill="url(https://evil/x.svg#g)" r="1"/></svg>',
    );
    expect(out).toContain('href="#g"');
    expect(out).toContain('fill="url(#g)"');
    expect(out).not.toContain('evil');
  });

  test('drops namespaced attributes other than xlink:href', () => {
    const out = clean(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:foo="http://www.w3.org/1999/xlink" xmlns:bar="urn:x"><rect bar:href="javascript:x" bar:fill="red"/></svg>',
    );
    expect(out).not.toMatch(/javascript|bar:/);
  });

  test('keeps plain inline styles, drops ones that load or escape', () => {
    expect(
      clean(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:red"/></svg>',
      ),
    ).toContain('style="fill:red"');
    expect(
      clean(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(https://evil/x)"/></svg>',
      ),
    ).not.toContain('style');
  });

  test('returns null for non-svg markup', () => {
    expect(sanitizeSvg('<div>not svg</div>')).toBeNull();
  });

  test('returns null for unparseable markup', () => {
    expect(sanitizeSvg('<svg><unclosed')).toBeNull();
  });
});

describe('sanitizeSvg without an xmlns declaration', () => {
  test('still yields an SVG icon', () => {
    const svg = sanitizeSvg(
      '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" onclick="x()"/></svg>',
    );
    expect(svg?.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg?.firstElementChild?.namespaceURI).toBe(
      'http://www.w3.org/2000/svg',
    );
    expect(svg?.outerHTML).toContain('d="M0 0h24v24H0z"');
    expect(svg?.outerHTML).not.toContain('onclick');
  });
});
