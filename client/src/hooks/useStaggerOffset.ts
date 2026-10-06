import { useState } from "react";

import { useOnChange } from "./useOnChange.ts";

/**
 * Stagger offset for a list that grows a page at a time: the items on screen when a page is appended don't count, so
 * only the new page animates in. A list that starts over (its first item changes: a new search, filter or sort)
 * staggers from 0 again.
 */
export function useStaggerOffset(items: readonly { id: string }[] | undefined) {
  const firstId = items?.[0]?.id;
  const count = items?.length ?? 0;
  const [stagger, setStagger] = useState({ firstId, count, offset: 0 });
  useOnChange(`${firstId}:${count}`, () =>
    setStagger({ firstId, count, offset: stagger.firstId === firstId && count > stagger.count ? stagger.count : 0 }),
  );
  return stagger.offset;
}
