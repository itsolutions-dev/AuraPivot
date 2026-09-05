/**
 * Collision-free identifiers for client-generated list entries (conditional
 * rules, expression clauses). These ids are used as React keys on lists the
 * user can reorder by drag & drop, so a timestamp is not enough: two entries
 * added within the same millisecond would share a key.
 */

let counter = 0;

export const newId = (prefix: string): string => {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${(counter += 1).toString(36)}`;
  return `${prefix}${uuid}`;
};

/**
 * Backfills ids on entries loaded from a persisted configuration written
 * before ids existed, so every list item has a stable key from the start.
 */
export const withIds = <T extends { id?: string }>(
  items: T[] | null | undefined,
  prefix: string,
): T[] =>
  (items || []).map((item) =>
    item && item.id ? item : { ...item, id: newId(prefix) },
  );

export default newId;
