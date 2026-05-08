export const mergeLocalization = (base, override) => {
  if (!override) return base || {};
  if (!base) return override;
  const out = { ...base };
  Object.keys(override).forEach((section) => {
    const baseSection = base[section];
    const overrideSection = override[section];
    if (
      baseSection &&
      overrideSection &&
      typeof baseSection === 'object' &&
      typeof overrideSection === 'object' &&
      !Array.isArray(baseSection) &&
      !Array.isArray(overrideSection)
    ) {
      out[section] = { ...baseSection, ...overrideSection };
    } else {
      out[section] = overrideSection;
    }
  });
  return out;
};

export default mergeLocalization;
