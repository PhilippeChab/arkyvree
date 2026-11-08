/**
 * A class's progression as its Progression and Spells tabs edit it at once: its levels' own fields and granted feats,
 * its feat pools' picks, and its spell slots and its cantrips and known spells as totals, which its levels keep as
 * increments.
 */

import { z } from "zod";

import { type ColumnTotal, type LevelModifier, ProgressionColumns } from "@/engine/core/entities/index.ts";
import type { EntityFieldValues, EntityLinkValues } from "@/engine/core/fields/index.ts";
import type { FeatureCreatePlan, MadeEntity } from "@/engine/core/module/index.ts";
import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import RulesError from "@/engine/core/RulesError.ts";
import { RequestIds, type RulesetData, type RulesetView } from "@/engine/core/view/index.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd5/limits.ts";
import AptitudeTargets, { ALLOWED_ALL } from "@/engine/rulesets/dnd5/model/aptitudes/AptitudeTargets.ts";
import ClassOffers from "@/engine/rulesets/dnd5/rules/ClassOffers.ts";
import FeatureStacking from "@/engine/rulesets/dnd5/rules/FeatureStacking.ts";
import SpellLists from "@/engine/rulesets/dnd5/rules/SpellLists.ts";
import Dnd5View from "@/engine/rulesets/dnd5/view/Dnd5View.ts";
import type { Dnd5Kinds, Klass, KlassLevel } from "@/engine/rulesets/dnd5/view/rows.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { sanitizeName, stripSeparators } from "@/shared/text.ts";
import { FEAT_GENERATED, FEAT_SELECTABLE, FEAT_STACKABLE } from "@/vocabulary/dnd5/fields/index.ts";
import { MAX_SPELL_LEVEL, SPELL_LEVELS } from "@/vocabulary/dnd5/spells.ts";

import type ClassLevelEntity from "./ClassLevelEntity.ts";
import type ClassTable from "./ClassTable.ts";
import LevelTotals, { PACT_KEYS } from "./LevelTotals.ts";
import { PROGRESSION } from "./progression.ts";

/** A pool's picks a progression's save gives (`id`, the pool's): how many each level adds, by the level's id. */
interface PoolPicks {
  id: string;
  picks: { count: number; ownedId: string }[];
}

/** The spell list a class's spells go to, its slug its modifiers' targets name it by. */
interface SpellList {
  id: string;
  name: string;
  slug: string;
}

/** A level's totals in a spell table, by spell level from 0: none (`null`), a count, or "all" of its list's spells. */
interface SpellRow<V> {
  counts: (V | null)[];
  ownedId: string;
}

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
      pact: z.array(z.object({ counts: z.array(COUNT.nullable()).max(PACT_KEYS.length) })).optional(),
      perDay: z.array(z.object({ counts: z.array(COUNT.nullable()).max(MAX_SPELL_LEVEL) })).optional(),
    })
    .optional(),
});

/** A form's fields, an object of them by stored field, which their codec reads. */
const FIELDS = z.custom<EntityFieldValues>((value) => isRecord(value), "Expected an object of the entity's fields");

/** A form's links, an object of them by role, which its fields read. */
const LINKS = z.custom<EntityLinkValues>((value) => isRecord(value), "Expected an object of the entity's links");

/**
 * A progression's save, as its form sends it: its class levels' forms (`owned`, each its fields, and its links: the
 * feats it grants, by role), its pools' picks by level (each pool by its `id`), and its
 * spell tables' totals, a level's one a column of its table (`null` for none): a spell level, from 0 for its cantrips
 * and known spells, from 1 for its spell slots; its Pact Magic's slots and their level. Each part refuses a key it doesn't take,
 * as an entity's form does.
 */
const PROGRESSION_BODY = z.strictObject({
  owned: z
    .array(z.strictObject({ ownedId: z.string().uuid(), fields: FIELDS.optional(), links: LINKS.optional() }))
    .optional(),
  pools: z
    .array(
      z.strictObject({
        id: z.string().uuid(),
        picks: z.array(z.strictObject({ ownedId: z.string().uuid(), count: z.number().int() })),
      }),
    )
    .optional(),
  spells: z
    .strictObject({
      known: z
        .array(
          z.strictObject({
            ownedId: z.string().uuid(),
            counts: z.array(z.union([z.number().int(), z.literal("all")]).nullable()),
          }),
        )
        .optional(),
      pact: z
        .array(z.strictObject({ ownedId: z.string().uuid(), counts: z.array(z.number().int().nullable()) }))
        .optional(),
      perDay: z
        .array(z.strictObject({ ownedId: z.string().uuid(), counts: z.array(z.number().int().nullable()) }))
        .optional(),
    })
    .optional(),
});

/** Whether a modifier sets its spell level's spells known to every spell of its list, ungated. */
function isPlainAll(modifier: LevelModifier) {
  return !modifier.gated && AptitudeTargets.setsAllKnown(modifier);
}

/**
 * The feats a progression's save sends its levels as granting (`owned`: each level's form, its `grants` links), by the
 * level's id: those whose form sends its grants alone.
 */
function readSentGrants(owned: readonly { links?: Record<string, unknown>; ownedId: string }[] = []) {
  return new Map(
    owned.flatMap(({ links, ownedId }): [string, string[]][] => {
      const grants = links?.grants;
      if (!Array.isArray(grants)) return [];
      return [
        [ownedId, grants.flatMap((grant) => (isRecord(grant) && typeof grant.toId === "string" ? [grant.toId] : []))],
      ];
    }),
  );
}

/**
 * A spell table's spell levels, its columns' keys in their order, by the field its totals count (`uses`: its spell
 * slots', from spell level 1; `allowed`: its cantrips' and known spells', from 0): a save's row gives a count a
 * column, which these name.
 */
function spellLevelsOf(field: "allowed" | "uses"): number[] {
  const key = field === "uses" ? "perDay" : "known";
  return PROGRESSION.tables.find((table) => table.key === key)?.columns.map((column) => Number(column.key)) ?? [];
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
    const dnd5 = Dnd5View.of(rulesetData);
    const featPicks: Record<string, Record<string, number>> = {};
    for (const [sourceId, modifiers] of rulesetData.modifiersBySource) {
      for (const modifier of modifiers) {
        const slug = modifier.sourceType === "feats" ? AptitudeTargets.parsePool(modifier.target) : undefined;
        const value = LiteralValue.parse(modifier.value, "number");
        const pool = dnd5.aptitudesById.get(dnd5.aptitudeIdBySlug.get(slug ?? "") ?? "");
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
    return (this.dnd5.classLevelsByClass.get(this.klass.id) ?? []).toSorted((a, b) => a.position - b.position);
  }

  /** The view's D&D 5th Edition lists and indices. */
  private get dnd5(): Dnd5View {
    return Dnd5View.of(this.rulesetData);
  }

  /**
   * The tables the class's tabs don't show, by their keys (`hiddenTables`): its Pact Magic unless its levels give it
   * (`spellcasting.pact.*`), and its Spell Slots when they give it and no slot on a list (a warlock's).
   */
  private hiddenTables(): string[] {
    const pact = this.classLevels.some((level) =>
      this.modifiersOf(level.id).some((modifier) => modifier.target.startsWith("spellcasting.pact.")),
    );
    if (!pact) return ["pact"];
    // Its levels' slots on a list, as its Spell Slots table counts them: a warlock's known spells' list gives none
    const slots = this.table.describeSpells().some(({ spellsPerDay }) => Object.keys(spellsPerDay).length > 0);
    return slots ? [] : ["perDay"];
  }

  /** The entities a save names by id, as the view reads them: refused, naming one it shows none of. */
  private get ids() {
    return new RequestIds<Dnd5Kinds>(this.rulesetData, "this ruleset");
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

  /** The notes on a feature's levels, in its rules' words: one that gives nothing (`repeat`), one a click moves it to. */
  private get noteWords() {
    const words = PROGRESSION.grants?.words;
    return { repeat: words?.repeat ?? "", single: words?.single ?? "" };
  }

  /** The Pact Magic's totals by each level (its `slots`, their `level`), of the levels' modifiers as a save plans them. */
  private pactTotals(
    working: Map<string, LevelModifier[]>,
    keep: (modifier: LevelModifier) => boolean = () => true,
  ): Map<string, Record<string | number, number>> {
    return ProgressionColumns.computeRunning(
      this.classLevels,
      ProgressionColumns.readTableModifiers(working, keep),
      LevelTotals.readPactStep,
    );
  }

  /**
   * One column of a table a save writes (`target`, what it counts), at the totals it's asked (`wanted`, normalized),
   * over what the levels' other modifiers give (`kept`): each level's own modifiers on it (`isOwn`) swapped for the ones
   * it plans. A column with a modifier the table can't read as a count (`unread`: one requirements gate, which it counts
   * for every character; one that isn't an add of a number) takes no change from what it totals now (`current`):
   * refused (`refusal`), that's its levels' own to make.
   */
  private planColumn(
    working: Map<string, LevelModifier[]>,
    column: {
      current: ColumnTotal[];
      isOwn: (modifier: LevelModifier) => boolean;
      kept: ColumnTotal[];
      refusal: string;
      target: string;
      unread: (modifier: LevelModifier) => boolean;
      wanted: ColumnTotal[];
    },
  ) {
    const levels = this.classLevels;
    const current = ProgressionColumns.normalizedColumn(column.current);
    const changes = column.wanted.some((total, index) => total !== current[index]);
    if (changes && levels.some(({ id }) => working.get(id)?.some(column.unread)))
      throw new RulesError("invalid", column.refusal);
    const planned = ProgressionColumns.planColumn(column.target, column.wanted, column.kept, ALLOWED_ALL);
    for (const [index, { id }] of levels.entries()) {
      const next = planned[index];
      if (next) ProgressionColumns.replaceOwn(working, id, column.isOwn, next);
    }
  }

  /**
   * A save's levels' modifiers (`sent`, read by its schema, refused as invalid when it isn't one or a count is past the
   * rules' bounds): each level's as the view has them (`original`), and as its pools' picks and its spell tables leave
   * them (`working`), with the save as read (`body`).
   */
  private planModifiers(sent: ProgressionForm) {
    const body = RulesError.parse(PROGRESSION_BODY, sent);
    RulesError.parse(COUNTS, body);
    const original = new Map(this.classLevels.map((level) => [level.id, this.modifiersOf(level.id)]));
    const working = new Map(original);
    for (const pool of body.pools ?? []) this.planPool(working, pool);
    // Each table reads its totals before either writes: a save of one keeps the other's as they were
    const slots = this.spellTotals("uses", working);
    if (body.spells?.known)
      this.planSpells(working, body.spells.known, "allowed", this.spellTotals("allowed", working));
    if (body.spells?.perDay) this.planSpells(working, body.spells.perDay, "uses", slots);
    if (body.spells?.pact) this.planPact(working, body.spells.pact);
    if (body.spells) this.checkListKept(working);
    return { body, original, working };
  }

  /**
   * The Pact Magic's totals (`rows`: each level's slots and their level, a column each) over the ones it had before the
   * save, as each level's own modifiers on the class's Pact Magic (`spellcasting.pact.slots`, `.level`, a warlock's):
   * each level adds what its total gains on the level before. Refused for a slot level past the highest spell level, and
   * where a level's modifier the table can't read as a count would change.
   */
  private planPact(working: Map<string, LevelModifier[]>, rows: SpellRow<number>[]) {
    const levels = this.classLevels;
    const totals = this.pactTotals(working);
    const given = new Map(rows.map(({ counts, ownedId }) => [this.levels.find(ownedId).id, counts]));
    for (const [column, key] of PACT_KEYS.entries()) {
      const target = `spellcasting.pact.${key}`;
      const isOwn = (modifier: LevelModifier) => modifier.target === target && ProgressionColumns.isPlainAdd(modifier);
      const kept = this.pactTotals(working, (modifier) => !isOwn(modifier));
      const asked = levels.map(({ id }): ColumnTotal => {
        const counts = given.get(id);
        if (counts === undefined || counts[column] === undefined) return totals.get(id)?.[key];
        return counts[column] ?? undefined;
      });
      const wanted = ProgressionColumns.normalizedColumn(asked);
      if (key === "level" && wanted.some((total) => typeof total === "number" && total > MAX_SPELL_LEVEL))
        throw new RulesError("invalid", `Pact Magic's slot level is ${MAX_SPELL_LEVEL} at most`);
      this.planColumn(working, {
        current: levels.map(({ id }) => totals.get(id)?.[key]),
        isOwn,
        kept: levels.map(({ id }) => kept.get(id)?.[key]),
        refusal: "Pact Magic has modifiers this table can't edit: edit its levels'",
        target,
        unread: (modifier) => modifier.target === target && !ProgressionColumns.isPlainAdd(modifier),
        wanted,
      });
    }
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
    for (const { count, ownedId } of picks) {
      const isOwn = (modifier: LevelModifier) => modifier.target === target && ProgressionColumns.isPlainAdd(modifier);
      ProgressionColumns.replaceOwn(
        working,
        this.levels.find(ownedId).id,
        isOwn,
        count > 0 ? [ProgressionColumns.planned(target, "add", count)] : [],
      );
    }
  }

  /**
   * A spell table's totals (`field`: `allowed` for its cantrips and known spells, `uses` for its spell slots), each
   * level's given (`rows`) over the ones it had before the save (`totals`), as each spell level's own modifiers on the
   * class's list (`aptitudes.<list>.<level>.<field>`): refused where its spell tables take no save (`spellTables`).
   */
  private planSpells(
    working: Map<string, LevelModifier[]>,
    rows: SpellRow<number | "all">[],
    field: "allowed" | "uses",
    totals: Map<string, Record<string | number, ColumnTotal>>,
  ) {
    const { list, refusal } = this.spellTables;
    if (!list) throw new RulesError("invalid", refusal);
    const levels = this.classLevels;
    const levelsOf = spellLevelsOf(field);
    const given = new Map(
      rows.map(({ counts, ownedId }) => [
        this.levels.find(ownedId).id,
        Object.fromEntries(counts.map((count, column) => [levelsOf[column], count])),
      ]),
    );
    for (const spellLevel of SPELL_LEVELS) {
      const target = `aptitudes.${list.slug}.${spellLevel}.${field}`;
      const isOwn = (modifier: LevelModifier) =>
        modifier.target === target &&
        (ProgressionColumns.isPlainAdd(modifier) || (field === "allowed" && isPlainAll(modifier)));
      const kept = this.spellTotals(field, working, (modifier) => !isOwn(modifier));
      const asked = levels.map(({ id }): ColumnTotal => {
        const count = given.get(id)?.[spellLevel];
        if (count === undefined) return totals.get(id)?.[spellLevel];
        return count === "all" ? "All" : (count ?? undefined);
      });
      this.planColumn(working, {
        current: levels.map(({ id }) => totals.get(id)?.[spellLevel]),
        isOwn,
        kept: levels.map(({ id }) => kept.get(id)?.[spellLevel]),
        refusal: `Spell level ${spellLevel} has modifiers this table can't edit: edit its levels'`,
        target,
        unread: (modifier) =>
          modifier.target === target &&
          !ProgressionColumns.isPlainAdd(modifier) &&
          !(field === "allowed" && isPlainAll(modifier)),
        // Every spell of a spell level, once known, stays known: a count after it is all of them too
        wanted: ProgressionColumns.normalizedColumn(asked),
      });
    }
  }

  /** A feature's name as typed, trimmed: refused as invalid when that leaves none. */
  private readFeatureName(name: string) {
    const given = sanitizeName(name);
    if (!given) {
      throw new RulesError("invalid", "A feature needs a name", [
        { category: "name", message: "A feature needs a name" },
      ]);
    }
    return given;
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
    const id = list?.id ?? this.table.describeOwnList().id;
    const aptitude = id === undefined || id === null ? undefined : this.dnd5.aptitudesById.get(id);
    return aptitude && { id: aptitude.id, name: aptitude.name, slug: stripSeparators(aptitude.name) };
  }

  /** The spell lists the class's levels give slots in, its own first: read once. */
  private get spellLists() {
    return (this.lists ??= this.table.describeSlotLists());
  }

  /**
   * The spell list a save of the class's spell tables writes on (`list`), or why they take no save (`refusal`, the
   * save's refusal, which its tabs show): a class without a spell list, and one whose levels give spells in several,
   * whose tables add them up and which no save can split.
   */
  private get spellTables(): { list: SpellList; refusal?: undefined } | { list?: undefined; refusal: string } {
    const list = this.spellList;
    const { name } = this.klass;
    if (!list) return { refusal: `${name} has no spell list to give spells in` };
    const several = `${name} gives spells in several lists, which these totals add up: edit each level's modifiers`;
    return this.spellLists.length > 1 ? { refusal: several } : { list };
  }

  /**
   * A spell table's totals by each level (`field`'s: `uses` for its spell slots, `allowed` for its cantrips and
   * known spells), of the levels' modifiers as a save plans them (`keep`: those).
   */
  private spellTotals(
    field: "allowed" | "uses",
    working: Map<string, LevelModifier[]>,
    keep: (modifier: LevelModifier) => boolean = () => true,
  ): Map<string, Record<string | number, ColumnTotal>> {
    const modifiers = ProgressionColumns.readTableModifiers(working, keep);
    return field === "uses"
      ? ProgressionColumns.computeRunning(this.classLevels, modifiers, LevelTotals.readSlotStep)
      : ProgressionColumns.computeRunning(this.classLevels, modifiers, LevelTotals.readKnownStep);
  }

  /**
   * What the class's tabs read beside its levels and its tables: its pools (each by its `id`), each with its levels'
   * own picks (what the pool's own modifiers add, by the level's id; a feat the level grants adds its own apart), the
   * spell list its spells go to (none for a class without one), whether its levels give spells in several
   * (`severalSpellLists`, which the public API answers), why its spell tables take no save (`spellTablesRefusal`, in
   * the save's words: a class without a list, or with several; none when they take one), the tables it doesn't show
   * (`hiddenTables`: a warlock's Spell Slots, any other class's Pact Magic), its own list (`ownSpellList`:
   * "Witch Spells", its id none while the ruleset has no such aptitude, which its list's first add makes), the picks
   * the ruleset's feats give in pools (`featPicks`, a granted feature's), and the pools its Progression tab offers
   * (`ClassOffers.describe`): those its features are granted through (`featurePools`), those it may give picks
   * in (`offeredPools`), and its own feature pool (`ownFeaturePool`: "Witch Features", its id none while the ruleset
   * has none, which its first created feature makes), and the notes on its levels' grants that give nothing
   * (`featureNotes`, `FeatureStacking.describeNotes`).
   */
  describe() {
    const { rulesetData } = this;
    const { dnd5 } = this;
    const lists = SpellLists.of(rulesetData).classListIds;
    const picksBySlug = new Map<string, Record<string, number>>();
    for (const level of this.classLevels) {
      for (const modifier of this.modifiersOf(level.id)) {
        const slug = AptitudeTargets.parsePool(modifier.target);
        if (slug === undefined) continue;
        const picks = picksBySlug.get(slug) ?? {};
        picksBySlug.set(slug, picks);
        if (ProgressionColumns.isPlainAdd(modifier)) picks[level.id] = (picks[level.id] ?? 0) + Number(modifier.value);
      }
    }
    const pools = [...picksBySlug].flatMap(([slug, picks]) => {
      const aptitude = dnd5.aptitudesById.get(dnd5.aptitudeIdBySlug.get(slug) ?? "");
      return aptitude && !lists.has(aptitude.id) ? [{ id: aptitude.id, name: aptitude.name, picks }] : [];
    });
    const featPicks = ClassProgression.readFeatPicks(rulesetData);
    const list = this.spellList;
    const offers = new ClassOffers(this.view, this.klass).describe();
    return {
      featPicks,
      featurePools: offers.featurePools,
      offeredPools: offers.pools,
      ownFeaturePool: offers.ownFeaturePool,
      ownSpellList: this.table.describeOwnList(),
      pools,
      featureNotes: new FeatureStacking(this.view, this.klass).describeNotes(new Map(), this.noteWords),
      hiddenTables: this.hiddenTables(),
      severalSpellLists: this.spellLists.length > 1,
      spellList: list ? { id: list.id, name: list.name } : null,
      spellTablesRefusal: this.spellTables.refusal ?? null,
    };
  }

  /**
   * The feature a name creates (`name`, as typed: "Hex"), as its picker offers it: the name its create gives it ("Hex
   * (Witch)"), and whether the ruleset has a feat of that name already (`exists`), which its create refuses. Refused as
   * invalid without a name.
   */
  describeNewFeature(name: string): { exists: boolean; name: string } {
    return new ClassOffers(this.view, this.klass).describeNewFeature(this.readFeatureName(name));
  }

  /**
   * What one save of the class's progression (`sent`) would leave the tables its tables' tab edits at, unwritten
   * (`tables`): each by its name (its rules' progression's `tables`), its levels' totals as the class's table reads them once written
   * (`ClassTable.describe`). Refused as its save is for what it plans here: its schema, its counts' bounds, its pools'
   * picks and its spell tables. Its levels' own forms (`owned`), which change no table, it reads by its schema alone,
   * never as their save checks them (`ClassLevelEntity.planEdit`), but for the feats they grant: the notes on those
   * that would give nothing once saved (`featureNotes`, `FeatureStacking.describeNotes`), as the card shows them.
   */
  describePlan(sent: ProgressionForm) {
    const { body, working } = this.planModifiers(sent);
    const modifiers = ProgressionColumns.readTableModifiers(working);
    return {
      tables: Object.fromEntries(PROGRESSION.tables.map(({ table }) => [table, this.table.describe(table, modifiers)])),
      // What its levels' grants give once saved, as its card shows them before the save
      featureNotes: new FeatureStacking(this.view, this.klass).describeNotes(
        readSentGrants(body.owned),
        this.noteWords,
      ),
    };
  }

  /**
   * What one save of the class's progression writes (`sent`, read by its schema), refused as invalid when it isn't one,
   * a count is past the rules' bounds, a level isn't the class's or an entity isn't the ruleset's: the class as the
   * view has it, each level it changes, by its number, with its form's edit (`ClassLevelEntity.planEdits`) and the
   * modifiers it adds and removes, and what its activity records. A level's own modifiers it writes are its pools'
   * picks and its spell tables' increments, never one requirements gate.
   */
  plan(sent: ProgressionForm) {
    const { body, original, working } = this.planModifiers(sent);
    // Its levels' edits are checked together: a feature it moves from one level to another is no repeat
    const forms = (body.owned ?? []).map(({ ownedId, ...form }) => ({ form, ownedId }));
    const edits = new Map(this.levels.planEdits(forms).map((edit) => [edit.entity.id, edit]));
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

  /**
   * A new feature the class's levels can grant (`name`, as typed: "Hex"), made in its own feature pool under the name
   * its rules give it ("Hex (Witch)"), the pool made first where the ruleset has none ("Witch Features",
   * `ClassOffers.describeOwnFeaturePool`): never picked at a level up, and not Stackable until its page says so; what
   * its activity records is the feat's create's. Refused as invalid without a name, and as a conflict for a feat of the
   * name the ruleset has already, or an aptitude of the pool's name its spells are listed in.
   */
  planFeature(name: string): FeatureCreatePlan {
    const offers = new ClassOffers(this.view, this.klass);
    const own = offers.describeOwnFeaturePool();
    const { exists, name: featName } = offers.describeNewFeature(this.readFeatureName(name));
    const { dnd5 } = this;
    if (exists) throw new RulesError("conflict", `${featName} already exists`);
    if (own.id !== null && dnd5.aptitudeIdsWithSpells.has(own.id))
      throw new RulesError("conflict", `${own.name} is a spell list, so it can't hold ${this.klass.name}'s features`);
    const poolId = own.id ?? crypto.randomUUID();
    const made: MadeEntity[] =
      own.id === null
        ? [
            {
              links: [],
              modifiers: [],
              requirements: [],
              row: { description: "", id: poolId, name: own.name },
              type: "aptitudes",
            },
          ]
        : [];
    const id = crypto.randomUUID();
    made.push({
      links: [{ links: [{ tier: null, toId: poolId }], role: "listedIn", toType: "aptitudes" }],
      modifiers: [],
      requirements: [],
      row: {
        description: "",
        fields: { [FEAT_GENERATED]: false, [FEAT_SELECTABLE]: false, [FEAT_STACKABLE]: false },
        id,
        name: featName,
      },
      type: "feats",
    });
    return {
      activity: { entityName: featName, rulesetId: this.view.ruleset.id },
      created: { id, name: featName, stacks: false, type: "feats", via: { id: poolId, name: own.name } },
      writes: { made },
    };
  }
}
