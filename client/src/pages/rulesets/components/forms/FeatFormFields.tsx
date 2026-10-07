import type { InferRequestType } from "hono/client";
import { Controller, type UseFormReturn } from "react-hook-form";

import { DescriptionField, NameField } from "@/client/src/components/common/index.ts";
import { type Aptitude, AptitudesAutocomplete } from "@/client/src/components/customization/index.ts";
import { NAME_RULES } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

import { byName, useAptitudeLookup } from "./useAptitudeLookup.ts";

interface FeatFormFieldsProps {
  form: UseFormReturn<FeatFormData>;
  rulesetId: string;
  /** Aptitudes the form may already hold (the feat's own), so they show by name. */
  knownAptitudes?: Aptitude[];
  /** A generated feat's name names its option (`Weapon Focus: Longsword`): it can't be changed. */
  generated?: boolean;
}

export type FeatFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["feats"]["$post"]>["json"];

/** Name, description and aptitudes of a feat; the aptitudes live in the form as `aptitudeIds`, sorted by name. */
export function FeatFormFields({ form, rulesetId, knownAptitudes = [], generated = false }: FeatFormFieldsProps) {
  const aptitudes = useAptitudeLookup(knownAptitudes);
  return (
    <>
      <NameField
        control={form.control}
        name="name"
        rules={NAME_RULES}
        disabled={generated}
        helperText={generated ? "A generated feat keeps its name" : undefined}
      />
      <DescriptionField control={form.control} name="description" />
      <Controller
        control={form.control}
        name="aptitudeIds"
        render={({ field }) => (
          <AptitudesAutocomplete
            rulesetId={rulesetId}
            value={aptitudes.resolve(field.value ?? [])}
            onChange={(selected) => {
              aptitudes.remember(selected);
              field.onChange([...selected].sort(byName).map((a) => a.id));
            }}
          />
        )}
      />
    </>
  );
}
