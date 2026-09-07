import { eq } from "drizzle-orm";
import {
  abilitiesInRules,
  aptitudesInRules,
  featsInRules,
  rulesetExtensionsInRules,
  rulesetsInRules,
  savesInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { ALL_CLASSES as SRD_CLASSES } from "@/database/packages/dnd35-from-parser/generated/srd/classes/index.ts";
import { buildClassSpellLevels } from "@/database/packages/dnd35/seed-utils/helpers.ts";
import { seedFeats } from "@/database/packages/dnd35/seed-utils/seed-feats.ts";
import { seedPowers } from "@/database/packages/dnd35/seed-utils/seed-powers.ts";
import { seedDomains } from "@/database/packages/dnd35/seed-utils/seed-domains.ts";
import { seedClass } from "@/database/packages/dnd35/seed-utils/seed-class.ts";
import { cowFeatsIntoExtension } from "@/database/packages/dnd35/seed-utils/cow-feats-into-extension.ts";
import { cowSpellsIntoExtension } from "@/database/packages/dnd35/seed-utils/cow-spells-into-extension.ts";
import type { CowFeatEntry } from "@/database/packages/dnd35/seed-utils/cow-feats-into-extension.ts";
import type { CowSpellEntry } from "@/database/packages/dnd35/seed-utils/cow-spells-into-extension.ts";
import type { ClassSeed } from "@/database/packages/dnd35/seed-utils/types.ts";
import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";
import type { PowerSeed } from "@/database/packages/dnd35/v1/spells/types.ts";
import type { DomainDefinition } from "@/database/packages/dnd35/v1/domains/types.ts";

type PowerSeedWithLevel = PowerSeed & { level: number };

export interface ExtensionSeedData {
  name: string;
  description: string;
  aptitudeNames: string[];
  standaloneFeats: FeatSeed[];
  classFeats: FeatSeed[];
  cowFeats: CowFeatEntry[];
  spells: PowerSeedWithLevel[];
  cowSpells: CowSpellEntry[];
  domains: DomainDefinition[];
  classes: ClassSeed[];
}

export async function seedExtension(db: Db, data: ExtensionSeedData): Promise<void> {
  const [baseRuleset] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

  if (!baseRuleset) return;

  // Create the extension ruleset
  const [extension] = await db
    .insert(rulesetsInRules)
    .values({
      name: data.name,
      description: data.description,
      rulesetId: baseRuleset.id,
      ancestorRulesetIds: [baseRuleset.id],
      baseRules: "Dungeons & Dragons: 3.5",
      userId: null,
      system: true,
      kind: "extension",
      private: false,
      status: "Published",
    })
    .returning({ id: rulesetsInRules.id });

  // Link as extension of the base ruleset
  await db.insert(rulesetExtensionsInRules).values({
    rulesetId: baseRuleset.id,
    extensionId: extension.id,
  });

  // 1. Fetch base data maps
  const [aptitudes, saves, skills, baseFeats, abilities] = await Promise.all([
    db.select({ id: aptitudesInRules.id, name: aptitudesInRules.name })
      .from(aptitudesInRules)
      .where(eq(aptitudesInRules.rulesetId, baseRuleset.id)),
    db.select({ id: savesInRules.id, name: savesInRules.name })
      .from(savesInRules)
      .where(eq(savesInRules.rulesetId, baseRuleset.id)),
    db.select({ id: skillsInRules.id, name: skillsInRules.name })
      .from(skillsInRules)
      .where(eq(skillsInRules.rulesetId, baseRuleset.id)),
    db.select({ id: featsInRules.id, name: featsInRules.name })
      .from(featsInRules)
      .where(eq(featsInRules.rulesetId, baseRuleset.id)),
    db.select({ id: abilitiesInRules.id, name: abilitiesInRules.name })
      .from(abilitiesInRules)
      .where(eq(abilitiesInRules.rulesetId, baseRuleset.id)),
  ]);

  const aptMap = Object.fromEntries(aptitudes.map((a) => [a.name, a.id]));
  const saveMap = Object.fromEntries(saves.map((s) => [s.name, s.id]));
  const skillMap = Object.fromEntries(skills.map((s) => [s.name, s.id]));
  const featMap = Object.fromEntries(baseFeats.map((f) => [f.name, f.id]));
  const abilityMap = Object.fromEntries(abilities.map((a) => [a.name, a.id]));

  // 2. Insert only aptitudes not already in the ancestor chain. Names that
  // exist in base (e.g. General, Fighter Bonus Feat, Cleric Domain) are
  // referenced via aptMap — same pattern a user fork uses when adding feats.
  // Names not in base (sibling-shared class spell lists like "Assassin
  // Spells", or extension-private names like "Ronin Bonus Feat") get their
  // own copy; the sibling mechanism merges across extensions at read time.
  const newAptitudeNames = data.aptitudeNames.filter((n) => !aptMap[n]);
  if (newAptitudeNames.length > 0) {
    const insertedApts = await db
      .insert(aptitudesInRules)
      .values(newAptitudeNames.map((name) => ({ rulesetId: extension.id, name })))
      .returning({ id: aptitudesInRules.id, name: aptitudesInRules.name });

    for (const a of insertedApts) {
      aptMap[a.name] = a.id;
    }
  }

  // 3. Seed standalone feats
  const standaloneFeatMap = await seedFeats(db, extension.id, aptMap, data.standaloneFeats);
  Object.assign(featMap, standaloneFeatMap);

  // 4. Seed class feature feats
  const classFeatureMap = await seedFeats(db, extension.id, aptMap, data.classFeats);
  Object.assign(featMap, classFeatureMap);

  // 5. COW base SRD feats into bonus feat aptitudes
  await cowFeatsIntoExtension(db, extension.id, data.cowFeats, featMap, aptMap);

  // 6. Seed spells
  const powerMap = await seedPowers(db, extension.id, data.spells, { aptMap, saveMap });

  // 7. COW spells from other books
  await cowSpellsIntoExtension(db, baseRuleset.id, extension.id, data.cowSpells, aptMap);

  // 8. Seed domains
  const clericDomainAptId = aptMap["Cleric Domain"];
  if (clericDomainAptId) {
    const domainFeatMap = await seedDomains(db, extension.id, data.domains, {
      aptMap,
      powerMap,
      clericDomainAptId,
      clericSpellLevels: buildClassSpellLevels(SRD_CLASSES)["Cleric"],
    });
    Object.assign(featMap, domainFeatMap);
  }

  // 9. Seed all classes
  const ctx = { rulesetId: extension.id, saveMap, skillMap, featMap, aptMap, abilityMap };
  for (const classDef of data.classes) {
    await seedClass(db, extension.id, classDef, ctx);
  }
}
