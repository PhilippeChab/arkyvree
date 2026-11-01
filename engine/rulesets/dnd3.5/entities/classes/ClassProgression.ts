/**
 * A class's progression as its Progression and Spells tabs edit it at once: its levels' own fields, saves and granted
 * feats, its feat pools' picks, and its spells per day and spells known as totals, which its levels keep as increments.
 */

import { z } from "zod";

import type { EntityFieldValues, EntityLinkValues } from "@/engine/core/fields/index.ts";
import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import RulesError from "@/engine/core/RulesError.ts";
import { RequestIds, type RulesetData, type RulesetView } from "@/engine/core/view/index.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import AptitudeTargets, { ALLOWED_ALL } from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/rules/SpellLists.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Klass, KlassLevel } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { stripSeparators } from "@/shared/text.ts";
import { SPELL_LEVELS } from "@/vocabulary/dnd3.5/spells.ts";

import type ClassLevelEntity from "./ClassLevelEntity.ts";
import type ClassTable from "./ClassTable.ts";
import LevelTotals, { type TableModifier } from "./LevelTotals.ts";

/** A modifier a class level keeps or a progression's save writes on it: a stored one's id, and whether it's gated. */
interface LevelModifier {
  /** Requirements gate it: a progression's save leaves it as it is */
  gated: boolean;
  id?: string;
  operator: string;
  target: string;
  value: string;
}

/** A pool's picks a progression's save gives (`id`, the pool's): how many each level adds, by the level's id. */
interface PoolPicks {
  id: string;
  picks: { count: number; levelId: string }[];
}

/** A level's totals in a spell table, by spell level from 0: none (`null`), a count, or "all" of its list's spells. */
interface SpellRow<V> {
  counts: (V | null)[];
  levelId: string;
}

/** A spell table's total at a spell level by a class level: none (`undefined`), a count, or every spell of its list. */
type SpellTotal = number | "All" | undefined;

/** What a class's progression's save sends, as its client writes it (`PROGRESSION_BODY`'s). */
export type ProgressionForm = z.input<typeof PROGRESSION_BODY>;

/** A count a class's table gives by a level: a pool's picks, a spell level's spells. */
const COUNT = z.number().int().min(0).max(RULESET_LIMITS.tableCount);

/** A level's spells known by spell level: a count, or "all" of its list's spells. */
const KNOWN = z.union([COUNT, z.literal("all")]);

/** A progression's save's counts, each within the rules' bounds, one a spell level at most for a level's spells. */
const COUNTS = z.object({
  pools: z.array(z.object({ picks: z.array(z.object({ count: COUNT })) })).optional(),
  spells: z
    .object({
      known: z.array(z.object({ counts: z.array(KNOWN.nullable()).max(SPELL_LEVELS.length) })).optional(),
      perDay: z.array(z.object({ counts: z.array(COUNT.nullable()).max(SPELL_LEVELS.length) })).optional(),
    })
    .optional(),
});

/** A form's fields, an object of them by stored field, which their codec reads. */
const FIELDS = z.custom<EntityFieldValues>((value) => isRecord(value), "Expected an object of the entity's fields");

/** A form's links, an object of them by role, which its fields read. */
const LINKS = z.custom<EntityLinkValues>((value) => isRecord(value), "Expected an object of the entity's links");

/**
 * A progression's save, as its form sends it: its levels' forms (each its fields, and its links: its saves' base
 * bonuses and the feats it grants, by role), its pools' picks by level (each pool by its `id`), and its spell tables'
 * totals, a level's one a spell level from 0 (`null` for none). Each part refuses a key it doesn't take, as an entity's
 * form does.
 */
const PROGRESSION_BODY = z.strictObject({
  levels: z
    .array(z.strictObject({ levelId: z.string().uuid(), fields: FIELDS.optional(), links: LINKS.optional() }))
    .optional(),
  pools: z
    .array(
      z.strictObject({
        id: z.string().uuid(),
        picks: z.array(z.strictObject({ levelId: z.string().uuid(), count: z.number().int() })),
      }),
    )
    .optional(),
  spells: z
    .strictObject({
      known: z
        .array(
          z.strictObject({
            levelId: z.string().uuid(),
            counts: z.array(z.union([z.number().int(), z.literal("all")]).nullable()),
          }),
        )
        .optional(),
      perDay: z
        .array(z.strictObject({ levelId: z.string().uuid(), counts: z.array(z.number().int().nullable()) }))
        .optional(),
    })
    .optional(),
});

/** Whether a modifier adds a number, ungated: what a progression's save writes, and rewrites, of a level's own. */
function isPlainAdd(modifier: LevelModifier) {
  return (
    !modifier.gated && modifier.operator === "add" && typeof LiteralValue.parse(modifier.value, "number") === "number"
  );
}

/** Whether a modifier sets its spell level's spells known to every spell of its list, ungated. */
function isPlainAll(modifier: LevelModifier) {
  return !modifier.gated && AptitudeTargets.setsAllKnown(modifier);
}

/** A spell table's column as its totals read: none until its first count, then 0 for none, and "All" once it's all. */
function normalizedColumn(column: SpellTotal[]): SpellTotal[] {
  let counted = false;
  let all = false;
  return column.map((total) => {
    all ||= total === "All";
    counted ||= total !== undefined;
    if (all) return "All";
    return total ?? (counted ? 0 : undefined);
  });
}

/**
 * The modifiers a spell table's column (`target`, a spell level's) gives each level, for the totals it's asked
 * (`wanted`, normalized) over what the levels' other modifiers give (`kept`): each level adds what its total gains on
 * the level before; a column counted from a level the others give nothing at opens there with 0; "All" sets it once.
 * A level the others already give "All" at (a gated one's, perhaps) keeps its own as they are (`undefined`).
 */
function planColumn(target: string, wanted: SpellTotal[], kept: SpellTotal[]): (LevelModifier[] | undefined)[] {
  let given = 0;
  let open = false;
  let all = false;
  return wanted.map((total, index) => {
    const other = kept[index];
    if (other === "All") return all ? [] : undefined;
    if (all || total === undefined) return [];
    if (total === "All") {
      all = true;
      return [planned(target, "set", ALLOWED_ALL)];
    }
    const need = total - (other ?? 0);
    const gain = need - given;
    given = need;
    const opens = !open && other === undefined;
    open = true;
    return gain !== 0 || opens ? [planned(target, "add", gain)] : [];
  });
}

/** A modifier a progression's save writes. */
function planned(target: string, operator: "add" | "set", value: number): LevelModifier {
  return { gated: false, operator, target, value: String(value) };
}

/**
 * Swaps the modifiers of a level that a save rewrites (`isOwn`) for the ones it plans (`next`), unless they already say
 * the same: a level whose own modifiers stand keeps them, and writes nothing. Answers whether it swapped them.
 */
function replaceOwn(
  working: Map<string, LevelModifier[]>,
  levelId: string,
  isOwn: (modifier: LevelModifier) => boolean,
  next: LevelModifier[],
) {
  const modifiers = working.get(levelId) ?? [];
  const own = modifiers.filter(isOwn);
  const same = (a: LevelModifier, b: LevelModifier) =>
    a.target === b.target && a.operator === b.operator && Number(a.value) === Number(b.value);
  if (own.length === next.length && own.every((modifier, index) => same(modifier, next[index]))) return false;
  working.set(levelId, [...modifiers.filter((modifier) => !isOwn(modifier)), ...next]);
  return true;
}

/**
 * A class's progression (`klass`, as the view has it, with its levels' and its table's parts): what its tabs read
 * beside its levels and tables (its pools' own picks, the spell list its spells go to), and what one save of them all
 * writes, level by level.
 */
export default class ClassProgression {
  constructor(
    private readonly view: RulesetView,
    private readonly klass: Klass,
    private readonly levels: ClassLevelEntity,
    private readonly table: ClassTable,
  ) {}

  /** The picks each feat gives in pools, by the ruleset's view: read once a view. */
  private static readonly featPicksByView = new WeakMap<RulesetData, Record<string, Record<string, number>>>();

  /**
   * The picks each of the ruleset's feats gives in pools (`rulesetData`'s), by its id then the pool's name: a feature
   * granted at a level gives them there.
   */
  private static readFeatPicks(rulesetData: RulesetData) {
    const cached = ClassProgression.featPicksByView.get(rulesetData);
    if (cached) return cached;
    const dnd35 = Dnd35View.of(rulesetData);
    const featPicks: Record<string, Record<string, number>> = {};
    for (const [sourceId, modifiers] of rulesetData.modifiersBySource) {
      for (const modifier of modifiers) {
        const slug = modifier.sourceType === "feats" ? AptitudeTargets.parsePool(modifier.target) : undefined;
        const value = LiteralValue.parse(modifier.value, "number");
        const pool = dnd35.aptitudesById.get(dnd35.aptitudeIdBySlug.get(slug ?? "") ?? "");
        if (!pool || typeof value !== "number") continue;
        const picks = (featPicks[sourceId] ??= {});
        picks[pool.name] = (picks[pool.name] ?? 0) + value;
      }
    }
    ClassProgression.featPicksByView.set(rulesetData, featPicks);
    return featPicks;
  }

  /** The spell lists the class's levels give slots in, once read (`spellLists`). */
  private lists?: { id: string; name: string }[];

  /**
   * Refuses spell tables a save empties of every modifier on the class's list when the list isn't named for the class
   * ("Blackguard Spells", a templar's): its levels' modifiers are all that tie the class to it.
   */
  private checkListKept(working: Map<string, LevelModifier[]>) {
    const list = this.spellList;
    if (!list || list.slug === `${stripSeparators(this.klass.name)}spells`) return;
    const onList = (modifier: LevelModifier) => modifier.target.startsWith(`aptitudes.${list.slug}.`);
    const lost = `Emptied, ${this.klass.name}'s spell tables would lose ${list.name}: keep a count on one`;
    if (![...working.values()].some((modifiers) => modifiers.some(onList))) throw new RulesError("invalid", lost);
  }

  /** The class's levels, as the view has them, by their number. */
  private get classLevels(): KlassLevel[] {
    return (this.dnd35.classLevelsByClass.get(this.klass.id) ?? []).toSorted((a, b) => a.position - b.position);
  }

  /** The view's 3.5 lists and indices. */
  private get dnd35(): Dnd35View {
    return Dnd35View.of(this.rulesetData);
  }

  /** The entities a save names by id, as the view reads them: refused, naming one it shows none of. */
  private get ids() {
    return new RequestIds(this.rulesetData, "this ruleset");
  }

  /** A level's own modifiers, as the view has them, each marked when requirements gate it. */
  private modifiersOf(levelId: string): LevelModifier[] {
    return (this.rulesetData.modifiersBySource.get(levelId) ?? []).map(({ id, operator, target, value }) => ({
      gated: (this.rulesetData.requirementsByEntity.get(id)?.length ?? 0) > 0,
      id,
      operator,
      target,
      value,
    }));
  }

  /**
   * A pool's picks, each level's (`count`), as its own modifiers on the pool (`aptitudes.<pool>.allowed`): refused for
   * a class's spell list (any class's, this one's before its levels give it slots), which its spell tables write.
   */
  private planPool(working: Map<string, LevelModifier[]>, { id, picks }: PoolPicks) {
    const pool = this.ids.find("aptitudes", id);
    const notPool = `${pool.name} is a spell list, not a feat pool`;
    const lists = SpellLists.of(this.rulesetData).classListIds;
    if (lists.has(pool.id) || pool.id === this.spellList?.id) throw new RulesError("invalid", notPool);
    const target = `aptitudes.${stripSeparators(pool.name)}.allowed`;
    for (const { count, levelId } of picks) {
      const isOwn = (modifier: LevelModifier) => modifier.target === target && isPlainAdd(modifier);
      replaceOwn(working, this.levels.find(levelId).id, isOwn, count > 0 ? [planned(target, "add", count)] : []);
    }
  }

  /**
   * A spell table's totals (`field`: `uses` for spells per day, `allowed` for spells known), each level's given
   * (`rows`) over the ones it had before the save (`totals`), as each spell level's own modifiers on the class's list:
   * refused for a class without one, or with several (whose table adds them all up).
   */
  private planSpells(
    working: Map<string, LevelModifier[]>,
    rows: SpellRow<number | "all">[],
    field: "allowed" | "uses",
    totals: Map<string, Record<string | number, SpellTotal>>,
  ) {
    const list = this.spellList;
    if (!list) throw new RulesError("invalid", `${this.klass.name} has no spell list to give spells in`);
    const several = `${this.klass.name} gives spells in several lists: edit each level's modifiers`;
    if (this.spellLists.length > 1) throw new RulesError("invalid", several);
    const levels = this.classLevels;
    const given = new Map(rows.map(({ counts, levelId }) => [this.levels.find(levelId).id, counts]));
    for (const spellLevel of SPELL_LEVELS) {
      const target = `aptitudes.${list.slug}.${spellLevel}.${field}`;
      const isOwn = (modifier: LevelModifier) =>
        modifier.target === target && (isPlainAdd(modifier) || (field === "allowed" && isPlainAll(modifier)));
      const kept = this.spellTotals(field, working, (modifier) => !isOwn(modifier));
      const asked = levels.map(({ id }): SpellTotal => {
        const count = given.get(id)?.[spellLevel];
        if (count === undefined) return totals.get(id)?.[spellLevel];
        return count === "all" ? "All" : (count ?? undefined);
      });
      // Every spell of a spell level, once known, stays known: a count after it is all of them too
      const wanted = normalizedColumn(asked);
      const columnModifiers = planColumn(
        target,
        wanted,
        levels.map(({ id }) => kept.get(id)?.[spellLevel]),
      );
      // A column with a modifier the table can't read as a count (one requirements gate, which it counts for every
      // character; one that isn't an add of a number) takes no change: that's its levels' own to make
      const unread = (modifier: LevelModifier) =>
        modifier.target === target && !isPlainAdd(modifier) && !(field === "allowed" && isPlainAll(modifier));
      const current = normalizedColumn(levels.map(({ id }) => totals.get(id)?.[spellLevel]));
      const changes = wanted.some((total, index) => total !== current[index]);
      if (changes && levels.some(({ id }) => working.get(id)?.some(unread))) {
        throw new RulesError(
          "invalid",
          `Spell level ${spellLevel} has modifiers this table can't edit: edit its levels'`,
        );
      }
      for (const [index, { id }] of levels.entries()) {
        const next = columnModifiers[index];
        if (next) replaceOwn(working, id, isOwn, next);
      }
    }
  }

  private get rulesetData(): RulesetData {
    return this.view.rulesetData;
  }

  /**
   * The spell list the class's spells go to: the first its levels give slots in (its own first), or the one named for
   * the class ("Wizard Spells") before any does; none for a class without one.
   */
  private get spellList() {
    const [list] = this.spellLists;
    const id = list?.id ?? this.dnd35.aptitudeIdBySlug.get(`${stripSeparators(this.klass.name)}spells`);
    const aptitude = id === undefined ? undefined : this.dnd35.aptitudesById.get(id);
    return aptitude && { id: aptitude.id, name: aptitude.name, slug: stripSeparators(aptitude.name) };
  }

  /** The spell lists the class's levels give slots in, its own first: read once. */
  private get spellLists() {
    return (this.lists ??= this.table.describeSpellLists());
  }

  /**
   * A spell table's totals by each level (`field`'s), of the levels' modifiers as a save plans them (`keep`: those).
   */
  private spellTotals(
    field: "allowed" | "uses",
    working: Map<string, LevelModifier[]>,
    keep: (modifier: LevelModifier) => boolean = () => true,
  ): Map<string, Record<string | number, SpellTotal>> {
    const modifiers: TableModifier[] = [...working].flatMap(([sourceId, levelModifiers]) =>
      levelModifiers.filter(keep).map((modifier) => ({ ...modifier, sourceId })),
    );
    return field === "uses"
      ? LevelTotals.computeRunning(this.classLevels, modifiers, LevelTotals.readPerDayStep)
      : LevelTotals.computeRunning(this.classLevels, modifiers, LevelTotals.readKnownStep);
  }

  /**
   * What the class's tabs read beside its levels and its tables: its pools (each by its `id`), each with its levels' own picks (what the
   * pool's own modifiers add, by the level's id; a feat the level grants adds its own apart), the spell list its
   * spells go to (none for a class without one), whether its levels give spells in several (`severalSpellLists`:
   * its tables add them up, which no save can split), and the picks the ruleset's feats give in pools (`featPicks`, a
   * granted feature's).
   */
  describe() {
    const { rulesetData } = this;
    const { dnd35 } = this;
    const lists = SpellLists.of(rulesetData).classListIds;
    const picksBySlug = new Map<string, Record<string, number>>();
    for (const level of this.classLevels) {
      for (const modifier of this.modifiersOf(level.id)) {
        const slug = AptitudeTargets.parsePool(modifier.target);
        if (slug === undefined) continue;
        const picks = picksBySlug.get(slug) ?? {};
        picksBySlug.set(slug, picks);
        if (isPlainAdd(modifier)) picks[level.id] = (picks[level.id] ?? 0) + Number(modifier.value);
      }
    }
    const pools = [...picksBySlug].flatMap(([slug, picks]) => {
      const aptitude = dnd35.aptitudesById.get(dnd35.aptitudeIdBySlug.get(slug) ?? "");
      return aptitude && !lists.has(aptitude.id) ? [{ id: aptitude.id, name: aptitude.name, picks }] : [];
    });
    const featPicks = ClassProgression.readFeatPicks(rulesetData);
    const list = this.spellList;
    return {
      featPicks,
      pools,
      severalSpellLists: this.spellLists.length > 1,
      spellList: list ? { id: list.id, name: list.name } : null,
    };
  }

  /**
   * What one save of the class's progression writes (`sent`, read by its schema), refused as invalid when it isn't one,
   * a count is past the rules' bounds, a level isn't the class's or an entity isn't the ruleset's: the class as the
   * view has it, each level it changes, by its number, with its form's edit (`ClassLevelEntity.planEdit`) and the
   * modifiers it adds and removes, and what its activity records. A level's own modifiers it writes are its pools'
   * picks and its spell tables' increments, never one requirements gate.
   */
  plan(sent: ProgressionForm) {
    const body = RulesError.parse(PROGRESSION_BODY, sent);
    RulesError.parse(COUNTS, body);
    const original = new Map(this.classLevels.map((level) => [level.id, this.modifiersOf(level.id)]));
    const working = new Map(original);
    for (const pool of body.pools ?? []) this.planPool(working, pool);
    // Spells per day open where spells known do: a save of spells known keeps spells per day's totals as they were
    const perDay = this.spellTotals("uses", working);
    if (body.spells?.known)
      this.planSpells(working, body.spells.known, "allowed", this.spellTotals("allowed", working));
    if (body.spells) this.planSpells(working, body.spells.perDay ?? [], "uses", perDay);
    if (body.spells) this.checkListKept(working);
    const edits = new Map(
      (body.levels ?? []).map(({ levelId, ...form }) => {
        const edit = this.levels.planEdit(levelId, form);
        return [edit.entity.id, edit];
      }),
    );
    const owned = this.classLevels.flatMap((level) => {
      const kept = working.get(level.id) ?? [];
      const keptIds = new Set(kept.flatMap(({ id }) => id ?? []));
      const removedIds = (original.get(level.id) ?? []).flatMap(({ id }) => (id && !keptIds.has(id) ? [id] : []));
      const added = kept.flatMap(({ id, operator, target, value }) =>
        id ? [] : [{ operator, target, value, valueType: "number" as const }],
      );
      const edit = edits.get(level.id);
      return edit || removedIds.length > 0 || added.length > 0
        ? [{ added, edit, entity: level, position: level.position, removedIds }]
        : [];
    });
    return {
      activity: { entityName: this.klass.name, levels: owned.length },
      owned,
      ownedType: "class-levels",
      owner: this.klass,
    };
  }
}
