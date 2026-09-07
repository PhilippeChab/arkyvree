import type { Db } from "@/server/database/index.ts";
import { DND35_COMPLETE_ADVENTURER_NAME } from "@/database/packages/dnd35/names.ts";
import { seedExtension } from "@/database/packages/dnd35/seed-utils.ts";
import { ALL_CLASSES } from "@/database/packages/dnd35-from-parser/generated/complete-adventurer/classes/index.ts";
import { ALL_DOMAINS } from "@/database/packages/dnd35-from-parser/generated/complete-adventurer/domains/data.ts";
import { ALL_SPELLS } from "@/database/packages/dnd35-from-parser/generated/complete-adventurer/spells/index.ts";
import { COW_FEATS } from "@/database/packages/dnd35-from-parser/generated/complete-adventurer/cowFeats.ts";
import { COW_SPELLS } from "@/database/packages/dnd35-from-parser/generated/complete-adventurer/cowSpells.ts";
import { ALL_CLASS_FEATS, ALL_STANDALONE_FEATS } from "@/database/packages/dnd35-from-parser/generated/complete-adventurer/feats/index.ts";
import { ALL_APTITUDES } from "@/database/packages/dnd35-from-parser/generated/complete-adventurer/aptitudes.ts";

export default async function seed(db: Db) {
  await seedExtension(db, {
    name: DND35_COMPLETE_ADVENTURER_NAME,
    description: "Rogue, scout, and skill-focused options for D&D 3.5.",
    aptitudeNames: ALL_APTITUDES,
    standaloneFeats: ALL_STANDALONE_FEATS,
    classFeats: ALL_CLASS_FEATS,
    cowFeats: COW_FEATS,
    spells: ALL_SPELLS,
    cowSpells: COW_SPELLS,
    domains: ALL_DOMAINS,
    classes: ALL_CLASSES,
  });
}
