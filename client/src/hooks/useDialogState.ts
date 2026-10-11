import { useState } from "react";

/**
 * A dialog opened for a record (a row, a level) or for nothing (`true`): what it shows, kept while it fades out, and
 * whether it's open. A dialog that keeps state of its own mounts with its record (`{dialog.target && …}`) and lets it
 * go once it has faded (`onExited`), so it opens clean.
 */
export function useDialogState<T = true>(initial: T | null = null) {
  const [state, setState] = useState({ target: initial, open: initial !== null });
  return {
    target: state.target,
    open: state.open,
    openWith: (target: T) => setState({ target, open: true }),
    close: () => setState((current) => ({ ...current, open: false })),
    /** The dialog's transition has ended: closed, it lets its record go; opened again meanwhile, it keeps it. */
    onExited: () => setState((current) => (current.open ? current : { target: null, open: false })),
  };
}
