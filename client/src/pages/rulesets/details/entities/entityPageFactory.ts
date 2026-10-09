import type { ComponentType } from "react";

import type { BaseRules } from "@/shared/enums.ts";

import { SkillDetails, type SkillDetailsProps } from "./dnd3.5/index.ts";

/** What an entity's page renders by its ruleset's base rules: the details of the entities that are theirs. */
interface EntityPageMap {
  SkillDetails: ComponentType<SkillDetailsProps>;
}

const ENTITY_PAGES: Record<BaseRules, EntityPageMap> = {
  "Dungeons & Dragons: 3.5": { SkillDetails },
};

export function getEntityPages(baseRules: BaseRules): EntityPageMap {
  return ENTITY_PAGES[baseRules];
}
