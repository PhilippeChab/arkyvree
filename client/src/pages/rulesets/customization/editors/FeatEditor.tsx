import { parseResponse } from "hono/client";

import { ValueChip } from "@/client/src/components/common/index.ts";
import { useFormSync, useFormWith } from "@/client/src/hooks/index.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  byName,
  EMPTY_FEAT,
  type FeatFormData,
  FeatFormFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { Feat } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import type { EditorProps } from "./types.ts";
import { useEditorSave } from "./useEditorSave.ts";

function featAptitudes(feat: Feat) {
  return feat.featsAptitudesInRules.flatMap((fa) => fa.aptitudesInRule ?? []).sort(byName);
}

function toFeatForm(feat: Feat): FeatFormData {
  return {
    name: feat.name,
    description: feat.description ?? "",
    aptitudeIds: featAptitudes(feat).map((a) => a.id),
  };
}

export function FeatEditor({
  rulesetId,
  entityId,
  recordKey,
  adoptKey,
  entity: feat,
  canEdit,
  locked,
  onSaved,
}: EditorProps<Feat>) {
  const form = useFormWith<FeatFormData>(EMPTY_FEAT);
  const sync = useFormSync(form, toFeatForm(feat), { key: recordKey, adoptKey, updatedAt: feat.updatedAt });
  const saveMutation = useEditorSave({
    sync,
    entityId,
    onSaved,
    listKey: QUERY_KEYS.rulesets.section(rulesetId, "feats"),
    label: "Feat",
    saveFn: (data: FeatFormData) =>
      parseResponse(
        rpc.api.rulesets[":id"].feats[":featId"].$put({
          param: { id: rulesetId, featId: entityId },
          json: { ...data, updatedAt: sync.updatedAt() },
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
