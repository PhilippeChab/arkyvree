/** A class's levels as a ruleset's entities: their details, their fields, and what their forms write. */

import { z } from "zod";

import { CustomizationPageEntity, type FormBody } from "@/engine/core/entities/index.ts";
import type { EntityForm } from "@/engine/core/fields/index.ts";
import type { EntityRecord, EntityWrite, LinkSet } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { NamedLink, RulesetView, ViewLink } from "@/engine/core/view/index.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd5/limits.ts";
import FeatureStacking from "@/engine/rulesets/dnd5/rules/FeatureStacking.ts";
import Dnd5View from "@/engine/rulesets/dnd5/view/Dnd5View.ts";
import type { Dnd5Kinds, Klass, KlassLevel } from "@/engine/rulesets/dnd5/view/rows.ts";
import { FEAT_STACKABLE } from "@/vocabulary/dnd5/fields/index.ts";

import { CLASS_LEVEL_FIELDS } from "./fields.ts";

/**
 * A class level's link as its answers carry it (`NamedLink`): a feat it grants with the feat's description
 * (`toDescription`), whether a character takes it more than once (`stacks`: its `FEAT_STACKABLE`), and its pool's name
 * (`viaName`, none when the pool doesn't list the feat).
 */
interface LevelLink extends NamedLink {
  stacks?: boolean;
  toDescription?: string | null;
  viaName?: string | null;
}

/** A new level's number: the class's first to its last. */
const LEVEL = z.number().int().min(1).max(RULESET_LIMITS.classLevel);

/** The feats a level's save grants (`plan`'s `grants` links to feats), by their ids; none where it leaves them as they are. */
function grantedIn(plan: { links?: LinkSet[] }) {
  return plan.links?.find((set) => set.role === "grants" && set.toType === "feats")?.links.map(({ toId }) => toId);
}

/**
 * A class's levels (`klass`, as the view has it) as the ruleset describes them, each with all its links (`links`, as
 * its saves answer them too), and what a level's save writes beside its row: the feats it grants (its `grants` links,
 * `linksOf`). A level's number is its `position` on its
 * class's, which the levels are taken in (`LevelRules.findNextClassLevel`): a level requires none of the one before.
 */
export default class ClassLevelEntity extends CustomizationPageEntity<
  Dnd5Kinds,
  "class-levels",
  typeof CLASS_LEVEL_FIELDS.fields
> {
  constructor(
    view: RulesetView,
    private readonly klass: Klass,
  ) {
    super(view);
  }

  /** The feats it grants, each through its pool. */
  protected override readonly fields = CLASS_LEVEL_FIELDS;

  override readonly type = "class-levels";

  /**
   * Refuses a new level without its number (its `position`), past the class's bounds, or of a number the class already
   * has (`taken`).
   */
  protected override checkForm({ position }: FormBody, _given: object, level?: KlassLevel) {
    if (level) return;
    const number = RulesError.parse(LEVEL, position, ["position"]);
    if (this.dnd5.classLevelByClassAndLevel.has(`${this.klass.id}:${number}`))
      throw new RulesError("conflict", this.taken(number));
  }

  /**
   * A form's links, by role: the feats it grants (`grants`, each through its pool, free unless it says), each entity the
   * view's. A role the form leaves out it keeps.
   */
  protected override linksOf(body: FormBody): LinkSet[] {
    const sets = super.linksOf(body) ?? [];
    const grants = sets.filter((set) => set.role === "grants");
    return [
      ...grants.map((set) => ({ ...set, links: set.links.map((link) => ({ ...link, free: link.free ?? true })) })),
      ...sets.filter((set) => set.role !== "grants"),
    ];
  }

  /**
   * A level's links, each with its target's name (`toName`): a feat it grants with its description (`toDescription`),
   * whether it stacks (`stacks`), and its pool's name (`viaName`), when the pool lists the feat.
   */
  protected override nameLinks(links: readonly ViewLink[]): LevelLink[] {
    const { dnd5 } = this;
    return super.nameLinks(links).map((link) => {
      const feat = link.role === "grants" && link.toType === "feats" ? dnd5.featsById.get(link.toId) : undefined;
      if (!feat) return link;
      const viaId = link.viaId ?? undefined;
      const listed = viaId !== undefined && dnd5.listLinksOf(feat.id).some((list) => list.toId === viaId);
      const pool = listed ? dnd5.aptitudesById.get(viaId) : undefined;
      const stacks = feat.fields[FEAT_STACKABLE] === true;
      return { ...link, stacks, toDescription: feat.description, viaName: pool?.name ?? null };
    });
  }

  /** Of a saved level's own links (`links`, as stored), those its answer names: all of them, as a read names them. */
  protected override savedLinks(_row: Pick<EntityRecord, "links">, links: readonly ViewLink[]): readonly ViewLink[] {
    return this.ordered(links);
  }

  /** What a level's form writes of its row: nothing, a level has no name nor description (its number its `position`). */
  protected override storedOf(): EntityWrite {
    return {};
  }

  /**
   * One of the class's levels with all its links and its customizations, and whether it can be deleted (`deletable`:
   * the class's last alone, `checkLast`): refused when it isn't the class's.
   */
  override describe(levelId: string) {
    const level = super.describe(levelId);
    return { ...level, deletable: level.position >= this.lastPosition(), links: this.linksIn(level.id) };
  }

  /** One of the class's levels, as the view has it: refused when there's none, or it isn't the class's. */
  override find(levelId: string) {
    const level = super.find(levelId);
    if (level.ownerId !== this.klass.id) this.refuseMissing();
    return level;
  }

  /**
   * A new level of the class: the class as the view has it, the level's row (its number, its `position`) and links,
   * what its form writes beside them, the level it answers once written, with the fields it keeps, and what it's
   * refused with when another save gave the class its number first (`taken`). Refused when it isn't the class's next
   * (`checkNext`), or granting a feat that isn't Stackable another level grants (`FeatureStacking.check`).
   */
  override planCreate(form: EntityForm) {
    const plan = this.planOne(form);
    this.checkNext([plan.row.position]);
    this.stacking.check(new Map(), [{ feats: grantedIn(plan) ?? [], position: plan.row.position }]);
    return plan;
  }

  /**
   * Deleting one of the class's levels: the class and the level, as the view has them. Refused for a level the class
   * has one above (`checkLast`).
   */
  override planDelete(levelId: string) {
    const plan = super.planDelete(levelId);
    this.checkLast(plan.entity);
    const activity = { rulesetId: this.view.ruleset.id, entityName: this.klass.name, position: plan.entity.position };
    return { ...plan, activity, owner: this.klass };
  }

  /**
   * One of the class's levels' edit (`planEditOne`), refused when it grants a feat that isn't Stackable another of its
   * levels grants (`FeatureStacking.check`).
   */
  override planEdit(levelId: string, form: EntityForm) {
    return this.planEdits([{ form, ownedId: levelId }])[0];
  }

  /**
   * Refuses deleting a level the class has one above: its characters take its levels in order, so a gap would stop them
   * there ("Only Fighter's last level, level 20, can be deleted"). Its last goes, then the one below it.
   */
  private checkLast(level: KlassLevel) {
    const last = this.lastPosition();
    if (level.position < last)
      throw new RulesError("conflict", `Only ${this.klass.name}'s last level, level ${last}, can be deleted`);
  }

  /**
   * Refuses new levels (`positions`) that aren't the class's next: the lowest numbers it lacks, a gap's first, as many
   * as there are, so a create leaves no gap, which would stop its characters there ("Fighter's next level is 3").
   */
  private checkNext(positions: readonly number[]) {
    const held = new Set((this.dnd5.classLevelsByClass.get(this.klass.id) ?? []).map((level) => level.position));
    const next: number[] = [];
    for (let position = 1; next.length < positions.length; position++) if (!held.has(position)) next.push(position);
    const given = positions.toSorted((a, b) => a - b);
    if (given.every((position, index) => position === next[index])) return;
    const [first] = next;
    const last = next.at(-1) ?? first;
    const what = next.length === 1 ? `level is ${first}` : `levels are ${first} to ${last}`;
    throw new RulesError("conflict", `${this.klass.name}'s next ${what}`);
  }

  /** The view's D&D 5th Edition lists and indices. */
  private get dnd5(): Dnd5View {
    return Dnd5View.of(this.rulesetData);
  }

  /** The class's highest level's number, as the view has its levels; 0 for a class without one. */
  private lastPosition() {
    const levels = this.dnd5.classLevelsByClass.get(this.klass.id) ?? [];
    return Math.max(0, ...levels.map((level) => level.position));
  }

  /**
   * A level's links as its answers carry them (`levelId`): all of them, as the view composes them (`ordered`), named
   * (`nameLinks`).
   */
  private linksIn(levelId: string): LevelLink[] {
    return this.nameLinks(this.ordered(this.rulesetData.linksOf(levelId)));
  }

  /**
   * A level's links in the order its answers give them (`links`): the feats it grants by their names, as the books list
   * them, then its others (its saves' base bonuses) as they come.
   */
  private ordered(links: readonly ViewLink[]): ViewLink[] {
    const { featsById } = this.dnd5;
    const isFeat = (link: ViewLink) => link.role === "grants" && link.toType === "feats";
    const nameOf = (link: ViewLink) => featsById.get(link.toId)?.name ?? "";
    const feats = links.filter(isFeat).toSorted((a, b) => nameOf(a).localeCompare(nameOf(b)));
    return [...feats, ...links.filter((link) => !isFeat(link))];
  }

  /**
   * A new level among several (`form`, the `index`th of them), planned as its own create is (`planOne`): a refusal of
   * its form names it by its place among them (`owned.2.position`).
   */
  private planEach(form: EntityForm, index: number) {
    try {
      return this.planOne(form);
    } catch (error) {
      if (!(error instanceof RulesError) || !error.issues) throw error;
      const issues = error.issues.map((issue) => ({ ...issue, category: `owned.${index}.${issue.category}` }));
      throw new RulesError(error.refusal, error.message, issues);
    }
  }

  /**
   * One of the class's levels' edit: the class and the level, as the view has them, its new links when the form sends
   * them, what its form writes against the fields the view composes for it (those a copy of it holds), and the
   * level it answers once written, with the fields it keeps.
   */
  private planEditOne(levelId: string, form: EntityForm) {
    const plan = super.planEdit(levelId, form);
    return { ...plan, activity: { entityName: this.klass.name, position: plan.entity.position }, owner: this.klass };
  }

  /**
   * A new level of the class, its next or not: what `planCreate` answers, and each level of several plans
   * (`planEach`), which `planCreateMany` checks are its next together.
   */
  private planOne(form: EntityForm) {
    const plan = super.planCreate(form);
    const level = RulesError.parse(LEVEL, form.position);
    return {
      ...plan,
      activity: { entityName: this.klass.name, position: level },
      owner: this.klass,
      row: { ...plan.row, position: level },
      taken: this.taken(level),
    };
  }

  /** Whether the class's levels would grant a feat that isn't Stackable at more than one of them. */
  private get stacking() {
    return new FeatureStacking(this.view, this.klass);
  }

  /** What a new level of a number the class already has (`level`) is refused with: "Fighter already has a level 3". */
  private taken(level: number) {
    return `${this.klass.name} already has a level ${level}`;
  }

  /** The class's levels, each with its fields and all its links. */
  describeAll() {
    const levels = this.dnd5.classLevelsByClass.get(this.klass.id) ?? [];
    return this.describeRows(levels).map((level) => ({ ...level, links: this.linksIn(level.id) }));
  }

  /**
   * New levels of the class at once (`forms`, each a level's, as `planCreate` reads it: levels 6 to 15 of a class that
   * has 5), each planned as its own create is, a refusal of one naming it by its place among them; refused as invalid
   * when there are more than a class has levels, or two give one number, and when they aren't the class's next
   * (`checkNext`), or grant a feat that isn't Stackable at more than one level (`FeatureStacking.check`). What their one
   * activity records: the class's name and the levels' numbers, in order.
   */
  planCreateMany(forms: readonly EntityForm[]) {
    if (forms.length > RULESET_LIMITS.classLevel) {
      const issue = { category: "owned", message: `A class has at most ${RULESET_LIMITS.classLevel} levels` };
      throw new RulesError("invalid", issue.message, [issue]);
    }
    const created = forms.map((form, index) => this.planEach(form, index));
    const positions = created.map((plan) => plan.row.position);
    const repeated = positions.findIndex((position, index) => positions.indexOf(position) !== index);
    if (repeated >= 0) {
      const issue = { category: `owned.${repeated}.position`, message: `Level ${positions[repeated]} is listed twice` };
      throw new RulesError("invalid", issue.message, [issue]);
    }
    this.checkNext(positions);
    this.stacking.check(
      new Map(),
      created.map((plan) => ({ feats: grantedIn(plan) ?? [], position: plan.row.position })),
    );
    const activity = { entityName: this.klass.name, positions: positions.toSorted((a, b) => a - b) };
    return { activity, created, owner: this.klass };
  }

  /**
   * Several of the class's levels' edits at once (`edits`, each a level's id and its form), each planned as its own edit
   * is (`planEditOne`), refused when once written they'd grant a feat that isn't Stackable at more than one level
   * (`FeatureStacking.check`): checked together, a feature moved from one level to another in one save is no repeat.
   */
  planEdits(edits: readonly { form: EntityForm; ownedId: string }[]) {
    const plans = edits.map(({ form, ownedId }) => this.planEditOne(ownedId, form));
    const changed = new Map(
      plans.flatMap((plan) => {
        const feats = grantedIn(plan);
        return feats ? [[plan.entity.id, feats] as const] : [];
      }),
    );
    this.stacking.check(changed);
    return plans;
  }
}
