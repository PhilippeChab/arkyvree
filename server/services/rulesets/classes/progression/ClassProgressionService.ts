import { getTableName } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { klassesInRules } from "@/drizzle/schema.ts";
import { type ClassEngine, Engine } from "@/engine/index.ts";
import { EntityEdit, type RulesetScope, RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
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
   * The class row a progression's save writes (`klass`, as the view has it): the ruleset's own, its `updatedAt` moved
   * and refused when stale (`updatedAt`, the class the client read), or the copy of an inherited one, with its levels
   * and their customizations, which takes no stale check (the client's token is the source's).
   */
  private async targetClass(
    tx: Db,
    scope: RulesetScope,
    klass: { id: string; rulesetId: string },
    updatedAt: string | undefined,
  ): Promise<TargetClass> {
    const target = await new EntityEdit(scope.ruleset).cowToEdit(tx, "klasses", klass);
    const expectedUpdatedAt = target.copied ? undefined : updatedAt;
    const [row] = await Klasses.update(tx, {}, { id: target.id, expectedUpdatedAt });
    if (!row) throw new ConflictError(STALE_ENTITY_MESSAGE);
    return { copied: target.copied, copiedIds: target.copiedIds, id: target.id, updatedAt: row.updatedAt };
  }

  /**
   * Writes each level a progression's save changes on the target class's level of its number (a copy's own, once the
   * class was copied): its form's edit, and its modifiers, those it drops (their copies', on a copy) and those it adds.
   */
  private async writeLevels(tx: Db, scope: RulesetScope, target: TargetClass, levels: PlannedLevels) {
    const rows = await KlassLevels.findMany(tx, { klassId: target.id });
    const idByNumber = new Map(rows.map((row) => [row.level, row.id]));
    for (const { added, edit, level, removedIds } of levels) {
      const levelId = idByNumber.get(level.level);
      if (!levelId) throw new NotFoundError("Class level no longer exists; refresh the class");

      if (edit) {
        await KlassLevels.update(tx, {}, { id: levelId });
        await writeLevelEdit(tx, scope, levelId, edit);
      }
      const ids = removedIds.flatMap((id) => (target.copied ? (target.copiedIds.get(id) ?? []) : [id]));
      if (ids.length > 0) await Modifiers.delete(tx, { ids });
      await Modifiers.createMany(
        tx,
        added.map((modifier) => ({ ...modifier, sourceId: levelId, sourceType: "klass_levels" })),
      );
    }
  }

  /** What a class's progression tabs read beside its levels and tables: its pools' own picks, and its spell list. */
  async getProgression(rulesetId: string, classId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) =>
      Engine.for(scope).class(classId).describeProgression(),
    );
  }

  /**
   * Saves a class's progression at once (`body`): its levels' fields, saves and granted feats, its pools' picks and its
   * spell tables, in one transaction, copying an inherited class first. Refused when the class changed since the client
   * read it (`updatedAt`). Answers the class written (`klassId`: a copy's, when it copied one) and its new token.
   */
  async updateProgression(
    session: Session,
    rulesetId: string,
    classId: string,
    body: ProgressionBody & { updatedAt?: string },
  ) {
    const { updatedAt, ...form } = body;
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          (await RulesetsPolicy.for(tx, session, scope.ruleset)).canUpdateEntity();
          const plan = Engine.for(scope).class(classId).planProgression(form);

          const target = await this.targetClass(tx, scope, plan.klass, updatedAt);
          await this.writeLevels(tx, scope, target, plan.levels);

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
