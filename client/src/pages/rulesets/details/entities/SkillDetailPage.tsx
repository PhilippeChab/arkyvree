import { useParams } from "react-router-dom";

import { TagChip } from "@/client/src/components/common/index.ts";
import { useRulesetAbilities } from "@/client/src/hooks/index.ts";
import {
  EMPTY_SKILL,
  type SkillFormData,
  SkillFormFields,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { abilityTag, TRAINED_ONLY } from "@/client/src/pages/rulesets/components/index.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

import { skillQuery } from "./entityDetailQueries.ts";
import { RulesetEntityDetail } from "./RulesetEntityDetail.tsx";

export default function SkillDetailPage() {
  const { id: rulesetId = "", skillId = "" } = useParams<{ id: string; skillId: string }>();
  const param = { id: rulesetId, skillId };
  const endpoint = rpc.api.rulesets[":id"].skills[":skillId"];
  const { data: abilities = [] } = useRulesetAbilities(rulesetId);

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
          impactedByWeight: skill.impactedByWeight,
          checkPenaltyMultiplier: skill.checkPenaltyMultiplier,
          usableWithoutTraining: skill.usableWithoutTraining,
        }),
        update: (data, updatedAt) => parseResponse(endpoint.$put({ param, json: { ...data, updatedAt } })),
        remove: () => endpoint.$delete({ param }),
        renderFields: (form) => <SkillFormFields form={form} abilities={abilities} />,
      }}
      renderChips={(skill) => {
        const primaryAbilityName = abilities.find((a) => a.id === skill.primaryAbilityId)?.name;
        return (
          <>
            {primaryAbilityName && <TagChip tag={abilityTag(primaryAbilityName)} size="medium" />}
            {!skill.usableWithoutTraining && <TagChip tag={TRAINED_ONLY} size="medium" />}
            {skill.impactedByWeight && (
              <TagChip
                tag={{
                  label:
                    skill.checkPenaltyMultiplier > 1
                      ? `Weight Penalty ×${skill.checkPenaltyMultiplier}`
                      : "Weight Penalty",
                  color: "info",
                }}
                size="medium"
              />
            )}
          </>
        );
      }}
    />
  );
}
