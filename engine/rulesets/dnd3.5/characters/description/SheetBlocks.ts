import type { ScoresBlock, SheetBlock, SheetColumn, SheetStat, StatsBlock } from "@/engine/core/module/index.ts";
import { MAX_ABILITY_SCORE, MIN_ABILITY_SCORE } from "@/vocabulary/dnd3.5/abilities.ts";

import type CombatSheet from "./CombatSheet.ts";

/** An ability as its box reads it: its names, its total and modifier, its base, and its other parts. */
interface SheetAbility {
  abbreviation: string;
  base: number;
  modifier: number;
  name: string;
  parts: SheetStat[];
  total: number;
}

/** What a 3.5 sheet's blocks read of its sheet: its abilities, saves and combat, as the API answers them. */
interface SheetParts {
  abilities: (SheetAbility & { abilityId: string })[];
  combat: ReturnType<typeof CombatSheet.describe>;
  saves: Record<string, { name: string; parts: SheetStat[]; total: number }>;
}

/**
 * An attack's columns. On a phone, its weapon leads, its attack bonus at the line's end, and the rest under them
 * ("1d8 · ×3 · 1,100 ft. · -2 / 110 ft. · Piercing").
 */
const ATTACK_COLUMNS: SheetColumn[] = [
  { key: "weapon", label: "Weapon", width: "22%", slot: "primary" },
  { key: "attack", label: "Attack Bonus", width: "15%", align: "center", slot: "trailing" },
  { key: "damage", label: "Damage", width: "12%", align: "center", slot: "inline", hideEmpty: true },
  { key: "critical", label: "Critical", width: "11%", align: "center", slot: "inline" },
  { key: "range", label: "Range", width: "11%", align: "center", slot: "inline", hideEmpty: true, noWrap: true },
  {
    key: "increment",
    label: "Increment",
    width: "13%",
    align: "center",
    slot: "inline",
    hideEmpty: true,
    noWrap: true,
  },
  { key: "type", label: "Type", width: "16%", align: "center", slot: "inline", hideEmpty: true },
];

/** What a weapon set with no weapon says, and a sheet with no weapon set. */
const NO_WEAPONS = "No weapons equipped";

/**
 * A 3.5 sheet's blocks, in its order: its ability scores, its saving throws, and its combat with its weapon sets. What
 * its sections show, in the core's shapes (`SheetBlock`).
 */
export default class SheetBlocks {
  /** The ability scores: each its total over its modifier, its base its owner sets within the rules' bounds. */
  private static abilities(abilities: SheetParts["abilities"]): ScoresBlock {
    return {
      kind: "scores",
      key: "abilities",
      title: "Ability Scores",
      empty: "No ability scores",
      edit: {
        failed: "Failed to update ability score",
        lower: {
          title: "Decrease Ability Score",
          message:
            "Are you sure you want to decrease this ability score? It may break the prerequisites of what the character took.",
          confirm: "Decrease Ability Score",
        },
      },
      scores: abilities.map((ability) => ({
        key: ability.abilityId,
        label: ability.name,
        short: ability.abbreviation,
        value: ability.total,
        badge: ability.modifier,
        base: { label: "Base", value: ability.base, min: MIN_ABILITY_SCORE, max: MAX_ABILITY_SCORE },
        parts: ability.parts,
      })),
    };
  }

  /**
   * The combat: its line (HP, Initiative, Speed, BAB, Grapple), then its weapon sets, each headed by its number and
   * what its hands hold (none when the character has no weapon set, its one loadout striking unarmed), with its armor
   * class in boxes and its weapons' attacks, a weapon its wielder isn't proficient with flagged.
   */
  private static combat(combat: SheetParts["combat"]): StatsBlock {
    return {
      kind: "stats",
      key: "combat",
      title: "Combat",
      empty: NO_WEAPONS,
      stats: combat.stats,
      panels: combat.weaponSets.map(({ set, armorClass, held, weapons }) => ({
        key: String(set),
        ...(combat.hasWeaponSets && {
          heading: { label: `Set ${set + 1}`, ...(held.length > 0 && { note: held.join(", ") }) },
        }),
        boxes: armorClass,
        table: {
          columns: ATTACK_COLUMNS,
          empty: NO_WEAPONS,
          minWidth: 700,
          rows: weapons.flatMap((weapon) =>
            weapon.rows.map((row) => ({
              key: row.key,
              cells: {
                weapon: weapon.name,
                attack: row.attack,
                damage: row.damage,
                critical: row.critical,
                range: row.range,
                increment: row.increment,
                type: row.types,
              },
              caption: row.label,
              ...(!weapon.proficient && { alert: "Not Proficient (-4)" }),
            })),
          ),
        },
      })),
    };
  }

  /** The saving throws: each its total, signed, and its parts (its base, its ability's, its misc). */
  private static saves(saves: SheetParts["saves"]): ScoresBlock {
    return {
      kind: "scores",
      key: "saves",
      title: "Saving Throws",
      empty: "No saving throws",
      scores: Object.entries(saves).map(([key, save]) => ({
        key,
        label: save.name,
        short: save.name,
        value: save.total,
        signed: true,
        parts: save.parts,
      })),
    };
  }

  /** The sheet's blocks, from its parts as the API answers them. */
  static describe({ abilities, combat, saves }: SheetParts): SheetBlock[] {
    return [SheetBlocks.abilities(abilities), SheetBlocks.saves(saves), SheetBlocks.combat(combat)];
  }
}
