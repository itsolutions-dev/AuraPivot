import { describe, expect, test } from 'vitest';
import en from './en.json';
import it from './it.json';

type Dict = Record<string, Record<string, unknown>>;

// Vite's import.meta.glob, which vitest provides; the repo does not pull in
// vite/client types for one test.
declare global {
  interface ImportMeta {
    glob: (
      pattern: string,
      options: { query: string; import: string; eager: true },
    ) => Record<string, unknown>;
  }
}

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

/**
 * Every caption a component reads through `section(t, '<name>')` must exist
 * in the shipped dictionary, or it can only ever render its inline English
 * fallback. The scan is textual: `const tX = section(t, 'name')` binds a
 * section, every `tX.key` after it in that file is a lookup, and so is a
 * direct `section(t, 'name').key`. Lookups through a computed key are only
 * covered where the keys sit in a `labelKey` / `l10nKey` table.
 */
/** Whether `key` names an entry of `node` or of any section nested in it. */
const hasKeyDeep = (node: unknown, key: string): boolean =>
  !!node &&
  typeof node === 'object' &&
  (key in node || Object.values(node).some((v) => hasKeyDeep(v, key)));

describe('component caption lookups', () => {
  const files = import.meta.glob('../components/**/*.{ts,tsx}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  test('resolve to keys present in en.json', () => {
    const missing: string[] = [];
    Object.entries(files).forEach(([file, source]) => {
      if (/\.test\.tsx?$/.test(file)) return;
      const bindings = [
        ...source.matchAll(
          /const (\w+) = (?:useMemo\(\(\) => )?section\([^,]+,\s*'(\w+)'\)/g,
        ),
      ];
      bindings.forEach((match, i) => {
        const [, name, sectionName] = match;
        // A binding holds until the file rebinds the same name (components
        // in one file reuse short names such as `tb` for different sections).
        const next = bindings.slice(i + 1).find((later) => later[1] === name);
        const scope = source.slice(match.index, next?.index);
        const entries = (en as Dict)[sectionName] ?? {};
        const use = new RegExp(`\\b${name}\\.(\\w+)\\b`, 'g');
        for (const [, key] of scope.matchAll(use)) {
          if (!(key in entries)) {
            missing.push(`${file}: ${sectionName}.${key}`);
          }
        }
      });
      // Key tables (`labelKey: 'x'`, `l10nKey: 'x'`) are read with a
      // computed key; each must exist in a section the file binds, or in
      // some section when the file receives its captions as a parameter.
      const bound = bindings.map((b) => b[2]);
      const pool = bound.length > 0 ? bound : Object.keys(en);
      for (const [, key] of source.matchAll(/(?:labelKey|l10nKey): '(\w+)'/g)) {
        if (!pool.some((name) => hasKeyDeep((en as Dict)[name], key))) {
          missing.push(`${file}: ${key} (key table)`);
        }
      }
      // One-off lookups: section(t, 'name').key
      const inline = /section\([^,]+,\s*'(\w+)'\)\.(\w+)/g;
      for (const [, sectionName, key] of source.matchAll(inline)) {
        if (!(key in ((en as Dict)[sectionName] ?? {}))) {
          missing.push(`${file}: ${sectionName}.${key}`);
        }
      }
    });
    expect([...new Set(missing)].sort()).toEqual([]);
  });
});
