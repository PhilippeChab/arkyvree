import { parseResponse } from "hono/client";

import { useRulesetRules } from "@/client/src/hooks/index.ts";
import type { EntityRow } from "@/client/src/lib/entityRequests.ts";
import type { EntityKindDescription } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import {
  type EntityFormData,
  linkedEntities,
  ownFieldOf,
  RulesetEntityFormFields,
  toEntityBody,
  toEntityForm,
  withEntityFields,
  withTemplateFlag,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import { useEntityColumns, useEntityFields, useEntityForm } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import type { EditorProps } from "./renderEditor.tsx";

/** What an entity's editor takes past every editor's: its kind, as its rules describe it. */
interface EntityEditorProps extends EditorProps<EntityRow> {
  kind: EntityKindDescription;
}

/**
 * An entity's details on its customization page, any kind's (a feat's, a race's, an item's, a spell's), as its rules
 * describe it: its form of its columns and fields, two side by side where its kind's form is wide, read off the entity
 * (its pools off its links, a copy's template flag), saved through the routes by kind; its name locked while its kind
 * says so (a generated feat's), and every field sent once a copy moves to another template.
 */
export function EntityEditor({
  rulesetId,
  entityId,
  recordKey,
  adoptKey,
  entity,
  kind,
  locked,
  followCopy,
  refetchSaved,
}: EntityEditorProps) {
  const { fields } = useEntityFields(rulesetId, kind.type);
  const { columns } = useEntityColumns(rulesetId, kind.type);
  const label = entityTypeLabel(kind.type, useRulesetRules(rulesetId).rules?.words);
  const { copies, lockedName } = kind;
  const { form, save } = useEntityForm({
    empty: withTemplateFlag(toEntityForm<EntityFormData>(columns), copies, false),
    values: withEntityFields(
      withTemplateFlag(
        toEntityForm<EntityFormData>(columns, entity),
        copies,
        ownFieldOf(entity, copies?.template.field ?? "") === true,
      ),
      fields,
      entity,
    ),
    columns,
    formKey: recordKey,
    adoptKey,
    updatedAt: entity.updatedAt,
    locked,
    rulesetId,
    entityId,
    followCopy,
    storeSaved: refetchSaved,
    listKey: QUERY_KEYS.rulesets.section(rulesetId, kind.type),
    label,
    // Moved to another template, it holds that one's fields: the save sends them all, the server keeping its own
    sendsAllFields: copies
      ? (data, baseline) => {
          const source = data.links?.[copies.source];
          return !!source && source !== baseline?.links?.[copies.source];
        }
      : undefined,
    saveFn: (data: EntityFormData, updatedAt: string | undefined) =>
      parseResponse(
        rpc.api.rulesets[":id"].entities[":entityType"][":entityId"].$put({
          param: { id: rulesetId, entityType: kind.type, entityId },
          json: { ...toEntityBody<EntityFormData, EntityFormData>(columns, data), updatedAt },
        }),
      ),
  });

  return (
    <EntityDetailsCard
      title={`${label} Details`}
      form={{
        fields: (
          <RulesetEntityFormFields
            form={form}
            entityType={kind.type}
            rulesetId={rulesetId}
            columns={kind.wideForm ? 2 : undefined}
            context={{
              knownLinks: linkedEntities(columns, entity),
              templateName: typeof entity.templateName === "string" ? entity.templateName : null,
            }}
            nameLocked={lockedName && ownFieldOf(entity, lockedName.field) === true ? lockedName.reason : undefined}
          />
        ),
        ...save,
      }}
    />
  );
}
