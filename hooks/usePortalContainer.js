import { usePivot } from '../context/PivotContext';

// Returns the pivot's fullscreen root element when the pivot is in fullscreen,
// otherwise `undefined`. MUI overlay components (Dialog, Menu, Popover,
// Snackbar, Tooltip) read this via their `container` prop and fall back to
// `document.body` when it is `undefined`. Re-portalling inside the fullscreen
// element is required because the Fullscreen API top-layer hides any
// descendant of `<body>` that is *not* the fullscreen element.
export const usePortalContainer = () => {
  const { fullscreenRef, isFullscreen } = usePivot();
  return isFullscreen ? fullscreenRef?.current : undefined;
};

export default usePortalContainer;
