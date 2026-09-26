import { Chip } from "@mui/material";
import { useParams } from "react-router-dom";

import { useRulesetAbilities } from "@/client/src/hooks/index.ts";
import {
  SkillFormFields,
  type SkillFormData,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
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
      fetchEntity={() => parseResponse(endpoint.$get({ param }))}
      editing={{
        toFormValues: (skill): SkillFormData => ({
          name: skill.name,
          description: skill.description ?? undefined,
          primaryAbilityId: skill.primaryAbilityId,
          impactedByWeight: skill.impactedByWeight,
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
            {primaryAbilityName && (
              <Chip label={primaryAbilityName} color="secondary" sx={{ fontWeight: 600 }} />
            )}
            {!skill.usableWithoutTraining && <Chip label="Trained Only" color="warning" />}
            {skill.impactedByWeight && <Chip label="Weight Penalty" color="info" variant="outlined" />}
          </>
        );
      }}
    />
  );
}
