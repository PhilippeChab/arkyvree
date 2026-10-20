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
 * refuses a level changed since, however often the tab reads them again; an edit while they're read again (`fresh`
 * false: what shows may be older) keeps none yet, the next one or the save reading them.
 */
export function useClassDraft<T>(
  classId: string,
  levels: readonly { id: string; updatedAt: string }[],
  fresh: boolean,
  empty: T,
) {
  const [draft, setDraft] = useState<Draft<T>>({ classId, edits: empty });
  const own = (current: Draft<T>): Draft<T> => (current.classId === classId ? current : { classId, edits: empty });

  const readTokens = (): DraftTokens => ({
    levelTokens: levels.map((level) => ({ levelId: level.id, updatedAt: level.updatedAt })),
  });

  const setEdits = (change: (current: T) => T) =>
    setDraft((current) => {
      const mine = own(current);
      return { classId, edits: change(mine.edits), tokens: mine.tokens ?? (fresh ? readTokens() : undefined) };
    });

  return {
    discard: () => setDraft({ classId, edits: empty }),
    edits: own(draft).edits,
    /** After a refused save: the tokens it sent are forgotten, the next save reading the levels as they're read again. */
    forgetTokens: () => setDraft((current) => ({ classId, edits: own(current).edits })),
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
    /** The tokens to send: those the draft began over, and the current ones of levels added since. */
    tokens: (): DraftTokens => {
      const kept = own(draft).tokens;
      if (!kept) return readTokens();
      const known = new Set(kept.levelTokens.map(({ levelId }) => levelId));
      const added = readTokens().levelTokens.filter(({ levelId }) => !known.has(levelId));
      return { levelTokens: [...kept.levelTokens, ...added] };
    },
  };
}
