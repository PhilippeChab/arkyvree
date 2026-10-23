import { EntriesSection } from "./EntriesSection.tsx";
import { PoolsSection } from "./PoolsSection.tsx";
import { ScoresSection } from "./ScoresSection.tsx";
import type { SheetBlock } from "./sheetBlocks.ts";
import { StatsSection } from "./StatsSection.tsx";
import { TableSection } from "./TableSection.tsx";

interface SheetBlockViewProps {
  block: SheetBlock;
  characterId: string;
  readOnly?: boolean;
  /** Links each entity a block lists to its page in this ruleset. */
  rulesetId?: string;
  /** A creature an entry bonds links to its sheet: the owner's view. */
  subsheetsLinkable: boolean;
}

/** A sheet's block, in its kind's section. */
export function SheetBlockView({ block, characterId, readOnly, rulesetId, subsheetsLinkable }: SheetBlockViewProps) {
  switch (block.kind) {
    case "entries":
      return <EntriesSection block={block} rulesetId={rulesetId} subsheetsLinkable={subsheetsLinkable} />;
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
