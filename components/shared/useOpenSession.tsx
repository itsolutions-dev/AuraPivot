import React, { useState } from 'react';

/**
 * A counter that increments every time `open` turns true. Used as a `key`,
 * it remounts a dialog body on each open so its drafts seed from the engine
 * in their state initializers instead of in a reset effect.
 */
export const useOpenSession = (open: boolean): number => {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    // Adjusting state during render (React's documented alternative to an
    // effect): no extra commit, the body mounts already seeded.
    setWasOpen(open);
    if (open) setSession((n) => n + 1);
  }
  return session;
};

/** Wraps a dialog body so it remounts, and so re-seeds, on every open. */
export const withOpenSession = <P extends { open: boolean }>(
  Body: React.ComponentType<P>,
): React.FC<P> => {
  const Session = (props: P) => {
    const session = useOpenSession(props.open);
    return <Body key={session} {...props} />;
  };
  Session.displayName = `withOpenSession(${Body.displayName || Body.name})`;
  return Session;
};
