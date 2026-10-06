import { getTableName } from "drizzle-orm";

import { powersInRules } from "@/drizzle/schema.ts";
import { type CachedRulesetData, findScopedEntity, RulesetCache } from "@/server/cache/rulesetCache/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { hasCharacterPicks, RulesetEdit } from "@/server/cow/index.ts";
import { type Db, db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { FeatsAptitudes, Powers, PowersAptitudes, Properties } from "@/server/repositories/index.ts";
import type { ServiceHooks } from "@/server/rulesets/hooks/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { getListPowerIds } from "@/server/services/rulesets/aptitudes/index.ts";
import type { BaseRules } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";

interface PowerBody {
  name: string;
  description?: string | null;
  aptitudes?: { id: string; level?: number }[];
  saveId?: string | null;
  saveEffect?: string | null;
  school?: string;
  subschool?: string;
  descriptors?: string[];
  castingTime?: string;
  rangeType?: string;
  target?: string;
  areaOfEffect?: string;
  duration?: string;
  spellResistance?: string;
  components?: string[];
  updatedAt?: string;
}

/** The spell fields a power's generated properties come from. */
const SPELL_FIELDS = [
  "school",
  "subschool",
  "descriptors",
  "castingTime",
  "rangeType",
  "target",
  "areaOfEffect",
  "duration",
  "spellResistance",
  "components",
] as const satisfies (keyof PowerBody)[];

class PowersService {
  /**
   * The ids a page of powers is drawn from: those on a class's spell list (none when its levels give slots in none) or
   * on a list, at a level when one is given, or at a level on any list; every power when none of these is given.
   */
  private getListedPowerIds(
    baseRules: BaseRules,
    rulesetData: CachedRulesetData,
    rulesetId: string,
    where: { aptitudeId?: string; classId?: string; level?: number },
  ) {
    if (where.classId !== undefined) {
      const { sourceChain } = rulesetData.cow;
      const klass = findScopedEntity(rulesetData.klassesById, where.classId, rulesetId, sourceChain, "Class");
      const listId = RulesetFactory.fromBaseRules(baseRules).hooks.classLevels.getSpellListId(rulesetData, klass.id);
      return listId === undefined ? [] : getListPowerIds(rulesetData, { aptitudeId: listId, level: where.level });
    }
    if (where.aptitudeId === undefined && where.level == null) return undefined;
    return getListPowerIds(rulesetData, where);
  }

  /** Throws when one of the aptitudes is already used for feats: a spell can't be linked to it. */
  private async checkSpellAptitudes(tx: Db, aptitudeIds: string[]) {
    const featAptitudes = await FeatsAptitudes.findAptitudeIds(tx, { aptitudeIds });
    if (featAptitudes.length > 0) {
      throw new ConflictError("Cannot link spell to aptitude(s) already used for feats");
    }
  }

  /**
   * Regenerates a power's spell properties from the body, and its grouping feats when its grouping (the school)
   * changes.
   */
  private async regenerateSpellProperties(
    tx: Db,
    hooks: ServiceHooks,
    rulesetId: string,
    sourceChain: string[],
    powerId: string,
    body: PowerBody,
  ) {
    const existingProps = await Properties.findMany(tx, {
      entityIds: [powerId],
      entityType: "powers",
      type: hooks.powers.primaryGroupingType,
    });
    const oldGroupingValue = existingProps.length > 0 ? existingProps[0].value : null;

    await Properties.delete(tx, {
      entityIds: [powerId],
      entityType: "powers",
      types: hooks.powers.generatedPropertyTypes,
    });

    const newGroupingValue = hooks.powers.extractGroupingValue(body);
    if (newGroupingValue) {
      await hooks.powers.generateProperties(tx, powerId, body);

      if (newGroupingValue !== oldGroupingValue) {
        await hooks.powers.generateGroupingFeats(tx, rulesetId, sourceChain, newGroupingValue);
      }
    }
  }

  /** Replaces a power's aptitude links with these. */
  private async replaceAptitudes(tx: Db, powerId: string, aptitudes: NonNullable<PowerBody["aptitudes"]>) {
    await PowersAptitudes.delete(tx, { powerId });

    if (aptitudes.length > 0) {
      await this.checkSpellAptitudes(
        tx,
        aptitudes.map((a) => a.id),
      );

      await PowersAptitudes.createMany(
        tx,
        aptitudes.map((aptitude) => ({
          powerId,
          aptitudeId: aptitude.id,
          level: aptitude.level ?? null,
        })),
      );
    }
  }

  async createPower(session: Session, rulesetId: string, body: PowerBody) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const edit = new RulesetEdit(ruleset, rulesetData.cow);
        const { tombstoneAncestorId } = await edit.assertNameAvailable(tx, "powers", body.name);

        if (!body.aptitudes || body.aptitudes.length === 0) {
          throw new BadRequestError("At least one aptitude must be selected for the power");
        }

        await this.checkSpellAptitudes(
          tx,
          body.aptitudes.map((a) => a.id),
        );

        const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;

        const rows = await Powers.create(tx, {
          name: body.name,
          description: body.description,
          rulesetId,
          saveId: body.saveId ?? null,
          saveEffect: body.saveEffect ?? null,
        });
        const power = rows[0];

        if (tombstoneAncestorId) {
          await edit.repointTombstone(tx, "powers", tombstoneAncestorId, power.id);
        }

        for (const aptitude of body.aptitudes) {
          await PowersAptitudes.create(tx, {
            powerId: power.id,
            aptitudeId: aptitude.id,
            level: aptitude.level ?? null,
          });
        }

        const groupingValue = hooks.powers.extractGroupingValue(body);
        if (groupingValue) {
          await hooks.powers.generateProperties(tx, power.id, body);
          await hooks.powers.generateGroupingFeats(tx, rulesetId, sourceChain, groupingValue);
        }

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: power.id,
          targetTable: getTableName(powersInRules),
          type: "createPower",
          data: { baseRules: ruleset.baseRules, entityName: power.name },
        });

        return power;
      });
    });
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async deletePower(session: Session, rulesetId: string, powerId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const inUse = await hasCharacterPicks(tx, "powers", powerId, rulesetId);
        (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

        const power = findScopedEntity(rulesetData.powersById, powerId, rulesetId, sourceChain, "Power");

        const edit = new RulesetEdit(ruleset, rulesetData.cow);
        const targetId = await edit.cowToDelete(tx, "powers", power);

        // FK CASCADE on powers_aptitudes.power_id and klass_level_powers.power_id
        // wipes those join rows when the power row is deleted.
        // The database deletes its customizations with it.
        const rows = await Powers.delete(tx, { id: targetId });
        const deletedPower = rows[0];

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId,
          targetTable: getTableName(powersInRules),
          type: "deletePower",
          data: { baseRules: ruleset.baseRules, rulesetId, entityName: power.name },
        });

        return deletedPower;
      });
    });
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async getPower(rulesetId: string, powerId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const power = findScopedEntity(rulesetData.powersById, powerId, rulesetId, sourceChain, "Power");
      return {
        ...power,
        modifiers: rulesetData.modifiersBySource.get(power.id) ?? [],
        properties: rulesetData.propertiesByEntity.get(power.id) ?? [],
        requirements: rulesetData.requirementsByEntity.get(power.id) ?? [],
      };
    });
  }

  /** A page of the ruleset's powers, as its composed view has them: all of them, a list's or a class's (at a level). */
  async getPowers(
    rulesetId: string,
    where: {
      childOnly?: boolean;
      aptitudeId?: string;
      classId?: string;
      level?: number;
      search?: string;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const { aptitudeId, classId, level, ...filters } = where;
      const ids = this.getListedPowerIds(ruleset.baseRules, rulesetData, rulesetId, { aptitudeId, classId, level });
      const result = await Powers.findPage(
        db,
        { rulesetId, ancestorRulesetIds: sourceChain, ...filters, ids },
        pagination,
      );
      // Each inherited power's lists as the ruleset composes them: its siblings' links merged in, their ids remapped
      if (sourceChain.length > 0 && !where.childOnly) {
        result.items = result.items.map((power) => {
          const merged = rulesetData.powersById.get(power.id);
          return merged ? { ...power, powersAptitudesInRules: merged.powersAptitudesInRules } : power;
        });
      }
      return result;
    });
  }

  async updatePower(session: Session, rulesetId: string, powerId: string, body: PowerBody) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const power = findScopedEntity(rulesetData.powersById, powerId, rulesetId, sourceChain, "Power");

        const edit = new RulesetEdit(ruleset, rulesetData.cow);
        const { id: targetId, copied } = await edit.cowToEdit(tx, "powers", power);
        const expectedUpdatedAt = copied ? undefined : body.updatedAt;

        const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;

        const rows = await Powers.update(
          tx,
          {
            name: body.name,
            description: body.description,
            saveId: body.saveId ?? null,
            saveEffect: body.saveEffect ?? null,
          },
          { id: targetId, expectedUpdatedAt },
        );
        if (expectedUpdatedAt && rows.length === 0) {
          throw new ConflictError(STALE_ENTITY_MESSAGE);
        }
        const updatedPower = rows[0];

        if (body.aptitudes !== undefined) {
          await this.replaceAptitudes(tx, targetId, body.aptitudes);
        }
        if (SPELL_FIELDS.some((field) => body[field] !== undefined)) {
          await this.regenerateSpellProperties(tx, hooks, rulesetId, sourceChain, targetId, body);
        }

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId,
          targetTable: getTableName(powersInRules),
          type: "updatePower",
          data: {
            baseRules: ruleset.baseRules,
            entityName: body.name,
            changedFields: getChangedFields(power, body),
          },
        });

        return updatedPower;
      });
    });
    RulesetCache.invalidate(rulesetId);
    return result;
  }
}

export default new PowersService();
