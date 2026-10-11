/** A class's levels as a ruleset's entities: their details, their fields, and what their forms write. */

import { z } from "zod";

import { CustomizationPageEntity } from "@/engine/core/entities/index.ts";
import type { EntityWrites } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import CombatSheet from "@/engine/rulesets/dnd3.5/characters/description/CombatSheet.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import ClassesPaths from "@/engine/rulesets/dnd3.5/model/classes/ClassesPaths.ts";
import type { Klass, KlassLevel } from "@/shared/relations.ts";

import { CLASS_LEVEL_FIELDS, type ClassLevelFieldValues } from "./fields.ts";

/**
 * A class level's save, as its form sends it: its number (a new level's), its fields, the feats it grants and its
 * saves' base bonuses.
 */
interface ClassLevelBody {
  feats?: { aptitudeId: string; featId: string; free?: boolean }[];
  fields?: Partial<ClassLevelFieldValues>;
  level?: number;
  saves?: { base: number; saveId: string }[];
}

/** A new level's number: the class's first to its last. */
const LEVEL = z.number().int().min(1).max(RULESET_LIMITS.classLevel);

/** A level's saves' base bonuses, each within the rules' bounds. */
const SAVES = z.array(z.object({ base: z.number().int().min(0).max(RULESET_LIMITS.saveBase) })).optional();

/**
 * A class's levels (`klass`, as the view has it) as the ruleset describes them, and what a level's save writes beside
 * its row: its fields, the feats it grants and its saves' base bonuses (`joinRows`), and its requirement of the class's
 * previous level.
 */
export default class ClassLevelEntity extends CustomizationPageEntity<
  "klass_levels",
  ClassLevelBody,
  { level?: number },
  typeof CLASS_LEVEL_FIELDS.fields
> {
  constructor(
    view: RulesetView,
    private readonly klass: Klass,
  ) {
    super(view);
  }

  /** Its base attack bonus and its skill points. */
  protected override readonly fields = CLASS_LEVEL_FIELDS;

  protected override readonly label = "Class level";

  override readonly type = "klass_levels";

  /** Refuses a new level's number past the class's bounds, and a save's base bonus past the rules'. */
  protected override checkForm({ level: number, saves }: ClassLevelBody, level?: KlassLevel) {
    if (!level) RulesError.parse(LEVEL, number, ["level"]);
    RulesError.parse(SAVES, saves, ["saves"]);
  }

  /** A form's columns: none, a level's number is its own (a new one's, its form's: `planCreate`). */
  protected override columnsOf() {
    return {};
  }

  /**
   * A form's granted feats and their pools, and its saves, the view's: refused when it names a save twice (by its
   * source's id and its copy's).
   */
  protected override resolveIds({ feats, saves }: ClassLevelBody) {
    const saveIds = this.ids.resolveAll("saves", saves?.map(({ saveId }) => saveId) ?? []);
    return {
      ...(feats && {
        feats: feats.map((feat) => ({
          ...feat,
          aptitudeId: this.ids.resolve("aptitudes", feat.aptitudeId),
          featId: this.ids.resolve("feats", feat.featId),
        })),
      }),
      ...(saves && { saves: saves.map((save, index) => ({ ...save, saveId: saveIds[index] })) }),
    };
  }

  /**
   * What saving a level writes (`level`: the one edited): the base attack and skill points its form gives, over those it
   * keeps, and, made with a level past the class's first, its requirement of the class's previous level
   * (`classes.<slug>.level` above it).
   */
  protected override writesOf(
    body: ClassLevelBody,
    given: Partial<ClassLevelFieldValues>,
    level?: KlassLevel,
  ): EntityWrites {
    const writes: EntityWrites = {};
    if (!level && body.level !== undefined && body.level > 1) {
      writes.requirement = {
        level: "1",
        target: ClassesPaths.level(this.klass.name),
        value: (body.level - 1).toString(),
        valueType: "number",
        operator: "greater_than",
      };
    }
    const fields = this.formFields(given, level);
    return fields ? { ...writes, properties: this.fields.write(fields) } : writes;
  }

  /** One of the class's levels with its details and its customizations: refused when it isn't the class's. */
  override describe(levelId: string) {
    const level = super.describe(levelId);
    return { ...level, ...this.detailsOf(level) };
  }

  /** One of the class's levels, as the view has it: refused when there's none, or it isn't the class's. */
  override find(levelId: string) {
    const level = super.find(levelId);
    if (level.klassId !== this.klass.id) throw new RulesError("not-found", `${this.label} not found in this ruleset`);
    return level;
  }

  /**
   * A new level of the class: the class as the view has it, the level's row and join rows, what its form writes beside
   * them, and the level it answers once written, with the fields it keeps.
   */
  override planCreate(body: ClassLevelBody & { level: number }) {
    return { ...super.planCreate(body), ...this.joinRows(body), columns: { level: body.level }, klass: this.klass };
  }

  /** Deleting one of the class's levels: the class and the level, as the view has them. */
  override planDelete(levelId: string) {
    return { ...super.planDelete(levelId), klass: this.klass };
  }

  /**
   * One of the class's levels' edit: the class and the level, as the view has them, its new join rows when the form
   * sends them, what its form writes against the properties the view composes for it (those a copy of it holds), and the
   * level it answers once written, with the fields it keeps.
   */
  override planEdit(levelId: string, body: ClassLevelBody) {
    return { ...super.planEdit(levelId, body), ...this.joinRows(body), klass: this.klass };
  }

  /** A level's details: the feats it grants (each with its pool's name and whether it's free), its saves' base bonuses. */
  private detailsOf(level: { id: string }) {
    const levelSaves = this.rulesetData.klassLevelSavesByKlassLevel.get(level.id) ?? [];
    return {
      feats: this.grantedFeats(level.id),
      saves: levelSaves.map((ls) => ({ saveId: ls.saveId, base: ls.base })),
    };
  }

  /** The feats a class level grants, each with its pool's name and whether it's free. */
  private grantedFeats(levelId: string) {
    const { rulesetData } = this;
    return (rulesetData.klassLevelFeatsByKlassLevel.get(levelId) ?? []).map((lf) => {
      const feat = rulesetData.featsById.get(lf.featId);
      const aptitudeEntry = feat?.featsAptitudesInRules?.find((fa) => fa.aptitudeId === lf.aptitudeId);
      return {
        ...feat!,
        aptitudeId: lf.aptitudeId,
        aptitudeName: aptitudeEntry?.aptitudesInRule?.name ?? null,
        free: lf.free,
      };
    });
  }

  /**
   * A form's join rows: the feats it grants (free unless it says), and its saves' base bonuses, each entity the view's
   * (`resolveIds`).
   */
  private joinRows(body: ClassLevelBody) {
    const { feats, saves } = { ...body, ...this.resolveIds(body) };
    return {
      feats: feats?.map((feat) => ({ aptitudeId: feat.aptitudeId, featId: feat.featId, free: feat.free ?? true })),
      saves: saves?.map((save) => ({ base: save.base, saveId: save.saveId })),
    };
  }

  /**
   * The class's levels, each with its fields, its details, and its base attack bonus as the sheet writes it, its
   * attacks a round (`babLabel`: "+6/+1").
   */
  describeAll() {
    const levels = this.rulesetData.klassLevelsByKlass.get(this.klass.id) ?? [];
    return this.describeRows(levels).map((level) => ({
      ...level,
      ...this.detailsOf(level),
      babLabel: CombatSheet.formatBab(level.bab),
    }));
  }
}
