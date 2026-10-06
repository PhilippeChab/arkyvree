import { BlankState, Section } from "@/client/src/components/common/index.ts";

import type { EncumbranceData, EquipmentRow } from "./equipment.ts";
import { EquipmentTable } from "./EquipmentTable.tsx";

interface ReadOnlyEquipmentSectionProps {
  equipment: EquipmentRow[];
  encumbrance?: EncumbranceData;
}

export function ReadOnlyEquipmentSection({ equipment, encumbrance }: ReadOnlyEquipmentSectionProps) {
  return (
    <Section title="Equipment & Inventory">
      {equipment.length > 0 ? (
        <EquipmentTable rows={equipment} encumbrance={encumbrance} />
      ) : (
        <BlankState title="No equipment" />
      )}
    </Section>
  );
}
