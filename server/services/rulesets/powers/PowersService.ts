import { getTableName } from "drizzle-orm";

import { powersInRules } from "@/drizzle/schema.ts";
import {
  findScopedEntity,
  RulesetCache,
  type RulesetScope,
  withRulesetScope,
} from "@/server/cache/rulesetCache/index.ts";
import { hasCharacterPicks, RulesetEdit } from "@/server/cow/index.ts";
import { type Db, db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { FeatsAptitudes, Powers, PowersAptitudes, Properties } from "@/server/repositories/index.ts";
import type { RulesetModule } from "@/server/rulesets/engine/types.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { createActivityWithNotifications, getChangedFields } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { getListPowerIds } from "@/server/services/rulesets/aptitudes/index.ts";
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
  /** Throws when one of the aptitudes is already used for feats: a spell can't be linked to it. */
  private async checkSpellAptitudes(tx: Db, aptitudeIds: string[]) {
    const featAptitudes = await FeatsAptitudes.findAptitudeIds(tx, { aptitudeIds });
    if (featAptitudes.length > 0) throw new ConflictError("Cannot link spell to aptitude(s) already used for feats");
  }

  /**
   * Regenerates a power's spell properties from the body, and its grouping feats when its grouping (the school)
   * changes.
   */
  private async regenerateSpellProperties(
    tx: Db,
    rulesetModule: Pick<RulesetModule, "effects" | "rules">,
    scope: RulesetScope,
    powerId: string,
    body: PowerBody,
  ) {
    const { effects, rules } = rulesetModule;
    const existingProps = await Properties.findMany(tx, {
      entityIds: [powerId],
      entityType: "powers",
      type: rules.powers.primaryGroupingType,
    });
    const oldGroupingValue = existingProps.length > 0 ? existingProps[0].value : null;

    await Properties.delete(tx, {
      entityIds: [powerId],
      entityType: "powers",
      types: rules.powers.generatedPropertyTypes,
    });

    const newGroupingValue = rules.powers.extractGroupingValue(body);
    if (newGroupingValue) {
      await effects.powers.generateProperties(tx, powerId, body);

      if (newGroupingValue !== oldGroupingValue)
        await effects.powers.generateGroupingFeats(tx, scope, newGroupingValue);
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
        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const edit = new RulesetEdit(ruleset, rulesetData.cow);
        const { tombstoneAncestorId } = await edit.assertNameAvailable(tx, "powers", body.name);

        if (!body.aptitudes || body.aptitudes.length === 0)
          throw new BadRequestError("At least one aptitude must be selected for the power");

        await this.checkSpellAptitudes(
          tx,
          body.aptitudes.map((a) => a.id),
        );

        const { effects, rules } = RulesetFactory.fromBaseRules(ruleset.baseRules);

        const rows = await Powers.create(tx, {
          name: body.name,
          description: body.description,
          rulesetId,
          saveId: body.saveId ?? null,
          saveEffect: body.saveEffect ?? null,
        });
        const power = rows[0];

        if (tombstoneAncestorId) await edit.repointTombstone(tx, "powers", tombstoneAncestorId, power.id);

        for (const aptitude of body.aptitudes) {
          await PowersAptitudes.create(tx, {
            powerId: power.id,
            aptitudeId: aptitude.id,
            level: aptitude.level ?? null,
          });
        }

        const groupingValue = rules.powers.extractGroupingValue(body);
        if (groupingValue) {
          await effects.powers.generateProperties(tx, power.id, body);
          await effects.powers.generateGroupingFeats(tx, { ruleset, rulesetData }, groupingValue);
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

  /** A page of the ruleset's powers, as its composed view has them: all of them, or a list's (at a level). */
  async getPowers(
    rulesetId: string,
    where: {
      childOnly?: boolean;
      aptitudeId?: string;
      level?: number;
      search?: string;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const { aptitudeId, level, ...filters } = where;
      const ids =
        aptitudeId !== undefined || level != null ? getListPowerIds(rulesetData, { aptitudeId, level }) : undefined;
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

        const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);

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
        if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

        const updatedPower = rows[0];

        if (body.aptitudes !== undefined) await this.replaceAptitudes(tx, targetId, body.aptitudes);

        if (SPELL_FIELDS.some((field) => body[field] !== undefined))
          await this.regenerateSpellProperties(tx, rulesetModule, { ruleset, rulesetData }, targetId, body);

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
