/**
 * Type definitions for the pivot-core library.
 * Kept as JSDoc typedefs so the rest of the project (plain JS) can consume
 * them through editor tooling without needing a TypeScript compiler.
 */

/**
 * @typedef {'string'|'number'|'date'|'time'|'month'|'weekday'} FieldType
 */

/**
 * @typedef {Object} FieldMeta
 * @property {FieldType} type
 * @property {string} caption
 */

/**
 * @typedef {Object.<string, FieldMeta>} MetadataRow
 */

/**
 * @typedef {Object.<string, (string|number|null)>} DataRow
 */

/**
 * @typedef {'asc'|'desc'|'none'} SortDirection
 */

/**
 * @typedef {'sum'|'count'|'distinctcount'|'avg'|'min'|'max'} AggregationType
 */

/**
 * @typedef {Object} SliceField
 * @property {string} uniqueName
 * @property {SortDirection} [sort]
 * @property {string} [caption]
 */

/**
 * @typedef {Object} SliceMeasure
 * @property {string} uniqueName
 * @property {AggregationType} aggregation
 * @property {string} [caption]
 * @property {AggregationType[]} [availableAggregations]
 */

/**
 * @typedef {Object} SliceFilter
 * @property {string} uniqueName
 * @property {string[]} [members]
 * @property {string[]} [exclude]
 */

/**
 * @typedef {Object} Slice
 * @property {SliceField[]} rows
 * @property {SliceField[]} columns
 * @property {SliceMeasure[]} measures
 * @property {{ expandAll?: boolean, expandedMembers?: string[] }} [expands]
 * @property {SliceFilter[]} [filters]
 * @property {string[]} [flatOrder]
 */

/**
 * @typedef {Object} PivotOptions
 * @property {'columns'|'rows'|'none'} [sorting]
 * @property {boolean} [drillThrough]
 */

/**
 * @typedef {Object} Report
 * @property {Slice} slice
 * @property {{ data?: any[], dataSourceType?: 'json' }} [dataSource]
 * @property {PivotOptions} [options]
 */

/**
 * @typedef {Object} TreeNode
 * @property {string} key             - Unique path like 'callDate.Year|2024'
 * @property {string} caption
 * @property {number} depth
 * @property {boolean} isExpanded
 * @property {boolean} [isTotal]
 * @property {TreeNode[]} children
 * @property {string[]} rowIndexes    - indexes into the data array belonging to this node
 * @property {string} [field]         - uniqueName of the splitting field at this depth
 * @property {string|number|null} [value]
 */

/**
 * @typedef {Object} MatrixCell
 * @property {number|null} value
 * @property {string} formattedValue
 * @property {string} rowKey
 * @property {string} colKey
 * @property {string} measureKey
 */

/**
 * @typedef {Object} PivotMatrix
 * @property {TreeNode[]} rowLeaves
 * @property {TreeNode[]} colLeaves
 * @property {TreeNode} rowRoot
 * @property {TreeNode} colRoot
 * @property {Map<string, MatrixCell>} cells
 * @property {SliceMeasure[]} measures
 */

export {};
