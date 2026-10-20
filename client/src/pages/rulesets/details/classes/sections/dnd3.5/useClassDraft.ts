import { useState } from "react";

/** A draft: the class it's of, its edits, and the tokens of what it began over. */
interface Draft<T> {
  classId: string;
  edits: T;
  tokens?: DraftTokens;
}

/** The tokens a draft's save is checked against: its levels', as the tab read them when it began. */
export interface DraftTokens {
  levelTokens: { levelId: string; updatedAt: string }[];
}

/**
 * A class tab's changes before its save (`edits`, from `empty`), the class's (`classId`): once the page follows a copy
 * of it, whose levels are others, it holds none. Its first edit keeps its `levels`' tokens (`tokens`), so a save
 * refuses a level changed since, however often the tab reads them again.
 */
export function useClassDraft<T>(classId: string, levels: readonly { id: string; updatedAt: string }[], empty: T) {
  const [draft, setDraft] = useState<Draft<T>>({ classId, edits: empty });
  const own = (current: Draft<T>): Draft<T> => (current.classId === classId ? current : { classId, edits: empty });

  const readTokens = (): DraftTokens => ({
    levelTokens: levels.map((level) => ({ levelId: level.id, updatedAt: level.updatedAt })),
  });

  const setEdits = (change: (current: T) => T) =>
    setDraft((current) => {
      const mine = own(current);
      return { classId, edits: change(mine.edits), tokens: mine.tokens ?? readTokens() };
    });

  return {
    discard: () => setDraft({ classId, edits: empty }),
    edits: own(draft).edits,
    setEdits,
    /**
     * After a save of the edits it sent (`sent`): none left, or those made while it ran, over the levels it moved, whose
     * tokens are read again.
     */
    settle: (sent: T) =>
      setDraft((current) => {
        const mine = own(current);
        return mine.edits === sent ? { classId, edits: empty } : { classId, edits: mine.edits };
      }),
    tokens: () => own(draft).tokens ?? readTokens(),
  };
}
