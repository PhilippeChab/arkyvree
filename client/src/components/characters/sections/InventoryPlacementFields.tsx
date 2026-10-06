import { MenuItem, Stack, TextField } from "@mui/material";
import { useController, type UseFormReturn } from "react-hook-form";

import { FormTextField } from "@/client/src/components/common/index.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { wholeNumberRules } from "@/client/src/lib/validation.ts";
import { isHandLocation } from "@/shared/equipment.ts";

import { type InventoryFormData, LOCATION_CHOICES, type PlacementProfile } from "./equipment.ts";

interface InventoryPlacementFieldsProps {
  form: UseFormReturn<InventoryFormData>;
  /** The item's placement; the slot fields wait for an item. */
  profile: PlacementProfile | null;
}

/** How many of the item, where it's worn, its weapon set, and its charges: the add and edit dialogs' fields. */
export function InventoryPlacementFields({ form, profile }: InventoryPlacementFieldsProps) {
  const { field: location } = useController({ control: form.control, name: "location" });

  return (
    <>
      <FormTextField
        control={form.control}
        name="quantity"
        rules={wholeNumberRules(1, "Quantity is required")}
        number
        label="Quantity"
        type="number"
        fullWidth
      />
      {profile && (
        <>
          <TextField
            select
            label={profile.isWeapon ? "Hand Slot" : "Equipment Slot"}
            value={location.value}
            onChange={(e) => location.onChange(oneOf(e.target.value, LOCATION_CHOICES, "none"))}
            onBlur={location.onBlur}
            inputRef={location.ref}
            fullWidth
          >
            <MenuItem value="none">Not Equipped</MenuItem>
            {profile.locationOptions.map((loc) => (
              <MenuItem key={loc} value={loc}>
                {loc}
              </MenuItem>
            ))}
          </TextField>
          {profile.showWeaponSet && isHandLocation(location.value) && (
            <FormTextField
              control={form.control}
              name="weaponSet"
              rules={wholeNumberRules(1, "Weapon set is required")}
              number
              label="Weapon Set"
              type="number"
              fullWidth
            />
          )}
          {profile.charges.has && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <FormTextField
                control={form.control}
                name="totalCharges"
                rules={wholeNumberRules(0)}
                number
                label="Total Charges"
                type="number"
                fullWidth
              />
              <FormTextField
                control={form.control}
                name="remainingCharges"
                rules={wholeNumberRules(0)}
                number
                label="Remaining Charges"
                type="number"
                fullWidth
              />
            </Stack>
          )}
        </>
      )}
    </>
  );
}
