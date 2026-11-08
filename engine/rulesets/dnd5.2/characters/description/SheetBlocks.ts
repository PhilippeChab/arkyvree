import type {
  EntriesBlock,
  FieldsBlock,
  InventoryBlock,
  InventoryWords,
  PoolsBlock,
  ScoresBlock,
  SheetBlock,
  SheetColumn,
  SheetEntry,
  SheetStat,
  StatsBlock,
  TableBlock,
} from "@/engine/core/module/index.ts";
import IdentityFields from "@/engine/rulesets/dnd5.2/characters/IdentityFields.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd5.2/limits.ts";
import type { Feat } from "@/engine/rulesets/dnd5.2/view/rows.ts";
import { formatSigned } from "@/shared/text.ts";
import { MIN_ABILITY_SCORE } from "@/vocabulary/dnd5.2/abilities.ts";
import { FEAT_STACKABLE, ITEM_COST_GP, ITEM_WEIGHT } from "@/vocabulary/dnd5.2/fields/index.ts";

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
 * What a sheet's blocks read of its sheet, as the API answers it: its abilities, saves, combat (what it carries among
 * it), skills and passive Perception, classes (their levels' feats), the feats it has without a pick, its spells and
 * spell slots, and its equipment.
 */
interface SheetParts {
  abilities: (SheetAbility & { abilityId: string })[];
  classes: Record<string, { levels: { feats: { entity: SheetFeat }[] }[] }>;
  combat: ReturnType<typeof CombatSheet.describe>;
  equipment: ReturnType<typeof CharacterResponse.equipmentOf>;
  identity: Parameters<typeof IdentityFields.describe>[0];
  passivePerception: number | null;
  saves: Record<string, { name: string; parts: SheetStat[]; proficient: boolean; total: number }>;
  skills: Record<string, SheetSkill>;
  spellGroups: ReturnType<typeof SpellGroups.describe>;
  spellSlots: ReturnType<typeof SpellGroups.describeSlots>;
  virtualFeats: SheetFeat[];
}

/**
 * A skill as its row reads it: its name and ability, whether the character is proficient in it, with Expertise or
 * half proficient (a bard's Jack of All Trades), what its proficiency adds, and its misc and total.
 */
interface SheetSkill {
  ability: number;
  abilityName: string;
  expertise: boolean;
  halfproficient: boolean;
  misc: number;
  name: string;
  proficiency: number;
  proficient: boolean;
  total: number;
}

/** A feat a sheet lists: its id, name and description, and whether the character may hold it more than once. */
type SheetFeat = Pick<Feat, "description" | "id" | "name"> & { fields: Pick<Feat["fields"], typeof FEAT_STACKABLE> };

/**
 * An attack's columns. On a phone, its weapon leads, its attack bonus at the line's end, and the rest under them
 * ("1d8+3 · 20 · 80/320 ft. · Piercing · Vex").
 */
const ATTACK_COLUMNS: SheetColumn[] = [
  { key: "weapon", label: "Weapon", width: "22%", slot: "primary" },
  { key: "attack", label: "Attack Bonus", width: "13%", align: "center", slot: "trailing" },
  { key: "damage", label: "Damage", width: "13%", align: "center", slot: "inline", hideEmpty: true },
  { key: "critical", label: "Critical", width: "10%", align: "center", slot: "inline" },
  { key: "range", label: "Range", width: "14%", align: "center", slot: "inline", hideEmpty: true, noWrap: true },
  { key: "type", label: "Type", width: "14%", align: "center", slot: "inline", hideEmpty: true },
  { key: "mastery", label: "Mastery", width: "14%", align: "center", slot: "inline", hideEmpty: true },
];

/** The fields of an item its equipment's rows read its cost and its weight off, which its add dialog shows them by. */
const INVENTORY_ITEM_FIELDS = { cost: ITEM_COST_GP, weight: ITEM_WEIGHT } as const;

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
  { key: "ability", label: "Ability", width: "72px", align: "center", slot: "labeled" },
  { key: "proficiency", label: "Proficiency", width: "96px", align: "center", slot: "labeled", hideEmpty: true },
  { key: "misc", label: "Misc. Bonus", width: "96px", align: "center", slot: "labeled", hideEmpty: true },
  { key: "total", label: "Total", width: "56px", align: "center", slot: "trailing", strong: true },
];

/** A skill's mark beside its name: proficient (*), with Expertise (**), or half proficient (½). */
const SKILL_MARKS = { expertise: " **", half: " ½", proficient: " *" } as const;

/** A spell's columns: on a phone, its name leads, its DC at the line's end, its school and saving throw under them. */
const SPELL_COLUMNS: SheetColumn[] = [
  { key: "name", label: "Name", width: "40%", slot: "primary" },
  { key: "school", label: "School", width: "20%", slot: "inline", hideEmpty: true, noDash: true },
  { key: "save", label: "Save", width: "30%", slot: "labeled", hideEmpty: true, noDash: true },
  { key: "dc", label: "DC", width: "10%", align: "center", slot: "labeled", hideEmpty: true },
];

/**
 * A D&D 5th Edition sheet's blocks, in its order: its identity, its ability scores, its saving throws, its combat with
 * its weapon sets, its skills, its feats, its spells and its equipment. What its sections show, in the core's shapes
 * (`SheetBlock`).
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
   * The combat: its line (HP, Initiative, Speed, Proficiency Bonus, Attacks), then its weapon sets, each headed by its
   * number and what its hands hold (none when the character has no weapon set, its one loadout striking unarmed), with
   * its Armor Class in a box and its weapons' attacks, a weapon its wielder isn't proficient with flagged (its attack
   * adds no Proficiency Bonus).
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
                type: row.types,
                mastery: row.mastery,
              },
              caption: row.label,
              ...(!weapon.proficient && { alert: "Not Proficient" }),
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
    const levels = Object.values(classes).flatMap((klass) => klass.levels);
    for (const { entity: feat } of levels.flatMap((level) => level.feats)) {
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
   * its weight in pounds and its cost in gold pieces, whether it's equipped, and its charges; then what the character
   * carries against its capacity, in pounds.
   */
  private static inventory(equipment: SheetParts["equipment"], load: SheetParts["combat"]["load"]): InventoryBlock {
    return {
      kind: "inventory",
      key: "equipment",
      title: "Equipment & Inventory",
      empty: "No equipment",
      entityType: "items",
      itemFields: INVENTORY_ITEM_FIELDS,
      rows: equipment.map((entry) => ({
        key: entry.id,
        id: entry.itemId,
        name: entry.name,
        description: entry.description,
        slot: entry.slotLabel,
        quantity: entry.quantity,
        weight: entry.fields[INVENTORY_ITEM_FIELDS.weight] ?? null,
        cost: entry.fields[INVENTORY_ITEM_FIELDS.cost] ?? null,
        held: entry.location !== null,
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

  /** A saving throw's name, marked (*) when the character is proficient in it. */
  private static markedSave(save: { name: string; proficient: boolean }): string {
    return save.proficient ? `${save.name} *` : save.name;
  }

  /**
   * The saving throws: each its total, signed, and its parts (its ability's, its Proficiency Bonus, +0 when not
   * proficient, its misc), a proficient one marked (*).
   */
  private static saves(saves: SheetParts["saves"]): ScoresBlock {
    return {
      kind: "scores",
      key: "saves",
      title: "Saving Throws",
      empty: "No saving throws",
      scores: Object.entries(saves).map(([key, save]) => ({
        key,
        label: SheetBlocks.markedSave(save),
        short: SheetBlocks.markedSave(save),
        value: save.total,
        signed: true,
        parts: save.parts,
      })),
    };
  }

  /** A skill's mark beside its name (`SKILL_MARKS`): none for a skill the character isn't proficient in. */
  private static skillMark(skill: SheetSkill): string {
    if (skill.expertise) return SKILL_MARKS.expertise;
    if (skill.proficient) return SKILL_MARKS.proficient;
    return skill.halfproficient ? SKILL_MARKS.half : "";
  }

  /**
   * The skills, by name: each its ability's modifier, what its proficiency adds and its misc bonus where it has them,
   * and its total; a proficient one marked (*, ** with Expertise, ½ half proficient), which its note says, with the
   * character's passive Perception.
   */
  private static skills(skills: SheetParts["skills"], passivePerception: number | null): TableBlock {
    const marked = (skill: SheetSkill) => `${skill.name}${SheetBlocks.skillMark(skill)}`;
    const passive = passivePerception === null ? "" : ` · Passive Perception ${passivePerception}`;
    return {
      kind: "table",
      key: "skills",
      title: "Skills",
      empty: "No skills",
      note: `* proficient, ** Expertise, ½ half proficient${passive}`,
      table: {
        columns: SKILL_COLUMNS,
        empty: "No skills",
        fixed: true,
        minWidth: 480,
        rows: Object.values(skills)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((skill) => ({
            key: skill.name,
            cells: {
              skill: marked(skill),
              ability: `${formatSigned(skill.ability)} (${skill.abilityName.slice(0, 3).toUpperCase()})`,
              proficiency: skill.proficiency !== 0 ? formatSigned(skill.proficiency) : "",
              misc: skill.misc !== 0 ? formatSigned(skill.misc) : "",
              total: formatSigned(skill.total),
            },
            short: marked(skill),
          })),
      },
    };
  }

  /**
   * The spells and spell slots: each list's spells by spell level, each spell its school, saving throw and DC, its
   * tags, and its details and description; and the slots, a row for its Spellcasting's and one for its Pact Magic's.
   * None for a character with neither.
   */
  private static spells(spellGroups: SheetParts["spellGroups"], slots: SheetParts["spellSlots"]): PoolsBlock[] {
    if (spellGroups.length === 0 && slots.lists.length === 0) return [];
    return [
      {
        kind: "pools",
        key: "spells",
        title: "Spells",
        empty: "No spells",
        entityType: "spells",
        columns: SPELL_COLUMNS,
        ...(slots.lists.length > 0 && {
          counts: {
            title: "Spell Slots",
            corner: "Slots",
            tiers: slots.labels,
            lists: slots.lists.map(({ aptitudeName, slots: counts }) => ({ name: aptitudeName, counts })),
          },
        }),
        pools: spellGroups.map(({ aptitudeName, levels }) => ({
          key: aptitudeName,
          name: aptitudeName,
          tiers: levels.map(({ label, level, spells }) => ({
            key: String(level),
            label,
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
   * A sheet's block of a kind (`kind`) under its key (`key`), one `describe` gives every sheet: what the printed
   * sheet's pages render.
   */
  static blockOf<K extends SheetBlock["kind"]>(blocks: SheetBlock[], kind: K, key: string) {
    const block = blocks.find(
      (each): each is Extract<SheetBlock, { kind: K }> => each.kind === kind && each.key === key,
    );
    if (!block) throw new Error(`The sheet has no ${kind} block ${key}`);
    return block;
  }

  /** The sheet's blocks, from its parts as the API answers them, in its sections' order. */
  static describe(parts: SheetParts): SheetBlock[] {
    return [
      IdentityFields.describe(parts.identity),
      SheetBlocks.abilities(parts.abilities),
      SheetBlocks.saves(parts.saves),
      SheetBlocks.combat(parts.combat),
      SheetBlocks.skills(parts.skills, parts.passivePerception),
      SheetBlocks.feats(parts.classes, parts.virtualFeats),
      ...SheetBlocks.spells(parts.spellGroups, parts.spellSlots),
      SheetBlocks.inventory(parts.equipment, parts.combat.load),
    ];
  }

  /** A `fields` block's field under its key (`key`), on its lines or under them: what the printed sheet prints of it. */
  static fieldOf(block: FieldsBlock, key: string) {
    const field = [...block.lines.flat(), ...block.fields].find((each) => each.key === key);
    if (!field) throw new Error(`The ${block.key} block has no field ${key}`);
    return field;
  }
}
