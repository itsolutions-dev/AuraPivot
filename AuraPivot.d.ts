// Declaration shim for the JSX entry component so TypeScript call sites
// (tests, typed consumers resolving the source tree) get the public props.
// The published package types live in index.d.ts (copied to dist/).
import type * as React from "react";
import type { AuraPivotProps, AuraPivotRef } from "./index";

declare const Pivot: React.ForwardRefExoticComponent<
  AuraPivotProps & React.RefAttributes<AuraPivotRef>
>;

export default Pivot;
