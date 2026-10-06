import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** When this tab last reloaded for a deploy's chunks: kept for the tab's session, so a reload can't loop. */
interface ChunkReloadState {
  lastReloadAt: number;
  markReload: () => void;
}

export const useChunkReloadStore = create<ChunkReloadState>()(
  persist(
    (set) => ({
      lastReloadAt: 0,
      markReload: () => set({ lastReloadAt: Date.now() }),
    }),
    { name: "chunk-reload", storage: createJSONStorage(() => sessionStorage) },
  ),
);
