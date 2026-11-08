import { Document } from "@react-pdf/renderer";

import type CharacterResponse from "@/engine/rulesets/dnd5/characters/description/CharacterResponse.ts";
import SheetBlocks from "@/engine/rulesets/dnd5/characters/description/SheetBlocks.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd5/model/DetailedCharacter.ts";

import DiagnosticsPage from "./DiagnosticsPage.tsx";
import FeatsPage from "./FeatsPage.tsx";
import InfoPage from "./InfoPage.tsx";
import InventoryPage from "./InventoryPage.tsx";
import SkillsPage from "./SkillsPage.tsx";
import SpellsPage from "./SpellsPage.tsx";

/**
 * A character's printed sheet: its pages, and its diagnostics when asked. Its first, skills, feats and inventory pages
 * render its sheet's blocks (`sheet`, as the API describes it), and its spells page its spells by list and its slots.
 */
function DetailedCharacterSheet({
  detailedCharacter,
  diagnostics,
  portraitUrl,
  sheet,
}: {
  detailedCharacter: DetailedCharacter;
  diagnostics: boolean;
  portraitUrl?: string | null;
  sheet: ReturnType<typeof CharacterResponse.buildSheet>;
}) {
  const { blocks } = sheet;
  const name = sheet.identity.physiology.name;

  return (
    <Document>
      <InfoPage portraitUrl={portraitUrl} rulesetName={detailedCharacter.getRuleset()?.name} sheet={sheet} />
      <SkillsPage block={SheetBlocks.blockOf(blocks, "table", "skills")} name={name} />
      <FeatsPage block={SheetBlocks.blockOf(blocks, "entries", "feats")} name={name} />
      <SpellsPage name={name} slots={sheet.spellSlots} spellGroups={sheet.spellGroups} />
      <InventoryPage block={SheetBlocks.blockOf(blocks, "inventory", "equipment")} name={name} />
      {diagnostics && <DiagnosticsPage detailedCharacter={detailedCharacter} />}
    </Document>
  );
}

export default DetailedCharacterSheet;
