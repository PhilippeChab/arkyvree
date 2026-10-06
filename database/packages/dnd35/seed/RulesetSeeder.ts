import { and, eq, isNull } from "drizzle-orm";

import type {
  BondContent,
  BookContent,
  CoreContent,
  DomainDefinition,
} from "@/database/packages/dnd35/content/types.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { BaseSeeder, type SeedContext } from "@/database/packages/dnd35/seed/BaseSeeder.ts";
import { CopiesOnWrite } from "@/database/packages/dnd35/seed/concerns/CopiesOnWrite.ts";
import { SeedsAptitudes } from "@/database/packages/dnd35/seed/concerns/SeedsAptitudes.ts";
import { SeedsClasses } from "@/database/packages/dnd35/seed/concerns/SeedsClasses.ts";
import { SeedsCoreRules } from "@/database/packages/dnd35/seed/concerns/SeedsCoreRules.ts";
import { SeedsFeats } from "@/database/packages/dnd35/seed/concerns/SeedsFeats.ts";
import { SeedsItems } from "@/database/packages/dnd35/seed/concerns/SeedsItems.ts";
import { SeedsPowers } from "@/database/packages/dnd35/seed/concerns/SeedsPowers.ts";
import { SeedsRaces } from "@/database/packages/dnd35/seed/concerns/SeedsRaces.ts";
import { SeedsWizardSchools } from "@/database/packages/dnd35/seed/concerns/SeedsWizardSchools.ts";
import {
  abilitiesInRules,
  aptitudesInRules,
  featsInRules,
  powersAptitudesInRules,
  powersInRules,
  rulesetExtensionsInRules,
  rulesetsInRules,
  savesInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { include } from "@/server/mixins.ts";
import type { BaseRules } from "@/shared/enums.ts";
import { stripSeparators } from "@/shared/text.ts";

/**
 * Seeds a ruleset, step by step: a step that writes one kind of row is a concern (`concerns/`), and the steps made of
 * others are its own. Each names the rows the steps before it seeded by their ids in its context. It holds no content:
 * the core rules' package gives `seedCore` theirs, an extension's package gives `seedBook` its book.
 */
export class RulesetSeeder extends include(
  BaseSeeder,
  CopiesOnWrite,
  SeedsAptitudes,
  SeedsClasses,
  SeedsCoreRules,
  SeedsFeats,
  SeedsItems,
  SeedsPowers,
  SeedsRaces,
  SeedsWizardSchools,
) {
  /** A seeder of a new core ruleset, published and of the system, whose rows it names as it seeds them. */
  static async createCore(db: Db, ruleset: { name: string; description: string }) {
    return RulesetSeeder.forRuleset(db, await RulesetSeeder.createSystemRuleset(db, ruleset));
  }

  /**
   * A seeder of a new extension of the core rules (or of `base`'s ruleset): it names the base's rows, in maps of its own
   * that leave the base's as they are, and has no powers of its own yet, its base's (and those its base inherits) being
   * the ones it copies before changing them (`inheritedPowerMap`).
   */
  static async createExtension(db: Db, ruleset: { name: string; description: string }, base?: SeedContext) {
    const from = base ?? (await RulesetSeeder.loadContext(db, await RulesetSeeder.findCoreRulesetId(db, ruleset.name)));
    const { powerMap, inheritedPowerMap, ...names } = structuredClone(from);
    return new RulesetSeeder(db, {
      ...names,
      rulesetId: await RulesetSeeder.createSystemRuleset(db, ruleset, from.rulesetId),
      powerMap: {},
      inheritedPowerMap: { ...inheritedPowerMap, ...powerMap },
    });
  }

  /** The seeded core rules' id, which `neededBy` (the step that needs them) can't do without. */
  static async findCoreRulesetId(db: Db, neededBy: string): Promise<string> {
    const [core] = await db
      .select({ id: rulesetsInRules.id })
      .from(rulesetsInRules)
      .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
    if (!core) throw new Error(`${neededBy} needs ${DND35_RULESET_NAME}, which isn't seeded`);
    return core.id;
  }

  /** A seeder of the ruleset, naming none of its rows: what a step needs no names for (items) or names as it goes. */
  static forRuleset(db: Db, rulesetId: string) {
    return new RulesetSeeder(db, {
      rulesetId,
      abilityMap: {},
      saveMap: {},
      skillMap: {},
      aptMap: {},
      featMap: {},
      powerMap: {},
      inheritedPowerMap: {},
    });
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
      BaseSeeder.idsByName(
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

  /** Creates a published system ruleset, the core rules or an extension of `baseId`, and returns its id. */
  private static async createSystemRuleset(db: Db, ruleset: { name: string; description: string }, baseId?: string) {
    const baseRules: BaseRules = "Dungeons & Dragons: 3.5";
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

  /** Seeds a kind of bonded creature: its aptitudes, feats, races and class. */
  async seedBond(bond: BondContent) {
    await this.seedAptitudes(bond.aptitudes);
    await this.seedFeats(bond.feats);
    await this.seedRaces(bond.races, bond.kind);
    await this.seedClass(bond.klass);
  }

  /**
   * Seeds an extension's book. Its content names the core's rows as a fork does: it adds only the aptitudes the core
   * lacks, and copies the core feats and spells it changes. Its domains open their spell levels at the core cleric's
   * (`clericSpellLevels`).
   */
  async seedBook(book: BookContent, clericSpellLevels: Record<number, number>) {
    await this.seedAptitudes(book.aptitudes.filter((name) => !this.ctx.aptMap[name]));
    await this.seedFeats(book.standaloneFeats);
    await this.seedFeats(book.classFeats);
    await this.cowFeatsIntoExtension(book.cowFeats);
    await this.seedPowers(book.spells);
    await this.cowSpellsIntoExtension(book.cowSpells);
    await this.seedDomains(book.domains, clericSpellLevels);
    for (const klass of book.classes) await this.seedClass(klass);
  }

  /** Seeds the core rules: the SRD's content, and the hand-written core content and bonded creatures. */
  async seedCore(core: CoreContent) {
    await this.seedAptitudes(core.aptitudes);
    await this.seedLanguages(core.languages);
    await this.seedRaces(core.races);
    await this.seedAbilities(core.abilities);
    await this.seedSkills(core.skills);
    await this.seedSaves(core.saves);
    await this.seedFeats(core.feats);
    for (const klass of core.classes) await this.seedClass(klass);

    // The templates first, a magic one among them (elven chain): the other items are made from them
    const templates = await this.seedItems([...core.templateItems, ...core.items.filter((item) => item.isTemplate)], {
      isTemplate: true,
    });
    await this.seedItems(
      core.items.filter((item) => !item.isTemplate),
      { templateMap: templates },
    );

    await this.seedPowers(core.spells);
    await this.seedWizardSchools(core.wizardSchools, core.wizardSpellLevels);
    await this.seedDomains(core.domains, core.clericSpellLevels);
    for (const bond of core.bonds) await this.seedBond(bond);
  }

  /**
   * Seeds cleric domains: each a feat taken in Cleric Domain that gives its spell list ("X Domain Spells") a slot at
   * each spell level, once the cleric casts that level (`clericSpellLevels`), and joins it to the cleric's list, plus
   * the domain's own modifiers.
   */
  async seedDomains(domains: DomainDefinition[], clericSpellLevels: Record<number, number>) {
    if (domains.length === 0) return;

    await this.seedAptitudes(domains.map((d) => `${d.name} Domain Spells`));
    await this.seedFeats(
      domains.map((d) => ({ name: `${d.name} Domain`, description: d.description, aptitudes: ["Cleric Domain"] })),
    );
    await this.insertGatedSpellSlots(
      domains.flatMap((d) => {
        const featId = this.ctx.featMap[`${d.name} Domain`];
        const list = `${stripSeparators(d.name)}domainspells`;
        return [
          ...this.spellListSlots(featId, "feats", list),
          this.joinsClassList(featId, "feats", list),
          ...this.modifierRows(featId, "feats", d.modifiers),
        ];
      }),
      "classes.cleric.level",
      clericSpellLevels,
    );

    const links = [];
    for (const d of domains) {
      for (const spell of d.spells) {
        const powerId = await this.ownPower(spell.name);
        if (!powerId) {
          console.warn(`[domain seed] Domain spell not found in DB: "${spell.name}" (${d.name} Domain)`);
          continue;
        }
        links.push({ powerId, aptitudeId: this.ctx.aptMap[`${d.name} Domain Spells`], level: spell.level });
      }
    }
    await this.insertAll(
      powersAptitudesInRules,
      this.uniqueBy(links, (l) => `${l.powerId}:${l.aptitudeId}`),
    );
  }
}
