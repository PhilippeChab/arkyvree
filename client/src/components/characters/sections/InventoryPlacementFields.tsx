import { Autocomplete, Stack, TextField } from "@mui/material";
import { useController, type UseFormReturn } from "react-hook-form";

import { FormTextField, SelectField, ValueChip } from "@/client/src/components/common/index.ts";
import { requiredRules, wholeNumberRules } from "@/client/src/lib/validation.ts";

import { type InventoryFormData, type PlacementProfile } from "./equipment.ts";
import type { InventoryWords } from "./sheetBlocks.ts";

interface GroupsFieldProps {
  choices: number[];
  form: UseFormReturn<InventoryFormData>;
  words: InventoryWords;
}

interface InventoryPlacementFieldsProps {
  form: UseFormReturn<InventoryFormData>;
  /** The item's placement; the slot fields wait for an item. */
  profile: PlacementProfile | null;
  /**
   * The groups a held item can be in (3.5's weapon sets), as shown, from 1: the character's, and a new one
   * (`groupChoices`).
   */
  setChoices: number[];
  /** What the fields say: their inventory block's words. */
  words: InventoryWords;
}

/**
 * The groups a held item is in (3.5's weapon sets), one or more, as chips ("Set 1", "Set 2"): the character's, or a new
 * one.
 */
function GroupsField({ choices, form, words }: GroupsFieldProps) {
  const {
    field: { ref, value, onChange, ...bound },
    fieldState: { error },
  } = useController({ control: form.control, name: "groups", rules: requiredRules(words.groupRequired) });
  return (
    <Autocomplete
      {...bound}
      multiple
      disableCloseOnSelect
      options={choices}
      value={value}
      getOptionLabel={(set) => `${words.group} ${set}`}
      onChange={(_, next) => onChange([...next].sort((a, b) => a - b))}
      renderValue={(selected, getItemProps) =>
        selected.map((set, index) => {
          const { key, ...chipProps } = getItemProps({ index });
          return <ValueChip color="default" key={key} label={`${words.group} ${set}`} {...chipProps} />;
        })
      }
      renderInput={(params) => (
        <TextField {...params} inputRef={ref} label={words.groups} error={!!error} helperText={error?.message} />
      )}
    />
  );
}

/** How many of the item, where it's worn, its groups, and its charges: the add and edit dialogs' fields. */
export function InventoryPlacementFields({ form, profile, setChoices, words }: InventoryPlacementFieldsProps) {
  const location = form.watch("location");
  // The form asks for its groups where the item's placement says they apply: a weapon's or a shield's hand
  const asksGroup = !!profile?.locations.some((option) => option.location === location && option.grouped);

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
          {asksGroup && <GroupsField form={form} choices={setChoices} words={words} />}
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
