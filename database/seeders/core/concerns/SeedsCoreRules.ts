import type { AbilitySeed } from "@/content/core/builders/abilities/types.ts";
import type { LanguageSeed } from "@/content/core/builders/languages/types.ts";
import type { SaveSeed } from "@/content/core/builders/saves/types.ts";
import { SeederState } from "@/database/seeders/core/SeederState.ts";
import { abilitiesInRules, languagesInRules, savesInRules } from "@/drizzle/schema.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { stripSeparators } from "@/shared/text.ts";

/** Seeding a base ruleset's own rules: its abilities, saves and languages. */
export function SeedsCoreRules<B extends Constructor<SeederState>>(Base: B) {
  abstract class SeedingCoreRules extends Base {
    /**
     * Refuses abilities a sheet couldn't tell apart, among themselves or from those the ruleset has: a character's sheet
     * and a target path know an ability by its slug (`abilities.forcepoints.misc`), so two names that share one ("Force
     * Points", "Force-Points") would be one ability's scores, and a name with none (no letter or digit of a-z, 0-9)
     * would have no path.
     */
    protected refuseSharedSlugs(abilities: AbilitySeed[]) {
      const namesBySlug = new Map(Object.keys(this.ctx.abilityMap).map((name) => [stripSeparators(name), name]));
      for (const { name } of abilities) {
        const slug = stripSeparators(name);
        if (!slug) throw new Error(`The ability ${name} has no slug: its name needs a letter or a digit of a-z, 0-9`);
        const other = namesBySlug.get(slug);
        if (other) throw new Error(`The abilities ${other} and ${name} share the slug ${slug}`);
        namesBySlug.set(slug, name);
      }
    }

    /** The abilities, each with a slug of its own (`refuseSharedSlugs`). */
    async seedAbilities(abilities: AbilitySeed[]) {
      this.refuseSharedSlugs(abilities);
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
