import { eq } from "drizzle-orm";
import { languagesInRules, rulesetsInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";

export default async function seed(db: Db) {
  const [ruleset] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
  if (!ruleset) throw new Error(`Ruleset "${DND35_RULESET_NAME}" not found`);

  await db.insert(languagesInRules).values([
    { rulesetId: ruleset.id, name: "Abyssal", type: "Exotic", description: "The language of demons, full of curses and threats." },
    { rulesetId: ruleset.id, name: "Aquan", type: "Exotic", description: "The language of the sea" },
    { rulesetId: ruleset.id, name: "Auran", type: "Exotic", description: "The language of the sky" },
    { rulesetId: ruleset.id, name: "Celestial", type: "Exotic", description: "The language of angels and other good outsiders, known for its beauty and clarity." },
    { rulesetId: ruleset.id, name: "Common", type: "Common", description: "The most widely spoken language in the world, used for trade and diplomacy." },
    { rulesetId: ruleset.id, name: "Draconic", type: "Exotic", description: "The language of dragons, known for its complex grammar and rich vocabulary." },
    { rulesetId: ruleset.id, name: "Druidic", type: "Exotic", description: "The language of druids" },
    { rulesetId: ruleset.id, name: "Dwarven", type: "Common", description: "The language of dwarves, known for its complex grammar and rich vocabulary for stone and metal." },
    { rulesetId: ruleset.id, name: "Elven", type: "Common", description: "A flowing, melodic language spoken by elves, known for its beauty and precision." },
    { rulesetId: ruleset.id, name: "Giant", type: "Common", description: "A harsh, guttural language spoken by giants and their kin." },
    { rulesetId: ruleset.id, name: "Gnome", type: "Common", description: "A language full of technical terms and complex concepts, reflecting the gnomes' inventive nature." },
    { rulesetId: ruleset.id, name: "Goblin", type: "Common", description: "A crude language spoken by goblins and related creatures." },
    { rulesetId: ruleset.id, name: "Gnoll", type: "Exotic", description: "The language of gnoll" },
    { rulesetId: ruleset.id, name: "Halfling", type: "Common", description: "A simple, practical language spoken by halflings." },
    { rulesetId: ruleset.id, name: "Ignan", type: "Exotic", description: "The language of the Ignan" },
    { rulesetId: ruleset.id, name: "Infernal", type: "Exotic", description: "The language of devils, known for its complex legal terminology." },
    { rulesetId: ruleset.id, name: "Orc", type: "Common", description: "A brutal, aggressive language spoken by orcs and their kin." },
    { rulesetId: ruleset.id, name: "Sylvan", type: "Exotic", description: "The language of fey creatures, known for its musical quality." },
    { rulesetId: ruleset.id, name: "Terran", type: "Exotic", description: "The language of the Terran" },
    { rulesetId: ruleset.id, name: "Undercommon", type: "Exotic", description: "A trade language spoken in the Underdark, derived from Elven." },
  ]);
}
