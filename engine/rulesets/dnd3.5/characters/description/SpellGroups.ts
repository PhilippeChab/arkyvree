import type { SpellTagLists } from "@/engine/rulesets/dnd3.5/model/spellcasting/SpellcastingState.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/model/spellcasting/SpellLists.ts";
import { SPELL_SCHOOL } from "@/shared/dnd3.5/properties/index.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { stripSeparators } from "@/shared/text.ts";

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

/** What the groups read of a character: its classes' levels, its computed powers, its aptitudes and spell tags. */
interface SpellSheet {
  aptitudes: Record<string, { id: string; name: string }>;
  classes: Record<string, { levels?: { klassLevel?: { level: number } | null; powers?: LevelSpell[] }[] }>;
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
  getSpellTagLists(): SpellSheet["spellTagLists"];
  getSpellTags(): SpellSheet["spellTags"];
  getVirtualPowers(): SpellSheet["virtualPowers"];
}

/**
 * A character's spells as its sheets list them, the web sheet's and the PDF's alike: by aptitude (its spell list), then
 * by spell level, with the uses per day the aptitude allows there.
 */
export default class SpellGroups {
  /** The levels' spells, a spell once per group with all its tags, then the spells modifiers give. */
  private static groupSpells(sheet: SpellSheet, aptitudeNameById: Map<string, string>) {
    const groupMap = new Map<string, SpellGroup>();
    const groupOf = (aptitudeId: string, level: number) => {
      const key = `${aptitudeId}:${level}`;
      let group = groupMap.get(key);
      if (!group) {
        const aptitudeName = aptitudeNameById.get(aptitudeId) || "Spells";
        group = { aptitudeName, level, uses: SpellGroups.usesPerDay(sheet.aptitudes, aptitudeName, level), spells: [] };
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
      powers: powers.getFlatPowers(),
      spellTagLists: character.getSpellTagLists(),
      spellTags: character.getSpellTags(),
      virtualPowers: character.getVirtualPowers(),
    };
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
}
