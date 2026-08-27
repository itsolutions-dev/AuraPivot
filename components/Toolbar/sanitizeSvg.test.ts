// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { sanitizeSvgMarkup } from './sanitizeSvg';

describe('sanitizeSvgMarkup', () => {
  test('passes a clean icon through with content intact', () => {
    const out = sanitizeSvgMarkup(
      '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="currentColor"/></svg>'
    );
    expect(out).toContain('<path');
    expect(out).toContain('d="M0 0h24v24H0z"');
    expect(out).toContain('viewBox="0 0 24 24"');
  });

  test('strips event handler attributes from the root', () => {
    const out = sanitizeSvgMarkup('<svg onload="alert(1)"><rect/></svg>');
    expect(out).not.toContain('onload');
    expect(out).toContain('<rect');
  });

  test('strips event handler attributes from nested elements', () => {
    const out = sanitizeSvgMarkup(
      '<svg><circle r="4" onclick="steal()" onmouseover="x()"/></svg>'
    );
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('onmouseover');
    expect(out).toContain('r="4"');
  });

  test('removes script elements', () => {
    const out = sanitizeSvgMarkup('<svg><script>alert(1)</script><rect/></svg>');
    expect(out).not.toContain('script');
    expect(out).not.toContain('alert');
    expect(out).toContain('<rect');
  });

  test('removes foreignObject elements', () => {
    const out = sanitizeSvgMarkup(
      '<svg><foreignObject><body onload="x()"/></foreignObject><path/></svg>'
    );
    expect(out).not.toContain('foreignObject');
    expect(out).toContain('<path');
  });

  test('strips javascript: hrefs', () => {
    const out = sanitizeSvgMarkup(
      '<svg><a href="javascript:alert(1)"><text>hi</text></a></svg>'
    );
    expect(out).not.toContain('javascript:');
    expect(out).toContain('hi');
  });

  test('strips javascript: xlink:href', () => {
    const out = sanitizeSvgMarkup(
      '<svg><a xlink:href="JAVASCRIPT:alert(1)" xmlns:xlink="http://www.w3.org/1999/xlink"><text>hi</text></a></svg>'
    );
    expect(out).not.toMatch(/javascript:/i);
  });

  test('returns null for non-svg markup', () => {
    expect(sanitizeSvgMarkup('<div>not svg</div>')).toBeNull();
  });

  test('returns null for unparseable markup', () => {
    expect(sanitizeSvgMarkup('<svg><unclosed')).toBeNull();
  });

  test('removes SMIL elements that could rewrite href after sanitization', () => {
    const out = sanitizeSvgMarkup(
      '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><a href="#safe">' +
        '<set attributeName="href" to="javascript:alert(1)"/>' +
        '<animate attributeName="xlink:href" values="javascript:alert(1)"/>' +
        '<text>hi</text></a></svg>'
    );
    expect(out).not.toMatch(/<set/i);
    expect(out).not.toMatch(/<animate/i);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).toContain('<text');
  });

  test('removes style elements', () => {
    const out = sanitizeSvgMarkup(
      '<svg><style>@import url(http://evil/x.css);</style><rect/></svg>'
    );
    expect(out).not.toMatch(/<style/i);
    expect(out).not.toContain('@import');
    expect(out).toContain('<rect');
  });
});
