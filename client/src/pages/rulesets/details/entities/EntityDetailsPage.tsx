import { useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { Navigate, useLocation, useParams } from "react-router-dom";

import { useRules } from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { type EntityKindDescription, rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import {
  type EntityFormData,
  RulesetEntityFormFields,
  toEntityBody,
  toEntityForm,
  withEntityFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { EntityDetailLayout, EntityPageError } from "@/client/src/pages/rulesets/components/index.ts";
import { useEntityFields, useEntityPageBack } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { entityQuery } from "./entityDetailQueries.ts";
import { RulesetEntityDetail } from "./RulesetEntityDetail.tsx";

/** What an entity's details take: the entity, its kind, as its rules describe it, and its word. */
interface EntityDetailsProps {
  entityId: string;
  kind: EntityKindDescription;
  label: string;
  rulesetId: string;
}

/**
 * An entity's details, any kind's whose row opens its own page: its form of its columns and fields, as its rules
 * describe them, saved and deleted through the routes by kind; its description alone for a read-only kind (an
 * ability's).
 */
function EntityDetails({ entityId, kind, label, rulesetId }: EntityDetailsProps) {
  const param = { id: rulesetId, entityType: kind.type, entityId };
  const endpoint = rpc.api.rulesets[":id"].entities[":entityType"][":entityId"];
  const { fields } = useEntityFields(rulesetId, kind.type);

  return (
    <RulesetEntityDetail
      rulesetId={rulesetId}
      entityId={entityId}
      section={kind.type}
      label={label}
      query={(id) => entityQuery(rulesetId, kind.type, id)}
      editing={
        kind.readOnly
          ? undefined
          : (columns) => ({
              empty: toEntityForm<EntityFormData>(columns),
              toFormValues: (entity): EntityFormData =>
                withEntityFields<EntityFormData>(toEntityForm<EntityFormData>(columns, entity), fields, entity),
              updateFn: (data, updatedAt) =>
                parseResponse(
                  endpoint.$put({
                    param,
                    json: { ...toEntityBody<EntityFormData, EntityFormData>(columns, data), updatedAt },
                  }),
                ),
              removeFn: () => parseResponse(endpoint.$delete({ param })),
              renderFields: (form) => (
                <RulesetEntityFormFields
                  form={form}
                  entityType={kind.type}
                  rulesetId={rulesetId}
                  longDescription={kind.longDescription}
                />
              ),
            })
      }
    />
  );
}

/**
 * The page of an entity of any kind whose row opens its own page (`opens: "page"`: a language's, a skill's, an
 * ability's), by its kind's URL segment: it waits for its ruleset to know its kind by its rules (which the app has
 * loaded before any page), reading the entity meanwhile; a segment no such kind has goes back to the ruleset.
 */
export default function EntityDetailsPage() {
  const {
    id: rulesetId = "",
    section = "",
    entityId = "",
  } = useParams<{
    entityId: string;
    id: string;
    section: string;
  }>();
  const location = useLocation();
  const { data: ruleset, isLoading, error } = useQuery(rulesetDetailQuery(rulesetId));
  const { rules } = useRules(ruleset?.baseRules);
  // Read alongside its ruleset, under the key its details read it by: a segment no kind has is refused
  useQuery(entityQuery(rulesetId, section, entityId));
  const kind = rules?.kinds.find((each) => each.opens === "page" && each.type === section);
  const label = kind ? entityTypeLabel(kind.type, rules?.words) : "Entity";
  const back = useEntityPageBack(location.state, `/rulesets/${rulesetId}/${section}`, rules?.words);

  if (ruleset) {
    if (!kind) return <Navigate to={`/rulesets/${rulesetId}`} replace />;
    // Keyed by its kind alone: a save that copies an inherited entity moves to the copy on the same page
    return <EntityDetails key={kind.type} rulesetId={rulesetId} entityId={entityId} kind={kind} label={label} />;
  }

  if (isLoading) {
    return (
      <EntityDetailLayout what={label} backTo={back.to} isLoading>
        {null}
      </EntityDetailLayout>
    );
  }

  return <EntityPageError message={loadFailureMessage("Ruleset", error)} backLabel={back.label} backTo={back.to} />;
}
