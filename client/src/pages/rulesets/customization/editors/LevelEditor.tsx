import { parseResponse } from "hono/client";

import type { RulesDescription } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import {
  emptyLevel,
  EntityFields,
  grantKey,
  grantLabel,
  type GrantLink,
  type LevelFormData,
  type LevelLinks,
  levelListsOf,
  readLevel,
  toLevelForm,
  withEntityFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { OwnedEntity } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { useAllAmounts, useEntityForm } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import type { EditorProps } from "./renderEditor.tsx";

/** What a level's editor takes past every editor's: its kind, its owner's kind and id, and its rules. */
interface LevelEditorProps extends EditorProps<OwnedEntity> {
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
 * An owned level's details on its customization page (3.5's class level's), as its rules describe its kind (`type`):
 * its number, its fields, and its amounts and grants among its links, at its lists' roles, each read off its links
 * (`toLevelForm`), saved through its owner's routes, every amount sent (`useAllAmounts`).
 */
export function LevelEditor({
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
}: LevelEditorProps) {
  const fields = rules?.fields[type];
  const lists = levelListsOf(fields);
  const level = readLevel(entity, lists);
  const { amounts, grants } = lists;
  const word = entityTypeLabel(type, rules?.words);
  const { withAll } = useAllAmounts(rulesetId, lists.amounts);
  const { form, save } = useEntityForm({
    empty: emptyLevel(lists),
    values: withEntityFields(toLevelForm(fields ?? [], entity), fields, entity),
    fields,
    formKey: recordKey,
    adoptKey,
    updatedAt: entity.updatedAt,
    locked,
    rulesetId,
    entityId,
    followCopy,
    storeSaved: refetchSaved,
    // Its owner's tabs, its levels' table among them, read the level
    listKey: QUERY_KEYS.rulesets.ownerDetail(rulesetId, ownerId),
    label: `${word.charAt(0)}${word.slice(1).toLowerCase()}`,
    saveFn: (data: LevelFormData, updatedAt: string | undefined) =>
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
              ...(amounts && { [amounts.role]: withAll(data.links?.[amounts.role] ?? []) as LevelLinks[string] }),
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
        fields: (
          <EntityFields
            form={form}
            entityType={type}
            rulesetId={rulesetId}
            context={{
              grantLabels: new Map(level.grants.map((grant) => [grantKey(grant.toId, grant.viaId), labelOf(grant)])),
            }}
          />
        ),
        ...save,
      }}
    />
  );
}
