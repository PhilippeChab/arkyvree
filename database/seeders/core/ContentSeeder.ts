import { and, eq, isNull } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import type {
  Modifier,
  ModifierSeed,
  Property,
  RequirementEntry,
} from "@/content/core/builders/customization/types.ts";
import type { CorePackageDefinition } from "@/content/core/builders/packages/types.ts";
import {
  abilitiesInRules,
  aptitudesInRules,
  entitySnapshotsInRules,
  featsInRules,
  modifiersInCustomization,
  powersInRules,
  propertiesInCustomization,
  requirementsInCustomization,
  rulesetExtensionsInRules,
  rulesetsInRules,
  savesInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

type Ids = Record<string, string>;

type ModifierRow = typeof modifiersInCustomization.$inferInsert;
type PropertyRow = typeof propertiesInCustomization.$inferInsert;
type RequirementRow = typeof requirementsInCustomization.$inferInsert;

/** A ruleset's seeder class, which `createCore` and `createExtension` make one of: a concrete `ContentSeeder`. */
type SeederOf<S> = new (db: Db, ctx: SeedContext) => S;

/**
 * The ruleset a seed writes to, and the ids of the rows its content names. Seeding aptitudes, feats or
 * powers adds them, so the steps after can name them.
 */
export type SeedContext = {
  abilityMap: Ids;
  /** Its aptitudes and its base ruleset's. */
  aptMap: Ids;
  /** Its feats and its base ruleset's, its own under a name they share. */
  featMap: Ids;
  /** Its base ruleset's powers, which it copies before adding them to a spell list (`cowPower`). */
  inheritedPowerMap: Ids;
  /** Its own powers. */
  powerMap: Ids;
  rulesetId: string;
  saveMap: Ids;
  skillMap: Ids;
};

/**
 * A content package's seeder, any ruleset's: the database it writes to, the context it names rows by (`ctx`, its
 * ruleset's id and the ids its steps add), and what every ruleset's steps write with: the customizations' rows and
 * their inserts, the copies an extension makes of what it changes, and the system rulesets a package creates
 * (`createCore`, `createExtension`), the core one found by its package (`findCoreRulesetId`). A ruleset's seeder
 * extends it with its steps, and seeds what its packages give it: the core rules' content (`Core`, `seedCore`) and an
 * extension's book (`Book`, `seedExtension`), which its entry in the registry (`database/packages/registry.ts`) hands
 * it.
 */
export abstract class ContentSeeder<Core = unknown, Book = unknown> {
  constructor(
    readonly db: Db,
    readonly ctx: SeedContext,
  ) {}

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

  /** Ids by name. */
  static idsByName(rows: { id: string; name: string }[]): Ids {
    return Object.fromEntries(rows.map((row) => [row.name, row.id]));
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
      ContentSeeder.idsByName(
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

  /** Copies an entity's requirements onto its copy. */
  private async copyRequirements(fromId: string, toId: string) {
    const rows = await this.db
      .select()
      .from(requirementsInCustomization)
      .where(eq(requirementsInCustomization.entityId, fromId));
    await this.insertAll(
      requirementsInCustomization,
      rows.map(({ entityType, level, target, operator, value, valueType, chainingOperator }) => ({
        entityId: toId,
        entityType,
        level,
        target,
        operator,
        value,
        valueType,
        chainingOperator,
      })),
    );
  }

  /** The id of a row the content names, or an error that says which. */
  protected idOf(ids: Ids, name: string, what: string): string {
    const id = ids[name];
    if (!id) throw new Error(`${what}: "${name}" isn't seeded`);
    return id;
  }

  /** A source's modifiers as rows. */
  protected modifierRows(
    sourceId: string,
    sourceType: string,
    modifiers: (Modifier | ModifierSeed)[] = [],
  ): ModifierRow[] {
    return modifiers.map(({ target, operator, value, valueType }) => ({
      sourceId,
      sourceType,
      target,
      operator,
      value,
      valueType,
    }));
  }

  /** An entity's properties as rows. */
  protected propertyRows(entityId: string, entityType: string, properties: Property[] = []): PropertyRow[] {
    return properties.map(({ type, value }) => ({ entityId, entityType, type, value }));
  }

  /** An entity's requirements as rows: each numbered by its place in the tree ("1", "2", "2.1"…). */
  protected requirementRows(entityId: string, entityType: string, entries: RequirementEntry[] = []): RequirementRow[] {
    const rows: RequirementRow[] = [];
    const walk = (list: RequirementEntry[], parent?: string) => {
      for (const [i, entry] of list.entries()) {
        const level = parent ? `${parent}.${i + 1}` : String(i + 1);
        if ("chainingOperator" in entry) {
          rows.push({ entityId, entityType, level, chainingOperator: entry.chainingOperator });
          walk(entry.children, level);
        } else {
          rows.push({ entityId, entityType, level, ...entry });
        }
      }
    };
    walk(entries);
    return rows;
  }

  /** The rows without the repeats: the first of each key. */
  protected uniqueBy<T>(rows: T[], key: (row: T) => string): T[] {
    const seen = new Set<string>();
    return rows.filter((row) => !seen.has(key(row)) && seen.add(key(row)));
  }

  /** Copies an entity's requirements, modifiers (with theirs) and properties onto its copy. */
  protected async copyCustomizations(fromId: string, toId: string) {
    await this.copyRequirements(fromId, toId);
    for (const modifier of await this.db
      .select()
      .from(modifiersInCustomization)
      .where(eq(modifiersInCustomization.sourceId, fromId))) {
      const { sourceType, target, value, valueType, operator } = modifier;
      const [copy] = await this.db
        .insert(modifiersInCustomization)
        .values({ sourceId: toId, sourceType, target, value, valueType, operator })
        .returning({ id: modifiersInCustomization.id });
      await this.copyRequirements(modifier.id, copy.id);
    }
    const properties = await this.db
      .select()
      .from(propertiesInCustomization)
      .where(eq(propertiesInCustomization.entityId, fromId));
    await this.insertAll(
      propertiesInCustomization,
      properties.map(({ entityType, type, value, description }) => ({
        entityId: toId,
        entityType,
        type,
        value,
        description,
      })),
    );
  }

  /** Inserts the rows, if there are any. */
  protected async insertAll<T extends PgTable>(table: T, rows: T["$inferInsert"][]) {
    if (rows.length > 0) await this.db.insert(table).values(rows);
  }

  /**
   * Modifiers with their sources: the ones without requirements in one insert, and each one with requirements alone,
   * its requirements as rows of it.
   */
  protected async insertModifiers(sourceType: string, modifiers: { modifier: ModifierSeed; sourceId: string }[]) {
    const plain = modifiers.filter(({ modifier }) => !modifier.requirements?.length);
    await this.insertAll(
      modifiersInCustomization,
      plain.flatMap(({ sourceId, modifier }) => this.modifierRows(sourceId, sourceType, [modifier])),
    );
    for (const { sourceId, modifier } of modifiers.filter(({ modifier }) => modifier.requirements?.length)) {
      const [row] = await this.db
        .insert(modifiersInCustomization)
        .values(this.modifierRows(sourceId, sourceType, [modifier]))
        .returning({ id: modifiersInCustomization.id });
      await this.insertAll(
        requirementsInCustomization,
        this.requirementRows(row.id, "modifiers", modifier.requirements),
      );
    }
  }

  /** Records a copy in `entity_snapshots`, so the ruleset shows it in place of the original. */
  protected async recordCopy(entityType: string, sourceEntityId: string, forkedEntityId: string) {
    await this.db.insert(entitySnapshotsInRules).values({
      rulesetId: this.ctx.rulesetId,
      entityType,
      sourceEntityId,
      forkedEntityId,
    });
  }
}
