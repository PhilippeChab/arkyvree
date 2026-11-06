import { Document } from "@react-pdf/renderer";

import type CharacterResponse from "@/engine/rulesets/pf1/characters/description/CharacterResponse.ts";
import SheetBlocks from "@/engine/rulesets/pf1/characters/description/SheetBlocks.ts";
import type DetailedCharacter from "@/engine/rulesets/pf1/model/DetailedCharacter.ts";
import type { CharacterKind } from "@/engine/rulesets/pf1/model/Pf1CharacterBuilder.ts";
import { PLAYER_CHARACTER_KIND } from "@/vocabulary/pf1/bondedKinds.ts";

import DiagnosticsPage from "./DiagnosticsPage.tsx";
import FeatsPage from "./FeatsPage.tsx";
import InfoPage from "./InfoPage.tsx";
import InventoryPage from "./InventoryPage.tsx";
import SkillsPage from "./SkillsPage.tsx";
import SpellsPage from "./SpellsPage.tsx";

/**
 * A character's printed sheet: its pages, a bonded creature's without its inventory or its skill points, and its
 * diagnostics when asked. Its first, skills, feats and inventory pages render its sheet's blocks (`sheet`, as the API
 * describes it), and its spells page its spells by list and per day.
 */
function DetailedCharacterSheet({
  detailedCharacter,
  diagnostics,
  kind = PLAYER_CHARACTER_KIND,
  portraitUrl,
  sheet,
}: {
  detailedCharacter: DetailedCharacter;
  diagnostics: boolean;
  kind?: CharacterKind;
  portraitUrl?: string | null;
  sheet: ReturnType<typeof CharacterResponse.buildSheet>;
}) {
  const isBonded = kind !== PLAYER_CHARACTER_KIND;
  const { blocks } = sheet;
  const name = sheet.identity.physiology.name;
  // The skills it can't use yet (one that needs training, with no rank), by name, which its skills' rows are keyed by
  const untrained = new Set(
    Object.values(sheet.skills)
      .filter((skill) => !skill.trained)
      .map((skill) => skill.name),
  );

  return (
    <Document>
      <InfoPage portraitUrl={portraitUrl} rulesetName={detailedCharacter.getRuleset()?.name} sheet={sheet} />
      <SkillsPage
        block={SheetBlocks.blockOf(blocks, "table", "skills")}
        budget={isBonded ? undefined : sheet.skillBudget}
        name={name}
        untrained={untrained}
      />
      <FeatsPage block={SheetBlocks.blockOf(blocks, "entries", "feats")} name={name} />
      <SpellsPage name={name} perDay={sheet.spellsPerDay} spellGroups={sheet.spellGroups} />
      {!isBonded && <InventoryPage block={SheetBlocks.blockOf(blocks, "inventory", "equipment")} name={name} />}
      {diagnostics && <DiagnosticsPage detailedCharacter={detailedCharacter} />}
    </Document>
  );
}

export default DetailedCharacterSheet;
