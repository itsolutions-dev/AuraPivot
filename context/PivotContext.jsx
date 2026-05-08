import React, { createContext, useContext } from 'react';

const PivotContext = createContext(null);

export const PivotProvider = function PivotProvider({ value, children }) {
  return (
    <PivotContext.Provider value={value}>{children}</PivotContext.Provider>
  );
};

export const usePivot = () => {
  const ctx = useContext(PivotContext);
  if (!ctx) {
    throw new Error('usePivot must be used within a <PivotProvider>');
  }
  return ctx;
};

export default PivotContext;
