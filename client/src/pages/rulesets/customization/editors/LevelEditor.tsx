import { parseResponse } from "hono/client";

import { entitySegment } from "@/client/src/lib/entityRequests.ts";
import type { RulesDescription } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import {
  emptyLevel,
  EntityFormFields,
  type Grant,
  grantKey,
  grantLabel,
  type LevelColumns,
  levelColumnsOf,
  type LevelFormData,
  type LevelLinks,
  type LevelRead,
  readLevel,
  sortGrants,
  toAmountRow,
  withEntityFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { OwnedEntity } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { useAllAmounts, useEntityFields, useEntityForm } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

import type { EditorProps } from "./renderEditor.tsx";

/** What a level's editor takes past every editor's: its kind, its owner's kind and id, and its rules. */
interface LevelEditorProps extends EditorProps<OwnedEntity> {
  owner: string;
  ownerId: string;
  rules: RulesDescription | undefined;
  type: string;
}

/** A grant's label, by its entity's name and the one it's through's. */
function labelOf(grant: Grant) {
  return grantLabel(grant.name, grant.viaName);
}

/**
 * A level's form off its read (`level`): its number, and its amounts and grants among its links, at its columns' roles
 * (`columns`).
 */
function toLevelForm(level: LevelRead, { amounts, grants }: LevelColumns): LevelFormData {
  return {
    position: level.level,
    links: {
      ...(amounts && { [amounts.role]: level.amounts.map(toAmountRow) }),
      ...(grants && {
        [grants.role]: sortGrants(level.grants, labelOf).map((grant) => ({ toId: grant.entityId, viaId: grant.viaId })),
      }),
    },
  };
}

/**
 * An owned level's details on its customization page (3.5's class level's), as its rules describe its kind (`type`):
 * its declared fields, and its amounts and grants among its links, at its columns' roles, saved through its owner's
 * routes, every amount sent (`useAllAmounts`).
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
  const columns = levelColumnsOf(rules, type);
  const level = readLevel(entity, columns);
  const { amounts, grants } = columns;
  const word = entityTypeLabel(type, rules?.words);
  const { fields } = useEntityFields(rulesetId, type);
  const { withAll } = useAllAmounts(rulesetId, columns.amounts);
  const { form, save } = useEntityForm({
    empty: emptyLevel(columns),
    values: withEntityFields(toLevelForm(level, columns), fields, entity),
    columns: rules?.columns[type],
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
            entityType: entitySegment(getUrlSegment(owner)),
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
          <EntityFormFields
            form={form}
            entityType={type}
            rulesetId={rulesetId}
            context={{
              grantLabels: new Map(
                level.grants.map((grant) => [grantKey(grant.entityId, grant.viaId), labelOf(grant)]),
              ),
            }}
          />
        ),
        ...save,
      }}
    />
  );
}
