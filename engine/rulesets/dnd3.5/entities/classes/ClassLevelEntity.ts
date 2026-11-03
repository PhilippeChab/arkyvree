/** A class's levels as a ruleset's entities: their details, their fields, and what their forms write. */

import { z } from "zod";

import { CustomizationPageEntity, type FormBody } from "@/engine/core/entities/index.ts";
import type { EntityForm } from "@/engine/core/fields/index.ts";
import type { EntityRecord, EntityWrite, LinkSet } from "@/engine/core/module/index.ts";
import RulesError, { type RulesIssue } from "@/engine/core/RulesError.ts";
import type { NamedLink, RulesetView, ViewLink } from "@/engine/core/view/index.ts";
import CombatSheet from "@/engine/rulesets/dnd3.5/characters/description/CombatSheet.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Klass, KlassLevel } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import { CLASS_LEVEL_BAB, CLASS_LEVEL_SKILL_POINTS } from "@/vocabulary/dnd3.5/fields/index.ts";

import { CLASS_LEVEL_FIELDS } from "./fields.ts";
import { PROGRESSION } from "./progression.ts";

/**
 * A class level's link as its answers carry it (`NamedLink`): a feat it grants with the feat's description
 * (`toDescription`) and its pool's name (`viaName`, none when the pool doesn't list the feat).
 */
interface LevelLink extends NamedLink {
  toDescription?: string | null;
  viaName?: string | null;
}

/** The role of a level's base bonuses to the saves, its links to them. */
const BASE_BONUS = "baseBonus";

/** A new level's number: the class's first to its last. */
const LEVEL = z.number().int().min(1).max(RULESET_LIMITS.classLevel);

/**
 * A class's levels (`klass`, as the view has it) as the ruleset describes them, each with all its links (`links`, as
 * its saves answer them too), and what a level's save writes beside its row: its fields, and the feats it grants and
 * its saves' base bonuses (its `grants` and `baseBonus` links, `linksOf`). A level's number is its `position` on its
 * class's, which the levels are taken in (`LevelRules.findNextClassLevel`): a level requires none of the one before.
 */
export default class ClassLevelEntity extends CustomizationPageEntity<
  "class-levels",
  typeof CLASS_LEVEL_FIELDS.fields
> {
  constructor(
    view: RulesetView,
    private readonly klass: Klass,
  ) {
    super(view);
  }

  /** Its saves' base bonuses and the feats it grants, its base attack bonus and its skill points. */
  protected override readonly fields = CLASS_LEVEL_FIELDS;

  override readonly type = "class-levels";

  /**
   * Refuses a new level without its number (its `position`), past the class's bounds (its fields refuse a save's base
   * bonus past the rules'), or of a number the class already has (`taken`).
   */
  protected override checkForm({ position }: FormBody, _given: object, level?: KlassLevel) {
    if (level) return;
    const number = RulesError.parse(LEVEL, position, ["position"]);
    if (this.dnd35.classLevelByClassAndLevel.has(`${this.klass.id}:${number}`))
      throw new RulesError("conflict", this.taken(number));
  }

  /**
   * A form's links, by role: the feats it grants (`grants`, each through its pool, free unless it says), and its saves'
   * base bonuses (`baseBonus`), each entity the view's. A role the form leaves out it keeps.
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
   * A level's links, each with its target's name (`toName`): a feat it grants with its description (`toDescription`)
   * and its pool's name (`viaName`), when the pool lists the feat.
   */
  protected override nameLinks(links: readonly ViewLink[]): LevelLink[] {
    const { dnd35 } = this;
    return super.nameLinks(links).map((link) => {
      const feat = link.role === "grants" && link.toType === "feats" ? dnd35.featsById.get(link.toId) : undefined;
      if (!feat) return link;
      const viaId = link.viaId ?? undefined;
      const listed = viaId !== undefined && dnd35.listLinksOf(feat.id).some((list) => list.toId === viaId);
      const pool = listed ? dnd35.aptitudesById.get(viaId) : undefined;
      return { ...link, toDescription: feat.description, viaName: pool?.name ?? null };
    });
  }

  /**
   * A level's form as its kind reads it. A bonded creature's class's levels give no base attack bonus, saves or skill
   * points, which its sheet works out (the tracks its class's kind leaves out, `omittedFor`): such a form is refused as
   * invalid, by field, when it sets one other than none or than what the level holds (a read written back), and its save
   * leaves the level holding none, whatever it held.
   */
  protected override readForm(form: EntityForm, level?: KlassLevel) {
    const read = super.readForm(form, level);
    const omitted = { bab: this.omits("bab"), saves: this.omits("saves"), skills: this.omits("skills") };
    if (!omitted.bab && !omitted.saves && !omitted.skills) return read;
    const held = level && this.fieldsOf(level);
    const issues: RulesIssue[] = [];
    const refuse = (category: string, what: string) =>
      issues.push({
        category,
        message: `${this.klass.name} levels give no ${what}, which the creature's sheet works out`,
      });
    if (omitted.bab && ![0, held?.bab].includes(read.given.bab ?? 0))
      refuse(`fields.${CLASS_LEVEL_BAB}`, "base attack bonus");
    if (omitted.skills && ![0, held?.skills].includes(read.given.skills ?? 0))
      refuse(`fields.${CLASS_LEVEL_SKILL_POINTS}`, "skill points");
    const sent = omitted.saves ? (read.body.lists.find((set) => set.role === BASE_BONUS)?.links ?? []) : [];
    for (const [index, { amount, toId }] of sent.entries()) {
      const kept = level && this.dnd35.baseBonusesOf(level.id).find((bonus) => bonus.toId === toId)?.amount;
      if (![0, kept].includes(amount ?? 0)) refuse(`links.${BASE_BONUS}.${index}.amount`, "saves");
    }
    if (issues.length > 0) throw new RulesError("invalid", "Request validation failed", issues);
    const lists = [
      ...read.body.lists.filter((set) => set.role !== BASE_BONUS),
      { links: [], role: BASE_BONUS, toType: "saves" },
    ];
    const { defaults } = this.fields;
    return {
      body: omitted.saves ? { ...read.body, lists } : read.body,
      given: {
        ...read.given,
        ...(omitted.bab && { bab: defaults.bab }),
        ...(omitted.skills && { skills: defaults.skills }),
      },
    };
  }

  /** Of a saved level's own links (`links`, as stored), those its answer names: all of them, as a read names them. */
  protected override savedLinks(_row: Pick<EntityRecord, "links">, links: readonly ViewLink[]): readonly ViewLink[] {
    return this.ordered(links);
  }

  /** What a level's form writes of its row: nothing, a level has no name nor description (its number its `position`). */
  protected override storedOf(): EntityWrite {
    return {};
  }

  /** One of the class's levels with all its links and its customizations: refused when it isn't the class's. */
  override describe(levelId: string) {
    const level = super.describe(levelId);
    return { ...level, links: this.linksIn(level.id) };
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
   * refused with when another save gave the class its number first (`taken`).
   */
  override planCreate(form: EntityForm) {
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

  /** Deleting one of the class's levels: the class and the level, as the view has them. */
  override planDelete(levelId: string) {
    const plan = super.planDelete(levelId);
    const activity = { rulesetId: this.view.ruleset.id, entityName: this.klass.name, position: plan.entity.position };
    return { ...plan, activity, owner: this.klass };
  }

  /**
   * One of the class's levels' edit: the class and the level, as the view has them, its new links when the form sends
   * them, what its form writes against the fields the view composes for it (those a copy of it holds), and the
   * level it answers once written, with the fields it keeps.
   */
  override planEdit(levelId: string, form: EntityForm) {
    const plan = super.planEdit(levelId, form);
    return { ...plan, activity: { entityName: this.klass.name, position: plan.entity.position }, owner: this.klass };
  }

  /** The view's 3.5 lists and indices. */
  private get dnd35(): Dnd35View {
    return Dnd35View.of(this.rulesetData);
  }

  /**
   * A level's links as its answers carry them (`levelId`): all of them, as the view composes them (`ordered`), named
   * (`nameLinks`).
   */
  private linksIn(levelId: string): LevelLink[] {
    return this.nameLinks(this.ordered(this.rulesetData.linksOf(levelId)));
  }

  /**
   * Whether the class's kind leaves out its levels' track at `key` (`PROGRESSION`'s tracks' `omittedFor`, by the class's
   * partition: a bonded creature's, whose sheet works its base attack bonus, saves and skills out).
   */
  private omits(key: string) {
    return PROGRESSION.tracks.some((track) => track.key === key && track.omittedFor?.includes(this.klass.partition));
  }

  /**
   * A level's links in the order its answers give them (`links`): the feats it grants by their names, as the books list
   * them, then its others (its saves' base bonuses) as they come.
   */
  private ordered(links: readonly ViewLink[]): ViewLink[] {
    const { featsById } = this.dnd35;
    const isFeat = (link: ViewLink) => link.role === "grants" && link.toType === "feats";
    const nameOf = (link: ViewLink) => featsById.get(link.toId)?.name ?? "";
    const feats = links.filter(isFeat).toSorted((a, b) => nameOf(a).localeCompare(nameOf(b)));
    return [...feats, ...links.filter((link) => !isFeat(link))];
  }

  /**
   * A new level among several (`form`, the `index`th of them), planned as its own create is (`planCreate`): a refusal
   * of its form names it by its place among them (`owned.2.position`).
   */
  private planEach(form: EntityForm, index: number) {
    try {
      return this.planCreate(form);
    } catch (error) {
      if (!(error instanceof RulesError) || !error.issues) throw error;
      const issues = error.issues.map((issue) => ({ ...issue, category: `owned.${index}.${issue.category}` }));
      throw new RulesError(error.refusal, error.message, issues);
    }
  }

  /** What a new level of a number the class already has (`level`) is refused with: "Fighter already has a level 3". */
  private taken(level: number) {
    return `${this.klass.name} already has a level ${level}`;
  }

  /**
   * The class's levels, each with its fields, all its links, and its base attack bonus as the sheet writes it, its
   * attacks a round (`babLabel`: "+6/+1").
   */
  describeAll() {
    const levels = this.dnd35.classLevelsByClass.get(this.klass.id) ?? [];
    return this.describeRows(levels).map((level, index) => ({
      ...level,
      babLabel: CombatSheet.formatBab(this.fieldsOf(levels[index]).bab),
      links: this.linksIn(level.id),
    }));
  }

  /**
   * New levels of the class at once (`forms`, each a level's, as `planCreate` reads it: levels 6 to 15 of a class that
   * has 5), each planned as its own create is, a refusal of one naming it by its place among them; refused as invalid
   * when there are more than a class has levels, or two give one number. What their one activity records: the class's
   * name and the levels' numbers, in order.
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
    const activity = { entityName: this.klass.name, positions: positions.toSorted((a, b) => a - b) };
    return { activity, created, owner: this.klass };
  }
}
