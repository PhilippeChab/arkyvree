/** A class level as a ruleset's entity: its details, its fields, and what its save writes. */

import type { EntityWrites } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import ClassesPaths from "@/engine/rulesets/dnd3.5/model/classes/ClassesPaths.ts";
import type { KlassLevel } from "@/shared/relations.ts";

import ClassEntity from "./ClassEntity.ts";
import { CLASS_LEVEL_FIELDS, type ClassLevelFieldValues } from "./fields.ts";

/** A class level's save, as its form sends it: its fields, the feats it grants and its saves' base bonuses. */
type ClassLevelBody = Partial<ClassLevelFieldValues> & {
  feats?: { aptitudeId: string; featId: string; free?: boolean }[];
  saves?: { base: number; saveId: string }[];
};

/** A class level as the ruleset describes it, and what its save writes beside its row. */
export default class ClassLevelEntity {
  constructor(private readonly view: RulesetView) {}

  /**
   * A class level with its details: its fields, the feats it grants (each with its pool's name and whether it's free),
   * its saves' base bonuses, and its customizations.
   */
  private detail<L extends KlassLevel>(level: L) {
    const { rulesetData } = this.view;
    const levelSaves = rulesetData.klassLevelSavesByKlassLevelId.get(level.id) ?? [];
    return {
      ...this.withFields([level])[0],
      feats: this.grantedFeats(level.id),
      saves: levelSaves.map((ls) => ({ saveId: ls.saveId, base: ls.base })),
      ...rulesetData.customizationsOf(level.id),
    };
  }

  /** A class's level as the view has it: refused (`message`) when there's none, or it isn't the class's. */
  private findLevel(klass: { id: string }, levelId: string, message: string) {
    const level = this.view.rulesetData.klassLevelsById.get(levelId);
    if (!level || level.klassId !== klass.id) throw new RulesError("not-found", message);
    return level;
  }

  /** The feats a class level grants, each with its pool's name and whether it's free. */
  private grantedFeats(levelId: string) {
    const { rulesetData } = this.view;
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

  /** A save's join rows, from its form: the feats it grants (free unless it says), and its saves' base bonuses. */
  private joinRows({ feats, saves }: ClassLevelBody) {
    return {
      feats: feats?.map((feat) => ({ aptitudeId: feat.aptitudeId, featId: feat.featId, free: feat.free ?? true })),
      saves: saves?.map((save) => ({ base: save.base, saveId: save.saveId })),
    };
  }

  /**
   * What saving a level of `klass` writes (`before`: the properties it kept, for an edit): its base attack and skill
   * points, those an edit doesn't give kept, and, made with a level past the class's first, its requirement of the
   * class's previous level (`classes.<slug>.level` above it). An edit that gives neither keeps them.
   */
  private planSave(
    klass: { name: string },
    level: Partial<ClassLevelFieldValues> & { level?: number },
    before?: { properties: { type: string; value: string }[] },
  ): EntityWrites {
    const writes: EntityWrites = {};
    if (!before && level.level !== undefined && level.level > 1) {
      writes.requirement = {
        level: "1",
        target: ClassesPaths.level(klass.name),
        value: (level.level - 1).toString(),
        valueType: "number",
        operator: "greater_than",
      };
    }
    if (level.bab === undefined && level.skills === undefined) return writes;
    const kept = CLASS_LEVEL_FIELDS.read(before?.properties ?? []);
    const fields = CLASS_LEVEL_FIELDS.merge(kept, { bab: level.bab, skills: level.skills });
    return { ...writes, properties: CLASS_LEVEL_FIELDS.write(fields) };
  }

  /** Class levels with the fields their properties keep: those given (`properties`, a save's), or the view's. */
  private withFields<T extends { id: string }>(
    levels: T[],
    properties: { entityId: string; type: string; value: string }[] = levels.flatMap(
      (level) => this.view.rulesetData.propertiesByEntity.get(level.id) ?? [],
    ),
  ): (T & ClassLevelFieldValues)[] {
    const propertiesByLevelId = Map.groupBy(properties, (property) => property.entityId);
    return levels.map((level) => ({ ...level, ...CLASS_LEVEL_FIELDS.read(propertiesByLevelId.get(level.id) ?? []) }));
  }

  /** A class's level with its details: refused when the class isn't the ruleset's, or the level isn't the class's. */
  describe(klassId: string, levelId: string) {
    const level = this.findLevel(new ClassEntity(this.view).find(klassId), levelId, "Class level not found");
    return this.detail(level);
  }

  /** A class's levels, each with its fields, the feats it grants and its saves' base bonuses. */
  describeAll(klassId: string) {
    const { rulesetData } = this.view;
    const klass = new ClassEntity(this.view).find(klassId);
    const levels = (rulesetData.klassLevelsByKlassId.get(klass.id) ?? []).map((level) => ({
      ...level,
      feats: this.grantedFeats(level.id),
      saves: (rulesetData.klassLevelSavesByKlassLevelId.get(level.id) ?? []).map((ls) => ({
        saveId: ls.saveId,
        base: ls.base,
      })),
    }));
    return this.withFields(levels);
  }

  /**
   * A class level by its id alone, with its details, its class's name, which its page shows, and the ruleset that holds
   * its class: an inherited one's level is inherited too. Refused when the view has no such level.
   */
  describeWithClass(levelId: string) {
    const level = this.view.rulesetData.klassLevelsById.get(levelId);
    if (!level) throw new RulesError("not-found", "Class level not found");
    const klass = new ClassEntity(this.view).find(level.klassId);
    return this.detail({ ...level, name: klass.name, rulesetId: klass.rulesetId });
  }

  /**
   * A new level of a class (`klassId`): the class as the view has it, the level's row, its join rows, what its save
   * writes beside them, and the level it answers once saved (`describe`), with the fields the save keeps.
   */
  planCreate(klassId: string, body: ClassLevelBody & { level: number }) {
    const klass = new ClassEntity(this.view).find(klassId);
    const writes = this.planSave(klass, body);
    const fields = CLASS_LEVEL_FIELDS.read(writes.properties?.values ?? []);
    return {
      ...this.joinRows(body),
      columns: { level: body.level },
      describe: <T extends { id: string }>(row: T): T & ClassLevelFieldValues => ({ ...row, ...fields }),
      klass,
      writes,
    };
  }

  /** Deleting a class's level: the class and the level, as the view has them. */
  planDelete(klassId: string, levelId: string) {
    const klass = new ClassEntity(this.view).find(klassId);
    return { klass, level: this.findLevel(klass, levelId, "Level not found for this class") };
  }

  /**
   * A class level's edit: the class and the level, as the view has them, its new join rows when the form sends them,
   * what its save writes against the properties the view composes for it (those a copy of it holds), and the level it
   * answers once saved under its stored id (`describe`), with the fields it keeps.
   */
  planEdit(klassId: string, levelId: string, body: ClassLevelBody) {
    const klass = new ClassEntity(this.view).find(klassId);
    const level = this.findLevel(klass, levelId, "Level not found for this class");
    const kept = this.view.rulesetData.propertiesByEntity.get(level.id) ?? [];
    const writes = this.planSave(klass, body, { properties: kept });
    const fields = CLASS_LEVEL_FIELDS.read(writes.properties?.values ?? kept);
    return {
      ...this.joinRows(body),
      describe: (id: string) => ({ ...level, id, ...fields }),
      klass,
      level,
      writes,
    };
  }
}
