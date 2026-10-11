import { parseResponse } from "hono/client";

import { LoadError, StatusChip, ValueChip } from "@/client/src/components/common/index.ts";
import { useRulesetAbilities } from "@/client/src/hooks/index.ts";
import {
  EMPTY_SKILL,
  type SkillFormData,
  SkillFormFields,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { skillQuery } from "@/client/src/pages/rulesets/details/entities/entityDetailQueries.ts";
import type { SkillDetailsProps } from "@/client/src/pages/rulesets/details/entities/entityPageFactory.ts";
import { RulesetEntityDetail } from "@/client/src/pages/rulesets/details/entities/RulesetEntityDetail.tsx";
import { rpc } from "@/client/src/services/rpc.ts";

/** A 3.5 skill's page: its primary ability, whether it needs training, and its armor check penalty. */
export function SkillDetails({ rulesetId, skillId }: SkillDetailsProps) {
  const param = { id: rulesetId, skillId };
  const endpoint = rpc.api.rulesets[":id"].skills[":skillId"];
  const { data: abilities = [], error: abilitiesError } = useRulesetAbilities(rulesetId);

  return (
    <RulesetEntityDetail
      rulesetId={rulesetId}
      entityId={skillId}
      section="skills"
      label="Skill"
      query={(id) => skillQuery(rulesetId, id)}
      editing={{
        empty: EMPTY_SKILL,
        toFormValues: (skill): SkillFormData => ({
          name: skill.name,
          description: skill.description ?? "",
          primaryAbilityId: skill.primaryAbilityId,
          fields: {
            impactedByWeight: skill.impactedByWeight,
            checkPenaltyMultiplier: skill.checkPenaltyMultiplier,
            usableWithoutTraining: skill.usableWithoutTraining,
          },
        }),
        updateFn: (data, updatedAt) => parseResponse(endpoint.$put({ param, json: { ...data, updatedAt } })),
        removeFn: () => parseResponse(endpoint.$delete({ param })),
        renderFields: (form) => <SkillFormFields form={form} abilities={abilities} abilitiesError={abilitiesError} />,
      }}
      notice={!!abilitiesError && abilities.length === 0 && <LoadError what="Abilities" error={abilitiesError} />}
      renderChips={(skill) => {
        const primaryAbilityName = abilities.find((a) => a.id === skill.primaryAbilityId)?.name;
        return (
          <>
            {primaryAbilityName && <ValueChip label={primaryAbilityName} />}
            {!skill.usableWithoutTraining && <StatusChip label="Trained Only" color="warning" />}
            {skill.impactedByWeight && (
              <ValueChip
                label={
                  skill.checkPenaltyMultiplier > 1
                    ? `Weight Penalty ×${skill.checkPenaltyMultiplier}`
                    : "Weight Penalty"
                }
                color="info"
              />
            )}
          </>
        );
      }}
    />
  );
}
