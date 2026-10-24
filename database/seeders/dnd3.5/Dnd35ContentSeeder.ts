import type { BookContent, CoreContent } from "@/content/dnd3.5/builders/rulesets/types.ts";
import { ContentSeeder } from "@/database/seeders/core/ContentSeeder.ts";
import type { Ids, SeedContext } from "@/database/seeders/core/SeederState.ts";
import type { Db } from "@/drizzle/database.ts";

/**
 * The 3.5 ruleset a seed writes to, and the ids of the rows its content names. Seeding aptitudes, feats or spells adds
 * them, so the steps after can name them.
 */
export interface Dnd35SeedContext extends SeedContext {
  abilityMap: Ids;
  /** Its aptitudes and its base ruleset's. */
  aptMap: Ids;
  /** Its feats and its base ruleset's, its own under a name they share. */
  featMap: Ids;
  /** Its base ruleset's spells, which it copies before adding them to a spell list (`cowSpell`). */
  inheritedSpellMap: Ids;
  saveMap: Ids;
  skillMap: Ids;
  /** Its own spells. */
  spellMap: Ids;
}

/**
 * A content seeder of the 3.5 content (the core rules' `CoreContent`, an extension's `BookContent`), which names its
 * rows in 3.5's context (`Dnd35SeedContext`): a new ruleset's names none, an extension's its base's, and has no spells
 * of its own yet, its base's (and those its base inherits) being the ones it copies before changing them.
 */
export abstract class Dnd35ContentSeeder extends ContentSeeder<CoreContent, BookContent> {
  constructor(
    db: Db,
    override readonly ctx: Dnd35SeedContext,
  ) {
    super(db, ctx);
  }

  /** A context of the ruleset naming none of its rows: what a step needs no names for (items) or names as it goes. */
  static override emptyContext(rulesetId: string): Dnd35SeedContext {
    return {
      rulesetId,
      abilityMap: {},
      saveMap: {},
      skillMap: {},
      aptMap: {},
      featMap: {},
      spellMap: {},
      inheritedSpellMap: {},
    };
  }

  /**
   * An extension's context (`rulesetId`): its base's names (`base`), in maps of its own that leave the base's as they
   * are, and no spells of its own yet, its base's (and those its base inherits) being the ones it copies before changing
   * them (`inheritedSpellMap`).
   */
  static override extensionContext(base: Dnd35SeedContext, rulesetId: string): Dnd35SeedContext {
    const { spellMap, inheritedSpellMap, ...names } = structuredClone(base);
    return { ...names, rulesetId, spellMap: {}, inheritedSpellMap: { ...inheritedSpellMap, ...spellMap } };
  }

  /** The context of a seeded ruleset: the ids of its unarchived rows. */
  static override async loadContext(db: Db, rulesetId: string): Promise<Dnd35SeedContext> {
    // One after the other: a transaction runs one query at a time.
    return {
      rulesetId,
      abilityMap: await this.namesOf(db, rulesetId, "abilities"),
      saveMap: await this.namesOf(db, rulesetId, "saves"),
      skillMap: await this.namesOf(db, rulesetId, "skills"),
      aptMap: await this.namesOf(db, rulesetId, "aptitudes"),
      featMap: await this.namesOf(db, rulesetId, "feats"),
      spellMap: await this.namesOf(db, rulesetId, "spells"),
      inheritedSpellMap: {},
    };
  }
}
