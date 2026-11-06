import type { SheetStat } from "@/engine/core/module/index.ts";
import type { CastingLevels, SpellTagLists } from "@/engine/rulesets/dnd5.2/model/spellcasting/SpellcastingState.ts";
import SpellLists from "@/engine/rulesets/dnd5.2/rules/SpellLists.ts";
import { formatFieldName } from "@/shared/customization/fields.ts";
import { stripSeparators } from "@/shared/text.ts";
import { SPELL_SCHOOL } from "@/vocabulary/dnd5.2/fields/index.ts";
import { SPELL_LEVEL_LABELS, SPELL_LEVELS } from "@/vocabulary/dnd5.2/spells.ts";

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
  fields: Record<string, string>;
  id: string;
  level: number;
  name: string;
  saveName: string | null;
}

/** A spell a level holds (picked, granted, or known by its list): the spell, and its pool and spell level there. */
interface LevelSpell {
  entity: {
    description?: string | null;
    id: string;
    name: string;
  };
  saveName?: string | null;
  spellLevel?: number | null;
  viaId: string;
}

/** An aptitude's spells at a spell level (its name: `label`). */
interface SpellGroup {
  aptitudeName: string;
  label: string;
  level: number;
  spells: SpellRow[];
}

/**
 * A spell as a sheet lists it: its school, the saving throw it calls for and its DC, its description and fields (and
 * those its details show, its school aside, labelled: `details`), and its tags.
 */
interface SpellRow {
  dc: number | null;
  description: string;
  details: SheetStat[];
  fields: Record<string, string>;
  id: string;
  name: string;
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
 * What the groups read of a character: its classes' levels, its computed spells, its aptitudes, and its spell tags.
 */
interface SpellSheet {
  aptitudes: Record<string, { id: string; name: string }>;
  classes: Record<string, { levels?: { classLevel?: { position: number } | null; spells?: LevelSpell[] }[] }>;
  spells: Record<
    string,
    {
      // Its DC as each class casts it, by the class's aptitude slug
      dc?: Record<string, { total: number }> | null;
      fields?: Record<string, string>;
      spell?: { description?: string | null };
    }
  >;
  spellTagLists: Record<string, SpellTagLists>;
  spellTags: Record<string, string[]>;
  virtualSpells: GivenSpell[];
}

/**
 * A character's spell slots, as the summary at the start of its sheets' spells prints them: the spell levels it has
 * slots at, a column each (and their names, `labels`), and a row per kind of slot: its Spellcasting's, by the
 * Multiclass Spellcaster table, and its Pact Magic's, apart.
 */
interface SpellSlots {
  labels: string[];
  levels: number[];
  lists: { aptitudeName: string; slots: (string | null)[] }[];
}

/**
 * The character a sheet's spells are read off: a built character's components, what it has without a pick, and its
 * spell slots.
 */
interface SpellSource {
  components: {
    aptitudes: { getAptitudes(): SpellSheet["aptitudes"] };
    classes: { getCharacterClasses(): SpellSheet["classes"] };
    spells: { getFlatSpells(): SpellSheet["spells"] };
  };
  getSpellcasting(): CastingLevels;
  getSpellTagLists(): SpellSheet["spellTagLists"];
  getSpellTags(): SpellSheet["spellTags"];
  getVirtualSpells(): SpellSheet["virtualSpells"];
}

/**
 * A character's spells as its sheets list them, the web sheet's and the PDF's alike: by aptitude (its spell list), then
 * by spell level. And the spell slots the sheets open their spells on (`describeSlots`): its Spellcasting's, which
 * every class's spells share, and its Pact Magic's.
 */
export default class SpellGroups {
  /** A spell's fields as its details show them, labelled, its school aside (its row shows it). */
  private static detailsOf(fields: Record<string, string>): SheetStat[] {
    return Object.entries(fields)
      .filter(([key]) => key !== SPELL_SCHOOL)
      .map(([key, value]) => ({ label: formatFieldName(key), value }));
  }

  /** The levels' spells, a spell once per group with all its tags, then the spells modifiers give. */
  private static groupSpells(sheet: SpellSheet, aptitudeNameById: Map<string, string>) {
    const groupMap = new Map<string, SpellGroup>();
    const groupOf = (aptitudeId: string, level: number) => {
      const key = `${aptitudeId}:${level}`;
      let group = groupMap.get(key);
      if (!group) {
        const aptitudeName = aptitudeNameById.get(aptitudeId) || "Spells";
        group = { aptitudeName, label: SPELL_LEVEL_LABELS[level], level, spells: [] };
        groupMap.set(key, group);
      }
      return group;
    };

    for (const klass of Object.values(sheet.classes)) {
      for (const level of klass.levels || []) {
        for (const { entity: spell, saveName, spellLevel, viaId } of level.spells || []) {
          const group = groupOf(viaId, spellLevel ?? level.classLevel?.position ?? 0);
          const spellData = sheet.spells[stripSeparators(spell.name)];
          const fields = spellData?.fields ?? {};
          const tags = SpellGroups.tagsFor(sheet, spell.id, viaId);
          const existing = group.spells.find((row) => row.name === spell.name);
          if (existing) {
            const added = tags?.filter((tag) => !existing.tags?.some((had) => had.name === tag.name)) ?? [];
            if (added.length > 0) existing.tags = [...(existing.tags || []), ...added];
            continue;
          }
          group.spells.push({
            id: spell.id,
            name: spell.name,
            school: fields[SPELL_SCHOOL] || "—",
            save: saveName || "None",
            dc: spellData?.dc?.[SpellLists.toSpellPossessionSlug(group.aptitudeName)]?.total ?? null,
            description: spellData?.spell?.description || spell.description || "",
            details: SpellGroups.detailsOf(fields),
            fields,
            tags,
          });
        }
      }
    }

    for (const given of sheet.virtualSpells) {
      const fields = given.fields ?? {};
      groupOf(given.aptitudeId, given.level).spells.push({
        id: given.id,
        name: given.name,
        school: fields[SPELL_SCHOOL] || "—",
        save: given.saveName || "None",
        dc: given.dc ?? null,
        description: given.description || "",
        details: SpellGroups.detailsOf(fields),
        fields,
      });
    }
    return groupMap;
  }

  /** What a character's sheet lists its spells from. */
  private static sheetOf(character: SpellSource): SpellSheet {
    const { aptitudes, classes, spells } = character.components;
    return {
      aptitudes: aptitudes.getAptitudes(),
      classes: classes.getCharacterClasses(),
      spells: spells.getFlatSpells(),
      spellTagLists: character.getSpellTagLists(),
      spellTags: character.getSpellTags(),
      virtualSpells: character.getVirtualSpells(),
    };
  }

  /** A spell's tags that show on this list: a subclass's on its class's. */
  private static tagsFor(
    sheet: SpellSheet,
    spellId: string | undefined,
    aptitudeId: string,
  ): SpellRowTag[] | undefined {
    const kept = (spellId ? sheet.spellTags[spellId] : undefined)?.flatMap((name) => {
      const lists = sheet.spellTagLists[name];
      return lists?.aptitudeIds.includes(aptitudeId) ? [{ name, joinsClassList: lists.joinsClassList }] : [];
    });
    return kept?.length ? kept : undefined;
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
   * The character's spell slots, as the summary at the start of its sheets' spells prints them: a column per spell
   * level it has slots at, a row for its Spellcasting's (every class's spells cast with them, as the SRD 5.2.1's
   * Multiclass Spellcaster table gives them by its levels) and one for its Pact Magic's (all of one level). None for a
   * character with no slot.
   */
  static describeSlots(character: SpellSource): SpellSlots {
    const { pact, slots } = character.getSpellcasting();
    const counts = new Map(SPELL_LEVELS.map((level) => [level, slots[String(level)] ?? 0]));
    const levels = SPELL_LEVELS.filter(
      (level) => (counts.get(level) ?? 0) > 0 || (pact.slots > 0 && pact.level === level),
    );
    const rows = [
      { aptitudeName: "Spell Slots", count: (level: number) => counts.get(level) ?? 0 },
      { aptitudeName: "Pact Magic", count: (level: number) => (pact.level === level ? pact.slots : 0) },
    ];
    return {
      labels: levels.map((level) => SPELL_LEVEL_LABELS[level]),
      levels,
      lists: rows
        .filter(({ count }) => levels.some((level) => count(level) > 0))
        .map(({ aptitudeName, count }) => ({
          aptitudeName,
          slots: levels.map((level) => (count(level) > 0 ? String(count(level)) : null)),
        })),
    };
  }
}
