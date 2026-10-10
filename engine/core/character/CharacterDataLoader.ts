import type { CharacterRows } from "@/engine/core/module/index.ts";
import type { RulesetData, RulesetView } from "@/engine/core/view/index.ts";
import type { Character, CharacterInventory, Item, Modifier, Property, Requirement } from "@/shared/relations.ts";

/**
 * An entry of a character's inventory, as its build reads it: its item as the view composes it (the stored row's copy
 * or winner, the row itself without one), with its properties (its template's of each type it doesn't set, then its
 * own), its requirements as its template splits them, and its modifiers when it's equipped.
 */
export type InventoryEntry = CharacterInventory & {
  item: Item & {
    modifiers: Modifier[];
    /** The base item's requirements: its template's, or its own when it is one */
    proficiency: Requirement[];
    properties: Property[];
    /** Its other requirements, which its modifiers need */
    requirements: Requirement[];
  };
};

/**
 * What a character's build loads of its rows and its ruleset's view (`CharacterDataLoader`), as every ruleset's build
 * reads it: its campaign and player, its inventory, its modifiers and the requirement groups gating them, the item each
 * modifier an item is the source of belongs to, and the rulesets its rows may come from. A ruleset's loaded data adds
 * its own.
 */
export interface LoadedCharacter {
  campaign: CharacterRows["campaign"];
  inventory: InventoryEntry[];
  /** The item each modifier an item is the source of belongs to, by the modifier's id. */
  itemModifiers: Map<string, string>;
  modifiers: Modifier[];
  player: CharacterRows["player"];
  requirementGroups: Requirement[][];
  /** The rulesets the character's rows may come from: its own, and the ones it inherits from. */
  validRulesetIds: Set<string>;
}

/**
 * Where some of a character's modifiers come from: an entity it has (its race, an equipped item, a feat), with the
 * requirements that gate it (`requirements`), none for one whose source is its gate (a feat its class level grants).
 */
export interface ModifierSource {
  modifiers: Modifier[];
  requirements?: Requirement[];
}

/**
 * A character's data, assembled from its rows and its ruleset's view, reading nothing (`load`): what every ruleset's
 * build reads (`LoadedCharacter`), its campaign and player, its inventory's items as the view composes them, its
 * modifiers in the order they apply with the requirement groups gating them, and the rulesets its rows may come from;
 * then what its ruleset loads (`D`). A ruleset's loader says what its character has of the ruleset's entities
 * (`partsOf`, `P`), which of them its modifiers come from and in what order (`sourcesOf`), and its data (`loadOwn`).
 */
export default abstract class CharacterDataLoader<D extends LoadedCharacter, P extends object = object> {
  /** A loader of the data of `character`, the character's own row. */
  constructor(protected readonly character: Character) {}

  /** The character's data: what core loads (`loaded`) and the ruleset's own, from its parts and the view. */
  protected abstract loadOwn(view: RulesetView, parts: P, loaded: LoadedCharacter): D;

  /** What the character has of its ruleset's entities, as the view composes them, its inventory loaded. */
  protected abstract partsOf(rows: CharacterRows, view: RulesetView, inventory: InventoryEntry[]): P;

  /**
   * The sources of the character's modifiers past its own, in the order they apply: its parts, and its equipped items
   * (`items`, each item once, however many places it's in) where its ruleset applies them.
   */
  protected abstract sourcesOf(parts: P, items: ModifierSource[], view: RulesetView): ModifierSource[];

  /**
   * The character's modifiers and requirement groups, in order: its own modifiers (`rows.modifiers`, sourced on the
   * character, which the view can't hold), then each source's, with its requirements when they gate it; then each
   * modifier's requirements: the view's (the compose step merges a kept sibling's rows into them), with the character's
   * own modifiers' (`rows.requirements`, which the view misses).
   */
  private collectModifiers(rows: CharacterRows, rulesetData: RulesetData, sources: ModifierSource[]) {
    const modifiers: Modifier[] = [...rows.modifiers];
    const requirementGroups: Requirement[][] = [];
    for (const source of sources) {
      modifiers.push(...source.modifiers);
      if (source.requirements) requirementGroups.push(source.requirements);
    }

    const ownRequirements = Map.groupBy(rows.requirements, (r) => r.entityId);
    for (const modifier of modifiers) {
      const fromRuleset = rulesetData.requirementsByEntity.get(modifier.id) ?? [];
      const own = ownRequirements.get(modifier.id) ?? [];
      requirementGroups.push(own.length === 0 ? fromRuleset : [...fromRuleset, ...own]);
    }
    return { modifiers, requirementGroups };
  }

  /**
   * Each equipped item once, however many places it's in (a dagger in each hand): a modifier of it that targets the
   * weapon holding it reaches each of them already.
   */
  private equippedItems(inventory: InventoryEntry[]): ModifierSource[] {
    const items = new Map<string, InventoryEntry["item"]>();
    for (const { equipped, item } of inventory) if (equipped && !items.has(item.id)) items.set(item.id, item);
    return [...items.values()];
  }

  /**
   * The character's inventory, each entry's item as the view composes it (the join holds the stored row, which a copy
   * or a sibling winner stands for: its name and fields are the view's), with its properties, its requirements (the
   * base item's, its proficiency, and its own on top of a template, or a plain item's) and, equipped, its modifiers.
   */
  private loadInventory(rows: CharacterRows, rulesetData: RulesetData): InventoryEntry[] {
    return rows.inventory.map((entry) => {
      const item = rulesetData.itemsById.get(entry.itemId) ?? entry.itemsInRule;
      const { own, template } = rulesetData.itemRequirements(item);
      return {
        ...entry,
        itemsInRule: item,
        item: {
          ...item,
          properties: rulesetData.itemProperties(item),
          modifiers: entry.equipped ? (rulesetData.modifiersBySource.get(item.id) ?? []) : [],
          proficiency: template,
          requirements: own,
        },
      };
    });
  }

  /** The character's data, assembled from its rows (`rows`) and its ruleset's `view`. */
  load(rows: CharacterRows, view: RulesetView): D {
    const { rulesetData } = view;
    const inventory = this.loadInventory(rows, rulesetData);
    const parts = this.partsOf(rows, view, inventory);
    const sources = this.sourcesOf(parts, this.equippedItems(inventory), view);
    const { modifiers, requirementGroups } = this.collectModifiers(rows, rulesetData, sources);
    return this.loadOwn(view, parts, {
      campaign: rows.campaign,
      inventory,
      itemModifiers: new Map(modifiers.filter((m) => m.sourceType === "items").map((m) => [m.id, m.sourceId])),
      modifiers,
      player: rows.player,
      requirementGroups,
      validRulesetIds: new Set([this.character.rulesetId, ...rulesetData.cow.sourceChain]),
    });
  }
}
