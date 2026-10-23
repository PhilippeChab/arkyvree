import { Autocomplete, Stack, TextField } from "@mui/material";
import { useController, type UseFormReturn } from "react-hook-form";

import { FormTextField, SelectField, ValueChip } from "@/client/src/components/common/index.ts";
import { requiredRules, wholeNumberRules } from "@/client/src/lib/validation.ts";

import { type InventoryFormData, type PlacementProfile } from "./equipment.ts";
import type { InventoryWords } from "./sheetBlocks.ts";

interface InventoryPlacementFieldsProps {
  form: UseFormReturn<InventoryFormData>;
  /** The item's placement; the slot fields wait for an item. */
  profile: PlacementProfile | null;
  /** The weapon sets a held item can be in, as shown, from 1: the character's, and a new one (`weaponSetChoices`). */
  setChoices: number[];
  /** What the fields say: their inventory block's words. */
  words: InventoryWords;
}

interface WeaponSetsFieldProps {
  choices: number[];
  form: UseFormReturn<InventoryFormData>;
  words: InventoryWords;
}

/** The weapon sets a held item is in, one or more, as chips ("Set 1", "Set 2"): the character's, or a new one. */
function WeaponSetsField({ choices, form, words }: WeaponSetsFieldProps) {
  const {
    field: { ref, value, onChange, ...bound },
    fieldState: { error },
  } = useController({ control: form.control, name: "weaponSets", rules: requiredRules(words.weaponSetRequired) });
  return (
    <Autocomplete
      {...bound}
      multiple
      disableCloseOnSelect
      options={choices}
      value={value}
      getOptionLabel={(set) => `${words.weaponSet} ${set}`}
      onChange={(_, next) => onChange([...next].sort((a, b) => a - b))}
      renderValue={(selected, getItemProps) =>
        selected.map((set, index) => {
          const { key, ...chipProps } = getItemProps({ index });
          return <ValueChip color="default" key={key} label={`${words.weaponSet} ${set}`} {...chipProps} />;
        })
      }
      renderInput={(params) => (
        <TextField {...params} inputRef={ref} label={words.weaponSets} error={!!error} helperText={error?.message} />
      )}
    />
  );
}

/** How many of the item, where it's worn, its weapon sets, and its charges: the add and edit dialogs' fields. */
export function InventoryPlacementFields({ form, profile, setChoices, words }: InventoryPlacementFieldsProps) {
  const location = form.watch("location");
  // The form asks for a weapon set where the item's placement says one applies: a weapon's or a shield's hand
  const asksWeaponSet = !!profile?.locations.some((option) => option.location === location && option.weaponSet);

  return (
    <>
      <FormTextField
        control={form.control}
        name="quantity"
        rules={wholeNumberRules(1, words.quantityRequired)}
        number
        label={words.columns.quantity}
        fullWidth
      />
      {profile && (
        <>
          <SelectField
            control={form.control}
            name="location"
            label={profile.hand ? words.handSlot : words.slot}
            options={[
              { value: "none", label: words.notEquipped },
              ...profile.locations.map((option) => option.location),
            ]}
          />
          {asksWeaponSet && <WeaponSetsField form={form} choices={setChoices} words={words} />}
          {profile.charges !== null && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <FormTextField
                control={form.control}
                name="totalCharges"
                rules={wholeNumberRules(0, false)}
                number
                label={words.totalCharges}
                fullWidth
              />
              <FormTextField
                control={form.control}
                name="remainingCharges"
                rules={wholeNumberRules(0, false)}
                number
                label={words.remainingCharges}
                fullWidth
              />
            </Stack>
          )}
        </>
      )}
    </>
  );
}
