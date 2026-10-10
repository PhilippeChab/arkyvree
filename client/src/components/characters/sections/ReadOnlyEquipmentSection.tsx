import type { ReactNode } from "react";

import { BlankNote } from "@/client/src/components/common/index.ts";

import type { EquipmentRow } from "./equipment.ts";
import { EquipmentTable } from "./EquipmentTable.tsx";
import { SheetSection } from "./SheetSection.tsx";

interface ReadOnlyEquipmentSectionProps {
  equipment: EquipmentRow[];
  /** What the sheet's base rules say of the load it carries, under the table. */
  load?: ReactNode;
}

export function ReadOnlyEquipmentSection({ equipment, load }: ReadOnlyEquipmentSectionProps) {
  return (
    <SheetSection title="Equipment & Inventory">
      {equipment.length > 0 ? <EquipmentTable rows={equipment} load={load} /> : <BlankNote>No equipment</BlankNote>}
    </SheetSection>
  );
}
