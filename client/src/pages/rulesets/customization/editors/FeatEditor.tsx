import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  type EntityFormData,
  RulesetEntityFormFields,
  toEntityBody,
  toEntityForm,
  withEntityFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { byName, EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { Feat } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { useEntityColumns, useEntityFields, useEntityForm } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import type { EditorProps } from "./renderEditor.tsx";

function featAptitudes(feat: Feat) {
  return feat.featsAptitudesInRules.flatMap((fa) => fa.aptitudesInRule ?? []).sort(byName);
}

/** A feat's form: its columns (`columns`, its rules': its pools, as the feat links them) and its fields (`fields`). */
function toFeatForm(columns: readonly EntityField[], feat: Feat, fields: readonly EntityField[] | undefined) {
  const values = { ...toEntityForm<EntityFormData>(columns, feat), aptitudeIds: featAptitudes(feat).map((a) => a.id) };
  return withEntityFields(values, fields, feat);
}

export function FeatEditor({
  rulesetId,
  entityId,
  recordKey,
  adoptKey,
  entity: feat,
  locked,
  followCopy,
  refetchSaved,
}: EditorProps<Feat>) {
  const { fields } = useEntityFields(rulesetId, "feats");
  const { columns } = useEntityColumns(rulesetId, "feats");
  const { form, save } = useEntityForm({
    empty: toEntityForm<EntityFormData>(columns),
    values: toFeatForm(columns, feat, fields),
    formKey: recordKey,
    adoptKey,
    updatedAt: feat.updatedAt,
    locked,
    rulesetId,
    entityId,
    followCopy,
    storeSaved: refetchSaved,
    listKey: QUERY_KEYS.rulesets.section(rulesetId, "feats"),
    label: "Feat",
    saveFn: (data: EntityFormData, updatedAt: string | undefined) =>
      parseResponse(
        rpc.api.rulesets[":id"].feats[":featId"].$put({
          param: { id: rulesetId, featId: entityId },
          json: { ...toEntityBody<EntityFormData, EntityFormData>(columns, data), updatedAt },
        }),
      ),
  });

  return (
    <EntityDetailsCard
      title="Feat Details"
      form={{
        fields: (
          <RulesetEntityFormFields
            form={form}
            entityType="feats"
            rulesetId={rulesetId}
            context={{ knownAptitudes: featAptitudes(feat) }}
            nameLocked={feat.generated ? "A generated feat keeps its name" : undefined}
          />
        ),
        ...save,
      }}
    />
  );
}
