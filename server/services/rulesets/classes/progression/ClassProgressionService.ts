import { getTableName } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { klassesInRules } from "@/drizzle/schema.ts";
import { type ClassEngine, Engine } from "@/engine/index.ts";
import {
  EntityEdit,
  EntityRepositories,
  type RulesetScope,
  RulesetViews,
  withRulesetScope,
} from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Klasses, KlassLevels, Modifiers } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { writeLevelEdit } from "@/server/services/rulesets/classes/levels/index.ts";
import type { Session } from "@/shared/relations.ts";

/** The class row a progression's save writes: the ruleset's own, or the copy of an inherited one, and what it copied. */
interface TargetClass {
  /** The class was copied: its levels' modifiers are their sources' copies, by their sources' ids (`copiedIds`) */
  copied: boolean;
  copiedIds: ReadonlyMap<string, string>;
  id: string;
  updatedAt: string;
}

/** A save of a class's progression, as the engine plans it: each level it changes. */
type PlannedLevels = ReturnType<ClassEngine["planProgression"]>["levels"];

/** A save of a class's progression, as the engine takes it. */
type ProgressionBody = Parameters<ClassEngine["planProgression"]>[0];

class ClassProgressionService {
  /**
   * The class row a progression's save writes (`klass`, as the view has it): the ruleset's own, locked, its levels'
   * writes waiting on other saves of it (its own columns aren't written, nor its token moved: its levels' tokens check
   * the save), or the copy of an inherited one, with its levels and their customizations.
   */
  private async targetClass(tx: Db, scope: RulesetScope, klass: { id: string; rulesetId: string }) {
    const target = await new EntityEdit(scope.ruleset).cowToEdit(tx, "klasses", klass);
    if (!target.copied) await EntityRepositories.lock(tx, "klasses", target.id);
    const row = await Klasses.findOne(tx, { id: target.id });
    if (!row) throw new NotFoundError("Class no longer exists; refresh the class");
    return { copied: target.copied, copiedIds: target.copiedIds, id: target.id, updatedAt: row.updatedAt };
  }

  /**
   * Writes each level a progression's save changes on the target class's level of its number (a copy's own, once the
   * class was copied): its `updatedAt` moved, refused when stale (`tokens`: the level the client read; a copy's take no
   * check), its form's edit, and its modifiers, those it drops (their copies', on a copy: refused when one is gone
   * since) and those it adds.
   */
  private async writeLevels(
    tx: Db,
    scope: RulesetScope,
    target: TargetClass,
    levels: PlannedLevels,
    tokens: ReadonlyMap<string, string>,
  ) {
    const rows = await KlassLevels.findMany(tx, { klassId: target.id });
    const idByNumber = new Map(rows.map((row) => [row.level, row.id]));
    const removedIds: string[] = [];
    const added: Parameters<typeof Modifiers.createMany>[1] = [];
    for (const level of levels) {
      const levelId = idByNumber.get(level.level.level);
      if (!levelId) throw new NotFoundError("Class level no longer exists; refresh the class");

      const expectedUpdatedAt = target.copied ? undefined : tokens.get(level.level.id);
      const [row] = await KlassLevels.update(tx, {}, { id: levelId, expectedUpdatedAt });
      if (!row) throw new ConflictError(STALE_ENTITY_MESSAGE);
      if (level.edit) await writeLevelEdit(tx, scope, levelId, level.edit);

      removedIds.push(...level.removedIds);
      added.push(...level.added.map((modifier) => ({ ...modifier, sourceId: levelId, sourceType: "klass_levels" })));
    }

    // The levels' modifiers at once: those dropped (their copies', on a copy), then those added
    const ids = removedIds.flatMap((id) => (target.copied ? (target.copiedIds.get(id) ?? []) : [id]));
    const removed = ids.length > 0 ? await Modifiers.delete(tx, { ids }) : [];
    if (removed.length !== removedIds.length) throw new ConflictError(STALE_ENTITY_MESSAGE);
    if (added.length > 0) await Modifiers.createMany(tx, added);
  }

  /** What a class's progression tabs read beside its levels and tables: its pools' own picks, and its spell list. */
  async getProgression(rulesetId: string, classId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) =>
      Engine.for(scope).class(classId).describeProgression(),
    );
  }

  /**
   * Saves a class's progression at once (`body`): its levels' fields, saves and granted feats, its pools' picks and its
   * spell tables, in one transaction, copying an inherited class first. Refused when a level it changes changed since
   * the client read it (`levelTokens`). A save that changes nothing writes nothing. Answers the class written
   * (`klassId`: a copy's, when it copied one) and its token.
   */
  async updateProgression(
    session: Session,
    rulesetId: string,
    classId: string,
    body: ProgressionBody & { levelTokens?: { levelId: string; updatedAt: string }[] },
  ) {
    const { levelTokens, ...form } = body;
    const tokens = new Map((levelTokens ?? []).map((token) => [token.levelId, token.updatedAt]));
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          (await RulesetsPolicy.for(tx, session, scope.ruleset)).canUpdateEntity();
          const plan = Engine.for(scope).class(classId).planProgression(form);
          if (plan.levels.length === 0) return { klassId: plan.klass.id, updatedAt: plan.klass.updatedAt };

          const target = await this.targetClass(tx, scope, plan.klass);
          await this.writeLevels(tx, scope, target, plan.levels, tokens);

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: target.id,
            targetTable: getTableName(klassesInRules),
            type: "updateKlassProgression",
            data: { entityName: plan.klass.name, levels: plan.levels.length },
          });

          return { klassId: target.id, updatedAt: target.updatedAt };
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }
}

export default new ClassProgressionService();
