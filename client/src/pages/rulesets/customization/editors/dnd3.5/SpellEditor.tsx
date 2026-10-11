import { parseResponse } from "hono/client";

import { ValueChip } from "@/client/src/components/common/index.ts";
import { useFormSync, useFormWith } from "@/client/src/hooks/index.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  EMPTY_SPELL,
  spellAptitude,
  type SpellFormData,
  SpellFormFields,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { byName, EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { EditorProps } from "@/client/src/pages/rulesets/customization/editors/renderEditor.tsx";
import type { Power } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { useEntitySave, useRulesetSaves } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** The spell's aptitudes with their levels, in the form's (name) order. */
function linkedAptitudes(power: Power) {
  return power.powersAptitudesInRules
    .flatMap((pa) => (pa.aptitudesInRule ? [{ ...pa.aptitudesInRule, level: pa.level }] : []))
    .sort(byName);
}

function toSpellForm(power: Power): SpellFormData {
  return {
    name: power.name,
    description: power.description ?? "",
    saveId: power.saveId ?? "",
    saveEffect: power.saveEffect ?? "",
    aptitudes: linkedAptitudes(power).map((a) => spellAptitude(a.id, a.level)),
  };
}

export function SpellEditor({
  rulesetId,
  entityId,
  recordKey,
  adoptKey,
  entity: power,
  canEdit,
  locked,
  followCopy,
  refetchSaved,
}: EditorProps<Power>) {
  const form = useFormWith<SpellFormData>(EMPTY_SPELL);
  const sync = useFormSync(form, toSpellForm(power), { key: recordKey, adoptKey, updatedAt: power.updatedAt });
  const { data: saves = [], error: savesError } = useRulesetSaves(rulesetId);
  const saveMutation = useEntitySave({
    rulesetId,
    entityId,
    sync,
    followCopy,
    storeSaved: refetchSaved,
    listKey: QUERY_KEYS.rulesets.section(rulesetId, "powers"),
    label: "Spell",
    saveFn: (data: SpellFormData, updatedAt: string | undefined) =>
      parseResponse(
        rpc.api.rulesets[":id"].powers[":powerId"].$put({
          param: { id: rulesetId, powerId: entityId },
          json: { ...data, updatedAt },
        }),
      ),
  });

  const saveName = power.saveId ? saves.find((s) => s.id === power.saveId)?.name : undefined;

  return (
    <EntityDetailsCard
      title="Spell Details"
      description={power.description}
      chips={
        <>
          {linkedAptitudes(power).map((apt) => (
            <ValueChip key={apt.id} label={apt.name} />
          ))}
          {saveName && (
            <ValueChip label={`Save: ${saveName}${power.saveEffect ? ` (${power.saveEffect})` : ""}`} color="warning" />
          )}
        </>
      }
      edit={
        canEdit
          ? {
              fields: (
                <SpellFormFields
                  form={form}
                  rulesetId={rulesetId}
                  saves={saves}
                  savesError={savesError}
                  knownAptitudes={linkedAptitudes(power)}
                  hideProperties
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
