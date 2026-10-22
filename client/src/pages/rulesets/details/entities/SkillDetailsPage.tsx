import { useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useLocation, useParams } from "react-router-dom";

import { useRules } from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import {
  type EntityFormData,
  RulesetEntityFormFields,
  toEntityBody,
  toEntityForm,
  withEntityFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { EntityDetailLayout, EntityPageError } from "@/client/src/pages/rulesets/components/index.ts";
import { entityPageBack } from "@/client/src/pages/rulesets/entityPageState.ts";
import { useEntityColumns, useEntityFields } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { skillQuery } from "./entityDetailQueries.ts";
import { RulesetEntityDetail } from "./RulesetEntityDetail.tsx";

/** What a skill's details take: the skill, and its ruleset. */
interface SkillDetailsProps {
  rulesetId: string;
  skillId: string;
}

/** A skill's details: its columns and its fields, as its rules describe them (3.5's primary ability). */
function SkillDetails({ rulesetId, skillId }: SkillDetailsProps) {
  const param = { id: rulesetId, skillId };
  const endpoint = rpc.api.rulesets[":id"].skills[":skillId"];
  const { fields } = useEntityFields(rulesetId, "skills");
  const { columns } = useEntityColumns(rulesetId, "skills");

  return (
    <RulesetEntityDetail
      rulesetId={rulesetId}
      entityId={skillId}
      section="skills"
      label="Skill"
      query={(id) => skillQuery(rulesetId, id)}
      editing={{
        empty: toEntityForm<EntityFormData>(columns),
        toFormValues: (skill): EntityFormData =>
          withEntityFields<EntityFormData>(toEntityForm<EntityFormData>(columns, skill), fields, skill),
        updateFn: (data, updatedAt) =>
          parseResponse(
            endpoint.$put({
              param,
              json: { ...toEntityBody<EntityFormData, EntityFormData>(columns, data), updatedAt },
            }),
          ),
        removeFn: () => parseResponse(endpoint.$delete({ param })),
        renderFields: (form) => <RulesetEntityFormFields form={form} entityType="skills" rulesetId={rulesetId} />,
      }}
    />
  );
}

export default function SkillDetailsPage() {
  const { id: rulesetId = "", skillId = "" } = useParams<{ id: string; skillId: string }>();
  const location = useLocation();
  // A skill's columns are its ruleset's rules': the page waits for the ruleset and its rules to know them
  const { data: ruleset, isLoading, error } = useQuery(rulesetDetailQuery(rulesetId));
  const { rules, isPending: rulesPending } = useRules(ruleset?.baseRules);
  const back = entityPageBack(location.state, `/rulesets/${rulesetId}/skills`, rules?.words);

  if (ruleset && !rulesPending) return <SkillDetails rulesetId={rulesetId} skillId={skillId} />;

  if (isLoading || rulesPending) {
    return (
      <EntityDetailLayout what="Skill" backTo={back.to} isLoading>
        {null}
      </EntityDetailLayout>
    );
  }

  return <EntityPageError message={loadFailureMessage("Ruleset", error)} backLabel={back.label} backTo={back.to} />;
}
