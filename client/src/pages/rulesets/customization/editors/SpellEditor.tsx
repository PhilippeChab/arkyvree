import { Chip } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import type { SetStateAction } from "react";
import { useForm } from "react-hook-form";

import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useFormSync, useRulesetSaves } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import {
  SpellFormFields,
  type AptitudeMetadata,
  type SpellFormData,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import type { Power } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { editorKey, type EditorProps } from "./types.ts";
import { useAptitudeLookup } from "./useAptitudeLookup.ts";

type SpellAptitude = SpellFormData["aptitudes"][number];

// Aptitudes and their levels live in the form, without empty `level` keys so
// clearing a level back leaves the form clean.
const spellAptitude = (id: string, level: number | null | undefined): SpellAptitude =>
  level == null ? { id } : { id, level };

const linkedAptitudes = (power: Power) => power.powersAptitudesInRules.filter((pa) => pa.aptitudesInRule);

const toSpellForm = (power: Power): SpellFormData => ({
  name: power.name,
  description: power.description ?? "",
  saveId: power.saveId ?? null,
  saveEffect: power.saveEffect ?? null,
  aptitudes: linkedAptitudes(power).map((pa) => spellAptitude(pa.aptitudeId, pa.level)),
});

export function SpellEditor({ rulesetId, entityId, entity: power, canEdit, onSaved }: EditorProps<Power>) {
  const snackbar = useSnackbar();
  const form = useForm<SpellFormData>();
  const sync = useFormSync(form, toSpellForm(power), { key: editorKey(rulesetId, entityId), updatedAt: power.updatedAt });
  const { data: saves = [] } = useRulesetSaves(rulesetId);
  const aptitudes = useAptitudeLookup(linkedAptitudes(power).flatMap((pa) => pa.aptitudesInRule ?? []));

  const selected = form.watch("aptitudes") ?? [];
  const metadata: AptitudeMetadata = new Map(selected.map((a) => [a.id, a.level === undefined ? {} : { level: a.level }]));
  const setSelected = (next: SpellAptitude[]) => form.setValue("aptitudes", next, { shouldDirty: true });

  const saveMutation = useMutation({
    mutationFn: (data: SpellFormData) => parseResponse(rpc.api.rulesets[":id"].powers[":powerId"].$put({
      param: { id: rulesetId, powerId: entityId },
      json: { ...data, updatedAt: sync.updatedAt() },
    })),
    onSuccess: (saved, submitted) => {
      sync.saved(submitted, saved.updatedAt);
      return onSaved(saved.id, queryKeys.rulesets.section(rulesetId, "powers"), "Spell updated");
    },
    onError: (err) => snackbar.error(err, "Failed to update spell"),
  });

  const saveName = power.saveId ? saves.find((s) => s.id === power.saveId)?.name : undefined;

  return (
    <EntityDetailsCard
      title="Spell Details"
      sx={{ mb: 4 }}
      description={power.description}
      chips={(
        <>
          {linkedAptitudes(power).map((pa) => (
            <Chip key={pa.aptitudeId} label={pa.aptitudesInRule?.name} size="small" color="primary" variant="outlined" />
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
      )}
      edit={canEdit ? {
        fields: (
          <SpellFormFields
            form={form}
            rulesetId={rulesetId}
            selectedAptitudes={aptitudes.resolve(selected.map((a) => a.id))}
            onAptitudesChange={(next) => {
              aptitudes.remember(next);
              setSelected(next.map((a) => spellAptitude(a.id, metadata.get(a.id)?.level)));
            }}
            aptitudeMetadata={metadata}
            onAptitudeMetadataChange={(action: SetStateAction<AptitudeMetadata>) => {
              const next = typeof action === "function" ? action(metadata) : action;
              setSelected(selected.map((a) => spellAptitude(a.id, next.get(a.id)?.level)));
            }}
            saves={saves}
            hideProperties
          />
        ),
        onSubmit: sync.handleSubmit((data) => saveMutation.mutate(data)),
        canSave: form.formState.isDirty,
        isSaving: saveMutation.isPending,
      } : undefined}
    />
  );
}
