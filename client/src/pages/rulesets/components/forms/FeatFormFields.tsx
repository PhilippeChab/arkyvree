import type { InferRequestType } from "hono/client";
import { Controller, type UseFormReturn } from "react-hook-form";

import { DescriptionField, NameField } from "@/client/src/components/common/index.ts";
import { APTITUDES_RULES, NAME_RULES } from "@/client/src/lib/validation.ts";
import { AptitudesAutocomplete } from "@/client/src/pages/rulesets/components/AptitudesAutocomplete.tsx";
import { byName, useAptitudeLookup } from "@/client/src/pages/rulesets/components/useAptitudeLookup.ts";
import type { Aptitude } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

interface FeatFormFieldsProps {
  /** A new feat needs an aptitude; an existing one may lose its own. */
  aptitudesRequired?: boolean;
  form: UseFormReturn<FeatFormData>;
  /** A generated feat's name names its option (`Weapon Focus: Longsword`): it can't be changed. */
  generated?: boolean;
  /** Aptitudes the form may already hold (the feat's own), so they show by name. */
  knownAptitudes?: Aptitude[];
  rulesetId: string;
}

export type FeatFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["feats"]["$post"]>["json"];

/** Name, description and aptitudes of a feat; the aptitudes live in the form as `aptitudeIds`, sorted by name. */
export function FeatFormFields({
  form,
  rulesetId,
  knownAptitudes = [],
  generated = false,
  aptitudesRequired = false,
}: FeatFormFieldsProps) {
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
        rules={aptitudesRequired ? APTITUDES_RULES : undefined}
        render={({ field, fieldState }) => (
          <AptitudesAutocomplete
            rulesetId={rulesetId}
            inputRef={field.ref}
            error={fieldState.error}
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
