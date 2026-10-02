import { MenuItem, Stack, TextField } from "@mui/material";
import type { UseFormReturn } from "react-hook-form";

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
  const location = form.watch("location");
  const { errors } = form.formState;

  return (
    <>
      <TextField
        {...form.register("quantity", wholeNumberRules(1, "Quantity is required"))}
        label="Quantity"
        type="number"
        fullWidth
        error={!!errors.quantity}
        helperText={errors.quantity?.message}
      />
      {profile && (
        <>
          <TextField
            select
            label={profile.isWeapon ? "Hand Slot" : "Equipment Slot"}
            value={location}
            onChange={(e) => form.setValue("location", oneOf(e.target.value, LOCATION_CHOICES, "none"))}
            fullWidth
          >
            <MenuItem value="none">Not Equipped</MenuItem>
            {profile.locationOptions.map((loc) => (
              <MenuItem key={loc} value={loc}>
                {loc}
              </MenuItem>
            ))}
          </TextField>
          {profile.showWeaponSet && isHandLocation(location) && (
            <TextField
              {...form.register("weaponSet", wholeNumberRules(1, "Weapon set is required"))}
              label="Weapon Set"
              type="number"
              fullWidth
              error={!!errors.weaponSet}
              helperText={errors.weaponSet?.message}
            />
          )}
          {profile.charges.has && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                {...form.register("totalCharges", wholeNumberRules(0))}
                label="Total Charges"
                type="number"
                fullWidth
                error={!!errors.totalCharges}
                helperText={errors.totalCharges?.message}
              />
              <TextField
                {...form.register("remainingCharges", wholeNumberRules(0))}
                label="Remaining Charges"
                type="number"
                fullWidth
                error={!!errors.remainingCharges}
                helperText={errors.remainingCharges?.message}
              />
            </Stack>
          )}
        </>
      )}
    </>
  );
}
