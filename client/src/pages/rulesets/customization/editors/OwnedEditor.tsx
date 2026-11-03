import { useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { DiceSpinner, LoadError } from "@/client/src/components/common/index.ts";
import type { RulesDescription } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import {
  emptyOwned,
  EntityFields,
  grantKey,
  grantLabel,
  type GrantLink,
  omittedPlacesOf,
  type OwnedFormData,
  type OwnedLinks,
  ownedListsOf,
  readOwned,
  toOwnedForm,
  withEntityFields,
  withoutPlaces,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { OwnedEntity } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { ownerDetailQuery } from "@/client/src/pages/rulesets/details/owners/ownerSectionQueries.ts";
import { useAllAmounts, useEntityForm } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { toSentenceCase } from "@/shared/text.ts";

import type { EditorProps } from "./renderEditor.tsx";

/** What an owned entity's editor takes past every editor's: its kind, its owner's kind and id, and its rules. */
interface OwnedEditorProps extends EditorProps<OwnedEntity> {
  owner: string;
  ownerId: string;
  rules: RulesDescription | undefined;
  type: string;
}

/** A grant's label, by its entity's name and the one it's through's. */
function labelOf(grant: GrantLink) {
  return grantLabel(grant.toName, grant.viaName);
}

/**
 * An owned entity's details on its customization page (3.5's class level's), as its rules describe its kind (`type`):
 * its number, its fields, and its amounts and grants among its links, at its lists' roles, each read off its links
 * (`toOwnedForm`), saved through its owner's routes, every amount sent (`useAllAmounts`). It has none of the fields its
 * owner's kind leaves out (`omittedPlacesOf`: 3.5's bonded creature's class level's base attack bonus, saves and skill
 * points), the owner read for its kind before its fields show.
 */
export function OwnedEditor({
  rulesetId,
  entityId,
  recordKey,
  adoptKey,
  entity,
  owner,
  ownerId,
  rules,
  type,
  locked,
  followCopy,
  refetchSaved,
}: OwnedEditorProps) {
  // Its owner, whose kind (3.5's class's partition) its rules may leave some of its fields out for: its fields load
  // with it, none shown before it says which
  const { data: ownerData, error: ownerError } = useQuery(ownerDetailQuery(rulesetId, owner, ownerId));
  const allFields = ownerData && rules?.fields[type];
  const omitted = omittedPlacesOf(allFields, rules?.progression.tracks ?? [], ownerData?.partition);
  const fields = allFields && withoutPlaces(allFields, omitted);
  const lists = ownedListsOf(fields);
  const read = readOwned(entity, lists);
  const { amounts, grants } = lists;
  const word = entityTypeLabel(type, rules?.words);
  const { withAll } = useAllAmounts(rulesetId, lists.amounts);
  const { form, save } = useEntityForm({
    empty: emptyOwned(lists),
    values: withEntityFields(toOwnedForm(fields ?? [], entity), fields, entity),
    fields,
    formKey: recordKey,
    adoptKey,
    updatedAt: entity.updatedAt,
    locked,
    rulesetId,
    entityId,
    followCopy,
    storeSaved: refetchSaved,
    // Its owner's tabs, its owned entities' table among them, read the owned entity
    listKey: QUERY_KEYS.rulesets.ownerDetail(rulesetId, ownerId),
    label: toSentenceCase(word),
    saveFn: (data: OwnedFormData, updatedAt: string | undefined) =>
      parseResponse(
        rpc.api.rulesets[":id"].entities[":entityType"][":entityId"].owned[":ownedId"].$put({
          param: {
            id: rulesetId,
            entityType: owner,
            entityId: ownerId,
            ownedId: entityId,
          },
          json: {
            fields: data.fields,
            links: {
              ...data.links,
              ...(amounts && { [amounts.role]: withAll(data.links?.[amounts.role] ?? []) as OwnedLinks[string] }),
              ...(grants && { [grants.role]: data.links?.[grants.role] ?? [] }),
            },
            updatedAt,
          },
        }),
      ),
  });

  return (
    <EntityDetailsCard
      title={`${word} Details`}
      form={{
        // A failed refetch of its owner keeps the fields it has
        fields: !ownerData ? (
          ownerError ? (
            <LoadError what={entityTypeLabel(owner, rules?.words)} error={ownerError} />
          ) : (
            <DiceSpinner sx={{ py: 4 }} />
          )
        ) : (
          <EntityFields
            form={form}
            entityType={type}
            omitted={omitted}
            rulesetId={rulesetId}
            context={{
              grantLabels: new Map(read.grants.map((grant) => [grantKey(grant.toId, grant.viaId), labelOf(grant)])),
            }}
          />
        ),
        ...save,
      }}
    />
  );
}
