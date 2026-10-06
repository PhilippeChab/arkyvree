/**
 * A character's spells, grouped for its sheet: by aptitude (its spell list), then by spell level, with the uses per
 * day the aptitude allows there. The web sheet and the PDF sheet read the same data: the character response's.
 */

import { SPELL_SCHOOL } from "@/shared/dnd3.5/properties/index.ts";
import { toSpellPossessionSlug } from "@/shared/dnd3.5/spells.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { stripSeparators } from "@/shared/text.ts";

/** A spell a modifier gives without a pick. */
interface GivenSpell {
  id: string;
  name: string;
  aptitudeId: string;
  level: number;
  saveName: string | null;
  saveEffect: string | null;
  dc: number | null;
  description: string | null;
  properties: Record<string, string>;
}

/** A spell a class level picked or granted. */
interface LevelSpell {
  id: string;
  name: string;
  aptitudeId: string;
  powerLevel?: number | null;
  saveName?: string | null;
  saveEffect?: string | null;
  description?: string | null;
}

export interface AptitudeSpells {
  aptitudeName: string;
  levels: SpellGroup[];
}

export interface SpellGroup {
  aptitudeName: string;
  level: number;
  uses: number | null;
  spells: SpellRow[];
}

export interface SpellRow {
  id: string;
  name: string;
  school: string;
  save: string;
  dc: number | null;
  description: string;
  properties: Record<string, string>;
  tags?: SpellRowTag[];
}

/** A tag a spell row shows. */
export interface SpellRowTag {
  name: string;
  joinsClassList: boolean;
}

/** What the groups read of a character: its classes' levels, its computed powers, its aptitudes and spell tags. */
export interface SpellSheet {
  classes: Record<string, { levels?: { klassLevel?: { level: number } | null; powers?: LevelSpell[] }[] }>;
  powers?: Record<
    string,
    {
      properties?: Record<string, string>;
      // Its DC as each class casts it, by the class's aptitude slug
      dc?: Record<string, { total: number }> | null;
      power?: { description?: string | null };
    }
  >;
  virtualPowers?: GivenSpell[];
  aptitudes?: Record<string, { id: string; name: string }>;
  spellTags?: Record<string, string[]>;
  spellTagLists?: Record<string, SpellTagLists>;
}

/**
 * Where a feat's tag on the spells of a list it gives slots in or joins to its class's list shows (a cleric's domain,
 * "Fire Domain"; a specialist wizard's school, "Evocation Specialist"): on that list and on the lists of the class whose
 * level gave the feat. `joinsClassList`: whether the list's spells join that class's list, as a domain's do.
 */
export interface SpellTagLists {
  aptitudeIds: string[];
  joinsClassList: boolean;
}

function saveOf(saveName: string | null | undefined, saveEffect: string | null | undefined) {
  return saveName && saveEffect ? `${saveName} ${saveEffect}` : saveEffect || "None";
}

/** A spell's tags that show on this list: a domain's on the cleric's, a school's on the wizard's. */
function tagsFor(sheet: SpellSheet, powerId: string | undefined, aptitudeId: string): SpellRowTag[] | undefined {
  const kept = (powerId ? sheet.spellTags?.[powerId] : undefined)?.flatMap((name) => {
    const lists = sheet.spellTagLists?.[name];
    return lists?.aptitudeIds.includes(aptitudeId) ? [{ name, joinsClassList: lists.joinsClassList }] : [];
  });
  return kept?.length ? kept : undefined;
}

/** The uses per day an aptitude allows at a spell level, read off its per-level entry. */
function usesPerDay(aptitudes: SpellSheet["aptitudes"], aptitudeName: string, spellLevel: number): number | null {
  // Leveled aptitudes carry a per-spell-level entry the sheet's type doesn't declare.
  const aptitude: Record<string, unknown> | undefined = aptitudes?.[stripSeparators(aptitudeName)];
  const levelData = aptitude?.[String(spellLevel)];
  return isRecord(levelData) && typeof levelData.uses === "number" ? levelData.uses : null;
}

/** The levels' spells, a spell once per group with all its tags, then the spells modifiers give. */
function groupSpells(sheet: SpellSheet, aptitudeNameById: Map<string, string>) {
  const groupMap = new Map<string, SpellGroup>();
  const groupOf = (aptitudeId: string, level: number) => {
    const key = `${aptitudeId}:${level}`;
    let group = groupMap.get(key);
    if (!group) {
      const aptitudeName = aptitudeNameById.get(aptitudeId) || "Spells";
      group = { aptitudeName, level, uses: usesPerDay(sheet.aptitudes, aptitudeName, level), spells: [] };
      groupMap.set(key, group);
    }
    return group;
  };

  for (const klass of Object.values(sheet.classes)) {
    for (const level of klass.levels || []) {
      for (const power of level.powers || []) {
        const group = groupOf(power.aptitudeId, power.powerLevel ?? level.klassLevel?.level ?? 0);
        const powerData = sheet.powers?.[stripSeparators(power.name)];
        const properties = powerData?.properties ?? {};
        const tags = tagsFor(sheet, power.id, power.aptitudeId);
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
          save: saveOf(power.saveName, power.saveEffect),
          dc: powerData?.dc?.[toSpellPossessionSlug(group.aptitudeName)]?.total ?? null,
          description: powerData?.power?.description || power.description || "",
          properties,
          tags,
        });
      }
    }
  }

  for (const given of sheet.virtualPowers || []) {
    const properties = given.properties ?? {};
    groupOf(given.aptitudeId, given.level).spells.push({
      id: given.id,
      name: given.name,
      school: properties[SPELL_SCHOOL] || "—",
      save: saveOf(given.saveName, given.saveEffect),
      dc: given.dc ?? null,
      description: given.description || "",
      properties,
    });
  }
  return groupMap;
}

/** The character's spells by aptitude (by name), each aptitude's levels in order and their spells by name. */
export function buildSpellGroups(sheet: SpellSheet): AptitudeSpells[] {
  const aptitudeNameById = new Map<string, string>();
  for (const apt of Object.values(sheet.aptitudes ?? {})) {
    if (apt.id) aptitudeNameById.set(apt.id, apt.name);
  }

  const byAptitude = new Map<string, AptitudeSpells>();
  for (const group of groupSpells(sheet, aptitudeNameById).values()) {
    group.spells.sort((a, b) => a.name.localeCompare(b.name));
    const existing = byAptitude.get(group.aptitudeName);
    if (existing) existing.levels.push(group);
    else byAptitude.set(group.aptitudeName, { aptitudeName: group.aptitudeName, levels: [group] });
  }

  const sorted = [...byAptitude.values()].sort((a, b) => a.aptitudeName.localeCompare(b.aptitudeName));
  for (const apt of sorted) apt.levels.sort((a, b) => a.level - b.level);
  return sorted;
}
