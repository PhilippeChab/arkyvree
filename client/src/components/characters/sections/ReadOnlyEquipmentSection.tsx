import type { ReactNode } from "react";

import { BlankNote } from "@/client/src/components/common/index.ts";

import type { EquipmentRow } from "./equipment.ts";
import { EquipmentTable } from "./EquipmentTable.tsx";
import { SheetSection } from "./SheetSection.tsx";

interface ReadOnlyEquipmentSectionProps {
  equipment: EquipmentRow[];
  /** What the sheet's base rules say of the load it carries, under the table. */
  load?: ReactNode;
  /** Links each item to its page in this ruleset, for a viewer who reads it (a bonded creature's sheet) */
  rulesetId?: string;
}

export function ReadOnlyEquipmentSection({ equipment, load, rulesetId }: ReadOnlyEquipmentSectionProps) {
  return (
    <SheetSection title="Equipment & Inventory">
      {equipment.length > 0 ? (
        <EquipmentTable rows={equipment} load={load} rulesetId={rulesetId} />
      ) : (
        <BlankNote>No equipment</BlankNote>
      )}
    </SheetSection>
  );
}
