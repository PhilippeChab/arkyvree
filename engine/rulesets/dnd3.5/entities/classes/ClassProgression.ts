/**
 * A class's progression as its Progression and Spells tabs edit it at once: its levels' own fields, saves and granted
 * feats, its feat pools' picks, and its spells per day and spells known as totals, which its levels keep as increments.
 */

import { z } from "zod";

import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import RulesError from "@/engine/core/RulesError.ts";
import { RequestIds, type RulesetData, type RulesetView } from "@/engine/core/view/index.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import AptitudeTargets from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/rules/SpellLists.ts";
import type { Klass, KlassLevel } from "@/shared/relations.ts";
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

/** A pool's picks a progression's save gives: how many each level adds, by the level's id. */
interface PoolPicks {
  aptitudeId: string;
  picks: { count: number; levelId: string }[];
}

/** What a class's progression's save sends: its levels' own forms, its pools' picks, and its spell tables' totals. */
interface ProgressionBody {
  levels?: LevelEdit[];
  pools?: PoolPicks[];
  spells?: { known?: SpellRow<number | "all">[]; perDay?: SpellRow<number>[] };
}

/** A level's totals in a spell table, by spell level from 0: none (`null`), a count, or "all" of its list's spells. */
interface SpellRow<V> {
  counts: (V | null)[];
  levelId: string;
}

/** A level's edit of its own fields, saves and granted feats, as its form sends them (`ClassLevelEntity.planEdit`). */
type LevelEdit = Parameters<ClassLevelEntity["planEdit"]>[1] & { levelId: string };

/** A spell table's total at a spell level by a class level: none (`undefined`), a count, or every spell of its list. */
type SpellTotal = number | "All" | undefined;

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

/** Whether a modifier adds a number, ungated: what a progression's save writes, and rewrites, of a level's own. */
function isPlainAdd(modifier: LevelModifier) {
  return (
    !modifier.gated && modifier.operator === "add" && typeof LiteralValue.parse(modifier.value, "number") === "number"
  );
}

/** Whether a modifier sets its spell level's spells known to every spell of its list, ungated. */
function isPlainAll(modifier: LevelModifier) {
  return !modifier.gated && modifier.operator === "set" && LiteralValue.parse(modifier.value, "number") === -1;
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
 */
function planColumn(target: string, wanted: SpellTotal[], kept: SpellTotal[]): LevelModifier[][] {
  let given = 0;
  let open = false;
  let all = false;
  return wanted.map((total, index) => {
    const other = kept[index];
    if (all || other === "All" || total === undefined) return [];
    if (total === "All") {
      all = true;
      return [planned(target, "set", -1)];
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
 * the same: a level whose own modifiers stand keeps them, and writes nothing.
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
  if (own.length === next.length && own.every((modifier, index) => same(modifier, next[index]))) return;
  working.set(levelId, [...modifiers.filter((modifier) => !isOwn(modifier)), ...next]);
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

  /** The class's levels, as the view has them, by their number. */
  private get classLevels(): KlassLevel[] {
    return (this.rulesetData.klassLevelsByKlass.get(this.klass.id) ?? []).toSorted((a, b) => a.level - b.level);
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

  /** A pool's picks, each level's (`count`), as its own modifiers on the pool (`aptitudes.<pool>.allowed`). */
  private planPool(working: Map<string, LevelModifier[]>, { aptitudeId, picks }: PoolPicks) {
    const target = `aptitudes.${stripSeparators(this.ids.find("aptitudes", aptitudeId).name)}.allowed`;
    for (const { count, levelId } of picks) {
      const isOwn = (modifier: LevelModifier) => modifier.target === target && isPlainAdd(modifier);
      replaceOwn(working, this.levels.find(levelId).id, isOwn, count > 0 ? [planned(target, "add", count)] : []);
    }
  }

  /**
   * A spell table's totals (`field`: `uses` for spells per day, `allowed` for spells known), each level's given
   * (`rows`) over the ones it has, as each spell level's own modifiers on the class's list: refused for a class
   * without one.
   */
  private planSpells(
    working: Map<string, LevelModifier[]>,
    rows: SpellRow<number | "all">[],
    field: "allowed" | "uses",
  ) {
    const list = this.spellList;
    if (!list) throw new RulesError("invalid", `${this.klass.name} has no spell list to give spells in`);
    const levels = this.classLevels;
    const given = new Map(rows.map(({ counts, levelId }) => [this.levels.find(levelId).id, counts]));
    const totals = this.spellTotals(field, working);
    for (const spellLevel of SPELL_LEVELS) {
      const target = `aptitudes.${list.slug}.${spellLevel}.${field}`;
      const isOwn = (modifier: LevelModifier) =>
        modifier.target === target && (isPlainAdd(modifier) || (field === "allowed" && isPlainAll(modifier)));
      const kept = this.spellTotals(field, working, (modifier) => !isOwn(modifier));
      const wanted = normalizedColumn(
        levels.map(({ id }) => {
          const count = given.get(id)?.[spellLevel];
          if (count === undefined) return totals.get(id)?.[spellLevel];
          return count === "all" ? "All" : (count ?? undefined);
        }),
      );
      const columnModifiers = planColumn(
        target,
        wanted,
        levels.map(({ id }) => kept.get(id)?.[spellLevel]),
      );
      for (const [index, { id }] of levels.entries()) replaceOwn(working, id, isOwn, columnModifiers[index]);
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
    const [list] = this.table.describeSpellLists();
    const id = list?.id ?? this.rulesetData.aptitudeIdBySlug.get(`${stripSeparators(this.klass.name)}spells`);
    const aptitude = id === undefined ? undefined : this.rulesetData.aptitudesById.get(id);
    return aptitude && { id: aptitude.id, name: aptitude.name, slug: stripSeparators(aptitude.name) };
  }

  /** A spell table's totals by each level (`field`'s), of the levels' modifiers as a save plans them (`keep`: those). */
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
   * What the class's tabs read beside its levels and its tables: its pools, each with its levels' own picks (what the
   * pool's own modifiers add, by the level's id; a feat the level grants adds its own apart), and the spell list its
   * spells go to (none for a class without one).
   */
  describe() {
    const { rulesetData } = this;
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
      const aptitude = rulesetData.aptitudesById.get(rulesetData.aptitudeIdBySlug.get(slug) ?? "");
      return aptitude && !lists.has(aptitude.id) ? [{ aptitudeId: aptitude.id, name: aptitude.name, picks }] : [];
    });
    const list = this.spellList;
    return { pools, spellList: list ? { id: list.id, name: list.name } : null };
  }

  /**
   * What one save of the class's progression writes (`body`), refused as invalid when a count is past the rules'
   * bounds, a level isn't the class's or an entity isn't the ruleset's: the class as the view has it, and each level
   * it changes, with its form's edit (`ClassLevelEntity.planEdit`) and the modifiers it adds and removes. A level's
   * own modifiers it writes are its pools' picks and its spell tables' increments, never one requirements gate.
   */
  plan(body: ProgressionBody) {
    RulesError.parse(COUNTS, body);
    const working = new Map(this.classLevels.map((level) => [level.id, this.modifiersOf(level.id)]));
    for (const pool of body.pools ?? []) this.planPool(working, pool);
    if (body.spells?.known) this.planSpells(working, body.spells.known, "allowed");
    if (body.spells?.perDay) this.planSpells(working, body.spells.perDay, "uses");
    const edits = new Map(
      (body.levels ?? []).map(({ levelId, ...form }) => {
        const edit = this.levels.planEdit(levelId, form);
        return [edit.entity.id, edit];
      }),
    );
    const levels = this.classLevels.flatMap((level) => {
      const kept = working.get(level.id) ?? [];
      const keptIds = new Set(kept.flatMap(({ id }) => id ?? []));
      const removedIds = this.modifiersOf(level.id).flatMap(({ id }) => (id && !keptIds.has(id) ? [id] : []));
      const added = kept.flatMap(({ id, operator, target, value }) =>
        id ? [] : [{ operator, target, value, valueType: "number" as const }],
      );
      const edit = edits.get(level.id);
      return edit || removedIds.length > 0 || added.length > 0 ? [{ added, edit, level, removedIds }] : [];
    });
    return { klass: this.klass, levels };
  }
}
