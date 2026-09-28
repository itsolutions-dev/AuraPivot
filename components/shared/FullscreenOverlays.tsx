import React, { useMemo } from 'react';
import DefaultPropsProvider from '@mui/material/DefaultPropsProvider';
import { useTheme } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';

type Components = NonNullable<Theme['components']>;

/** `components` with Modal, Popover and Popper portalling into `container`. */
const withOverlayContainer = (
  components: Components,
  container: HTMLElement,
): Components => {
  const { MuiModal, MuiPopover, MuiPopper } = components;
  return {
    ...components,
    MuiModal: {
      ...MuiModal,
      defaultProps: { ...MuiModal?.defaultProps, container },
    },
    MuiPopover: {
      ...MuiPopover,
      defaultProps: { ...MuiPopover?.defaultProps, container },
    },
    MuiPopper: {
      ...MuiPopper,
      defaultProps: { ...MuiPopper?.defaultProps, container },
    },
  };
};

/**
 * Overlays portal to document.body, which the Fullscreen API's top layer
 * hides. While the pivot is fullscreen, every Dialog, Menu, Select, Popover
 * and Tooltip under it defaults to the fullscreen element instead — one
 * default rather than a `container` prop on each overlay.
 *
 * Only the component defaults are re-provided (what ThemeProvider feeds
 * DefaultPropsProvider from `theme.components`), not the theme itself, so a
 * host's CSS-variables theme and color-scheme state are left alone.
 */
const FullscreenOverlays = function FullscreenOverlays({
  container,
  children,
}: {
  container: HTMLElement | null;
  children: React.ReactNode;
}): React.ReactElement {
  const { components } = useTheme();
  const value = useMemo(
    () =>
      container
        ? withOverlayContainer(components || {}, container)
        : components,
    [components, container],
  );
  return (
    <DefaultPropsProvider
      // Same shape ThemeProvider passes (theme.components); the declared type
      // only lists the older flat-props form.
      value={
        value as React.ComponentProps<typeof DefaultPropsProvider>['value']
      }
    >
      {children}
    </DefaultPropsProvider>
  );
};

export default FullscreenOverlays;
