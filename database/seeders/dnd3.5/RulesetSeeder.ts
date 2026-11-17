import { inArray } from "drizzle-orm";

import { gte } from "@/content/core/builders/customization/requirements.ts";
import { CLERIC_DOMAIN, domainFeat, domainSpells } from "@/content/dnd3.5/builders/aptitudes/names.ts";
import type { BondContent } from "@/content/dnd3.5/builders/bonds/types.ts";
import type { DomainSeed } from "@/content/dnd3.5/builders/domains/types.ts";
import type { FeatSeed } from "@/content/dnd3.5/builders/feats/types.ts";
import type { BookContent, CoreContent } from "@/content/dnd3.5/builders/rulesets/types.ts";
import { Entities, EntityLinks, type Ids } from "@/database/seeders/core/SeederState.ts";
import { requirementsInCustomization } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import { stripSeparators } from "@/shared/text.ts";
import { LAST_NONEPIC_LEVEL } from "@/vocabulary/dnd3.5/classes.ts";
import { FEAT_EPIC } from "@/vocabulary/dnd3.5/fields/index.ts";

import { BaseSeeder } from "./BaseSeeder.ts";
import { CopiesIntoExtensions } from "./concerns/CopiesIntoExtensions.ts";
import { ExtendsForkCopies } from "./concerns/ExtendsForkCopies.ts";
import { SeedsClasses } from "./concerns/SeedsClasses.ts";
import { SeedsSkills } from "./concerns/SeedsSkills.ts";
import { SeedsSpells } from "./concerns/SeedsSpells.ts";
import { SeedsWizardSchools } from "./concerns/SeedsWizardSchools.ts";
import { findSpellcastingClass, type SpellcastingClass } from "./spellTable.ts";

/** An epic feat's requirement: a character's 21st level, as the codegen gives it (`FeatDetector.withEpicLevel`). */
const EPIC_LEVEL = gte("identity.meta.level", LAST_NONEPIC_LEVEL + 1);

/**
 * Seeds a 3.5 ruleset, step by step: a step that writes one kind of row is a concern, every ruleset's
 * (`ContentSeeder`'s: aptitudes, abilities, saves, languages, feats, races, items, copies) or 3.5's own (`concerns/`:
 * classes, skills, spells, wizard schools, an extension's changes to the core), and the steps made of others are its
 * own. Each names the rows the steps before it seeded by their ids in its context. It holds no content: the core rules'
 * package gives `seedCore` theirs, an extension's package gives `seedExtension` its book.
 */
export class RulesetSeeder extends include(
  BaseSeeder,
  CopiesIntoExtensions,
  ExtendsForkCopies,
  SeedsClasses,
  SeedsSkills,
  SeedsSpells,
  SeedsWizardSchools,
) {
  /** Seeds the core rules: the SRD's content, and the hand-written core content and bonded creatures. */
  override async seedCore(core: CoreContent) {
    await this.seedAptitudes(core.aptitudes);
    await this.seedLanguages(core.languages);
    await this.seedRaces(core.races);
    await this.seedAbilities(core.abilities);
    await this.seedSkillPointAbility();
    await this.seedSkills(core.skills);
    await this.seedSaves(core.saves);
    await this.seedFeats(core.feats);
    for (const klass of core.classes) await this.seedClass(klass);

    // The items others are made from, and the others, which name them
    await this.seedItems("items", [...core.templateItems, ...core.items]);

    await this.seedSpells(core.spells);
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
    await this.seedSpells(book.spells);
    await this.cowSpellsIntoExtension(book.cowSpells);
    await this.seedDomains(book.domains, findSpellcastingClass(core.classes, "Cleric"));
    for (const klass of book.classes) await this.seedClass(klass);
  }

  /**
   * Flags a seeded extension's feats epic as its content flags them (`feats`, its own by name: `ownFeats`), each one not
   * flagged yet (`FEAT_EPIC`) with a character's 21st level among its requirements, as the content gives it, unless it
   * has it: a feat its book kept before it was flagged (Complete Divine's Bonus Domain).
   */
  private async flagEpicFeats(feats: FeatSeed[], ownFeats: Ids) {
    const ids = feats.map(({ name }) => ownFeats[name]);
    const records = new Map((await Entities.findMany(this.db, { entityType: "feats", ids })).map((r) => [r.id, r]));
    const requirements = await this.db
      .select({
        entityId: requirementsInCustomization.entityId,
        level: requirementsInCustomization.level,
        target: requirementsInCustomization.target,
      })
      .from(requirementsInCustomization)
      .where(inArray(requirementsInCustomization.entityId, ids));
    const levelled = new Set(requirements.filter(({ target }) => target === EPIC_LEVEL.target).map((r) => r.entityId));
    // Each feat's requirements at the top of its tree ("1", "2"…): the 21st level goes after them, as a seed lists it
    const tops = (id: string) =>
      requirements.filter(({ entityId, level }) => entityId === id && !level.includes(".")).length;
    const unflagged = ids.filter((id) => records.get(id)?.fields[FEAT_EPIC] !== true);
    for (const id of unflagged)
      await Entities.update(this.db, this.baseRules, "feats", { fields: { [FEAT_EPIC]: true } }, { id });
    await this.insertAll(
      requirementsInCustomization,
      ids
        .filter((id) => !levelled.has(id))
        .flatMap((id) =>
          this.requirementRows(id, "feats", [EPIC_LEVEL]).map((row) => ({ ...row, level: String(tops(id) + 1) })),
        ),
    );
  }

  /** Seeds a kind of bonded creature: its aptitudes, feats, races and class. */
  async seedBond(bond: BondContent) {
    await this.seedAptitudes(bond.aptitudes);
    await this.seedFeats(bond.feats);
    await this.seedRaces(bond.races);
    await this.seedClass(bond.klass);
  }

  /**
   * Seeds cleric domains: each a feat taken in Cleric Domain that makes its spell list ("X Domain Spells") known at
   * each spell level, once the cleric casts that level (`cleric`'s table), and joins it to the cleric's list, plus the
   * domain's own modifiers. Its spells fill the cleric's one domain slot a spell level (`DOMAIN_SPELLS`), which his
   * domains share: his feature gives it, not a domain.
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
          ...this.spellListKnown(featId, "feats", list),
          this.joinsClassList(featId, "feats", list),
          ...this.modifierRows(featId, "feats", d.modifiers),
        ];
      }),
      cleric,
    );

    const links = [];
    for (const d of domains) {
      for (const spell of d.spells) {
        const spellId = await this.ownSpell(spell.name);
        if (!spellId) {
          console.warn(`[domain seed] Domain spell not found in DB: "${spell.name}" (${domainFeat(d.name)})`);
          continue;
        }
        links.push({ fromId: spellId, toId: this.ctx.aptMap[domainSpells(d.name)], tier: spell.level });
      }
    }
    await this.insertListings(
      "spells",
      this.uniqueBy(links, (l) => `${l.fromId}:${l.toId}`),
    );
  }

  /**
   * Brings the seeded core rules up to their content (`core`): the aptitudes and feats it gained, the aptitudes its feats
   * are listed in now (`syncListings`), and its classes' levels past their last seeded one (the core classes' 21st to
   * 40th, with their epic bonus feats). An update of the core rules' package (`updates.ts`); each step adds only what's
   * missing, so it's safe to run again.
   */
  async updateCore(core: CoreContent, pools: string[]) {
    await this.seedAptitudes(core.aptitudes.filter((name) => !this.ctx.aptMap[name]));
    await this.seedFeats(core.feats.filter(({ name }) => !this.ctx.featMap[name]));
    await this.syncListings(
      core.feats.map(({ name, aptitudes }) => ({
        fromId: this.ctx.featMap[name],
        toIds: aptitudes.map((aptitude) => this.idOf(this.ctx.aptMap, aptitude, name)),
      })),
    );
    for (const klass of core.classes) await this.addMissingLevels(klass);
    // The forks' own copies: a class it edited gets its new levels, a feat it edited the new pools
    await this.extendForkClasses();
    await this.listForkFeatsInPools(pools.map((pool) => this.idOf(this.ctx.aptMap, pool, "an epic pool")));
  }

  /**
   * Brings a seeded extension's feats up to its book (`book`) and its base (`baseFeats`, the core rules' feats by name;
   * `ownFeats`, its own as seeded): the feats its book gained (a Complete book's own epic feats), each epic one flagged
   * as its content flags it (`FEAT_EPIC`), its own feats' aptitudes as its content gives them, and each core feat it
   * copied listed where the core feat is now, then where its book adds it, as a copy is seeded. An update of the
   * extension's package (`updates.ts`); each step adds only what's missing, so it's safe to run again.
   */
  async updateExtension(book: BookContent, baseFeats: Ids, ownFeats: Ids, pools: string[]) {
    const feats = [...book.standaloneFeats, ...book.classFeats];
    await this.seedFeats(feats.filter(({ name }) => !ownFeats[name]));
    await this.flagEpicFeats(
      feats.filter(({ fields, name }) => ownFeats[name] && fields?.[FEAT_EPIC] === true),
      ownFeats,
    );
    const ids = (aptitudes: string[]) =>
      aptitudes.filter((name) => this.ctx.aptMap[name]).map((name) => this.ctx.aptMap[name]);
    const copies = book.cowFeats.filter(
      ({ feat }) => this.ctx.featMap[feat] && this.ctx.featMap[feat] !== baseFeats[feat],
    );
    const coreLists = await EntityLinks.findMany(this.db, {
      fromIds: copies.map(({ feat }) => baseFeats[feat]),
      role: "listedIn",
    });
    const coreListsOf = (featId: string) =>
      coreLists
        .filter(({ fromId, toType }) => fromId === featId && toType === "aptitudes")
        .toSorted((a, b) => a.ordinal - b.ordinal)
        .map(({ toId }) => toId);
    await this.syncListings([
      ...feats.map(({ name, aptitudes }) => ({
        fromId: this.ctx.featMap[name],
        toIds: ids(aptitudes),
      })),
      ...copies.map(({ feat, aptitudes }) => ({
        fromId: this.ctx.featMap[feat],
        toIds: [...new Set([...coreListsOf(baseFeats[feat]), ...ids(aptitudes)])],
      })),
    ]);
    // The forks' copies of its copies of core feats, in the epic pools they're in now
    await this.listForkFeatsInPools(pools.map((pool) => this.idOf(this.ctx.aptMap, pool, "an epic pool")));
  }
}
