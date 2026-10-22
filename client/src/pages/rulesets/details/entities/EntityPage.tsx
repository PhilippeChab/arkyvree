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
import { entitySegment } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { entityPageBack } from "@/client/src/pages/rulesets/entityPageState.ts";
import { useEntityFields } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

import { entityQuery } from "./entityDetailQueries.ts";
import { RulesetEntityDetail } from "./RulesetEntityDetail.tsx";

/** What an entity's details take: the entity, its kind, as its rules describe it, and its word. */
interface EntityDetailsProps {
  entityId: string;
  kind: EntityKindDescription;
  label: string;
  rulesetId: string;
}

/** The rows a long description's input takes (a mechanic's), as its create dialog's does. */
const LONG_DESCRIPTION_ROWS = 10;

/**
 * An entity's details, any kind's whose row opens its own page: its form of its columns and fields, as its rules
 * describe them, saved and deleted through the routes by kind; its description alone for a read-only kind (an
 * ability's).
 */
function EntityDetails({ entityId, kind, label, rulesetId }: EntityDetailsProps) {
  const segment = getUrlSegment(kind.type);
  const param = { id: rulesetId, entityType: entitySegment(segment), entityId };
  const endpoint = rpc.api.rulesets[":id"].entities[":entityType"][":entityId"];
  const { fields } = useEntityFields(rulesetId, kind.type);

  return (
    <RulesetEntityDetail
      rulesetId={rulesetId}
      entityId={entityId}
      section={segment}
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
                  descriptionRows={kind.longDescription ? LONG_DESCRIPTION_ROWS : undefined}
                />
              ),
            })
      }
    />
  );
}

/**
 * The page of an entity of any kind whose row opens its own page (`opens: "page"`: a language's, a skill's, an
 * ability's), by its kind's URL segment: it waits for its ruleset and its rules to know its kind; a segment no such
 * kind has goes back to the ruleset.
 */
export default function EntityPage() {
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
  const { rules, isPending: rulesPending } = useRules(ruleset?.baseRules);
  const kind = rules?.kinds.find((each) => each.opens === "page" && getUrlSegment(each.type) === section);
  const label = kind ? entityTypeLabel(kind.type, rules?.words) : "Entity";
  const back = entityPageBack(location.state, `/rulesets/${rulesetId}/${section}`, rules?.words);

  if (ruleset && !rulesPending) {
    if (!kind) return <Navigate to={`/rulesets/${rulesetId}`} replace />;
    return <EntityDetails key={entityId} rulesetId={rulesetId} entityId={entityId} kind={kind} label={label} />;
  }

  if (isLoading || rulesPending) {
    return (
      <EntityDetailLayout what={label} backTo={back.to} isLoading>
        {null}
      </EntityDetailLayout>
    );
  }

  return <EntityPageError message={loadFailureMessage("Ruleset", error)} backLabel={back.label} backTo={back.to} />;
}
