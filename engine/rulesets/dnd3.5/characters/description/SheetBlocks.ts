import type {
  EntriesBlock,
  InventoryBlock,
  InventoryWords,
  PoolsBlock,
  ScoresBlock,
  SheetBlock,
  SheetColumn,
  SheetEntry,
  SheetStat,
  StatsBlock,
  Subsheet,
  TableBlock,
} from "@/engine/core/module/index.ts";
import IdentityFields from "@/engine/rulesets/dnd3.5/characters/IdentityFields.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import type { Feat } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import { formatSigned } from "@/shared/text.ts";
import { MIN_ABILITY_SCORE } from "@/vocabulary/dnd3.5/abilities.ts";
import { FEAT_STACKABLE, ITEM_COST_GP, ITEM_WEIGHT } from "@/vocabulary/dnd3.5/fields/index.ts";

import type CharacterResponse from "./CharacterResponse.ts";
import type CombatSheet from "./CombatSheet.ts";
import type SpellGroups from "./SpellGroups.ts";

/** An ability as its box reads it: its names, its total and modifier, its base, and its other parts. */
interface SheetAbility {
  abbreviation: string;
  base: number;
  modifier: number;
  name: string;
  parts: SheetStat[];
  total: number;
}

/**
 * What a 3.5 sheet's blocks read of its sheet, as the API answers it: its abilities, saves, combat (its load among
 * it), skills, classes (their levels' feats), the feats it has without a pick, its spells, known and per day, and its
 * equipment.
 */
interface SheetParts {
  abilities: (SheetAbility & { abilityId: string })[];
  classes: Record<string, { levels: { feats: SheetFeat[] }[] }>;
  combat: ReturnType<typeof CombatSheet.describe>;
  equipment: ReturnType<typeof CharacterResponse.equipmentOf>;
  identity: Parameters<typeof IdentityFields.describe>[0];
  saves: Record<string, { name: string; parts: SheetStat[]; total: number }>;
  skills: Record<string, SheetSkill>;
  spellGroups: ReturnType<typeof SpellGroups.describe>;
  spellsPerDay: ReturnType<typeof SpellGroups.describePerDay>;
  virtualFeats: SheetFeat[];
}

/** A skill as its row reads it: its names, whether it's a class skill (`innate`), and its figures. */
interface SheetSkill {
  ability: number;
  family: string | null;
  innate?: boolean;
  misc: number;
  name: string;
  rank?: number;
  shortName: string;
  total: number;
  weight?: number;
}

/**
 * A bonded creature's sheet (`CharacterResponse.buildBondedSheet`), which its subsheet reads (its blocks, its combat,
 * its feats), with the feat of its master's that bonds it.
 */
type BondedSheet = Pick<
  ReturnType<typeof CharacterResponse.buildBondedSheet>,
  "blocks" | "combat" | "feats" | "id" | "name"
> & {
  bondFeatId: string | null;
};

/** A feat a sheet lists: its id, name and description, and whether the character may hold it more than once. */
type SheetFeat = Pick<Feat, "description" | "id" | "name"> & { fields: Pick<Feat["fields"], typeof FEAT_STACKABLE> };

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

/** What the equipment's table, its add, edit and remove dialogs, their fields and their toasts say. */
const INVENTORY_WORDS: InventoryWords = {
  add: "Add Item",
  added: "Item added to inventory",
  addTitle: "Add Item to Inventory",
  charges: "Charges",
  columns: {
    item: "Item",
    slot: "Slot",
    quantity: "Quantity",
    weight: "Weight",
    value: "Value",
    description: "Description",
  },
  create: "Create Item",
  createHint: "Opens the ruleset's Items tab in a new browser tab",
  editTitle: "Edit Inventory Item",
  handSlot: "Hand Slot",
  inventory: "Inventory",
  item: "Item",
  itemRequired: "Item is required",
  items: "Items",
  notEquipped: "Not Equipped",
  quantityRequired: "Quantity is required",
  remainingCharges: "Remaining Charges",
  remove: {
    title: "Remove Item",
    message: "Are you sure you want to remove this item from the inventory? This action cannot be undone.",
    confirm: "Remove Item",
  },
  removed: "Item removed from inventory",
  removeFailed: "Failed to remove item",
  saveFailed: "Failed to save item",
  search: "Search Item",
  slot: "Equipment Slot",
  slotWarning: "Slot warning",
  totalCharges: "Total Charges",
  unknown: "Unknown Item",
  updated: "Item updated",
  warnings: "Equipment Warnings",
  group: "Set",
  groupRequired: "Weapon set is required",
  groups: "Weapon Sets",
};

/** What a weapon set with no weapon says, and a sheet with no weapon set. */
const NO_WEAPONS = "No weapons equipped";

/** A skill's columns: on a phone, its name leads, its total at the line's end, and its parts under them, named. */
const SKILL_COLUMNS: SheetColumn[] = [
  { key: "skill", label: "Skill", slot: "primary" },
  { key: "rank", label: "Rank", width: "56px", align: "center", slot: "labeled" },
  { key: "ability", label: "Ability", width: "64px", align: "center", slot: "labeled" },
  { key: "misc", label: "Misc. Bonus", width: "96px", align: "center", slot: "labeled", hideEmpty: true },
  { key: "weight", label: "Armor Check", width: "104px", align: "center", slot: "labeled", hideEmpty: true },
  { key: "total", label: "Total", width: "56px", align: "center", slot: "trailing", strong: true },
];

/** A spell's columns: on a phone, its name leads, its DC at the line's end, its school and save under them. */
const SPELL_COLUMNS: SheetColumn[] = [
  { key: "name", label: "Name", width: "40%", slot: "primary" },
  { key: "school", label: "School", width: "20%", slot: "inline", hideEmpty: true, noDash: true },
  { key: "save", label: "Save", width: "30%", slot: "labeled", hideEmpty: true, noDash: true },
  { key: "dc", label: "DC", width: "10%", align: "center", slot: "labeled", hideEmpty: true },
];

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
        role: "score",
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
        base: { label: "Base", value: ability.base, min: MIN_ABILITY_SCORE, max: RULESET_LIMITS.abilityScore },
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

  /**
   * The feats and special abilities: the character's levels' feats, by name in the order it took them, a stackable one
   * held more than once counted on one entry ("(x2)"), each other one entry each; then those it has without a pick,
   * granted apart.
   */
  private static feats(classes: SheetParts["classes"], virtualFeats: SheetFeat[]): EntriesBlock {
    const byName = new Map<string, SheetFeat[]>();
    for (const feat of Object.values(classes).flatMap((klass) => klass.levels.flatMap((level) => level.feats))) {
      const held = byName.get(feat.name);
      if (held) held.push(feat);
      else byName.set(feat.name, [feat]);
    }
    const entryOf = (feat: SheetFeat, key: string, count?: number): SheetEntry => ({
      key,
      id: feat.id,
      name: feat.name,
      description: feat.description,
      ...(count !== undefined && { count }),
    });
    const entries = [...byName.values()].flatMap((held, group) => {
      const [feat] = held;
      if (feat.fields[FEAT_STACKABLE] && held.length > 1) return [entryOf(feat, `${feat.name}-${group}`, held.length)];
      return held.map((each, index) => entryOf(each, `${each.name}-${group}-${index}`));
    });
    return {
      kind: "entries",
      key: "feats",
      title: "Feats & Special Abilities",
      empty: "No feats or special abilities",
      entityType: "feats",
      entries,
      ...(virtualFeats.length > 0 && {
        granted: { label: "Granted", entries: virtualFeats.map((feat) => entryOf(feat, feat.id)) },
      }),
    };
  }

  /**
   * The equipment: each entry its item's name (empty for an item gone: its words name it), where it's worn, how many,
   * its weight in pounds and its cost in gold pieces, whether it's equipped, and its charges; then the load it makes,
   * in pounds.
   */
  private static inventory(equipment: SheetParts["equipment"], load: SheetParts["combat"]["load"]): InventoryBlock {
    return {
      kind: "inventory",
      key: "equipment",
      title: "Equipment & Inventory",
      empty: "No equipment",
      entityType: "items",
      itemFields: { cost: ITEM_COST_GP, weight: ITEM_WEIGHT },
      rows: equipment.map((entry) => ({
        key: entry.id,
        id: entry.itemId,
        name: entry.name,
        description: entry.description,
        slot: entry.slotLabel,
        quantity: entry.quantity,
        weight: entry.weight,
        cost: entry.costGp,
        held: entry.equipped,
        ...(entry.totalCharges != null && {
          charges: { remaining: entry.remainingCharges, total: entry.totalCharges },
        }),
      })),
      load: {
        figures: load.figures.map(({ label, shortLabel, weight }) => ({ label, short: shortLabel, weight })),
        status: load.status,
      },
      units: { cost: { one: "gp", many: "gp" }, weight: { one: "lb", many: "lbs" } },
      words: INVENTORY_WORDS,
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

  /**
   * The skills, by name: each its rank, its ability's modifier, its misc bonus and armor check penalty where it has
   * them, and its total; a class skill marked ("*", which its note says), and a family two or more share grouped.
   */
  private static skills(skills: SheetParts["skills"]): TableBlock {
    const marked = (name: string, skill: SheetSkill) => `${name}${skill.innate ? " *" : ""}`;
    return {
      kind: "table",
      key: "skills",
      title: "Skills",
      empty: "No skills",
      note: "* indicates a class skill",
      table: {
        columns: SKILL_COLUMNS,
        empty: "No skills",
        fixed: true,
        grouped: true,
        minWidth: 520,
        rows: Object.values(skills)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((skill) => ({
            key: skill.name,
            cells: {
              skill: marked(skill.name, skill),
              rank: String(skill.rank || 0),
              ability: formatSigned(skill.ability),
              misc: skill.misc !== 0 ? formatSigned(skill.misc) : "",
              weight: skill.weight ? `-${skill.weight}` : "",
              total: formatSigned(skill.total),
            },
            ...(skill.family !== null && { group: skill.family }),
            short: marked(skill.shortName, skill),
          })),
      },
    };
  }

  /**
   * The spells, known and per day: each list's spells by spell level, each level's uses a day where it has them, each
   * spell its school, save and DC, its tags, and its details and description; and the slots per day, a row per list
   * with slots. None for a character with neither.
   */
  private static spells(spellGroups: SheetParts["spellGroups"], perDay: SheetParts["spellsPerDay"]): PoolsBlock[] {
    if (spellGroups.length === 0 && perDay.lists.length === 0) return [];
    return [
      {
        kind: "pools",
        key: "spells",
        title: "Spells",
        empty: "No spells",
        entityType: "spells",
        columns: SPELL_COLUMNS,
        ...(perDay.lists.length > 0 && {
          counts: {
            title: "Spells per Day",
            corner: "Spell List",
            tiers: perDay.labels,
            lists: perDay.lists.map(({ aptitudeName, slots }) => ({ name: aptitudeName, counts: slots })),
          },
        }),
        pools: spellGroups.map(({ aptitudeName, levels }) => ({
          key: aptitudeName,
          name: aptitudeName,
          tiers: levels.map(({ label, level, spells, uses }) => ({
            key: String(level),
            label,
            ...(uses != null && { note: `${uses}/day` }),
            entries: spells.map((spell) => ({
              key: spell.name,
              id: spell.id,
              cells: {
                name: spell.name,
                school: spell.school,
                save: spell.save,
                dc: spell.dc == null ? "" : String(spell.dc),
              },
              tags: (spell.tags ?? []).map(({ joinsClassList, name }) => ({
                name,
                tone: joinsClassList ? ("secondary" as const) : ("primary" as const),
              })),
              details: spell.details,
              description: spell.description,
            })),
          })),
        })),
      },
    ];
  }

  /**
   * A bonded creature's subsheet, from its sheet: its abilities in compact boxes, its armor class, its summary and its
   * saves, and its feats' names, sorted.
   */
  private static subsheet(bonded: BondedSheet): Subsheet {
    const scoresOf = (key: string) =>
      bonded.blocks.find((block): block is ScoresBlock => block.kind === "scores" && block.key === key)?.scores ?? [];
    const combat = bonded.blocks.find((block) => block.kind === "stats" && block.key === "combat");
    const featNames = Object.values(bonded.feats)
      .filter((feat): feat is Extract<typeof feat, { possessed: boolean }> => typeof feat.possessed === "boolean")
      .filter((feat) => feat.possessed)
      .map((feat) => feat.name)
      .sort();
    return {
      id: bonded.id,
      name: bonded.name,
      scores: { title: "Abilities", scores: scoresOf("abilities") },
      stats: {
        title: "Combat & Saves",
        // A creature has one weapon set, its natural attacks', with no shield: its armor class
        ...(combat?.kind === "stats" && combat.panels[0]?.boxes && { boxes: combat.panels[0].boxes }),
        columns: [
          { key: "summary", lines: bonded.combat.summary },
          { key: "saves", lines: scoresOf("saves").map(({ label, value }) => ({ label, value: formatSigned(value) })) },
        ],
      },
      chips: { title: "Feats", names: featNames },
    };
  }

  /**
   * A master's blocks with its bonded creatures (`bonded`, each with the feat that bonds it) in its feats' details:
   * each feat's entry the subsheet of the creature it bonds (the last one, if several).
   */
  static bond(blocks: SheetBlock[], bonded: BondedSheet[]): SheetBlock[] {
    const byFeat = new Map(bonded.map((creature) => [creature.bondFeatId, creature]));
    return blocks.map((block) => {
      if (block.kind !== "entries" || block.key !== "feats") return block;
      const entries = block.entries.map((entry) => {
        const creature = entry.id === null ? undefined : byFeat.get(entry.id);
        return creature ? { ...entry, subsheet: SheetBlocks.subsheet(creature) } : entry;
      });
      return { ...block, entries };
    });
  }

  /** The sheet's blocks, from its parts as the API answers them, in its sections' order. */
  static describe(parts: SheetParts): SheetBlock[] {
    return [
      IdentityFields.describe(parts.identity),
      SheetBlocks.abilities(parts.abilities),
      SheetBlocks.saves(parts.saves),
      SheetBlocks.combat(parts.combat),
      SheetBlocks.skills(parts.skills),
      SheetBlocks.feats(parts.classes, parts.virtualFeats),
      ...SheetBlocks.spells(parts.spellGroups, parts.spellsPerDay),
      SheetBlocks.inventory(parts.equipment, parts.combat.load),
    ];
  }
}
