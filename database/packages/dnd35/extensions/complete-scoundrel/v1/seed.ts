import type { Db } from "@/server/database/index.ts";
import { DND35_COMPLETE_SCOUNDREL_NAME } from "@/database/packages/dnd35/names.ts";
import { seedExtension } from "@/database/packages/dnd35/seed-utils.ts";
import { ALL_CLASSES } from "@/database/packages/dnd35-from-parser/generated/complete-scoundrel/classes/index.ts";
import { ALL_DOMAINS } from "@/database/packages/dnd35-from-parser/generated/complete-scoundrel/domains/data.ts";
import { ALL_SPELLS } from "@/database/packages/dnd35-from-parser/generated/complete-scoundrel/spells/index.ts";
import { COW_FEATS } from "@/database/packages/dnd35-from-parser/generated/complete-scoundrel/cowFeats.ts";
import { COW_SPELLS } from "@/database/packages/dnd35-from-parser/generated/complete-scoundrel/cowSpells.ts";
import { ALL_CLASS_FEATS, ALL_STANDALONE_FEATS } from "@/database/packages/dnd35-from-parser/generated/complete-scoundrel/feats/index.ts";
import { ALL_APTITUDES } from "@/database/packages/dnd35-from-parser/generated/complete-scoundrel/aptitudes.ts";

export default async function seed(db: Db) {
  await seedExtension(db, {
    name: DND35_COMPLETE_SCOUNDREL_NAME,
    description: "Feats, prestige classes, and tricks for scoundrels in D&D 3.5.",
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
