import { Document } from "@react-pdf/renderer";

import { isProduction } from "@/server/environment.ts";
import type DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";

import DiagnosticsPage from "./DiagnosticsPage.tsx";
import FeatsPage from "./FeatsPage.tsx";
import InfoPage from "./InfoPage.tsx";
import InventoryPage from "./InventoryPage.tsx";
import SkillsPage from "./SkillsPage.tsx";
import SpellsPage from "./SpellsPage.tsx";

function DetailedCharacterSheet({
  detailedCharacter,
  kind = "pc",
  portraitUrl,
}: {
  detailedCharacter: DetailedCharacter;
  kind?: "pc" | "familiar" | "animalcompanion" | "mount";
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
      {/* Dev only */}
      {!isProduction() && <DiagnosticsPage detailedCharacter={detailedCharacter} />}
    </Document>
  );
}

export default DetailedCharacterSheet;
