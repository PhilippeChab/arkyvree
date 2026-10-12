import { parseResponse } from "hono/client";

import { useRulesetAbilities } from "@/client/src/hooks/index.ts";
import {
  EMPTY_SKILL,
  type SkillFormData,
  SkillFormFields,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { withEntityFields } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { skillQuery } from "@/client/src/pages/rulesets/details/entities/entityDetailQueries.ts";
import type { SkillDetailsProps } from "@/client/src/pages/rulesets/details/entities/entityPageFactory.ts";
import { RulesetEntityDetail } from "@/client/src/pages/rulesets/details/entities/RulesetEntityDetail.tsx";
import { useEntityFields } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** A 3.5 skill's page: its primary ability, and its fields, as its ruleset declares them. */
export function SkillDetails({ rulesetId, skillId }: SkillDetailsProps) {
  const param = { id: rulesetId, skillId };
  const endpoint = rpc.api.rulesets[":id"].skills[":skillId"];
  const { data: abilities = [], error: abilitiesError } = useRulesetAbilities(rulesetId);
  const { fields } = useEntityFields(rulesetId, "skills");

  return (
    <RulesetEntityDetail
      rulesetId={rulesetId}
      entityId={skillId}
      section="skills"
      label="Skill"
      query={(id) => skillQuery(rulesetId, id)}
      editing={{
        empty: EMPTY_SKILL,
        toFormValues: (skill): SkillFormData =>
          withEntityFields<SkillFormData>(
            { name: skill.name, description: skill.description ?? "", primaryAbilityId: skill.primaryAbilityId },
            fields,
            skill,
          ),
        updateFn: (data, updatedAt) => parseResponse(endpoint.$put({ param, json: { ...data, updatedAt } })),
        removeFn: () => parseResponse(endpoint.$delete({ param })),
        renderFields: (form) => (
          <SkillFormFields form={form} abilities={abilities} abilitiesError={abilitiesError} rulesetId={rulesetId} />
        ),
      }}
    />
  );
}
