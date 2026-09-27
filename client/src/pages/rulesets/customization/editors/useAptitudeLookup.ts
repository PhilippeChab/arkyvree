import { useState } from "react";

import type { Aptitude } from "@/client/src/components/customization/index.ts";

/**
 * Aptitude records for the ids a form keeps: the entity's own plus any picked
 * since, so the form stores plain ids and the pickers still show names.
 */
export function useAptitudeLookup(entityAptitudes: Aptitude[]) {
  const [picked, setPicked] = useState<Aptitude[]>([]);
  const byId = new Map([...entityAptitudes, ...picked].map((a) => [a.id, a]));
  return {
    resolve: (ids: string[]) => ids.flatMap((id) => byId.get(id) ?? []),
    remember: (aptitudes: Aptitude[]) => setPicked((prev) => [...prev, ...aptitudes]),
  };
}
