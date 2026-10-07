import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useSearchParam } from "@/client/src/hooks/index.ts";
import { aptitudeQuery, seedAptitude } from "@/client/src/pages/rulesets/details/entities/entityDetailQueries.ts";
import type { Aptitude } from "@/client/src/pages/rulesets/details/sectionQueries.ts";

/**
 * A ruleset list's aptitude filter, kept in the URL (`aptitude`, its id): the aptitude it filters by, read back for its
 * picker with its failure to load, and the change that picks one (the picked option seeds the aptitude's cache, so the
 * picker shows it at once).
 */
export function useAptitudeFilter(rulesetId: string) {
  const queryClient = useQueryClient();
  const { value: aptitudeId, setValue } = useSearchParam("aptitude");
  const { data, error } = useQuery(aptitudeQuery(rulesetId, aptitudeId || undefined));
  const aptitude: Aptitude | null = aptitudeId ? (data ?? null) : null;
  const setAptitude = (next: Aptitude | null) => {
    if (next) seedAptitude(queryClient, rulesetId, next);
    setValue(next?.id ?? "");
  };
  return { aptitude, aptitudeError: error, aptitudeId: aptitudeId || undefined, setAptitude };
}
