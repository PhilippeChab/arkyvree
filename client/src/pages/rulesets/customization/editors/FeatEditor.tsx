import { parseResponse } from "hono/client";

import { ValueChip } from "@/client/src/components/common/index.ts";
import { useFormSync, useFormWith } from "@/client/src/hooks/index.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  EMPTY_FEAT,
  type FeatFormData,
  FeatFormFields,
  withEntityFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { byName, EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { Feat } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { useEntityFields, useEntitySave } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import type { EditorProps } from "./renderEditor.tsx";

function featAptitudes(feat: Feat) {
  return feat.featsAptitudesInRules.flatMap((fa) => fa.aptitudesInRule ?? []).sort(byName);
}

function toFeatForm(feat: Feat, fields: readonly EntityField[] | undefined): FeatFormData {
  const values: FeatFormData = {
    name: feat.name,
    description: feat.description ?? "",
    aptitudeIds: featAptitudes(feat).map((a) => a.id),
  };
  return withEntityFields(values, fields, feat);
}

export function FeatEditor({
  rulesetId,
  entityId,
  recordKey,
  adoptKey,
  entity: feat,
  canEdit,
  locked,
  followCopy,
  refetchSaved,
}: EditorProps<Feat>) {
  const form = useFormWith<FeatFormData>(EMPTY_FEAT);
  const { fields } = useEntityFields(rulesetId, "feats");
  const sync = useFormSync(form, toFeatForm(feat, fields), { key: recordKey, adoptKey, updatedAt: feat.updatedAt });
  const saveMutation = useEntitySave({
    rulesetId,
    entityId,
    sync,
    followCopy,
    storeSaved: refetchSaved,
    listKey: QUERY_KEYS.rulesets.section(rulesetId, "feats"),
    label: "Feat",
    saveFn: (data: FeatFormData, updatedAt: string | undefined) =>
      parseResponse(
        rpc.api.rulesets[":id"].feats[":featId"].$put({
          param: { id: rulesetId, featId: entityId },
          json: { ...data, updatedAt },
        }),
      ),
  });

  return (
    <EntityDetailsCard
      title="Feat Details"
      description={feat.description}
      chips={featAptitudes(feat).map((apt) => (
        <ValueChip key={apt.id} label={apt.name} />
      ))}
      edit={
        canEdit
          ? {
              fields: (
                <FeatFormFields
                  form={form}
                  rulesetId={rulesetId}
                  knownAptitudes={featAptitudes(feat)}
                  generated={feat.generated}
                />
              ),
              onSubmit: sync.handleSubmit((data) => saveMutation.mutate(data)),
              canSave: sync.isDirty && !locked,
              isSaving: saveMutation.isPending,
            }
          : undefined
      }
    />
  );
}
