import { readExpertisePicks, readMasteryKinds } from "@/codegen/dnd5.2/tools/detect/classFeatures.ts";
import { readAbility } from "@/codegen/dnd5.2/tools/detect/proficiencies.ts";
import { CLASS_COUNTS, FEATURE_POOLS, SPELL_ROOM_FEATURES } from "@/codegen/dnd5.2/tools/terms/classFeatures.ts";
import type { ClassLevel } from "@/codegen/dnd5.2/tools/types/classes.ts";
import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import { gte, or } from "@/content/core/builders/customization/requirements.ts";
import type { ModifierSeed, RequirementEntry } from "@/content/core/builders/customization/types.ts";
import { classSpells, classSubclass, WEAPON_MASTERY_POOL } from "@/content/dnd5.2/builders/aptitudes/names.ts";
import { poolRoom, spellRoom, spellSlots } from "@/content/dnd5.2/builders/aptitudes/rooms.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { stripSeparators } from "@/shared/text.ts";
import type { MulticlassSlots } from "@/vocabulary/dnd5.2/classes.ts";
import { EXPERTISE_POOL } from "@/vocabulary/dnd5.2/feats.ts";
import { MAX_SPELL_LEVEL, SPELL_LEVELS } from "@/vocabulary/dnd5.2/spells.ts";

import type { ClassEntries } from "./ClassEntries.ts";

/** A class level's modifier: what it gives, at its level. */
type LevelModifier = ModifierSeed & { level: number };

/** A count a level's `class_specific` holds, by its key: none for a level without it. */
function readCount(level: ClassLevel, key: string): number | undefined {
  const value = level.class_specific?.[key];
  return typeof value === "number" ? value : undefined;
}

/** The highest spell level a level's slots reach (its pact slots', a warlock's): none for a level without slots. */
function readHighestSlot(spellcasting: Record<string, number>): number | undefined {
  const levels = Array.from({ length: MAX_SPELL_LEVEL }, (_, index) => index + 1);
  return levels.findLast((level) => (spellcasting[`spell_slots_level_${level}`] ?? 0) > 0);
}

/**
 * A class's progression, as its levels give it: how its levels count toward a multiclass's spell slots, the
 * requirements a multiclass into it meets (13 in its primary abilities, or in one of them for a fighter), its levels'
 * modifiers (the rooms its features give in its pools: its subclass at its pick, its Ability Score Improvements' feats,
 * its Epic Boon, its Fighting Style, its Weapon Mastery's kinds and its Expertise's skills; its spell slots, or a
 * warlock's Pact Magic; and the counts its levels hold that add to a target as they grow, `CLASS_COUNTS`), and its
 * spells (its list, and the cantrips and prepared spells it has by each level).
 */
export class ClassProgression {
  constructor(private readonly entries: ClassEntries) {}

  /** Each increase of the counts its levels hold (`CLASS_COUNTS`), at its level: the first level's count whole. */
  private countModifiers(): LevelModifier[] {
    return CLASS_COUNTS.flatMap(({ key, target, requirements }) => {
      let previous = 0;
      return this.entries.levels().flatMap((level) => {
        const count = readCount(level, key) ?? previous;
        const increase = count - previous;
        previous = count;
        return increase > 0
          ? [{ ...bonus(target, increase), ...(requirements ? { requirements } : {}), level: level.level }]
          : [];
      });
    });
  }

  /**
   * The rooms its features give at each level they're gained at: its subclass's at the level it's picked (its
   * placeholder's first), a feature's pool's (`FEATURE_POOLS`), the skills its text gives Expertise in, and the kinds of
   * weapons a Weapon Mastery takes when its levels hold no count of them (a paladin's, a ranger's, a rogue's).
   */
  private featureModifiers(): LevelModifier[] {
    const name = this.entries.name();
    const subclass = classSubclass(name);
    const counted = this.entries.levels().some((level) => readCount(level, "weapon_mastery") !== undefined);
    const picked = new Set<string>();
    return this.entries.levels().flatMap(({ features, level }) =>
      features.flatMap(({ name: feature }): LevelModifier[] => {
        const text = this.entries.feature(feature).description;
        const pools = FEATURE_POOLS.filter((entry) => entry.feature === feature).map(({ pool }) => poolRoom(pool, 1));
        const expertise = readExpertisePicks(text);
        const kinds = feature === "Weapon Mastery" && !counted ? readMasteryKinds(text) : undefined;
        const first = feature === subclass && !picked.has(feature);
        if (first) picked.add(feature);
        return [
          ...(first ? [poolRoom(subclass, 1)] : []),
          ...pools,
          ...(expertise ? [poolRoom(EXPERTISE_POOL, expertise)] : []),
          ...(kinds ? [poolRoom(WEAPON_MASTERY_POOL, kinds)] : []),
        ].map((modifier) => ({ ...modifier, level }));
      }),
    );
  }

  /** Whether its levels give Pact Magic (a warlock's), not the Spellcasting feature. */
  private hasPactMagic(): boolean {
    return this.entries.levels().some(({ features }) => features.some(({ name }) => name === "Pact Magic"));
  }

  /**
   * A warlock's Pact Magic as its levels give it: each level's new slots and the spell level they rise to, by its table
   * (`spellcasting.pact.slots`, `spellcasting.pact.level`). Refused for a table whose slots or level go down.
   */
  private pactModifiers(): LevelModifier[] {
    const previous = { level: 0, slots: 0 };
    return this.entries.levels().flatMap(({ level, name, spellcasting }): LevelModifier[] => {
      if (!spellcasting) return [];
      const slotLevel = readHighestSlot(spellcasting) ?? 0;
      const slots = slotLevel > 0 ? (spellcasting[`spell_slots_level_${slotLevel}`] ?? 0) : 0;
      if (slots < previous.slots || slotLevel < previous.level) throw new Error(`${name}: its Pact Magic shrinks`);
      const added = [
        ...(slots > previous.slots ? [bonus("spellcasting.pact.slots", slots - previous.slots)] : []),
        ...(slotLevel > previous.level ? [bonus("spellcasting.pact.level", slotLevel - previous.level)] : []),
      ];
      Object.assign(previous, { level: slotLevel, slots });
      return added.map((modifier) => ({ ...modifier, level }));
    });
  }

  /**
   * Its levels' spell slots, as its table gives them: each level's new slots at their spell level, on its list
   * (`aptitudes.<list>.<level>.uses`), for a class with the Spellcasting feature; a warlock's Pact Magic instead
   * (`pactModifiers`). Refused for a table whose slots go down.
   */
  private slotModifiers(): LevelModifier[] {
    if (this.hasPactMagic()) return this.pactModifiers();
    const list = classSpells(this.entries.name());
    const previous = new Map<number, number>();
    return this.entries.levels().flatMap(({ level, name, spellcasting }) =>
      SPELL_LEVELS.slice(1).flatMap((spellLevel): LevelModifier[] => {
        const slots = spellcasting?.[`spell_slots_level_${spellLevel}`] ?? previous.get(spellLevel) ?? 0;
        const added = slots - (previous.get(spellLevel) ?? 0);
        if (added < 0) throw new Error(`${name}: its level ${spellLevel} slots go down`);
        previous.set(spellLevel, slots);
        return added > 0 ? [{ ...spellSlots(list, spellLevel, added), level }] : [];
      }),
    );
  }

  /**
   * The rooms its spell room features give (`SPELL_ROOM_FEATURES`), at each level they're gained at: a spell level's
   * room each time, from the feature's first, in that spell level's pool (a Mystic Arcanum's).
   */
  private spellRoomModifiers(): LevelModifier[] {
    return SPELL_ROOM_FEATURES.flatMap(({ feature, firstLevel, pool }) =>
      this.entries
        .levels()
        .filter(({ features }) => features.some(({ name }) => name === feature))
        .map(({ level }, index) => ({ ...spellRoom(pool(firstLevel + index), firstLevel + index, 1), level })),
    );
  }

  /**
   * Its levels' modifiers, in level order: its features' rooms (its spell room features' too), its spell slots (a
   * warlock's Pact Magic), and its counts' increases.
   */
  modifiers(): LevelModifier[] {
    return [
      ...this.featureModifiers(),
      ...this.spellRoomModifiers(),
      ...this.slotModifiers(),
      ...this.countModifiers(),
    ].sort((a, b) => a.level - b.level);
  }

  /**
   * How its levels count toward a multiclass's spell slots, as its levels read: all of a class whose slots reach level 9
   * (a bard's, a wizard's), half of one whose slots stop short (a paladin's, a ranger's), none of a warlock's (Pact
   * Magic isn't the Spellcasting feature) or of a class without spells.
   */
  multiclassSlots(): MulticlassSlots {
    const last = this.entries.levels().at(-1)?.spellcasting;
    if (this.hasPactMagic() || !last) return "Its levels don't count";
    return readHighestSlot(last) === MAX_SPELL_LEVEL ? "All its levels" : "Half its levels";
  }

  /**
   * The requirements a character multiclassing into it meets, on its first level: 13 (or the score each names) in each
   * of its primary abilities, or in one of them when they're alternatives (a fighter's Strength or Dexterity).
   */
  requirements(): RequirementEntry[] {
    const { prerequisite_options, prerequisites = [] } = this.entries.entry().multi_classing;
    const score = (ability: string, minimum: number) =>
      gte(`abilities.${stripSeparators(readAbility(ability))}.total`, minimum);
    const options = (prerequisite_options?.from.options ?? []).flatMap((option) =>
      isRecord(option) && isRecord(option.ability_score) && typeof option.ability_score.name === "string"
        ? [score(option.ability_score.name, Number(option.minimum_score))]
        : [],
    );
    return [
      ...prerequisites.map(({ ability_score, minimum_score }) => score(ability_score.name, minimum_score)),
      ...(options.length > 0 ? [or(...options)] : []),
    ];
  }

  /**
   * Its spells, when it casts any: its list, and the cantrips and prepared spells it has by each level (cumulative), a
   * count per spell level from the cantrips' 0. A level's new prepared spells are at the highest spell level its slots
   * reach then (a warlock's pact slots'): its spell room features' rooms are in pools of their own (`modifiers`).
   */
  spells(): { known: number[][]; list: string } | undefined {
    const levels = this.entries.levels();
    if (!levels.some(({ spellcasting }) => spellcasting)) return undefined;
    const known = Array.from({ length: MAX_SPELL_LEVEL + 1 }, () => 0);
    const previous = { cantrips: 0, prepared: 0 };
    const table = levels.map(({ name, spellcasting = {} }) => {
      const cantrips = spellcasting.cantrips_known ?? 0;
      const prepared = spellcasting.prepared_spells ?? 0;
      const highest = readHighestSlot(spellcasting);
      if (cantrips < previous.cantrips || prepared < previous.prepared) throw new Error(`${name}: it has fewer spells`);
      if (prepared > previous.prepared && highest === undefined) throw new Error(`${name}: new spells, but no slots`);
      known[0] += cantrips - previous.cantrips;
      if (highest !== undefined) known[highest] += prepared - previous.prepared;
      Object.assign(previous, { cantrips, prepared });
      return [...known];
    });
    return { list: classSpells(this.entries.name()), known: table };
  }
}
