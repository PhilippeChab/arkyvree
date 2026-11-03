import { EditableInventorySection } from "./EditableInventorySection.tsx";
import { EntriesSection } from "./EntriesSection.tsx";
import { FieldsSection } from "./FieldsSection.tsx";
import { LoadFigures } from "./LoadFigures.tsx";
import { PoolsSection } from "./PoolsSection.tsx";
import { ReadOnlyInventorySection } from "./ReadOnlyInventorySection.tsx";
import { ScoresSection } from "./ScoresSection.tsx";
import type { SheetBlock } from "./sheetBlocks.ts";
import { StatsSection } from "./StatsSection.tsx";
import { TableSection } from "./TableSection.tsx";

/** A sheet's block, and what its reader may do with the character's rows (`SheetRows`). */
type SheetBlockViewProps = SheetRows & {
  block: SheetBlock;
  characterId: string;
  /** A creature an entry bonds links to its sheet: the owner's view. */
  subsheetsLinkable: boolean;
  /** The character's version, which a `fields` block's edit saves against. */
  updatedAt: string;
};

/**
 * Whether the sheet's reader changes the character's rows (its fields past its identity, its scores, its inventory:
 * `readOnly`, its `canEditRows`), and the ruleset its entities link to (`rulesetId`): a sheet whose rows are edited
 * always names it, which its inventory's edit reads; a read-only one may not (a share link's, a campaign's).
 */
export type SheetRows = { readOnly: false; rulesetId: string } | { readOnly: true; rulesetId?: string };

/** A sheet's block, in its kind's section. */
export function SheetBlockView({
  block,
  characterId,
  readOnly,
  rulesetId,
  subsheetsLinkable,
  updatedAt,
}: SheetBlockViewProps) {
  switch (block.kind) {
    // Its fields past those the sheet opens with
    case "fields":
      return <FieldsSection block={block} characterId={characterId} readOnly={readOnly} updatedAt={updatedAt} />;
    case "entries":
      return <EntriesSection block={block} rulesetId={rulesetId} subsheetsLinkable={subsheetsLinkable} />;
    case "inventory": {
      const load = block.load && <LoadFigures load={block.load} unit={block.units.weight} />;
      // Who may change the character's rows edits its inventory, in its ruleset; anyone else reads the sheet's
      return readOnly ? (
        <ReadOnlyInventorySection block={block} load={load} rulesetId={rulesetId} />
      ) : (
        <EditableInventorySection block={block} characterId={characterId} rulesetId={rulesetId} load={load} />
      );
    }
    case "pools":
      return <PoolsSection block={block} rulesetId={rulesetId} />;
    case "scores":
      return <ScoresSection block={block} characterId={characterId} readOnly={readOnly} />;
    case "stats":
      return <StatsSection block={block} />;
    case "table":
      return <TableSection block={block} />;
  }
}
