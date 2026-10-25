import { CharacterComponent } from "@/engine/core/character/index.ts";
import type { RulesetData, RulesetView } from "@/engine/core/view/index.ts";
import { SPELL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/spells/fields.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import type { CustomizedSpell } from "@/engine/rulesets/dnd3.5/model/loading/loadedEntities.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/rules/SpellLists.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Spell } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import { formatFieldValues } from "@/shared/customization/fields.ts";
import { stripSeparators } from "@/shared/text.ts";

import type SpellGroupingsComponent from "./SpellGroupingsComponent.ts";
import type { SpellDc, SpellDcsByClass } from "./SpellGroupingsComponent.ts";

interface SpellEntry {
  /** Its DC as each of the character's classes casts it, by the class's aptitude slug. */
  dc?: SpellDcsByClass;
  /**
   * Each field's values as text, in its declared order: a list, which a requirement's `contains` asks one of and a
   * modifier adds a value to or takes one from. A sheet lists them joined (`getFlatSpells`).
   */
  fields: Record<string, string[]>;
  spell: Spell;
}

/**
 * Spell known entries ({ [aptSlug]: { known } }) are bolted onto SpellEntry objects and onto standalone entries for
 * spells the character doesn't have. The traversal system navigates these via dot paths (e.g.
 * spells.magicmissile.wizard.known). getSpellEntry() encapsulates all known reads.
 *
 * Groupings (school/descriptor) live under the reserved `groups` key (spells.groups.<name>.<spellSlug>.dc.misc) to
 * avoid collisions with spells whose name matches a school name (e.g. the Cleric spell "Divination" vs the Divination
 * school).
 */
interface SpellsData {
  [key: string]: SpellEntry | SpellGroupEntry | Record<string, { known: boolean }> | SpellGroupsNamespace;
}
/** A grouping's spells, each with its DC as each class casts it */
type SpellGroupEntry = Record<string, Record<string, { dc: SpellDc }>>;

type SpellGroupsNamespace = Record<string, SpellGroupEntry>;

/**
 * A character's spells: each one's entry, with its fields' values, its known flag on each list it's on and its DC as
 * each class casts it, and its schools' and descriptors' groupings under `groups`, the spell groupings' DCs.
 */
export default class SpellsComponent extends CharacterComponent<LoadedCharacterData> {
  constructor(private readonly spellGroupings: SpellGroupingsComponent) {
    super();
  }

  /** The name of the save a spell's targets make, none without one. */
  static saveNameOf(spell: { saveId: string | null }, rulesetData: RulesetData): string | null {
    return spell.saveId ? (Dnd35View.of(rulesetData).savesById.get(spell.saveId)?.name ?? null) : null;
  }

  /** A spell's stored values (`spellId`'s, the view's) as text, by field, in their declared order: what its entry holds. */
  static textsOf(rulesetData: RulesetData, spellId: string): Record<string, string[]> {
    const { fields } = rulesetData.valuesOf(spellId);
    return Object.fromEntries(Object.entries(fields).map(([field, values]) => [field, values.map(String)]));
  }

  /**
   * A spell the character knows on a list (`aptitudeId`) without a pick, a modifier's grant: at its level there, its DC
   * from `abilityDcName`, with its customizations. None when the spell isn't on the list.
   */
  static toVirtualSpell(
    spellRow: Spell,
    aptitudeId: string,
    abilityDcName: string | null,
    rulesetData: RulesetData,
  ): CustomizedSpell | undefined {
    const link = Dnd35View.of(rulesetData)
      .listLinksOf(spellRow.id)
      .find((list) => list.toId === aptitudeId);
    if (!link) return undefined;
    return {
      ...spellRow,
      abilityDcName,
      klassLevelId: "",
      characterLevelId: "",
      aptitudeId,
      virtual: true,
      free: true,
      given: true,
      saveName: SpellsComponent.saveNameOf(spellRow, rulesetData),
      spellLevel: link.tier,
      modifiers: rulesetData.modifiersBySource.get(spellRow.id) ?? [],
      requirements: rulesetData.requirementsByEntity.get(spellRow.id) ?? [],
    };
  }

  private readonly spells: SpellsData = {};

  /**
   * The character's spells' entries; a known flag on each list the ruleset's spells are on, set for the character's
   * (the lists a feat brings, `SpellLists.featListIds`: a domain's, a specialist's school, give spells, never known);
   * then their DCs as the spell groupings hold them, an empty DC for each leveled spell without one, and the groupings.
   */
  override initialize({ spells }: Pick<LoadedCharacterData, "spells">, { rulesetData }: RulesetView) {
    const dnd35 = Dnd35View.of(rulesetData);
    this.addSpellEntries(spells, rulesetData);

    // Build spell known data nested under each spell entry: spell → aptitude → { known }, but on the lists a feat brings
    const { featListIds, spellSlugByAptitudeId } = SpellLists.of(rulesetData);
    const aptitudeIdToSlug = new Map([...spellSlugByAptitudeId].filter(([aptitudeId]) => !featListIds.has(aptitudeId)));

    for (const spell of dnd35.spells) {
      const spellSlug = stripSeparators(spell.name);
      for (const link of dnd35.listLinksOf(spell.id)) {
        if (link.tier == null) continue;
        const aptSlug = aptitudeIdToSlug.get(link.toId);
        if (!aptSlug) continue;

        if (!this.spells[spellSlug]) this.spells[spellSlug] = {} as Record<string, { known: boolean }>;

        (this.spells[spellSlug] as Record<string, { known: boolean }>)[aptSlug] = { known: false };
      }
    }

    // Mark known from character's actual spells
    for (const spell of spells) {
      const aptSlug = aptitudeIdToSlug.get(spell.aptitudeId);
      if (!aptSlug) continue;

      const spellEntry = this.spells[stripSeparators(spell.name)] as Record<string, { known: boolean }> | undefined;
      if (spellEntry?.[aptSlug]) spellEntry[aptSlug].known = true;
    }

    this.holdDcs();
    this.seedEmptyDcs(dnd35);
    this.holdGroupings();
  }

  /** Each spell's DC as each class casts it, as the spell groupings hold them (`getDcs`), on the spell's entry. */
  private holdDcs(): void {
    for (const [slug, dcs] of Object.entries(this.spellGroupings.getDcs())) {
      const entry = this.spells[slug] as SpellEntry | undefined;
      if (!entry) continue;
      for (const [aptitudeSlug, dc] of Object.entries(dcs)) (entry.dc ??= {})[aptitudeSlug] = dc;
    }
  }

  /**
   * The spell groupings under `groups`: `spells.groups.<grouping>.*.dc.misc` reaches each spell of it, and each class's
   * DC of the spell through it (a spell is a group of its classes).
   */
  private holdGroupings(): void {
    const groupings = this.spellGroupings.getSpellGroupings();
    if (Object.keys(groupings).length === 0) return;
    const namespace: SpellGroupsNamespace = {};
    for (const [key, group] of Object.entries(groupings)) {
      const wrapped: SpellGroupEntry = {};
      for (const [spellKey, dcs] of Object.entries(group))
        wrapped[spellKey] = Object.fromEntries(Object.entries(dcs).map(([klass, dc]) => [klass, { dc }]));

      namespace[key] = wrapped;
    }
    this.spells.groups = namespace;
  }

  /**
   * Every spell a list has at a level lists its DC paths (`spells.<spell>.dc.*.misc`): one the character doesn't cast
   * gets an empty DC there once the cast ones have theirs, so a modifier on it reaches nothing and a requirement on it is
   * unmet, as a school's empty group.
   */
  private seedEmptyDcs(dnd35: Dnd35View): void {
    for (const spell of dnd35.spells) {
      if (!dnd35.listLinksOf(spell.id).some((link) => link.tier != null)) continue;
      const entry: { dc?: SpellDcsByClass } = (this.spells[stripSeparators(spell.name)] ??= {});
      entry.dc ??= {};
    }
  }

  /** Each spell's entry (`spells`), with its fields' values as text, off the view's stored values. */
  addSpellEntries(spells: Spell[], rulesetData: RulesetData) {
    for (const spell of spells) {
      const fields = SpellsComponent.textsOf(rulesetData, spell.id);

      // A spell already listed keeps what's on its entry: its known flags and its DCs by class
      const slug = stripSeparators(spell.name);
      this.spells[slug] = { ...this.spells[slug], spell, fields };
    }
  }

  /** The spells as a sheet lists them: each field's values joined, those modifiers add included. */
  getFlatSpells(): Record<string, Omit<SpellEntry, "fields"> & { fields: Record<string, string> }> {
    const result: Record<string, Omit<SpellEntry, "fields"> & { fields: Record<string, string> }> = {};
    for (const [key, value] of Object.entries(this.spells)) {
      if ("spell" in value) {
        const entry = value as SpellEntry;
        result[key] = {
          ...entry,
          fields: formatFieldValues(entry.fields, (field) => SPELL_FIELDS.optionsOf(field)),
        };
      }
    }
    return result;
  }

  getSpell(name: string) {
    return this.spells[stripSeparators(name)] as SpellEntry | undefined;
  }

  /** A spell's known flag on a list (`listName`), by their names (or their slugs: a target's). */
  getSpellEntry(spellName: string, listName: string): { known: boolean } | undefined {
    const entry = this.spells[stripSeparators(spellName)] as Record<string, { known: boolean }> | undefined;
    return entry?.[SpellLists.toSpellPossessionSlug(listName)];
  }

  getSpells(): SpellsData {
    return this.spells;
  }

  /**
   * The spells' DCs and groupings as the spell groupings hold them again, once they've registered more: the spells the
   * spellcasting makes known (`KnownSpells`).
   */
  readGroupings(): void {
    this.holdDcs();
    this.holdGroupings();
  }
}
