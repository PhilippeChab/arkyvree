import type { ReactNode } from "react";

import { BlankNote } from "@/client/src/components/common/index.ts";

import { InventoryTable } from "./InventoryTable.tsx";
import type { BlockOf } from "./sheetBlocks.ts";
import { SheetSection } from "./SheetSection.tsx";

interface ReadOnlyInventorySectionProps {
  block: BlockOf<"inventory">;
  /** The load it carries, under the table. */
  load?: ReactNode;
  /** Links each item to its page in this ruleset, for a viewer who reads it (a subsheet's) */
  rulesetId?: string;
}

/** An `inventory` block, as a viewer who can't change it reads it: its items, and the load under them. */
export function ReadOnlyInventorySection({ block, load, rulesetId }: ReadOnlyInventorySectionProps) {
  return (
    <SheetSection title={block.title}>
      {block.rows.length > 0 ? (
        <InventoryTable block={block} load={load} rulesetId={rulesetId} />
      ) : (
        <BlankNote>{block.empty}</BlankNote>
      )}
    </SheetSection>
  );
}
