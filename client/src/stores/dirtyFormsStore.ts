import { create } from "zustand";

interface DirtyFormsState {
  count: number;
  increment: () => void;
  decrement: () => void;
}

/**
 * Global counter of currently-dirty forms. Components (typically via
 * `useDirtyForm` or FormDialog) increment on mount-while-dirty and
 * decrement on cleanup / when isDirty flips false. The Refresh action
 * in WebSocketContext checks `count > 0` to confirm before reloading,
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
