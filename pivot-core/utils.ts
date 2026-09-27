/**
 * Own-property check for maps keyed by data (field names, aggregation
 * keys): `in` and plain indexing would also find `__proto__`, `constructor`,
 * `valueOf` … on the prototype chain.
 */
export const hasOwn = (obj: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);
