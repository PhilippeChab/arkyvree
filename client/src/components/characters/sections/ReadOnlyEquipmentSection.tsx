import { BlankState } from "@/client/src/components/common/index.ts";

import type { EncumbranceData, EquipmentRow } from "./equipment.ts";
import { EquipmentTable } from "./EquipmentTable.tsx";
import { SheetSection } from "./SheetSection.tsx";

interface ReadOnlyEquipmentSectionProps {
  equipment: EquipmentRow[];
  encumbrance?: EncumbranceData;
}

export function ReadOnlyEquipmentSection({ equipment, encumbrance }: ReadOnlyEquipmentSectionProps) {
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
