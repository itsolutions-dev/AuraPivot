import React, { createContext, useContext } from 'react';
import type PivotEngine from '../pivot-core/PivotEngine';
import type { InternalOptions } from '../pivot-core/PivotEngine';

export interface PivotContextValue {
  engine: PivotEngine;
  localization: Record<string, unknown>;
  locale: string | undefined;
  options: InternalOptions;
  fullscreenRef: React.RefObject<HTMLDivElement | null>;
  isFullscreen: boolean;
}

const PivotContext = createContext<PivotContextValue | null>(null);

export const PivotProvider = function PivotProvider({
  value,
  children,
}: {
  value: PivotContextValue;
  children: React.ReactNode;
}) {
  return (
    <PivotContext.Provider value={value}>{children}</PivotContext.Provider>
  );
};

export const usePivot = (): PivotContextValue => {
  const ctx = useContext(PivotContext);
  if (!ctx) {
    throw new Error('usePivot must be used within a <PivotProvider>');
  }
  return ctx;
};

export default PivotContext;
