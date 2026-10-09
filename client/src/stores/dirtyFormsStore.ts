import { create } from "zustand";

interface DirtyFormsState {
  count: number;
  decrement: () => void;
  increment: () => void;
}

/**
 * Global counter of currently-dirty forms. `useDirtyForm` alone counts them (a dialog's form through `FormDialog`, an
 * inline one's through `useFormSync`): it increments on mount-while-dirty and
 * decrements on cleanup / when isDirty flips false. The new version's Refresh
 * action (`WebSocketProvider`) checks `count > 0` to confirm before reloading,
 * and the `beforeunload` handler in main.tsx uses the same to gate
 * the native "leave site?" prompt.
 *
 * `useStore.getState()` is read synchronously inside event handlers
 * (no React subscription) so it doesn't trigger re-renders.
 */
export const useDirtyFormsStore = create<DirtyFormsState>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  decrement: () => set((state) => ({ count: Math.max(0, state.count - 1) })),
}));
