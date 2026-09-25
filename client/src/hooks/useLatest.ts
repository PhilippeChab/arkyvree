import { useLayoutEffect, useRef } from "react";

/**
 * Ref to the latest committed value, for effects and event handlers that must
 * read it without re-running or changing identity. Only read `.current` outside
 * render: it is updated after each commit, never during render.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
