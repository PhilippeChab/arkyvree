import type { BookContent, CoreContent } from "@/content/dnd5/builders/rulesets/types.ts";
import { include } from "@/lib/mixins.ts";

import { BaseSeeder } from "./BaseSeeder.ts";
import { SeedsBackgrounds } from "./concerns/SeedsBackgrounds.ts";
import { SeedsClasses } from "./concerns/SeedsClasses.ts";
import { SeedsSkills } from "./concerns/SeedsSkills.ts";
import { SeedsSpecies } from "./concerns/SeedsSpecies.ts";
import { SeedsSpells } from "./concerns/SeedsSpells.ts";
import { UpdatesWeaponRules } from "./concerns/UpdatesWeaponRules.ts";

/**
 * Seeds a D&D 5th Edition ruleset, step by step: a step that writes one kind of row is a concern, every ruleset's
 * (`ContentSeeder`'s: items) or its own (`concerns/`: aptitudes, abilities, saves and languages, feats, skills,
 * species, backgrounds, classes, spells, the core rules' v2 update), and the steps made of others are its own. Each names the rows the steps
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
  UpdatesWeaponRules,
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
   * Brings the seeded core rules up to their content (`core`) since v1, where a weapon's proficiency, an armor's and
   * the Shield's training and Martial Arts' Dexterity work as 3.5's proficiency and Weapon Finesse do: each template
   * gets its requirements (a weapon's proficiency feats, an armor's training), each feat its weapon rule field (Martial
   * Arts' flag), and the feats' modifiers that set them before go; and so do the forks' own copies of them, a copy its
   * source's (`UpdatesWeaponRules`). A mastery stays its feat's modifier. An update of the core rules' package
   * (`updates.ts`); each step adds only what's missing, so it's safe to run again.
   */
  async updateCore(core: CoreContent) {
    const itemIds = await RulesetSeeder.namesOf(this.db, this.ctx.rulesetId, "items");
    const items = await this.withForkCopies("items", core.templateItems, itemIds);
    await this.requireProficiency(items.map(({ id, seed }) => ({ id, requirements: seed.requirements })));
    const feats = await this.withForkCopies("feats", core.feats, this.ctx.featMap);
    await this.addWeaponRuleFields(feats.map(({ id, seed }) => ({ fields: seed.fields, id })));
    await this.dropSettledModifiers(feats.map(({ id }) => id));
  }
}
