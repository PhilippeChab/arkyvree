import { oneOf } from "@/client/src/lib/oneOf.ts";
import { MenuItem, Stack, TextField } from "@mui/material";
import type { UseFormReturn } from "react-hook-form";
import { HAND_SLOTS, type InventoryFormData, LOCATION_CHOICES, type PlacementProfile } from "./equipment.ts";

interface InventoryPlacementFieldsProps {
  form: UseFormReturn<InventoryFormData>;
  /** The item's placement; the slot fields wait for an item. */
  profile: PlacementProfile | null;
}

const numberSlotProps = (min: number) => ({ htmlInput: { min } });

/** How many of the item, where it's worn, its weapon set, and its charges: the add and edit dialogs' fields. */
export function InventoryPlacementFields({ form, profile }: InventoryPlacementFieldsProps) {
  const location = form.watch("location");
  const { errors } = form.formState;

  return (
    <>
      <TextField
        {...form.register("quantity", { valueAsNumber: true, min: { value: 1, message: "Minimum 1" } })}
        label="Quantity"
        type="number"
        fullWidth
        error={!!errors.quantity}
        helperText={errors.quantity?.message}
        slotProps={numberSlotProps(1)}
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
          {profile.showWeaponSet && HAND_SLOTS.has(location) && (
            <TextField
              {...form.register("weaponSet", { valueAsNumber: true })}
              label="Weapon Set"
              type="number"
              fullWidth
              slotProps={numberSlotProps(0)}
            />
          )}
          {profile.charges.has && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                {...form.register("totalCharges", { valueAsNumber: true })}
                label="Total Charges"
                type="number"
                fullWidth
                slotProps={numberSlotProps(0)}
              />
              <TextField
                {...form.register("remainingCharges", { valueAsNumber: true })}
                label="Remaining Charges"
                type="number"
                fullWidth
                slotProps={numberSlotProps(0)}
              />
            </Stack>
          )}
        </>
      )}
    </>
  );
}
