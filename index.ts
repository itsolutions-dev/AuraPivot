import Pivot from './AuraPivot';

export { Pivot };
export { mergeLocalization } from './localization/merge';
export { PivotProvider, usePivot } from './context/PivotContext';
export { default as usePivotMatrix } from './hooks/usePivotMatrix';

// Public type surface. The names are the ones the hand-written index.d.ts has
// always published (`Pivot*`-prefixed), aliased onto their source types where
// those use the `AuraPivot*` prefix — renaming the published surface is not
// part of moving the declarations into the source tree.
export type { AuraPivotProps, AuraPivotRef } from './AuraPivot';
export type { AuraPivotOptions as PivotOptions } from './pivot-core/types';
export type { LocalizationDictionary } from './localization/types';
export type { PivotEngine } from './pivot-core';
export type {
  AuraPivotToolbarOptions as PivotToolbarOptions,
  AuraPivotLayoutOptions as PivotLayoutOptions,
  AuraPivotFieldEntry as PivotFieldDef,
  AuraPivotCalculatedFieldEntry as PivotCalculatedFieldDef,
  AuraPivotDimensionEntry as PivotDimensionDef,
  AuraPivotMeasureEntry as PivotMeasureDef,
  AuraPivotFilterEntry as PivotFilterDef,
  AuraPivotDataOptions as PivotDataOptions,
  AuraPivotConditionalRule as PivotConditionalRule,
  AuraPivotFormatOptions as PivotFormatOptions,
  Aggregation as PivotAggregation,
  EngineEvent as PivotEngineEvent,
} from './pivot-core/types';
// Not `pivot-core/types#PivotMatrix` — that shape is the pre-tree-expansion
// engine matrix. The type actually returned by `PivotEngine#processMatrix()`
// and `usePivotMatrix()` (the one consumers touch) is `ComputedMatrix` from
// MatrixComputer, which is why it keeps its source name here.
export type { ComputedMatrix } from './pivot-core/matrix/MatrixComputer';
export type { PivotContextValue } from './context/PivotContext';
export type {
  ToolbarApi,
  TabDef as ToolbarTab,
} from './components/Toolbar/PivotToolbar';

export default Pivot;
