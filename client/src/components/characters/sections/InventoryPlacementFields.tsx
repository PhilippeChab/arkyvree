import type { UseFormReturn } from "react-hook-form";

import { FieldRow, FormTextField, SelectField } from "@/client/src/components/common/index.ts";
import { wholeNumberRules } from "@/client/src/lib/validation.ts";
import { isHandLocation } from "@/shared/equipment.ts";

import { type InventoryFormData, type PlacementProfile } from "./equipment.ts";

interface InventoryPlacementFieldsProps {
  form: UseFormReturn<InventoryFormData>;
  /** The item's placement; the slot fields wait for an item. */
  profile: PlacementProfile | null;
}

/** How many of the item, where it's worn, its weapon set, and its charges: the add and edit dialogs' fields. */
export function InventoryPlacementFields({ form, profile }: InventoryPlacementFieldsProps) {
  const location = form.watch("location");

  return (
    <>
      <FormTextField
        control={form.control}
        name="quantity"
        rules={wholeNumberRules(1, "Quantity is required")}
        number
        label="Quantity"
        type="number"
      />
      {profile && (
        <>
          <SelectField
            control={form.control}
            name="location"
            label={profile.isWeapon ? "Hand Slot" : "Equipment Slot"}
            options={[{ value: "none", label: "Not Equipped" }, ...profile.locationOptions]}
          />
          {profile.showWeaponSet && isHandLocation(location) && (
            <FormTextField
              control={form.control}
              name="weaponSet"
              rules={wholeNumberRules(1, "Weapon set is required")}
              number
              label="Weapon Set"
              type="number"
            />
          )}
          {profile.charges.has && (
            <FieldRow>
              <FormTextField
                control={form.control}
                name="totalCharges"
                rules={wholeNumberRules(0)}
                number
                label="Total Charges"
                type="number"
              />
              <FormTextField
                control={form.control}
                name="remainingCharges"
                rules={wholeNumberRules(0)}
                number
                label="Remaining Charges"
                type="number"
              />
            </FieldRow>
          )}
        </>
      )}
    </>
  );
}
