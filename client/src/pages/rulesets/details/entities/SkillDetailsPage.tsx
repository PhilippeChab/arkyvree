import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "react-router-dom";

import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { EntityDetailLayout, EntityPageError } from "@/client/src/pages/rulesets/components/index.ts";
import { entityPageBack } from "@/client/src/pages/rulesets/entityPageState.ts";

import { getEntityPages } from "./entityPageFactory.ts";

export default function SkillDetailsPage() {
  const { id: rulesetId = "", skillId = "" } = useParams<{ id: string; skillId: string }>();
  const location = useLocation();
  const back = entityPageBack(location.state, `/rulesets/${rulesetId}/skills`);
  // A skill's details are its ruleset's base rules': the page waits for the ruleset to know them
  const { data: ruleset, isLoading, error } = useQuery(rulesetDetailQuery(rulesetId));

  if (ruleset) {
    const { SkillDetails } = getEntityPages(ruleset.baseRules);
    return <SkillDetails rulesetId={rulesetId} skillId={skillId} />;
  }

  if (isLoading) {
    return (
      <EntityDetailLayout what="Skill" backTo={back.to} isLoading>
        {null}
      </EntityDetailLayout>
    );
  }

  return <EntityPageError message={loadFailureMessage("Ruleset", error)} backLabel={back.label} backTo={back.to} />;
}
