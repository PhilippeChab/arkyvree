import { getTableName } from "drizzle-orm";

import { powersInRules } from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { FeatsAptitudes, Powers, PowersAptitudes, Properties } from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import {
  assertEntityNameAvailable,
  entityHasCharacterPicks,
  entityToDelete,
  entityToEdit,
  findScopedEntity,
  repointTombstoneSnapshot,
  withRulesetScope,
} from "@/server/services/rulesets/cow/index.ts";
import type { Session } from "@/shared/relations.ts";

import { findRulesetPowers } from "./findRulesetPowers.ts";

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

class PowersService {
  async getRulesetPower(rulesetId: string, powerId: string) {
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

  async getRulesetPowers(
    rulesetId: string,
    where: Parameters<typeof findRulesetPowers>[3],
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) =>
      findRulesetPowers(db, rulesetData, rulesetId, where, pagination),
    );
  }

  async createRulesetPower(session: Session, rulesetId: string, body: PowerBody) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const { tombstoneAncestorId } = await assertEntityNameAvailable(
          tx,
          rulesetId,
          rulesetData.cow,
          "powers",
          body.name,
        );

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
  }

  async updateRulesetPower(session: Session, rulesetId: string, powerId: string, body: PowerBody) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const power = findScopedEntity(rulesetData.powersById, powerId, rulesetId, sourceChain, "Power");

        const { id: targetId, copied } = await entityToEdit(tx, ruleset, sourceChain, "powers", power);
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
          await PowersAptitudes.delete(tx, { powerId: targetId });

          if (body.aptitudes.length > 0) {
            const aptitudeIds = body.aptitudes.map((a) => a.id);
            const featAptitudes = await FeatsAptitudes.findDistinctAptitudeIds(tx, { aptitudeIds });
            if (featAptitudes.length > 0) {
              throw new ConflictError("Cannot link spell to aptitude(s) already used for feats");
            }

            await PowersAptitudes.createMany(
              tx,
              body.aptitudes.map((aptitude) => ({
                powerId: targetId,
                aptitudeId: aptitude.id,
                level: aptitude.level ?? null,
              })),
            );
          }
        }

        const hasSpellFields =
          body.school !== undefined ||
          body.subschool !== undefined ||
          body.descriptors !== undefined ||
          body.castingTime !== undefined ||
          body.rangeType !== undefined ||
          body.target !== undefined ||
          body.areaOfEffect !== undefined ||
          body.duration !== undefined ||
          body.spellResistance !== undefined ||
          body.components !== undefined;

        if (hasSpellFields) {
          const existingProps = await Properties.findManyByEntity(tx, {
            entityIds: [targetId],
            entityType: "powers",
            type: hooks.powers.primaryGroupingType,
          });
          const oldGroupingValue = existingProps.length > 0 ? existingProps[0].value : null;

          await Properties.deleteMany(tx, {
            entityIds: [targetId],
            entityType: "powers",
            types: hooks.powers.generatedPropertyTypes,
          });

          const newGroupingValue = hooks.powers.extractGroupingValue(body);
          if (newGroupingValue) {
            await hooks.powers.generateProperties(tx, targetId, body);

            if (newGroupingValue !== oldGroupingValue) {
              await hooks.powers.generateGroupingFeats(tx, rulesetId, sourceChain, newGroupingValue);
            }
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
          data: {
            baseRules: ruleset.baseRules,
            entityName: body.name,
            changedFields: getChangedFields(power, body),
          },
        });

        return updatedPower;
      });
    });
    invalidateRuleset(rulesetId);
    return result;
  }

  async deleteRulesetPower(session: Session, rulesetId: string, powerId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const inUse = await entityHasCharacterPicks(tx, "powers", powerId, rulesetId);
        (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

        const power = findScopedEntity(rulesetData.powersById, powerId, rulesetId, sourceChain, "Power");

        const targetId = await entityToDelete(tx, ruleset, sourceChain, "powers", power);

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
    invalidateRuleset(rulesetId);
    return result;
  }
}

export default new PowersService();
