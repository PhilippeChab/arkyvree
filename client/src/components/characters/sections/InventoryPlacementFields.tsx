import { Stack } from "@mui/material";
import { type UseFormReturn } from "react-hook-form";

import { FormTextField, SelectField } from "@/client/src/components/common/index.ts";
import { wholeNumberRules } from "@/client/src/lib/validation.ts";

import { type InventoryFormData, type PlacementProfile } from "./equipment.ts";

interface InventoryPlacementFieldsProps {
  form: UseFormReturn<InventoryFormData>;
  /** The item's placement; the slot fields wait for an item. */
  profile: PlacementProfile | null;
}

/** How many of the item, where it's worn, its weapon set, and its charges: the add and edit dialogs' fields. */
export function InventoryPlacementFields({ form, profile }: InventoryPlacementFieldsProps) {
  const location = form.watch("location");
  // The form asks for a weapon set where the item's placement says one applies: a weapon's or a shield's hand
  const asksWeaponSet = !!profile?.locations.some((option) => option.location === location && option.weaponSet);

  return (
    <>
      <FormTextField
        control={form.control}
        name="quantity"
        rules={wholeNumberRules(1, "Quantity is required")}
        number
        label="Quantity"
        fullWidth
      />
      {profile && (
        <>
          <SelectField
            control={form.control}
            name="location"
            label={profile.hand ? "Hand Slot" : "Equipment Slot"}
            options={[{ value: "none", label: "Not Equipped" }, ...profile.locations.map((option) => option.location)]}
          />
          {asksWeaponSet && (
            <FormTextField
              control={form.control}
              name="weaponSet"
              rules={wholeNumberRules(1, "Weapon set is required")}
              number
              label="Weapon Set"
              fullWidth
            />
          )}
          {profile.charges !== null && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <FormTextField
                control={form.control}
                name="totalCharges"
                rules={wholeNumberRules(0)}
                number
                label="Total Charges"
                fullWidth
              />
              <FormTextField
                control={form.control}
                name="remainingCharges"
                rules={wholeNumberRules(0)}
                number
                label="Remaining Charges"
                fullWidth
              />
            </Stack>
          )}
        </>
      )}
    </>
  );
}
