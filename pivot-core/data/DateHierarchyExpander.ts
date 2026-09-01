/**
 * Synthesizes hierarchy fields for date / time / month / weekday typed columns.
 * Mirrors the auraPivot hierarchy syntax: fieldName.Year / fieldName.Quarter /
 * fieldName.Month / fieldName.Day / fieldName.Weekday / fieldName.Hour /
 * fieldName.Minute.
 *
 * Month, weekday and hierarchy-part captions are localizable via the optional
 * `localization` argument: it follows the same
 * `{ monthNames, weekdayNames, hierarchyParts }` shape exposed by react-pivot's
 * localization dictionaries (see `en.js` and `it.js`). When no override is
 * supplied, English names are used.
 */

import type { MetadataRow, DataRow, FieldType } from '../types';

/** Extended FieldMeta that includes an optional subpart marker for hierarchy fields. */
export interface ExpandedFieldMeta {
  type: FieldType | string;
  caption: string;
  subpart?: string;
}

/** The metadata map that may contain both base and synthetic hierarchy entries. */
export type ExpandedMetadataRow = Record<string, ExpandedFieldMeta>;

/** Localization shape accepted by expandHierarchies. */
interface HierarchyLocalization {
  monthNames?: string[];
  weekdayNames?: string[];
  hierarchyParts?: Partial<typeof DEFAULT_HIERARCHY_PARTS>;
}

const DEFAULT_MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DEFAULT_WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const DEFAULT_HIERARCHY_PARTS = {
  year: 'Year',
  quarter: 'Quarter',
  month: 'Month',
  week: 'Week',
  day: 'Day',
  weekday: 'Weekday',
  hour: 'Hour',
  minute: 'Minute',
};

// ISO-8601 week number: weeks start on Monday; week 1 is the week containing
// the first Thursday of the year.
const getISOWeek = (d: Date): number => {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.getTime();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  return 1 + Math.round((firstThursday - target.getTime()) / 604800000);
};

const pad = (n: number): string => String(n).padStart(2, '0');

const parseDate = (value: unknown): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatTime = (
  value: string | number | null | undefined,
): string | null => {
  if (value === null || value === undefined || value === '') return null;
  // Supports: number of seconds, "HH:mm", "HH:mm:ss" or Date.
  if (typeof value === 'number') {
    const totalSeconds = value < 10000 ? value : Math.floor(value);
    const hours = Math.floor(totalSeconds / 3600) % 24;
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${pad(hours)}:${pad(minutes)}`;
  }
  const str = String(value);
  const match = str.match(/(\d{1,2}):(\d{2})/);
  if (match) return `${pad(parseInt(match[1], 10))}:${match[2]}`;
  const d = parseDate(value);
  if (d) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return str;
};

export const expandHierarchies = (
  metadata: MetadataRow,
  rows: DataRow[],
  localization?: HierarchyLocalization,
): { metadata: ExpandedMetadataRow; rows: DataRow[] } => {
  const monthNames =
    (Array.isArray(localization?.monthNames) &&
      localization.monthNames.length === 12 &&
      localization.monthNames) ||
    DEFAULT_MONTH_NAMES;
  const weekdayNames =
    (Array.isArray(localization?.weekdayNames) &&
      localization.weekdayNames.length === 7 &&
      localization.weekdayNames) ||
    DEFAULT_WEEKDAY_NAMES;
  const parts = {
    ...DEFAULT_HIERARCHY_PARTS,
    ...(localization?.hierarchyParts || {}),
  };

  const expandedMeta: ExpandedMetadataRow = { ...metadata };
  const dateFields: string[] = [];
  const timeFields: string[] = [];
  const monthFields: string[] = [];
  const weekdayFields: string[] = [];

  Object.entries(metadata).forEach(([name, meta]) => {
    if (!meta) return;
    if (meta.type === 'date') {
      dateFields.push(name);
      expandedMeta[`${name}.Year`] = {
        type: 'string',
        subpart: 'year',
        caption: `${meta.caption} (${parts.year})`,
      };
      expandedMeta[`${name}.Quarter`] = {
        type: 'number',
        subpart: 'quarter',
        caption: `${meta.caption} (${parts.quarter})`,
      };
      expandedMeta[`${name}.Month`] = {
        type: 'number',
        subpart: 'month',
        caption: `${meta.caption} (${parts.month})`,
      };
      expandedMeta[`${name}.Week`] = {
        type: 'number',
        subpart: 'week',
        caption: `${meta.caption} (${parts.week})`,
      };
      expandedMeta[`${name}.Day`] = {
        type: 'string',
        subpart: 'day',
        caption: `${meta.caption} (${parts.day})`,
      };
      expandedMeta[`${name}.Weekday`] = {
        type: 'number',
        subpart: 'weekday',
        caption: `${meta.caption} (${parts.weekday})`,
      };
      expandedMeta[`${name}.Hour`] = {
        type: 'string',
        subpart: 'hour',
        caption: `${meta.caption} (${parts.hour})`,
      };
      expandedMeta[`${name}.Minute`] = {
        type: 'string',
        subpart: 'minute',
        caption: `${meta.caption} (${parts.minute})`,
      };
    } else if (meta.type === 'time') {
      timeFields.push(name);
    } else if (meta.type === 'month') {
      monthFields.push(name);
    } else if (meta.type === 'weekday') {
      weekdayFields.push(name);
    }
  });

  if (
    dateFields.length === 0 &&
    timeFields.length === 0 &&
    monthFields.length === 0 &&
    weekdayFields.length === 0
  ) {
    return { metadata: expandedMeta, rows };
  }

  const expandedRows = rows.map((row) => {
    const next = { ...row };

    dateFields.forEach((field) => {
      const d = parseDate(row[field]);
      if (!d) {
        next[`${field}.Year`] = null;
        next[`${field}.Quarter`] = null;
        next[`${field}.Month`] = null;
        next[`${field}.Week`] = null;
        next[`${field}.Day`] = null;
        next[`${field}.Weekday`] = null;
        next[`${field}.Hour`] = null;
        next[`${field}.Minute`] = null;
        return;
      }
      // Raw numeric storage for formattable sub-parts. The DateFormatter
      // produces the caption (full name / short name / number / padded)
      // at tree-build time so the user can switch format live.
      next[`${field}.Year`] = String(d.getFullYear());
      next[`${field}.Quarter`] = Math.floor(d.getMonth() / 3) + 1;
      next[`${field}.Month`] = d.getMonth() + 1;
      next[`${field}.Week`] = getISOWeek(d);
      next[`${field}.Day`] = pad(d.getDate());
      next[`${field}.Weekday`] = d.getDay();
      next[`${field}.Hour`] = pad(d.getHours());
      next[`${field}.Minute`] = pad(d.getMinutes());
    });

    timeFields.forEach((field) => {
      next[field] = formatTime(row[field]);
    });

    monthFields.forEach((field) => {
      const value = row[field];
      if (typeof value === 'number' && value >= 1 && value <= 12) {
        next[field] = monthNames[value - 1];
      }
    });

    weekdayFields.forEach((field) => {
      const value = row[field];
      if (typeof value === 'number' && value >= 0 && value <= 6) {
        next[field] = weekdayNames[value];
      }
    });

    return next;
  });

  return { metadata: expandedMeta, rows: expandedRows };
};
