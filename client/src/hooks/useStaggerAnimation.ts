import { useState } from "react";

/**
 * Stagger offset for a paginated list: cards before the offset are already on
 * screen, so only a newly loaded page animates in. Resets whenever `listKey`
 * changes (new search, filter or sort), so a fresh first page staggers again.
 */
export function useStaggerAnimation(listKey: readonly unknown[]) {
  const key = JSON.stringify(listKey);
  const [loaded, setLoaded] = useState({ key, offset: 0 });

  const updateOffset = (currentCount: number) => {
    setLoaded({ key, offset: currentCount });
  };

  return { offset: loaded.key === key ? loaded.offset : 0, updateOffset };
}
