import { and, eq, isNull } from "drizzle-orm";

import type { CorePackageDefinition } from "@/content/core/builders/packages/types.ts";
import {
  abilitiesInRules,
  aptitudesInRules,
  featsInRules,
  powersInRules,
  rulesetExtensionsInRules,
  rulesetsInRules,
  savesInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import type { Db } from "@/server/database/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { CopiesOnWrite } from "./concerns/CopiesOnWrite.ts";
import { SeedsAptitudes } from "./concerns/SeedsAptitudes.ts";
import { SeedsCoreRules } from "./concerns/SeedsCoreRules.ts";
import { SeedsFeats } from "./concerns/SeedsFeats.ts";
import { SeedsItems } from "./concerns/SeedsItems.ts";
import { SeedsRaces } from "./concerns/SeedsRaces.ts";
import { type SeedContext, SeederState } from "./SeederState.ts";

/** A ruleset's seeder class, which `createCore` and `createExtension` make one of: a concrete `ContentSeeder`. */
type SeederOf<S> = new (db: Db, ctx: SeedContext) => S;

/**
 * A content package's seeder, any ruleset's: the contract a ruleset's seeder implements, on what every ruleset's
 * seeding runs on. That's its state (`SeederState`: its database and context, the customizations' rows and their
 * inserts), the steps that write the rows every ruleset's content seeds alike (`concerns/`: aptitudes, abilities, saves
 * and languages, feats, races, items, and the copies an extension makes of what it changes), and the system rulesets
 * its packages create (`createCore`, `createExtension`), the core one found by its package (`findCoreRulesetId`). A
 * ruleset's seeder extends it with its own steps, says which links a power's copy keeps (`copyPowerLinks`), and seeds
 * what its packages give it: the core rules' content (`Core`, `seedCore`) and an extension's book (`Book`,
 * `seedExtension`), which its row of the registry (`database/packages/registry.ts`) hands it.
 */
export abstract class ContentSeeder<Core = unknown, Book = unknown> extends include(
  SeederState,
  CopiesOnWrite,
  SeedsAptitudes,
  SeedsCoreRules,
  SeedsFeats,
  SeedsItems,
  SeedsRaces,
) {
  /** A context of the ruleset naming none of its rows: what a step needs no names for (items) or names as it goes. */
  private static contextOf(rulesetId: string): SeedContext {
    return {
      rulesetId,
      abilityMap: {},
      saveMap: {},
      skillMap: {},
      aptMap: {},
      featMap: {},
      powerMap: {},
      inheritedPowerMap: {},
    };
  }

  /** Creates a published system ruleset of `baseRules`, its core rules or an extension of `baseId`, and returns its id. */
  private static async createSystemRuleset(
    db: Db,
    baseRules: BaseRules,
    ruleset: { description: string; name: string },
    baseId?: string,
  ) {
    const [{ id }] = await db
      .insert(rulesetsInRules)
      .values({
        ...ruleset,
        status: "Published",
        baseRules,
        system: true,
        ...(baseId
          ? { kind: "extension" as const, rulesetId: baseId, ancestorRulesetIds: [baseId] }
          : { kind: "ruleset" as const }),
      })
      .returning({ id: rulesetsInRules.id });
    if (baseId) await db.insert(rulesetExtensionsInRules).values({ rulesetId: baseId, extensionId: id });
    return id;
  }

  /** A seeder of a new core ruleset of `baseRules`, published and of the system, whose rows it names as it seeds them. */
  static async createCore<S>(
    this: SeederOf<S>,
    db: Db,
    baseRules: BaseRules,
    ruleset: { description: string; name: string },
  ): Promise<S> {
    return new this(db, ContentSeeder.contextOf(await ContentSeeder.createSystemRuleset(db, baseRules, ruleset)));
  }

  /**
   * A seeder of a new extension of `base`'s ruleset (its context): it names the base's rows, in maps of its own that
   * leave the base's as they are, and has no powers of its own yet, its base's (and those its base inherits) being the
   * ones it copies before changing them (`inheritedPowerMap`).
   */
  static async createExtension<S>(
    this: SeederOf<S>,
    db: Db,
    baseRules: BaseRules,
    ruleset: { description: string; name: string },
    base: SeedContext,
  ): Promise<S> {
    const { powerMap, inheritedPowerMap, ...names } = structuredClone(base);
    return new this(db, {
      ...names,
      rulesetId: await ContentSeeder.createSystemRuleset(db, baseRules, ruleset, base.rulesetId),
      powerMap: {},
      inheritedPowerMap: { ...inheritedPowerMap, ...powerMap },
    });
  }

  /** The id of the core ruleset its package (`core`) seeds, which `neededBy` (the step that needs it) can't do without. */
  static async findCoreRulesetId(db: Db, core: CorePackageDefinition, neededBy: string): Promise<string> {
    const [ruleset] = await db
      .select({ id: rulesetsInRules.id })
      .from(rulesetsInRules)
      .where(eq(rulesetsInRules.name, core.ruleset.name));
    if (!ruleset) throw new Error(`${neededBy} needs ${core.ruleset.name}, which isn't seeded`);
    return ruleset.id;
  }

  /** The context of a seeded ruleset: the ids of its unarchived rows. */
  static async loadContext(db: Db, rulesetId: string): Promise<SeedContext> {
    // One after the other: a transaction runs one query at a time.
    const names = async (
      table:
        | typeof abilitiesInRules
        | typeof savesInRules
        | typeof skillsInRules
        | typeof aptitudesInRules
        | typeof featsInRules
        | typeof powersInRules,
    ) =>
      SeederState.idsByName(
        await db
          .select({ id: table.id, name: table.name })
          .from(table)
          .where(and(eq(table.rulesetId, rulesetId), isNull(table.deletedAt))),
      );
    return {
      rulesetId,
      abilityMap: await names(abilitiesInRules),
      saveMap: await names(savesInRules),
      skillMap: await names(skillsInRules),
      aptMap: await names(aptitudesInRules),
      featMap: await names(featsInRules),
      powerMap: await names(powersInRules),
      inheritedPowerMap: {},
    };
  }

  /** Seeds its ruleset, a core one, with the core rules' content its core package gives. */
  abstract seedCore(content: Core): Promise<void>;

  /** Seeds its ruleset, an extension of the core rules (`core`, their content), with the book its package gives. */
  abstract seedExtension(book: Book, core: Core): Promise<void>;
}
