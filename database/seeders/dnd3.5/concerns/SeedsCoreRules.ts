import type { AbilitySeed } from "@/content/dnd3.5/builders/abilities/types.ts";
import type { LanguageSeed } from "@/content/dnd3.5/builders/languages/types.ts";
import type { SaveSeed } from "@/content/dnd3.5/builders/saves/types.ts";
import type { Dnd35ContentSeeder } from "@/database/seeders/dnd3.5/Dnd35ContentSeeder.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { stripSeparators } from "@/shared/text.ts";

/** Seeding a base ruleset's own rules: its abilities, saves and languages. */
export function SeedsCoreRules<B extends Constructor<Dnd35ContentSeeder>>(Base: B) {
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
        await this.insertEntities(
          "abilities",
          abilities.map((ability) => ({ rulesetId: this.ctx.rulesetId, ...ability })),
        ),
      );
    }

    /** The languages, with their fields. */
    async seedLanguages(languages: LanguageSeed[]) {
      await this.insertEntities(
        "languages",
        languages.map(({ description, name, fields }) => ({
          rulesetId: this.ctx.rulesetId,
          name,
          description,
          fields,
        })),
      );
    }

    /** The saves, each with its ability (its `keyAbility` link). */
    async seedSaves(saves: SaveSeed[]) {
      Object.assign(
        this.ctx.saveMap,
        await this.insertEntities(
          "saves",
          saves.map(({ name, description, links }) => ({
            rulesetId: this.ctx.rulesetId,
            name,
            description,
            links: { keyAbility: this.idOf(this.ctx.abilityMap, links.keyAbility, `${name}'s key ability`) },
          })),
        ),
      );
    }
  }
  return SeedingCoreRules;
}
