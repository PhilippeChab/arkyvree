import { CLERIC_DOMAIN, domainFeat, domainSpells } from "@/content/dnd3.5/builders/aptitudes/names.ts";
import type { BondContent } from "@/content/dnd3.5/builders/bonds/types.ts";
import type { DomainSeed } from "@/content/dnd3.5/builders/domains/types.ts";
import type { BookContent, CoreContent } from "@/content/dnd3.5/builders/rulesets/types.ts";
import { powersAptitudesInRules } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import { stripSeparators } from "@/shared/text.ts";

import { BaseSeeder } from "./BaseSeeder.ts";
import { CopiesOnWrite } from "./concerns/CopiesOnWrite.ts";
import { SeedsAptitudes } from "./concerns/SeedsAptitudes.ts";
import { SeedsClasses } from "./concerns/SeedsClasses.ts";
import { SeedsCoreRules } from "./concerns/SeedsCoreRules.ts";
import { SeedsFeats } from "./concerns/SeedsFeats.ts";
import { SeedsItems } from "./concerns/SeedsItems.ts";
import { SeedsPowers } from "./concerns/SeedsPowers.ts";
import { SeedsRaces } from "./concerns/SeedsRaces.ts";
import { SeedsWizardSchools } from "./concerns/SeedsWizardSchools.ts";
import { findSpellcastingClass, type SpellcastingClass } from "./spellTable.ts";

/**
 * Seeds a 3.5 ruleset, step by step: a step that writes one kind of row is a concern (`concerns/`), and the steps made
 * of others are its own. Each names the rows the steps before it seeded by their ids in its context. It holds no
 * content: the core rules' package gives `seedCore` theirs, an extension's package gives `seedExtension` its book.
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
  /** Seeds the core rules: the SRD's content, and the hand-written core content and bonded creatures. */
  override async seedCore(core: CoreContent) {
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
    await this.seedWizardSchools(core.wizardSchools, findSpellcastingClass(core.classes, "Wizard"));
    await this.seedDomains(core.domains, findSpellcastingClass(core.classes, "Cleric"));
    for (const bond of core.bonds) await this.seedBond(bond);
  }

  /**
   * Seeds an extension's book. Its content names the core's rows as a fork does: it adds only the aptitudes the core
   * lacks, and copies the core feats and spells it changes. Its domains open their spell levels at the core cleric's
   * (of `core`'s classes).
   */
  override async seedExtension(book: BookContent, core: CoreContent) {
    await this.seedAptitudes(book.aptitudes.filter((name) => !this.ctx.aptMap[name]));
    await this.seedFeats(book.standaloneFeats);
    await this.seedFeats(book.classFeats);
    await this.cowFeatsIntoExtension(book.cowFeats);
    await this.seedPowers(book.spells);
    await this.cowSpellsIntoExtension(book.cowSpells);
    await this.seedDomains(book.domains, findSpellcastingClass(core.classes, "Cleric"));
    for (const klass of book.classes) await this.seedClass(klass);
  }

  /** Seeds a kind of bonded creature: its aptitudes, feats, races and class. */
  async seedBond(bond: BondContent) {
    await this.seedAptitudes(bond.aptitudes);
    await this.seedFeats(bond.feats);
    await this.seedRaces(bond.races, bond.kind);
    await this.seedClass(bond.klass);
  }

  /**
   * Seeds cleric domains: each a feat taken in Cleric Domain that gives its spell list ("X Domain Spells") a slot at
   * each spell level, once the cleric casts that level (`cleric`'s table), and joins it to the cleric's list, plus
   * the domain's own modifiers.
   */
  async seedDomains(domains: DomainSeed[], cleric: SpellcastingClass) {
    if (domains.length === 0) return;

    await this.seedAptitudes(domains.map((d) => domainSpells(d.name)));
    await this.seedFeats(
      domains.map((d) => ({ name: domainFeat(d.name), description: d.description, aptitudes: [CLERIC_DOMAIN] })),
    );
    await this.insertGatedSpellSlots(
      domains.flatMap((d) => {
        const featId = this.ctx.featMap[domainFeat(d.name)];
        const list = stripSeparators(domainSpells(d.name));
        return [
          ...this.spellListSlots(featId, "feats", list),
          this.joinsClassList(featId, "feats", list),
          ...this.modifierRows(featId, "feats", d.modifiers),
        ];
      }),
      cleric,
    );

    const links = [];
    for (const d of domains) {
      for (const spell of d.spells) {
        const powerId = await this.ownPower(spell.name);
        if (!powerId) {
          console.warn(`[domain seed] Domain spell not found in DB: "${spell.name}" (${domainFeat(d.name)})`);
          continue;
        }
        links.push({ powerId, aptitudeId: this.ctx.aptMap[domainSpells(d.name)], level: spell.level });
      }
    }
    await this.insertAll(
      powersAptitudesInRules,
      this.uniqueBy(links, (l) => `${l.powerId}:${l.aptitudeId}`),
    );
  }
}
