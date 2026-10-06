import type { SkillFlags } from "@/server/rulesets/engine/hooks/index.ts";
import {
  SKILL_CHECK_PENALTY_MULTIPLIER,
  SKILL_IMPACTED_BY_WEIGHT,
  SKILL_USABLE_WITHOUT_TRAINING,
} from "@/shared/dnd3.5/properties/index.ts";

/** A skill's flags when it has none of their properties: armor doesn't weigh on it, and it needs training. */
export const NO_SKILL_FLAGS: SkillFlags = {
  impactedByWeight: false,
  checkPenaltyMultiplier: 1,
  usableWithoutTraining: false,
};

/** The flags as a skill keeps them: a multiplier only counts on a skill armor weighs on, so any other takes 1. */
export function normalizeSkillFlags(flags: SkillFlags): SkillFlags {
  return { ...flags, checkPenaltyMultiplier: flags.impactedByWeight ? flags.checkPenaltyMultiplier : 1 };
}

/** Each skill's flags, read off the rows of its properties, by skill id. */
export function readSkillFlags(
  properties: { entityId: string; type: string; value: string }[],
): Map<string, SkillFlags> {
  const flagsBySkillId = new Map<string, SkillFlags>();
  for (const property of properties) {
    let flags = flagsBySkillId.get(property.entityId);
    if (!flags) {
      flags = { ...NO_SKILL_FLAGS };
      flagsBySkillId.set(property.entityId, flags);
    }
    if (property.type === SKILL_IMPACTED_BY_WEIGHT && property.value === "true") {
      flags.impactedByWeight = true;
    }
    if (property.type === SKILL_CHECK_PENALTY_MULTIPLIER && Number(property.value) > 0) {
      flags.checkPenaltyMultiplier = Number(property.value);
    }
    if (property.type === SKILL_USABLE_WITHOUT_TRAINING && property.value === "true") {
      flags.usableWithoutTraining = true;
    }
  }
  return flagsBySkillId;
}
