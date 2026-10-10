import type { AbilitySeed } from "@/content/core/builders/abilities/types.ts";
import type { LanguageSeed } from "@/content/core/builders/languages/types.ts";
import type { SaveSeed } from "@/content/core/builders/saves/types.ts";
import { SeederState } from "@/database/seeders/core/SeederState.ts";
import { abilitiesInRules, languagesInRules, savesInRules } from "@/drizzle/schema.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Seeding a base ruleset's own rules: its abilities, saves and languages. */
export function SeedsCoreRules<B extends Constructor<SeederState>>(Base: B) {
  abstract class SeedingCoreRules extends Base {
    /** The abilities. */
    async seedAbilities(abilities: AbilitySeed[]) {
      Object.assign(
        this.ctx.abilityMap,
        SeederState.idsByName(
          await this.db
            .insert(abilitiesInRules)
            .values(abilities.map((ability) => ({ rulesetId: this.ctx.rulesetId, ...ability })))
            .returning({ id: abilitiesInRules.id, name: abilitiesInRules.name }),
        ),
      );
    }

    /** The languages. */
    async seedLanguages(languages: LanguageSeed[]) {
      await this.db
        .insert(languagesInRules)
        .values(languages.map((language) => ({ rulesetId: this.ctx.rulesetId, ...language })));
    }

    /** The saves, each with its ability. */
    async seedSaves(saves: SaveSeed[]) {
      Object.assign(
        this.ctx.saveMap,
        SeederState.idsByName(
          await this.db
            .insert(savesInRules)
            .values(
              saves.map(({ name, description, ability }) => ({
                rulesetId: this.ctx.rulesetId,
                name,
                description,
                abilityId: this.ctx.abilityMap[ability],
              })),
            )
            .returning({ id: savesInRules.id, name: savesInRules.name }),
        ),
      );
    }
  }
  return SeedingCoreRules;
}
