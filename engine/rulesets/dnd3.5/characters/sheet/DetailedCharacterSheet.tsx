import { Document } from "@react-pdf/renderer";

import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import type { CharacterKind } from "@/engine/rulesets/dnd3.5/model/Dnd35CharacterBuilder.ts";

import DiagnosticsPage from "./DiagnosticsPage.tsx";
import FeatsPage from "./FeatsPage.tsx";
import InfoPage from "./InfoPage.tsx";
import InventoryPage from "./InventoryPage.tsx";
import SkillsPage from "./SkillsPage.tsx";
import SpellsPage from "./SpellsPage.tsx";

/** A character's printed sheet: its pages, a bonded creature's without its inventory, and its diagnostics when asked. */
function DetailedCharacterSheet({
  detailedCharacter,
  diagnostics,
  kind = "pc",
  portraitUrl,
}: {
  detailedCharacter: DetailedCharacter;
  diagnostics: boolean;
  kind?: CharacterKind;
  portraitUrl?: string | null;
}) {
  const isBonded = kind !== "pc";

  return (
    <Document>
      <InfoPage detailedCharacter={detailedCharacter} portraitUrl={portraitUrl} />
      <SkillsPage detailedCharacter={detailedCharacter} />
      <FeatsPage detailedCharacter={detailedCharacter} />
      <SpellsPage detailedCharacter={detailedCharacter} />
      {!isBonded && <InventoryPage detailedCharacter={detailedCharacter} />}
      {diagnostics && <DiagnosticsPage detailedCharacter={detailedCharacter} />}
    </Document>
  );
}

export default DetailedCharacterSheet;
