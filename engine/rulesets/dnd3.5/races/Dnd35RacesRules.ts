import type { RaceFields, RacesRules } from "@/engine/core/module/index.ts";
import RequirementEvaluator from "@/engine/core/requirements/RequirementEvaluator.ts";
import type { Components } from "@/engine/core/types.ts";
import Dnd35TargetPaths from "@/engine/rulesets/dnd3.5/Dnd35TargetPaths.ts";
import type { Requirement } from "@/shared/relations.ts";

import { readRaceFields } from "./raceFields.ts";

export class Dnd35RacesRules implements RacesRules {
  enrichWithEligibility<T extends { id: string }>(
    races: T[],
    requirementsByEntity: Map<string, Requirement[]>,
    identity: { alignment?: string; gender?: string },
  ): (T & { eligible: boolean })[] {
    // Only what the form says: a requirement on what it doesn't reads no value, which leaves it invalid, not unmet
    const identityData: Record<string, Record<string, unknown>> = {
      physiology: {},
      beliefs: {},
      background: {},
      meta: {},
    };
    if (identity.alignment) identityData.beliefs.alignment = identity.alignment;
    if (identity.gender) identityData.physiology.gender = identity.gender;
    const components: Components = { identity: { getIdentity: () => identityData } };
    const targetPaths = new Dnd35TargetPaths();

    return races.map((race) => {
      const requirements = requirementsByEntity.get(race.id);
      if (!requirements || requirements.length === 0) return { ...race, eligible: true };
      const evaluator = new RequirementEvaluator(targetPaths);
      evaluator.evaluateRequirements(components, [requirements]);
      return { ...race, eligible: evaluator.getRequirements().unmetRequirementGroups.length === 0 };
    });
  }

  readProperties(properties: { type: string; value: string }[]): RaceFields {
    return readRaceFields(properties);
  }
}
