import { BlankState } from "@/client/src/components/common/index.ts";

import type { EncumbranceData, EquipmentRow } from "./equipment.ts";
import { EquipmentTable } from "./EquipmentTable.tsx";
import { SheetSection } from "./SheetSection.tsx";

export function ReadOnlyEquipmentSection({
  equipment,
  encumbrance,
}: {
  equipment: EquipmentRow[];
  encumbrance?: EncumbranceData;
}) {
  return (
    <SheetSection title="Equipment & Inventory">
      {equipment.length > 0 ? (
        <EquipmentTable rows={equipment} encumbrance={encumbrance} />
      ) : (
        <BlankState title="No equipment" />
      )}
    </SheetSection>
  );
}
