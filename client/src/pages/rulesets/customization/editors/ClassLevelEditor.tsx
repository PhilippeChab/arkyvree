import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  EMPTY_CLASS_LEVEL,
  EntityFormFields,
  grantKey,
  grantLabel,
  type LevelFeat,
  sortGrants,
  withEntityFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { OwnedEntity } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { ClassLevelFormData } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { useAllLevelSaves, useEntityFields, useEntityForm } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import type { EditorProps } from "./renderEditor.tsx";

type LevelFeatRow = OwnedEntity["feats"][number];

function asLevelFeat(feat: LevelFeatRow): LevelFeat {
  return { featId: feat.id, aptitudeId: feat.aptitudeId };
}
function featLabel(feat: LevelFeatRow) {
  return grantLabel(feat.name, feat.aptitudeName);
}

function toClassLevelForm(level: OwnedEntity, fields: readonly EntityField[] | undefined): ClassLevelFormData {
  const values: ClassLevelFormData = {
    level: level.level,
    saves: level.saves.map(({ saveId, base }) => ({ saveId, base })),
    feats: sortGrants(level.feats, featLabel).map(asLevelFeat),
  };
  return withEntityFields(values, fields, level);
}

export function ClassLevelEditor({
  rulesetId,
  entityId,
  recordKey,
  adoptKey,
  entity: level,
  locked,
  followCopy,
  refetchSaved,
}: EditorProps<OwnedEntity>) {
  const { fields } = useEntityFields(rulesetId, "klass_levels");
  const { withAllSaves } = useAllLevelSaves(rulesetId);
  const { form, save } = useEntityForm({
    empty: EMPTY_CLASS_LEVEL,
    values: toClassLevelForm(level, fields),
    formKey: recordKey,
    adoptKey,
    updatedAt: level.updatedAt,
    locked,
    rulesetId,
    entityId,
    followCopy,
    storeSaved: refetchSaved,
    // Its class's tabs, its levels' table among them, read the level
    listKey: QUERY_KEYS.rulesets.classDetail(rulesetId, level.klassId),
    label: "Class level",
    saveFn: (data: ClassLevelFormData, updatedAt: string | undefined) =>
      parseResponse(
        rpc.api.rulesets[":id"].entities[":entityType"][":entityId"].owned[":ownedId"].$put({
          param: { id: rulesetId, entityType: "classes", entityId: level.klassId, ownedId: entityId },
          json: {
            fields: data.fields,
            saves: withAllSaves(data.saves ?? []),
            feats: data.feats ?? [],
            updatedAt,
          },
        }),
      ),
  });

  return (
    <EntityDetailsCard
      title="Class Level Details"
      form={{
        fields: (
          <EntityFormFields
            form={form}
            entityType="klass_levels"
            rulesetId={rulesetId}
            context={{
              grantLabels: new Map(level.feats.map((feat) => [grantKey(feat.id, feat.aptitudeId), featLabel(feat)])),
            }}
          />
        ),
        ...save,
      }}
    />
  );
}
