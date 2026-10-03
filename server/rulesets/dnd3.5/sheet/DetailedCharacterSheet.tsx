import { Document } from "@react-pdf/renderer";

import type DetailedCharacter from "../DetailedCharacter.ts";
import DiagnosticsPage from "./DiagnosticsPage.tsx";
import FeatsPage from "./FeatsPage.tsx";
import InfoPage from "./InfoPage.tsx";
import InventoryPage from "./InventoryPage.tsx";
import SkillsPage from "./SkillsPage.tsx";
import SpellsPage from "./SpellsPage.tsx";

const DetailedCharacterSheet = ({
  detailedCharacter,
  kind = "pc",
  portraitUrl,
}: {
  detailedCharacter: DetailedCharacter;
  kind?: "pc" | "familiar" | "animalcompanion" | "mount";
  portraitUrl?: string | null;
}) => {
  const isBonded = kind !== "pc";

  return (
    <Document>
      <InfoPage detailedCharacter={detailedCharacter} portraitUrl={portraitUrl} />
      <SkillsPage detailedCharacter={detailedCharacter} />
      <FeatsPage detailedCharacter={detailedCharacter} />
      <SpellsPage detailedCharacter={detailedCharacter} />
      {!isBonded && <InventoryPage detailedCharacter={detailedCharacter} />}
      {/* Dev only */}
      {process.env.NODE_ENV !== "production" && <DiagnosticsPage detailedCharacter={detailedCharacter} />}
    </Document>
  );
};

export default DetailedCharacterSheet;
