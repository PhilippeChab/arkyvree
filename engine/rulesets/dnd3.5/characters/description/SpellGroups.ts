import type { SpellTagLists } from "@/engine/rulesets/dnd3.5/model/spellcasting/SpellcastingState.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/rules/SpellLists.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { stripSeparators } from "@/shared/text.ts";
import { SPELL_SCHOOL } from "@/vocabulary/dnd3.5/properties/index.ts";
import { SPELL_LEVELS } from "@/vocabulary/dnd3.5/spells.ts";

/** An aptitude's spells, by spell level. */
interface AptitudeSpells {
  aptitudeName: string;
  levels: SpellGroup[];
}

/** A spell a modifier gives without a pick. */
interface GivenSpell {
  aptitudeId: string;
  dc: number | null;
  description: string | null;
  id: string;
  level: number;
  name: string;
  properties: Record<string, string>;
  saveEffect: string | null;
  saveName: string | null;
}

/** A spell a class level picked or granted. */
interface LevelSpell {
  aptitudeId: string;
  description?: string | null;
  id: string;
  name: string;
  powerLevel?: number | null;
  saveEffect?: string | null;
  saveName?: string | null;
}

/**
 * A spell list's slots per day as the sheets print them, a cell per spell level of the summary's (`SpellsPerDay`): "3",
 * "3+1" where a list its class's feat brings adds a slot (a cleric's domain slot, a specialist's school), or none.
 */
interface ListSlots {
  aptitudeName: string;
  slots: (string | null)[];
}

/**
 * A list's slots at a spell level: its own (`uses`), and those the lists its class's feats bring add to them
 * (`bonus`).
 */
interface SlotCount {
  bonus: number;
  uses: number;
}

/** An aptitude's spells at a spell level, with the uses per day the aptitude allows there. */
interface SpellGroup {
  aptitudeName: string;
  level: number;
  spells: SpellRow[];
  uses: number | null;
}

/** A spell as a sheet lists it: its school, save and DC, its description and properties, and its tags. */
interface SpellRow {
  dc: number | null;
  description: string;
  id: string;
  name: string;
  properties: Record<string, string>;
  save: string;
  school: string;
  tags?: SpellRowTag[];
}

/** A tag a spell row shows. */
interface SpellRowTag {
  joinsClassList: boolean;
  name: string;
}

/**
 * What the groups read of a character: its classes' levels, its computed powers, its aptitudes, the spells of the lists
 * a feat brings, and its spell tags.
 */
interface SpellSheet {
  aptitudes: Record<string, { id: string; name: string }>;
  classes: Record<string, { levels?: { klassLevel?: { level: number } | null; powers?: LevelSpell[] }[] }>;
  /** Each list a feat brings, by its id: its spells' ids by the spell level it has each at (none on a domain slot). */
  featListSpells: Map<string, Map<number, Set<string>>>;
  powers: Record<
    string,
    {
      // Its DC as each class casts it, by the class's aptitude slug
      dc?: Record<string, { total: number }> | null;
      power?: { description?: string | null };
      properties?: Record<string, string>;
    }
  >;
  spellTagLists: Record<string, SpellTagLists>;
  spellTags: Record<string, string[]>;
  virtualPowers: GivenSpell[];
}

/** The character a sheet's spells are read off: a built character's components and what it has without a pick. */
interface SpellSource {
  components: {
    aptitudes: { getAptitudes(): SpellSheet["aptitudes"] };
    classes: { getCharacterClasses(): SpellSheet["classes"] };
    powers: { getFlatPowers(): SpellSheet["powers"] };
  };
  getFeatListSpells(): SpellSheet["featListSpells"];
  getSpellTagLists(): SpellSheet["spellTagLists"];
  getSpellTags(): SpellSheet["spellTags"];
  getVirtualPowers(): SpellSheet["virtualPowers"];
}

/**
 * A character's slots per day, as the summary at the start of its sheets' spells prints them: the spell levels it has
 * slots at, a column each, and a row per spell list giving them, by name.
 */
interface SpellsPerDay {
  levels: number[];
  lists: ListSlots[];
}

/**
 * A character's spells as its sheets list them, the web sheet's and the PDF's alike: by aptitude (its spell list), then
 * by spell level, with the uses per day the aptitude allows there; a list a feat brings (a specialist's school, a
 * cleric's domain slot) at each level it has uses at. And the slots per day the sheets open their spells on
 * (`describePerDay`), a list a feat brings counted in its class's row.
 */
export default class SpellGroups {
  /**
   * The lists of the class whose level gave the feats bringing a list (`listId`: a cleric's domain slot, a specialist's
   * school): those the feats' spell tags show on beside it (`spellTagLists`), less the lists feats bring.
   */
  private static classListsOf(sheet: SpellSheet, listId: string) {
    return Object.values(sheet.spellTagLists)
      .filter((lists) => lists.aptitudeIds.includes(listId))
      .flatMap((lists) => lists.aptitudeIds.filter((id) => !sheet.featListSpells.has(id)));
  }

  /**
   * The tags whose spells fill a list a feat brings (`listId`), each with the list its spells are on: the list's own
   * feat's (a specialist's school); or, for a list of no spells of its own (a cleric's domain slot), the tags of the
   * lists joining its class's lists (his domains').
   */
  private static fillersOf(sheet: SpellSheet, listId: string) {
    const tagLists = Object.entries(sheet.spellTagLists);
    if (sheet.featListSpells.get(listId)?.size) {
      const bringing = tagLists.filter(([, lists]) => lists.aptitudeIds.includes(listId));
      return bringing.map(([tag]) => ({ tag, listId }));
    }

    const classListIds = new Set(SpellGroups.classListsOf(sheet, listId));
    return tagLists.flatMap(([tag, lists]) => {
      const ownListId = lists.aptitudeIds.find((id) => sheet.featListSpells.get(id)?.size);
      const joins = lists.joinsClassList && lists.aptitudeIds.some((id) => classListIds.has(id));
      return joins && ownListId ? [{ tag, listId: ownListId }] : [];
    });
  }

  /**
   * The slots of each list a feat brings (a specialist's school, a cleric's domain slot), at each spell level it has
   * uses at, each with the character's spells that fill them there (`fillersOf`): those the lists of the feat's class
   * list with their tag (the school's spells in the wizard's spellbook, his domains' spells on the cleric's).
   */
  private static groupFeatListSlots(
    sheet: SpellSheet,
    groups: Map<string, SpellGroup>,
    groupOf: (aptitudeId: string, level: number) => SpellGroup,
  ) {
    // The rows each tag marks, by its name: the spells of the lists a feat brings, on its class's lists
    const taggedRows = new Map<string, SpellRow[]>();
    for (const group of groups.values()) {
      for (const row of group.spells)
        for (const tag of row.tags ?? []) taggedRows.set(tag.name, [...(taggedRows.get(tag.name) ?? []), row]);
    }

    for (const { id, name } of Object.values(sheet.aptitudes)) {
      if (!sheet.featListSpells.has(id)) continue;
      const fillers = SpellGroups.fillersOf(sheet, id);
      for (const level of SPELL_LEVELS) {
        if (!SpellGroups.usesPerDay(sheet.aptitudes, name, level)) continue;
        const group = groupOf(id, level);
        for (const { tag, listId } of fillers) {
          for (const row of taggedRows.get(tag) ?? []) {
            if (!sheet.featListSpells.get(listId)?.get(level)?.has(row.id)) continue;
            if (group.spells.some((had) => had.name === row.name)) continue;
            group.spells.push({
              ...row,
              tags: row.tags?.filter((had) => fillers.some((filler) => filler.tag === had.name)),
            });
          }
        }
      }
    }
  }

  /**
   * The levels' spells, a spell once per group with all its tags, the spells modifiers give, then the slots of the
   * lists a feat brings.
   */
  private static groupSpells(sheet: SpellSheet, aptitudeNameById: Map<string, string>) {
    const groupMap = new Map<string, SpellGroup>();
    const groupOf = (aptitudeId: string, level: number) => {
      const key = `${aptitudeId}:${level}`;
      let group = groupMap.get(key);
      if (!group) {
        const aptitudeName = aptitudeNameById.get(aptitudeId) || "Spells";
        const uses = SpellGroups.usesPerDay(sheet.aptitudes, aptitudeName, level);
        // A list a feat brings counts no slot where it gives none: a domain's spells known on its own list
        const slotless = uses === 0 && sheet.featListSpells.has(aptitudeId);
        group = { aptitudeName, level, uses: slotless ? null : uses, spells: [] };
        groupMap.set(key, group);
      }
      return group;
    };

    for (const klass of Object.values(sheet.classes)) {
      for (const level of klass.levels || []) {
        for (const power of level.powers || []) {
          const group = groupOf(power.aptitudeId, power.powerLevel ?? level.klassLevel?.level ?? 0);
          const powerData = sheet.powers[stripSeparators(power.name)];
          const properties = powerData?.properties ?? {};
          const tags = SpellGroups.tagsFor(sheet, power.id, power.aptitudeId);
          const existing = group.spells.find((row) => row.name === power.name);
          if (existing) {
            const added = tags?.filter((tag) => !existing.tags?.some((had) => had.name === tag.name)) ?? [];
            if (added.length > 0) existing.tags = [...(existing.tags || []), ...added];
            continue;
          }
          group.spells.push({
            id: power.id,
            name: power.name,
            school: properties[SPELL_SCHOOL] || "—",
            save: SpellGroups.saveOf(power.saveName, power.saveEffect),
            dc: powerData?.dc?.[SpellLists.toSpellPossessionSlug(group.aptitudeName)]?.total ?? null,
            description: powerData?.power?.description || power.description || "",
            properties,
            tags,
          });
        }
      }
    }

    for (const given of sheet.virtualPowers) {
      const properties = given.properties ?? {};
      groupOf(given.aptitudeId, given.level).spells.push({
        id: given.id,
        name: given.name,
        school: properties[SPELL_SCHOOL] || "—",
        save: SpellGroups.saveOf(given.saveName, given.saveEffect),
        dc: given.dc ?? null,
        description: given.description || "",
        properties,
      });
    }
    SpellGroups.groupFeatListSlots(sheet, groupMap, groupOf);
    return groupMap;
  }

  private static saveOf(saveName: string | null | undefined, saveEffect: string | null | undefined) {
    return saveName && saveEffect ? `${saveName} ${saveEffect}` : saveEffect || "None";
  }

  /** What a character's sheet lists its spells from. */
  private static sheetOf(character: SpellSource): SpellSheet {
    const { aptitudes, classes, powers } = character.components;
    return {
      aptitudes: aptitudes.getAptitudes(),
      classes: classes.getCharacterClasses(),
      featListSpells: character.getFeatListSpells(),
      powers: powers.getFlatPowers(),
      spellTagLists: character.getSpellTagLists(),
      spellTags: character.getSpellTags(),
      virtualPowers: character.getVirtualPowers(),
    };
  }

  /**
   * The rows of the slots per day, by list id: each list's slots at each spell level it has any; a list a feat brings (a
   * cleric's domain slot, a specialist's school) adds its own to the row of its class's first list with slots at that
   * level (`classListsOf`), as its `bonus`, and keeps a row of its own where its class's lists have none.
   */
  private static slotRows(sheet: SpellSheet) {
    const slots = SpellGroups.slotsByList(sheet);
    const rows = new Map<string, { counts: Map<number, SlotCount>; name: string }>();
    const countAt = ({ id, name }: { id: string; name: string }, level: number) => {
      const row = rows.get(id) ?? { counts: new Map<number, SlotCount>(), name };
      rows.set(id, row);
      const count = row.counts.get(level) ?? { bonus: 0, uses: 0 };
      row.counts.set(level, count);
      return count;
    };

    for (const list of slots.values()) {
      const classLists = sheet.featListSpells.has(list.id)
        ? SpellGroups.classListsOf(sheet, list.id).flatMap((id) => slots.get(id) ?? [])
        : [];
      for (const [level, count] of list.uses) {
        const classList = classLists.find((other) => other.uses.has(level));
        if (classList) countAt(classList, level).bonus += count;
        else countAt(list, level).uses += count;
      }
    }
    return rows;
  }

  /** Each spell list with slots per day, by its id: its name, and its slots by spell level where it has any. */
  private static slotsByList(sheet: SpellSheet) {
    const slots = new Map<string, { id: string; name: string; uses: Map<number, number> }>();
    for (const { id, name } of Object.values(sheet.aptitudes)) {
      const uses = new Map<number, number>();
      for (const level of SPELL_LEVELS) {
        const count = SpellGroups.usesPerDay(sheet.aptitudes, name, level);
        if (count) uses.set(level, count);
      }
      if (uses.size > 0) slots.set(id, { id, name, uses });
    }
    return slots;
  }

  /** A spell's tags that show on this list: a domain's on the cleric's, a school's on the wizard's. */
  private static tagsFor(
    sheet: SpellSheet,
    powerId: string | undefined,
    aptitudeId: string,
  ): SpellRowTag[] | undefined {
    const kept = (powerId ? sheet.spellTags[powerId] : undefined)?.flatMap((name) => {
      const lists = sheet.spellTagLists[name];
      return lists?.aptitudeIds.includes(aptitudeId) ? [{ name, joinsClassList: lists.joinsClassList }] : [];
    });
    return kept?.length ? kept : undefined;
  }

  /** The uses per day an aptitude allows at a spell level, read off its per-level entry. */
  private static usesPerDay(
    aptitudes: SpellSheet["aptitudes"],
    aptitudeName: string,
    spellLevel: number,
  ): number | null {
    // Leveled aptitudes carry a per-spell-level entry the sheet's type doesn't declare.
    const aptitude: Record<string, unknown> | undefined = aptitudes[stripSeparators(aptitudeName)];
    const levelData = aptitude?.[String(spellLevel)];
    return isRecord(levelData) && typeof levelData.uses === "number" ? levelData.uses : null;
  }

  /** A list's slots at a spell level as the sheets print them: "3", or "3+1" with the slot a feat's list adds. */
  private static writeSlots({ bonus, uses }: SlotCount) {
    return bonus > 0 ? `${uses}+${bonus}` : String(uses);
  }

  /** The character's spells by aptitude (by name), each aptitude's levels in order and their spells by name. */
  static describe(character: SpellSource): AptitudeSpells[] {
    const sheet = SpellGroups.sheetOf(character);
    const aptitudeNameById = new Map<string, string>();
    for (const apt of Object.values(sheet.aptitudes)) if (apt.id) aptitudeNameById.set(apt.id, apt.name);

    const byAptitude = new Map<string, AptitudeSpells>();
    for (const group of SpellGroups.groupSpells(sheet, aptitudeNameById).values()) {
      group.spells.sort((a, b) => a.name.localeCompare(b.name));
      const existing = byAptitude.get(group.aptitudeName);
      if (existing) existing.levels.push(group);
      else byAptitude.set(group.aptitudeName, { aptitudeName: group.aptitudeName, levels: [group] });
    }

    const sorted = [...byAptitude.values()].sort((a, b) => a.aptitudeName.localeCompare(b.aptitudeName));
    for (const apt of sorted) apt.levels.sort((a, b) => a.level - b.level);
    return sorted;
  }

  /**
   * The character's slots per day, as the summary at the start of its sheets' spells prints them: a column per spell
   * level it has slots at, and a row per list with slots, by name, a list a feat brings (a cleric's domain slot, a
   * specialist's school) counted in its class's row ("3+1"), not in a row of its own. None for a character with no slot.
   */
  static describePerDay(character: SpellSource): SpellsPerDay {
    const rows = [...SpellGroups.slotRows(SpellGroups.sheetOf(character)).values()];
    const levels = SPELL_LEVELS.filter((level) => rows.some((row) => row.counts.has(level)));
    const lists = rows.map(({ name, counts }) => ({
      aptitudeName: name,
      slots: levels.map((level) => {
        const count = counts.get(level);
        return count ? SpellGroups.writeSlots(count) : null;
      }),
    }));
    return { levels, lists: lists.sort((a, b) => a.aptitudeName.localeCompare(b.aptitudeName)) };
  }
}
