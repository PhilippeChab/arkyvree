import { useState } from "react";

/**
 * A dialog opened for a record (a row, a level) or for nothing (`true`): what it shows, kept while it fades out, and
 * whether it's open. A dialog that keeps state of its own mounts with its record (`{dialog.target && …}`) and lets it
 * go once it has faded (`onExited`), so it opens clean, and takes its opening's `key`, so one opened again as it fades
 * out (a level wizard reopened right after its Finish) mounts afresh rather than keeping what it held.
 */
export function useDialogState<T = true>(initial: T | null = null) {
  const [state, setState] = useState({ target: initial, open: initial !== null, opening: 0 });
  return {
    target: state.target,
    open: state.open,
    /** Which opening it is: each `openWith` a new one */
    key: state.opening,
    openWith: (target: T) => setState((current) => ({ target, open: true, opening: current.opening + 1 })),
    close: () => setState((current) => ({ ...current, open: false })),
    /** The dialog's transition has ended: closed, it lets its record go; opened again meanwhile, it keeps it. */
    onExited: () => setState((current) => (current.open ? current : { ...current, target: null, open: false })),
  };
}
