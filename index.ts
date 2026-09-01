import Pivot from './AuraPivot';

export { Pivot };
export { mergeLocalization } from './localization/merge';
export { PivotProvider, usePivot } from './context/PivotContext';
export { default as usePivotMatrix } from './hooks/usePivotMatrix';
//export { TONE_STOPS, buildSwatches, variantSwatches } from './theme/swatches';

// Public type surface. The names are the ones the hand-written index.d.ts has
// always published (`Pivot*`-prefixed), aliased onto their source types where
// those use the `AuraPivot*` prefix — renaming the published surface is not
// part of moving the declarations into the source tree.
export type { AuraPivotProps, AuraPivotRef } from './AuraPivot';
export type { AuraPivotOptions as PivotOptions } from './pivot-core/types';
export type { LocalizationDictionary } from './localization/types';
export type { PivotEngine } from './pivot-core';

export default Pivot;
