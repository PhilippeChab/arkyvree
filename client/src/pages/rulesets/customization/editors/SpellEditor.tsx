import { Chip } from "@mui/material";
import { parseResponse } from "hono/client";

import { useFormSync, useFormWith, useRulesetSaves } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import {
  EMPTY_SPELL,
  spellAptitude,
  type SpellFormData,
  SpellFormFields,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { byName } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { Power } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import type { EditorProps } from "./types.ts";
import { useEditorSave } from "./useEditorSave.ts";

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
    saveId: power.saveId ?? null,
    saveEffect: power.saveEffect ?? null,
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
  onSaved,
}: EditorProps<Power>) {
  const form = useFormWith<SpellFormData>(EMPTY_SPELL);
  const sync = useFormSync(form, toSpellForm(power), { key: recordKey, adoptKey, updatedAt: power.updatedAt });
  const { data: saves = [] } = useRulesetSaves(rulesetId);
  const saveMutation = useEditorSave({
    sync,
    entityId,
    onSaved,
    listKey: queryKeys.rulesets.section(rulesetId, "powers"),
    label: "Spell",
    saveFn: (data: SpellFormData) =>
      parseResponse(
        rpc.api.rulesets[":id"].powers[":powerId"].$put({
          param: { id: rulesetId, powerId: entityId },
          json: { ...data, updatedAt: sync.updatedAt() },
        }),
      ),
  });

  const saveName = power.saveId ? saves.find((s) => s.id === power.saveId)?.name : undefined;

  return (
    <EntityDetailsCard
      title="Spell Details"
      sx={{ mb: 4 }}
      description={power.description}
      chips={
        <>
          {linkedAptitudes(power).map((apt) => (
            <Chip key={apt.id} label={apt.name} size="small" color="primary" variant="outlined" />
          ))}
          {saveName && (
            <Chip
              label={`Save: ${saveName}${power.saveEffect ? ` (${power.saveEffect})` : ""}`}
              size="small"
              color="warning"
              variant="outlined"
            />
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
                  knownAptitudes={linkedAptitudes(power)}
                  hideProperties
                />
              ),
              onSubmit: sync.handleSubmit((data) => saveMutation.mutate(data)),
              canSave: form.formState.isDirty && !locked,
              isSaving: saveMutation.isPending,
            }
          : undefined
      }
    />
  );
}
