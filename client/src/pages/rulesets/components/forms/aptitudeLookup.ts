import { useState } from "react";

import type { Aptitude } from "@/client/src/components/customization/index.ts";

/** Order aptitudes by name, so a form's list doesn't depend on picking order. */
export const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/**
 * Aptitude records for the ids a form keeps: the ones known when it mounted,
 * the current ones and any picked since, so the form stores plain ids and
 * the pickers still show every selected aptitude by name.
 */
export function useAptitudeLookup(known: Aptitude[]) {
  const [seen, setSeen] = useState<ReadonlyMap<string, Aptitude>>(() => new Map(known.map((a) => [a.id, a])));
  const byId = new Map([...seen, ...known.map((a) => [a.id, a] as const)]);
  return {
    resolve: (ids: string[]) => ids.flatMap((id) => byId.get(id) ?? []),
    remember: (aptitudes: Aptitude[]) => setSeen((prev) => {
      const next = new Map(prev);
      for (const aptitude of aptitudes) next.set(aptitude.id, aptitude);
      return next;
    }),
  };
}
