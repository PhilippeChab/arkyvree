import { and, eq, inArray } from "drizzle-orm";

import type { FeatSeed } from "@/content/dnd5/builders/feats/types.ts";
import type { Dnd5ItemSeed } from "@/content/dnd5/builders/items/types.ts";
import type { BookContent, CoreContent } from "@/content/dnd5/builders/rulesets/types.ts";
import { Entities, type Ids } from "@/database/seeders/core/SeederState.ts";
import { modifiersInCustomization, requirementsInCustomization } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import { FEAT_MARTIAL_ARTS, FEAT_WEAPON_MASTERY } from "@/vocabulary/dnd5/fields/index.ts";

import { BaseSeeder } from "./BaseSeeder.ts";
import { SeedsBackgrounds } from "./concerns/SeedsBackgrounds.ts";
import { SeedsClasses } from "./concerns/SeedsClasses.ts";
import { SeedsSkills } from "./concerns/SeedsSkills.ts";
import { SeedsSpecies } from "./concerns/SeedsSpecies.ts";
import { SeedsSpells } from "./concerns/SeedsSpells.ts";

/**
 * The targets a feat's modifier set before a weapon's proficiency, an armor's or the Shield's training, a mastery and
 * Martial Arts' Dexterity were an item's requirements and a feat's fields: what the core rules' v2 removes.
 */
const SETTLED_TARGET = /^items\.weapons\.[^.]+\.(proficient|mastered|finesse)$|^combat\.armortraining\./;

/** The feat fields a weapon rule is (Weapon Mastery's weapon, Martial Arts' flag), which the core rules' v2 writes. */
const WEAPON_RULE_FIELDS = [FEAT_WEAPON_MASTERY, FEAT_MARTIAL_ARTS] as const;

/**
 * Seeds a D&D 5th Edition ruleset, step by step: a step that writes one kind of row is a concern, every ruleset's
 * (`ContentSeeder`'s: items) or its own (`concerns/`: aptitudes, abilities, saves and languages, feats, skills,
 * species, backgrounds, classes, spells), and the steps made of others are its own. Each names the rows the steps
 * before it seeded by their ids in its context. It holds no content: the core rules' package gives `seedCore` theirs,
 * an extension's package gives `seedExtension` its book.
 */
export class RulesetSeeder extends include(
  BaseSeeder,
  SeedsBackgrounds,
  SeedsClasses,
  SeedsSkills,
  SeedsSpecies,
  SeedsSpells,
) {
  /**
   * Seeds the core rules: the SRD's content and the hand-written core content. The skills come before the classes,
   * whose skill picks list their Skill Proficiency feats, and the feats before the species, backgrounds and classes
   * whose links and grants name them.
   */
  override async seedCore(core: CoreContent) {
    await this.seedAptitudes(core.aptitudes);
    await this.seedLanguages(core.languages);
    await this.seedAbilities(core.abilities);
    await this.seedSkills(core.skills);
    await this.seedSaves(core.saves);
    await this.seedFeats(core.feats);
    await this.seedSpecies(core.species);
    await this.seedBackgrounds(core.backgrounds);
    for (const klass of core.classes) await this.seedClass(klass);

    // The items others are made from, and the others, which name them
    await this.seedItems("items", [...core.templateItems, ...core.items]);

    await this.seedSpells(core.spells);
  }

  /**
   * Seeds an extension's book. Its content names the core's rows as a fork does: it adds only the aptitudes the core
   * lacks. The SRD's package registers no extension yet: this is the contract's path an extension's package will take.
   */
  override async seedExtension(book: BookContent, _core: CoreContent) {
    await this.seedAptitudes(book.aptitudes.filter((name) => !this.ctx.aptMap[name]));
    await this.seedFeats(book.standaloneFeats);
    await this.seedFeats(book.classFeats);
    await this.seedSpells(book.spells);
    await this.seedSpecies(book.species);
    await this.seedBackgrounds(book.backgrounds);
    for (const klass of book.classes) await this.seedClass(klass);
  }

  /**
   * Deletes the modifiers of feats (`featIds`) whose targets a weapon rule settles now (`SETTLED_TARGET`), with their
   * own requirements: their name bindings go with them.
   */
  private async dropSettledModifiers(featIds: string[]) {
    if (featIds.length === 0) return;
    const modifiers = await this.db
      .select({ id: modifiersInCustomization.id, target: modifiersInCustomization.target })
      .from(modifiersInCustomization)
      .where(
        and(eq(modifiersInCustomization.sourceType, "feats"), inArray(modifiersInCustomization.sourceId, featIds)),
      );
    const ids = modifiers.filter(({ target }) => SETTLED_TARGET.test(target)).map(({ id }) => id);
    if (ids.length === 0) return;
    await this.db
      .delete(requirementsInCustomization)
      .where(
        and(
          eq(requirementsInCustomization.entityType, "modifiers"),
          inArray(requirementsInCustomization.entityId, ids),
        ),
      );
    await this.db.delete(modifiersInCustomization).where(inArray(modifiersInCustomization.id, ids));
  }

  /** Gives each item (`items`: its id and its content's requirements) its requirements, when it has none yet. */
  private async requireProficiency(items: { id: string; requirements: Dnd5ItemSeed["requirements"] }[]) {
    const required = items.filter(({ requirements }) => (requirements ?? []).length > 0);
    if (required.length === 0) return;
    const held = await this.db
      .select({ entityId: requirementsInCustomization.entityId })
      .from(requirementsInCustomization)
      .where(
        inArray(
          requirementsInCustomization.entityId,
          required.map(({ id }) => id),
        ),
      );
    const has = new Set(held.map(({ entityId }) => entityId));
    await this.insertAll(
      requirementsInCustomization,
      required
        .filter(({ id }) => !has.has(id))
        .flatMap(({ id, requirements }) => this.requirementRows(id, "items", requirements)),
    );
  }

  /**
   * The ruleset's entities of a kind (`type`) its content names (`seeds`, by name: `ids`), each with its seed, and the
   * forks' copies of them, each with its source's seed.
   */
  private async withForkCopies<S extends { name: string }>(type: string, seeds: S[], ids: Ids) {
    const own = seeds.filter(({ name }) => ids[name]).map((seed) => ({ id: ids[seed.name], seed }));
    const seedOf = new Map(own.map(({ id, seed }) => [id, seed]));
    const copies = (await this.findForkCopies(type)).flatMap(({ copyId, sourceId }) => {
      const seed = seedOf.get(sourceId);
      return seed ? [{ id: copyId, seed }] : [];
    });
    return [...own, ...copies];
  }

  /** Writes each feat's (`feats`: its id and its content's fields) weapon rule fields its content gives, when they differ. */
  private async writeWeaponRuleFields(feats: { fields: FeatSeed["fields"]; id: string }[]) {
    const given = feats.filter(({ fields }) => WEAPON_RULE_FIELDS.some((field) => fields?.[field] !== undefined));
    if (given.length === 0) return;
    const records = new Map(
      (await Entities.findMany(this.db, { entityType: "feats", ids: given.map(({ id }) => id) })).map((record) => [
        record.id,
        record,
      ]),
    );
    for (const { fields, id } of given) {
      const write: Record<string, boolean | string> = {};
      for (const field of WEAPON_RULE_FIELDS) {
        const value = fields?.[field];
        if (value !== undefined && records.get(id)?.fields[field] !== value) write[field] = value;
      }
      if (Object.keys(write).length > 0)
        await Entities.update(this.db, this.baseRules, "feats", { fields: write }, { id });
    }
  }

  /**
   * Brings the seeded core rules up to their content (`core`) since v1, where a weapon's proficiency, an armor's and
   * the Shield's training, a mastery and Martial Arts' Dexterity work as 3.5's do: each template gets its requirements
   * (a weapon's proficiency feats, an armor's training), each feat its weapon rule fields (Weapon Mastery's weapon,
   * Martial Arts' flag), and the feats' modifiers that set them before go; and so do the forks' own copies of them, a
   * copy its source's. An update of the core rules' package (`updates.ts`); each step changes only what differs, so
   * it's safe to run again.
   */
  async updateCore(core: CoreContent) {
    const itemIds = await RulesetSeeder.namesOf(this.db, this.ctx.rulesetId, "items");
    const items = await this.withForkCopies("items", core.templateItems, itemIds);
    await this.requireProficiency(items.map(({ id, seed }) => ({ id, requirements: seed.requirements })));
    const feats = await this.withForkCopies("feats", core.feats, this.ctx.featMap);
    await this.writeWeaponRuleFields(feats.map(({ id, seed }) => ({ fields: seed.fields, id })));
    await this.dropSettledModifiers(feats.map(({ id }) => id));
  }
}
