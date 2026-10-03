import type { InferRequestType } from "hono/client";
import type { UseFormReturn } from "react-hook-form";

import { DescriptionField, NameField } from "@/client/src/components/common/index.ts";
import { type Aptitude, AptitudesAutocomplete } from "@/client/src/components/customization/index.ts";
import { nameRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

import { byName, useAptitudeLookup } from "./aptitudeLookup.ts";

export type FeatFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["feats"]["$post"]>["json"];

interface FeatFormFieldsProps {
  form: UseFormReturn<FeatFormData>;
  rulesetId: string;
  /** Aptitudes the form may already hold (the feat's own), so they show by name. */
  knownAptitudes?: Aptitude[];
  /** A generated feat's name names its option (`Weapon Focus: Longsword`): it can't be changed. */
  generated?: boolean;
}

/** Name, description and aptitudes of a feat; the aptitudes live in the form as `aptitudeIds`, sorted by name. */
export function FeatFormFields({ form, rulesetId, knownAptitudes = [], generated = false }: FeatFormFieldsProps) {
  const aptitudes = useAptitudeLookup(knownAptitudes);
  return (
    <>
      <NameField
        {...form.register("name", nameRules)}
        error={form.formState.errors.name}
        disabled={generated}
        helperText={generated ? "A generated feat keeps its name" : undefined}
      />
      <DescriptionField {...form.register("description")} />
      <AptitudesAutocomplete
        rulesetId={rulesetId}
        value={aptitudes.resolve(form.watch("aptitudeIds") ?? [])}
        onChange={(selected) => {
          aptitudes.remember(selected);
          form.setValue(
            "aptitudeIds",
            [...selected].sort(byName).map((a) => a.id),
            { shouldDirty: true },
          );
        }}
      />
    </>
  );
}
