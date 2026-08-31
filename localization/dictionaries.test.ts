import { describe, expect, test } from 'vitest';
import en from './en.json';
import it from './it.json';

type Dict = Record<string, Record<string, unknown>>;

const flatten = (dict: Dict): string[] => {
  const out: string[] = [];
  Object.entries(dict).forEach(([section, entries]) => {
    if (entries && typeof entries === 'object') {
      Object.keys(entries).forEach((key) => out.push(`${section}.${key}`));
    } else {
      out.push(section);
    }
  });
  return out.sort();
};

/**
 * A key present in one dictionary but not the other silently falls back to
 * the component's inline English literal — which is how untranslated words
 * (e.g. the drill-through eyebrow) leak into the Italian UI.
 */
describe('shipped dictionaries', () => {
  test('en and it expose exactly the same keys', () => {
    expect(flatten(it as Dict)).toEqual(flatten(en as Dict));
  });

  test('no Italian entry is left as the English source string', () => {
    const shared = ['record', 'drill-through', 'export', 'excel', 'font'];
    const identical = flatten(en as Dict).filter((path) => {
      const [section, key] = path.split('.');
      const a = (en as Dict)[section]?.[key];
      const b = (it as Dict)[section]?.[key];
      if (typeof a !== 'string' || typeof b !== 'string') return false;
      if (a !== b) return false;
      // Proper nouns, technical terms and token-only templates
      // ("{field} ({agg})") stay identical across locales.
      const low = a.toLowerCase();
      const withoutTokens = a.replace(/\{\w+\}/g, '');
      return (
        !shared.some((w) => low.includes(w)) &&
        /\s/.test(a) &&
        /\p{L}/u.test(withoutTokens)
      );
    });
    expect(identical).toEqual([]);
  });
});
