import { usePivot } from '../context/PivotContext';

// Returns the pivot's fullscreen root element when the pivot is in fullscreen,
// otherwise `undefined`. MUI overlay components (Dialog, Menu, Popover,
// Snackbar, Tooltip) read this via their `container` prop and fall back to
// `document.body` when it is `undefined`. Re-portalling inside the fullscreen
// element is required because the Fullscreen API top-layer hides any
// descendant of `<body>` that is *not* the fullscreen element.
export const usePortalContainer = (): HTMLDivElement | null | undefined => {
  const { fullscreenRef, isFullscreen } = usePivot();
  // Read during render, not an effect: MUI overlays need the container on
  // their first render pass to avoid a portal flicker. Safe here because
  // fullscreenRef is set by an ancestor (AuraPivot's root div ref) before any
  // descendant can observe isFullscreen === true — the ref is never read
  // before it is attached.
  // eslint-disable-next-line react-hooks/refs
  return isFullscreen ? fullscreenRef?.current : undefined;
};

export default usePortalContainer;
