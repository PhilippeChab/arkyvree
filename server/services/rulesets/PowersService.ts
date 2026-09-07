import { powersInRules } from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import {
  FeatsAptitudes,
  Powers,
  PowersAptitudes,
  Properties,
} from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import BaseService from "@/server/services/BaseService.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activityNotifications.ts";
import {
  assertEntityNameAvailable,
  cowEntity,
  deleteModifiersWithCascade,
  deletePropertiesWithCascade,
  deleteRequirementsWithCascade,
  entityHasCharacterPicks,
  repointTombstoneSnapshot,
  withRulesetScope,
} from "@/server/services/rulesets/cow.ts";
import { getRulesetPolicy } from "@/server/services/rulesets/helpers.ts";
import type { Session } from "@/shared/relations.ts";
import { getTableName } from "drizzle-orm";

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

export const PowersMethods = {
  async getRulesetPowers(
    rulesetId: string,
    where: { childOnly?: boolean; aptitudeId?: string; level?: number; search?: string; orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain, siblingIds } = rulesetData.cow;
      const result = await Powers.findManyByRulesetId(db, { rulesetId, ancestorRulesetIds: sourceChain, ...where }, pagination);
      // Filter sibling losers (if any) and replace each row's aptitude links
      // with the compose-step version (sibling-merged + FK-remapped). The
      // rest of the DB row (savesInRule join, etc.) is kept as-is.
      if (sourceChain.length > 0 && !where.childOnly) {
        const filtered = siblingIds.size > 0 ? result.items.filter((p) => !siblingIds.has(p.id)) : result.items;
        result.items = filtered.map((p) => {
          const merged = rulesetData.powersById.get(p.id);
          return merged ? { ...p, powersAptitudesInRules: merged.powersAptitudesInRules } : p;
        });
      }
      return result;
    });
  },

  async getRulesetPower(rulesetId: string, powerId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const power = rulesetData.powersById.get(powerId);
      if (!power || (power.rulesetId !== rulesetId && !sourceChain.includes(power.rulesetId))) {
        throw new NotFoundError("Power not found in this ruleset");
      }
      return {
        ...power,
        modifiers: rulesetData.modifiersBySource.get(power.id) ?? [],
        properties: rulesetData.propertiesByEntity.get(power.id) ?? [],
        requirements: rulesetData.requirementsByEntity.get(power.id) ?? [],
      };
    });
  },

  async createRulesetPower(session: Session, rulesetId: string, body: PowerBody) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const { tombstoneAncestorId } = await assertEntityNameAvailable(tx, rulesetId, sourceChain, "powers", body.name);

        if (!body.aptitudes || body.aptitudes.length === 0) {
          throw new BadRequestError("At least one aptitude must be selected for the power");
        }

        const aptitudeIds = body.aptitudes.map((a) => a.id);
        const featAptitudes = await FeatsAptitudes.findDistinctAptitudeIds(tx, { aptitudeIds });
        if (featAptitudes.length > 0) {
          throw new ConflictError("Cannot link spell to aptitude(s) already used for feats");
        }

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
          await repointTombstoneSnapshot(tx, rulesetId, "powers", tombstoneAncestorId, power.id);
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

        if (hooks.powers.afterPowerLinked) {
          await hooks.powers.afterPowerLinked(tx, power.id, rulesetId, sourceChain);
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
    invalidateRuleset(rulesetId);
    return result;
  },

  async updateRulesetPower(session: Session, rulesetId: string, powerId: string, body: PowerBody) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const power = rulesetData.powersById.get(powerId);
        const isOwned = power && power.rulesetId === rulesetId;
        const isInherited = power && sourceChain.includes(power.rulesetId);
        if (!power || (!isOwned && !isInherited)) {
          throw new NotFoundError("Power not found in this ruleset");
        }

        let targetId = power.id;
        const expectedUpdatedAt = isOwned ? body.updatedAt : undefined;
        if (isInherited) {
          const cowResult = await cowEntity(tx, "powers", power.id, rulesetId, sourceChain, ruleset.extensionRulesetIds);
          targetId = cowResult.id as string;
        }

        const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;

        const rows = await Powers.update(tx, {
          name: body.name,
          description: body.description,
          saveId: body.saveId ?? null,
          saveEffect: body.saveEffect ?? null,
        }, { id: targetId, expectedUpdatedAt });
        if (expectedUpdatedAt && rows.length === 0) {
          throw new ConflictError(STALE_ENTITY_MESSAGE);
        }
        const updatedPower = rows[0];

        if (body.aptitudes !== undefined) {
          await PowersAptitudes.delete(tx, { powerId: targetId });

          if (body.aptitudes.length > 0) {
            const aptitudeIds = body.aptitudes.map((a) => a.id);
            const featAptitudes = await FeatsAptitudes.findDistinctAptitudeIds(tx, { aptitudeIds });
            if (featAptitudes.length > 0) {
              throw new ConflictError("Cannot link spell to aptitude(s) already used for feats");
            }

            await PowersAptitudes.createMany(tx,
              body.aptitudes.map((aptitude) => ({
                powerId: targetId,
                aptitudeId: aptitude.id,
                level: aptitude.level ?? null,
              })),
            );
          }
        }

        const hasSpellFields = body.school !== undefined || body.subschool !== undefined ||
          body.descriptors !== undefined || body.castingTime !== undefined ||
          body.rangeType !== undefined || body.target !== undefined ||
          body.areaOfEffect !== undefined || body.duration !== undefined ||
          body.spellResistance !== undefined || body.components !== undefined;

        if (hasSpellFields) {
          const existingProps = await Properties.findManyByEntity(tx, {
            entityIds: [targetId],
            entityType: "powers",
            type: hooks.powers.primaryGroupingType,
          });
          const oldGroupingValue = existingProps.length > 0 ? existingProps[0].value : null;

          await Properties.deleteMany(tx, { entityIds: [targetId], entityType: "powers" });

          const newGroupingValue = hooks.powers.extractGroupingValue(body);
          if (newGroupingValue) {
            await hooks.powers.generateProperties(tx, targetId, body);

            if (newGroupingValue !== oldGroupingValue) {
              await hooks.powers.generateGroupingFeats(tx, rulesetId, sourceChain, newGroupingValue);
              if (oldGroupingValue) {
                await hooks.powers.deleteGroupingFeats(tx, rulesetId, sourceChain, oldGroupingValue);
              }
            }
          } else if (oldGroupingValue) {
            await hooks.powers.deleteGroupingFeats(tx, rulesetId, sourceChain, oldGroupingValue);
          }
        }

        if (hooks.powers.afterPowerLinked) {
          await hooks.powers.afterPowerLinked(tx, targetId, rulesetId, sourceChain);
        }

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId,
          targetTable: getTableName(powersInRules),
          type: "updatePower",
          data: { baseRules: ruleset.baseRules, entityName: body.name, changedFields: getChangedFields(power as Record<string, unknown>, body as unknown as Record<string, unknown>) },
        });

        return updatedPower;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  },

  async deleteRulesetPower(session: Session, rulesetId: string, powerId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const inUse = await entityHasCharacterPicks(tx, "powers", powerId, rulesetId);
        (await getRulesetPolicy(tx, session, ruleset)).canDeleteEntity({ inUse });

        const power = rulesetData.powersById.get(powerId);
        const isOwned = power && power.rulesetId === rulesetId;
        const isInherited = power && sourceChain.includes(power.rulesetId);
        if (!power || (!isOwned && !isInherited)) {
          throw new NotFoundError("Power not found in this ruleset");
        }

        const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;

        // Read grouping value before COW/deleting (from the resolved entity)
        const groupingProps = await Properties.findManyByEntity(tx, {
          entityIds: [power.id],
          entityType: "powers",
          type: hooks.powers.primaryGroupingType,
        });
        const groupingValue = groupingProps.length > 0 ? groupingProps[0].value : null;

        let targetId = power.id;
        if (isInherited) {
          const cowResult = await cowEntity(tx, "powers", power.id, rulesetId, sourceChain, ruleset.extensionRulesetIds);
          targetId = cowResult.id as string;
        }

        // Customizations are polymorphic FKs — Postgres can't cascade these.
        await deleteRequirementsWithCascade(tx, { entityIds: [targetId], entityType: "powers" });
        await deletePropertiesWithCascade(tx, { entityIds: [targetId], entityType: "powers" });
        await deleteModifiersWithCascade(tx, { sourceIds: [targetId], sourceType: "powers" });

        // FK CASCADE on powers_aptitudes.power_id and klass_level_powers.power_id
        // wipes those join rows when the power row is deleted.
        const rows = await Powers.delete(tx, { id: targetId });
        const deletedPower = rows[0];

        if (groupingValue) {
          await hooks.powers.deleteGroupingFeats(tx, rulesetId, sourceChain, groupingValue);
        }

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
    invalidateRuleset(rulesetId);
    return result;
  },
} as const;

class PowersService extends BaseService<typeof PowersMethods> {
  static initialize() {
    return new PowersService(PowersMethods);
  }
}

export default PowersService;
