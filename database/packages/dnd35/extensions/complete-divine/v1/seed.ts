import type { Db } from "@/server/database/index.ts";
import { DND35_COMPLETE_DIVINE_NAME } from "@/database/packages/dnd35/names.ts";
import { seedExtension } from "@/database/packages/dnd35/seed-utils.ts";
import { ALL_CLASSES } from "@/database/packages/dnd35-from-parser/generated/complete-divine/classes/index.ts";
import { ALL_DOMAINS } from "@/database/packages/dnd35-from-parser/generated/complete-divine/domains/data.ts";
import { ALL_SPELLS } from "@/database/packages/dnd35-from-parser/generated/complete-divine/spells/index.ts";
import { COW_FEATS } from "@/database/packages/dnd35-from-parser/generated/complete-divine/cowFeats.ts";
import { COW_SPELLS } from "@/database/packages/dnd35-from-parser/generated/complete-divine/cowSpells.ts";
import { ALL_CLASS_FEATS, ALL_STANDALONE_FEATS } from "@/database/packages/dnd35-from-parser/generated/complete-divine/feats/index.ts";
import { ALL_APTITUDES } from "@/database/packages/dnd35-from-parser/generated/complete-divine/aptitudes.ts";

export default async function seed(db: Db) {
  await seedExtension(db, {
    name: DND35_COMPLETE_DIVINE_NAME,
    description: "Complete Divine — divine feats, domains, spells, and classes for D&D 3.5.",
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
