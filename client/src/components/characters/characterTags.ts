import type { Tag } from "@/client/src/components/common/index.ts";
import { ClassesIcon, ContributorsIcon, RacesIcon } from "@/client/src/components/icons/index.ts";

interface CharacterFacts {
  race: string;
  levels: readonly { klass: string; level: number }[];
  /** Another user's character the session contributes to */
  shared?: boolean;
}

/** A character's facts as tags: shared with the session, its race, its classes' levels. */
export function characterTags({ race, levels, shared = false }: CharacterFacts): Tag[] {
  return [
    ...(shared ? [{ icon: ContributorsIcon, label: "Shared", color: "info" } as const] : []),
    { icon: RacesIcon, label: race, color: "secondary" },
    ...levels.map(({ klass, level }) => ({ icon: ClassesIcon, label: `${klass} ${level}`, color: "primary" }) as const),
  ];
}
