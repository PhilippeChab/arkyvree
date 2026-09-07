import type { Db } from "@/server/database/index.ts";
import { DND35_COMPLETE_WARRIOR_NAME } from "@/database/packages/dnd35/names.ts";
import { seedExtension } from "@/database/packages/dnd35/seed-utils.ts";
import { ALL_CLASSES } from "@/database/packages/dnd35-from-parser/generated/complete-warrior/classes/index.ts";
import { ALL_DOMAINS } from "@/database/packages/dnd35-from-parser/generated/complete-warrior/domains/data.ts";
import { ALL_SPELLS } from "@/database/packages/dnd35-from-parser/generated/complete-warrior/spells/index.ts";
import { COW_FEATS } from "@/database/packages/dnd35-from-parser/generated/complete-warrior/cowFeats.ts";
import { COW_SPELLS } from "@/database/packages/dnd35-from-parser/generated/complete-warrior/cowSpells.ts";
import { ALL_CLASS_FEATS, ALL_STANDALONE_FEATS } from "@/database/packages/dnd35-from-parser/generated/complete-warrior/feats/index.ts";
import { ALL_APTITUDES } from "@/database/packages/dnd35-from-parser/generated/complete-warrior/aptitudes.ts";

export default async function seed(db: Db) {
  await seedExtension(db, {
    name: DND35_COMPLETE_WARRIOR_NAME,
    description: "Martial feats and combat options for D&D 3.5.",
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
