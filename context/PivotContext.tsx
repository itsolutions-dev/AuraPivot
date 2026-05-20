import React, { createContext, useContext } from 'react';
import type PivotEngine from '../pivot-core/PivotEngine';

// The options shape is whatever engine.getOptions() returns. InternalOptions is
// not exported from PivotEngine.ts, so we derive it via ReturnType.
type EngineOptions = ReturnType<InstanceType<typeof PivotEngine>['getOptions']>;

export interface PivotContextValue {
  engine: InstanceType<typeof PivotEngine>;
  localization: Record<string, unknown>;
  locale: string | undefined;
  options: EngineOptions;
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
