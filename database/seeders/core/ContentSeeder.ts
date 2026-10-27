import { and, eq } from "drizzle-orm";

import type { CorePackageDefinition } from "@/content/core/builders/packages/types.ts";
import type { Db } from "@/drizzle/database.ts";
import { entitiesInRules, rulesetsInRules } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { SeedsItems } from "./concerns/SeedsItems.ts";
import { type SeedContext, SeederState } from "./SeederState.ts";

/**
 * A ruleset's seeder class, which `createCore` and `createExtension` make one of: a concrete `ContentSeeder`, with the
 * contexts its rulesets' seeds start from (`emptyContext`, `extensionContext`).
 */
type SeederOf<S, C extends SeedContext> = (new (db: Db, ctx: C) => S) & {
  emptyContext(rulesetId: string): C;
  extensionContext(base: C, rulesetId: string): C;
};

/**
 * A content package's seeder, any ruleset's: the contract a ruleset's seeder implements, on what every ruleset's
 * seeding runs on. That's its state (`SeederState`: its database and context, the customizations' rows and their
 * inserts), the steps that write rows any ruleset's content seeds alike (`concerns/`: items), and the system rulesets
 * its packages create (`createCore`, `createExtension`), the core one found by its package (`findCoreRulesetId`). A
 * ruleset's seeder extends it with its own steps and the context they name its rows in (3.5's `Dnd35ContentSeeder`:
 * `emptyContext`, `extensionContext`, `loadContext`), and seeds what its packages give it: the core rules' content
 * (`Core`, `seedCore`) and an extension's book (`Book`, `seedExtension`), which its row of the registry
 * (`database/packages/registry.ts`) hands it.
 */
export abstract class ContentSeeder<Core = unknown, Book = unknown> extends include(SeederState, SeedsItems) {
  /**
   * Creates a published system ruleset of `baseRules`, its core rules or an extension of `baseId` (which a fork
   * subscribes to: the base itself subscribes to none), and returns its id.
   */
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
    return id;
  }

  /** The ids of a seeded ruleset's entities of a type, by name, in one query. */
  protected static async namesOf(db: Db, rulesetId: string, type: string) {
    return SeederState.idsByName(
      (await db
        .select({ id: entitiesInRules.id, name: entitiesInRules.name })
        .from(entitiesInRules)
        .where(and(eq(entitiesInRules.type, type), eq(entitiesInRules.rulesetId, rulesetId)))) as {
        id: string;
        name: string;
      }[],
    );
  }

  /** The context a new ruleset's seed starts from (`rulesetId`), naming none of its rows: its module's adds its own. */
  static emptyContext(rulesetId: string): SeedContext {
    return { rulesetId };
  }

  /** The context an extension's seed starts from (`rulesetId`), its base's (`base`): its module's adds its own. */
  static extensionContext(base: SeedContext, rulesetId: string): SeedContext {
    return { ...structuredClone(base), rulesetId };
  }

  /** A seeder of a new core ruleset of `baseRules`, published and of the system, whose rows it names as it seeds them. */
  static async createCore<S, C extends SeedContext>(
    this: SeederOf<S, C>,
    db: Db,
    baseRules: BaseRules,
    ruleset: { description: string; name: string },
  ): Promise<S> {
    return new this(db, this.emptyContext(await ContentSeeder.createSystemRuleset(db, baseRules, ruleset)));
  }

  /**
   * A seeder of a new extension of `base`'s ruleset (its context): it names the base's rows as its module's seeder
   * says (`extensionContext`), in a context of its own that leaves the base's as it is.
   */
  static async createExtension<S, C extends SeedContext>(
    this: SeederOf<S, C>,
    db: Db,
    baseRules: BaseRules,
    ruleset: { description: string; name: string },
    base: C,
  ): Promise<S> {
    return new this(
      db,
      this.extensionContext(base, await ContentSeeder.createSystemRuleset(db, baseRules, ruleset, base.rulesetId)),
    );
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

  /** The context of a seeded ruleset (`rulesetId`): its module's seeder names its rows. */
  static async loadContext(_db: Db, rulesetId: string): Promise<SeedContext> {
    return { rulesetId };
  }

  /** Seeds its ruleset, a core one, with the core rules' content its core package gives. */
  abstract seedCore(content: Core): Promise<void>;

  /** Seeds its ruleset, an extension of the core rules (`core`, their content), with the book its package gives. */
  abstract seedExtension(book: Book, core: Core): Promise<void>;
}
