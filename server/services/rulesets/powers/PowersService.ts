import { getTableName } from "drizzle-orm";

import { powersInRules } from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache/index.ts";
import { type Db, db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { FeatsAptitudes, Powers, PowersAptitudes, Properties } from "@/server/repositories/index.ts";
import type { ServiceHooks } from "@/server/rulesets/hooks/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import {
  assertEntityNameAvailable,
  cowEntityToDelete,
  cowEntityToEdit,
  findScopedEntity,
  hasCharacterPicks,
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

  async getPowers(
    rulesetId: string,
    where: Parameters<typeof findRulesetPowers>[3],
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) =>
      findRulesetPowers(db, rulesetData, rulesetId, where, pagination),
    );
  }

  async createPower(session: Session, rulesetId: string, body: PowerBody) {
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

  async updatePower(session: Session, rulesetId: string, powerId: string, body: PowerBody) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const power = findScopedEntity(rulesetData.powersById, powerId, rulesetId, sourceChain, "Power");

        const { id: targetId, copied } = await cowEntityToEdit(tx, ruleset, sourceChain, "powers", power);
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
    invalidateRuleset(rulesetId);
    return result;
  }

  async deletePower(session: Session, rulesetId: string, powerId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;

        const inUse = await hasCharacterPicks(tx, "powers", powerId, rulesetId);
        (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity({ inUse });

        const power = findScopedEntity(rulesetData.powersById, powerId, rulesetId, sourceChain, "Power");

        const targetId = await cowEntityToDelete(tx, ruleset, sourceChain, "powers", power);

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
