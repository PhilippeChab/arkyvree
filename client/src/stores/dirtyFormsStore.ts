import { create } from "zustand";

interface DirtyFormsState {
  count: number;
  decrement: () => void;
  increment: () => void;
}

/**
 * Global counter of currently-dirty forms. `useDirtyForm` alone counts them (a dialog's form through `FormDialog`, an
 * inline one's through `useFormSync`): it increments on mount-while-dirty and
 * decrements on cleanup / when isDirty flips false. The `beforeunload` handler
 * in main.tsx checks `count > 0` to gate the native "leave site?" prompt,
 * which any reload asks: a browser refresh, a closed tab, the new version's
 * Refresh (`WebSocketProvider`).
 *
 * `useDirtyFormsStore.getState()` is read synchronously inside event handlers
 * (no React subscription) so it doesn't trigger re-renders.
 */
export const useDirtyFormsStore = create<DirtyFormsState>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  decrement: () => set((state) => ({ count: Math.max(0, state.count - 1) })),
}));
