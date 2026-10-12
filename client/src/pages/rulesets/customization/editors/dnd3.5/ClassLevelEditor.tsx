import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  allLevelSaves,
  ClassLevelFields,
  EMPTY_CLASS_LEVEL,
  featKey,
  type LevelFeat,
  levelFeatLabel,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { EntityFields, withEntityFields } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { EditorProps } from "@/client/src/pages/rulesets/customization/editors/renderEditor.tsx";
import type { ClassLevel } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { ClassLevelFormData } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { useEntityFields, useEntityForm, useRulesetSaves } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

type LevelFeatRow = ClassLevel["feats"][number];

function asLevelFeat(feat: LevelFeatRow): LevelFeat {
  return { featId: feat.id, aptitudeId: feat.aptitudeId };
}
function featLabel(feat: LevelFeatRow) {
  return levelFeatLabel(feat.name, feat.aptitudeName);
}

/** Feats in the form's (label) order, like ClassLevelFields keeps them. */
function sortedFeats(level: ClassLevel) {
  return [...level.feats].sort((a, b) => featLabel(a).localeCompare(featLabel(b)));
}

function toClassLevelForm(level: ClassLevel, fields: readonly EntityField[] | undefined): ClassLevelFormData {
  const values: ClassLevelFormData = {
    level: level.level,
    saves: level.saves.map(({ saveId, base }) => ({ saveId, base })),
    feats: sortedFeats(level).map(asLevelFeat),
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
}: EditorProps<ClassLevel>) {
  const { fields } = useEntityFields(rulesetId, "klass_levels");
  const { data: rulesetSaves, error: savesError } = useRulesetSaves(rulesetId);
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
    listKey: QUERY_KEYS.rulesets.classLevels(rulesetId, level.klassId),
    label: "Class level",
    saveFn: (data: ClassLevelFormData, updatedAt: string | undefined) =>
      parseResponse(
        rpc.api.rulesets[":id"].classes[":classId"].levels[":levelId"].$put({
          param: { id: rulesetId, classId: level.klassId, levelId: entityId },
          json: {
            fields: data.fields,
            saves: allLevelSaves(rulesetSaves, data.saves ?? []),
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
          <>
            <EntityFields form={form} entityType="klass_levels" rulesetId={rulesetId} />
            <ClassLevelFields
              form={form}
              rulesetId={rulesetId}
              rulesetSaves={rulesetSaves}
              savesError={savesError}
              featLabels={new Map(level.feats.map((feat) => [featKey(asLevelFeat(feat)), featLabel(feat)]))}
            />
          </>
        ),
        ...save,
      }}
    />
  );
}
