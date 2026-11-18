import type { ItemSeed } from "@/content/core/builders/items/types.ts";
import type { BookContent, CoreContent } from "@/content/dnd3.5/builders/rulesets/types.ts";
import { ContentSeeder } from "@/database/seeders/core/ContentSeeder.ts";
import { EntityLinks, type Ids, type SeedContext } from "@/database/seeders/core/SeederState.ts";
import type { Db } from "@/drizzle/database.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";
import { ITEM_TYPE } from "@/vocabulary/dnd3.5/fields/index.ts";
import { TEMPLATE_ITEM_TYPES } from "@/vocabulary/dnd3.5/itemTemplates.ts";

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
    super(db, DND35_BASE_RULES, ctx);
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

  /** The context of a seeded ruleset: the ids of its rows. */
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

  /**
   * Refuses an item made from a template of another type than its own, or of a type no template is of (a weapon's, an
   * armor's or a shield's), as an item's form's save does.
   */
  protected override checkMadeFrom(item: ItemSeed, template: ItemSeed) {
    const [type, templateType] = [item.fields[ITEM_TYPE], template.fields[ITEM_TYPE]];
    if (templateType !== type || !isOneOf(type, TEMPLATE_ITEM_TYPES)) {
      throw new Error(
        `${item.name}: item type ${String(type ?? "None")} can't be based on the ${String(templateType ?? "None")} template "${template.name}"`,
      );
    }
  }

  /**
   * Inserts feats' or spells' links to the aptitudes they're listed in (`type`, `listings`: each its `listedIn` link,
   * from its entity, `fromId`, to its aptitude, `toId`, and, a spell's, at its level there, `tier`).
   */
  protected async insertListings(
    type: "feats" | "spells",
    listings: { fromId: string; tier?: number | null; toId: string }[],
  ) {
    await this.insertLinks(
      listings.map(({ fromId, tier, toId }) => ({
        role: "listedIn",
        fromId,
        fromType: type,
        toId,
        toType: "aptitudes",
        tier: tier ?? null,
      })),
    );
  }

  /**
   * Brings feats' lists (`lists`: each feat, `fromId`, with the aptitudes it's listed in, `toIds`, in the order a seed
   * lists them) to what's given: the links it lacks added, and each link's place (`ordinal`) the aptitude's in
   * `toIds`, as a seed writes them. What an update does once the content lists feats in more aptitudes; it adds only
   * what's missing and moves only what's out of place, so it's safe to run again.
   */
  protected async syncListings(lists: { fromId: string; toIds: string[] }[]) {
    const fromIds = lists.map(({ fromId }) => fromId);
    const listed = (await EntityLinks.findMany(this.db, { fromIds, role: "listedIn" })).filter(
      ({ toType }) => toType === "aptitudes",
    );
    const has = new Set(listed.map(({ fromId, toId }) => `${fromId}:${toId}`));
    await this.insertListings(
      "feats",
      lists.flatMap(({ fromId, toIds }) =>
        toIds.filter((toId) => !has.has(`${fromId}:${toId}`)).map((toId) => ({ fromId, toId })),
      ),
    );
    const links = (await EntityLinks.findMany(this.db, { fromIds, role: "listedIn" })).filter(
      ({ toType }) => toType === "aptitudes",
    );
    const place = new Map(lists.flatMap(({ fromId, toIds }) => toIds.map((toId, i) => [`${fromId}:${toId}`, i])));
    await EntityLinks.setOrdinals(
      this.db,
      links.flatMap(({ fromId, id, ordinal, toId }) => {
        const wanted = place.get(`${fromId}:${toId}`);
        return wanted === undefined || wanted === ordinal ? [] : [{ id, ordinal: wanted }];
      }),
    );
  }
}
