import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { classDetailQuery } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";

/** A draft: the class it's of, its edits, and the tokens of what it began over. */
interface Draft<T> {
  classId: string;
  edits: T;
  tokens?: DraftTokens;
}

/** The tokens a draft's save is checked against: its class's and its levels', as the tab read them when it began. */
export interface DraftTokens {
  levelTokens: { levelId: string; updatedAt: string }[];
  updatedAt?: string;
}

/**
 * A class tab's changes before its save (`edits`, from `empty`), the class's (`classId`): once the page follows a copy
 * of it, whose levels are others, it holds none. Its first edit keeps the class's token and its `levels`' (`tokens`),
 * so a save refuses what changed since, however often the tab reads them again.
 */
export function useClassDraft<T>(
  rulesetId: string,
  classId: string,
  levels: readonly { id: string; updatedAt: string }[],
  empty: T,
) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft<T>>({ classId, edits: empty });
  const own = (current: Draft<T>): Draft<T> => (current.classId === classId ? current : { classId, edits: empty });

  const readTokens = (): DraftTokens => ({
    levelTokens: levels.map((level) => ({ levelId: level.id, updatedAt: level.updatedAt })),
    updatedAt: queryClient.getQueryData(classDetailQuery(rulesetId, classId).queryKey)?.updatedAt,
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
    tokens: () => own(draft).tokens ?? readTokens(),
  };
}
