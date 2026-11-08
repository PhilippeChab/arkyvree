import { DND35_CORE_PACKAGE } from "@/content/dnd3.5/packages/core.ts";
import { DND35_COMPLETE_ADVENTURER_PACKAGE } from "@/content/dnd3.5/packages/extensions/complete-adventurer.ts";
import { DND35_COMPLETE_ARCANE_PACKAGE } from "@/content/dnd3.5/packages/extensions/complete-arcane.ts";
import { DND35_COMPLETE_DIVINE_PACKAGE } from "@/content/dnd3.5/packages/extensions/complete-divine.ts";
import { DND35_COMPLETE_SCOUNDREL_PACKAGE } from "@/content/dnd3.5/packages/extensions/complete-scoundrel.ts";
import { DND35_COMPLETE_WARRIOR_PACKAGE } from "@/content/dnd3.5/packages/extensions/complete-warrior.ts";
import { DND35_DMG_PACKAGE } from "@/content/dnd3.5/packages/extensions/dmg.ts";
import { DND52_CORE_PACKAGE } from "@/content/dnd5.2/packages/core.ts";
import { PF1_CORE_PACKAGE } from "@/content/pf1/packages/core.ts";
import { seedTestCharacters as seedDnd35TestCharacters } from "@/database/seeders/dnd3.5/characters/seedTestCharacters.ts";
import { RulesetSeeder as Dnd35RulesetSeeder } from "@/database/seeders/dnd3.5/RulesetSeeder.ts";
import { seedTestCharacters as seedDnd52TestCharacters } from "@/database/seeders/dnd5.2/characters/seedTestCharacters.ts";
import { RulesetSeeder as Dnd52RulesetSeeder } from "@/database/seeders/dnd5.2/RulesetSeeder.ts";
import { seedTestCharacters as seedPf1TestCharacters } from "@/database/seeders/pf1/characters/seedTestCharacters.ts";
import { RulesetSeeder as Pf1RulesetSeeder } from "@/database/seeders/pf1/RulesetSeeder.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { listContentPackages } from "./contentPackages.ts";
import type { RulesetContent } from "./types.ts";

/**
 * Each base rules' content, the one way the runner and the dev and test seeds reach a ruleset's packages, seeder and
 * test characters: one `BASE_RULES_OPTIONS` gains has to be written here, or the database's code doesn't compile, and
 * its seeder is checked against the contract (`ContentSeeder`'s abstract members). A package's updates, which write,
 * are given here too (`updates`, by package name).
 */
export const RULESET_CONTENT = {
  "Dungeons & Dragons: 3.5": {
    core: DND35_CORE_PACKAGE,
    extensions: [
      DND35_COMPLETE_WARRIOR_PACKAGE,
      DND35_DMG_PACKAGE,
      DND35_COMPLETE_DIVINE_PACKAGE,
      DND35_COMPLETE_SCOUNDREL_PACKAGE,
      DND35_COMPLETE_ADVENTURER_PACKAGE,
      DND35_COMPLETE_ARCANE_PACKAGE,
    ],
    seedTestCharacters: seedDnd35TestCharacters,
    seeder: Dnd35RulesetSeeder,
  },
  "Pathfinder: 1": {
    core: PF1_CORE_PACKAGE,
    extensions: [],
    seedTestCharacters: seedPf1TestCharacters,
    seeder: Pf1RulesetSeeder,
  },
  "Dungeons & Dragons: 5.2": {
    core: DND52_CORE_PACKAGE,
    extensions: [],
    seedTestCharacters: seedDnd52TestCharacters,
    seeder: Dnd52RulesetSeeder,
  },
} satisfies Record<BaseRules, RulesetContent>;

/** The packages, in the order the runner applies them: each base rules' core rules first, then its extensions. */
export const CONTENT_PACKAGES = listContentPackages(RULESET_CONTENT);
