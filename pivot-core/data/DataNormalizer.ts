/**
 * Parses the auraPivot-compatible input array where the first element is
 * a metadata descriptor and the remaining elements are data rows.
 *
 * Input shape:
 *   [
 *     { fieldA: { type, caption }, fieldB: { type, caption } },
 *     { fieldA: ..., fieldB: ... },
 *     ...
 *   ]
 */

import type { MetadataRow, DataRow } from "../types";

const DEFAULT_META: { type: 'string'; caption: string } = { type: 'string', caption: '' };

export const normalizeDataset = (
  // dynamic boundary: raw user-supplied dataset, shape validated at runtime
  dataset: unknown[]
): { metadata: MetadataRow; rows: DataRow[] } => {
  if (!Array.isArray(dataset) || dataset.length === 0) {
    return { metadata: {}, rows: [] };
  }

  const first = dataset[0];
  const isMetadata =
    first &&
    typeof first === 'object' &&
    Object.values(first as Record<string, unknown>).every(
      (v) => v && typeof v === 'object' && 'type' in (v as object)
    );

  if (!isMetadata) {
    // No metadata row: synthesize one from the first data row keys.
    const rows = dataset as DataRow[];
    const metadata: MetadataRow = {};
    if (rows.length > 0) {
      Object.keys(rows[0] as Record<string, unknown>).forEach((key) => {
        metadata[key] = { ...DEFAULT_META, caption: key };
      });
    }
    return { metadata, rows };
  }

  const metadata = { ...(first as MetadataRow) };
  const rows = dataset.slice(1) as DataRow[];
  return { metadata, rows };
};

export const getFieldCaption = (metadata: MetadataRow, uniqueName: string): string => {
  if (!metadata) return uniqueName;
  if (metadata[uniqueName]?.caption) return metadata[uniqueName].caption;
  // Derived hierarchy fields (e.g. callDate.Year)
  const [base, part] = uniqueName.split('.');
  if (part && metadata[base]?.caption) {
    return `${metadata[base].caption} (${part})`;
  }
  return uniqueName;
};
