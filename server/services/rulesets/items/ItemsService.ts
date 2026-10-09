import { itemsInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { include } from "@/lib/mixins.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Items } from "@/server/repositories/index.ts";
import EntitySaves from "@/server/services/rulesets/EntitySaves.ts";
import type { ItemLocation } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";

import { Variants } from "./concerns/Variants.ts";

interface ItemBody {
  costGp?: number;
  description?: string | null;
  isTemplate?: boolean;
  name: string;
  slot?: ItemLocation;
  sourceItemId?: string;
  type?: string | null;
  updatedAt?: string;
  weight?: number;
}

class ItemsService extends include(Object, Variants) {
  /** What its creates, updates and deletes write, in one order around the plans its rules give. */
  private readonly saves = new EntitySaves("items", Items, itemsInRules, "Item");

  /**
   * Adds an item to the ruleset. A duplicate of the item `duplicatedItemId` points at the same template, and takes its
   * customizations when it isn't a template itself; a template's copies get their properties from the template.
   */
  private async addRulesetItem(session: Session, rulesetId: string, body: ItemBody, duplicatedItemId?: string) {
    const { row } = await this.saves.create(session, rulesetId, body.name, (scope) =>
      Engine.for(scope).entities("items").planCreate(body, duplicatedItemId),
    );
    return row;
  }

  async createItem(session: Session, rulesetId: string, body: ItemBody) {
    return await this.addRulesetItem(session, rulesetId, body);
  }

  async deleteItem(session: Session, rulesetId: string, itemId: string) {
    return await this.saves.delete(
      session,
      rulesetId,
      itemId,
      (scope) => Engine.for(scope).entities("items").planDelete(itemId),
      {
        // A template's copies, in any ruleset: its delete is refused while it has any
        refuse: async (tx, plan) => {
          if (plan.copiesOf) plan.checkCopies(await Items.findMany(tx, { sourceItemId: plan.copiesOf }));
        },
      },
    );
  }

  async duplicateItem(session: Session, rulesetId: string, sourceItemId: string, body: ItemBody) {
    return await this.addRulesetItem(session, rulesetId, body, sourceItemId);
  }

  async getItem(rulesetId: string, itemId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => Engine.for(scope).entities("items").describe(itemId));
  }

  async getItems(
    rulesetId: string,
    where: {
      childOnly?: boolean;
      isTemplate?: boolean;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      search?: string;
    },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const result = await Items.findPage(
        db,
        { rulesetId, ...scope.rulesetData.cow.listFilters, ...where },
        pagination,
      );
      return { ...result, items: Engine.for(scope).entities("items").describePage(result.items) };
    });
  }

  async updateItem(session: Session, rulesetId: string, itemId: string, body: ItemBody) {
    const { row } = await this.saves.update(
      session,
      rulesetId,
      body,
      (scope) => Engine.for(scope).entities("items").planEdit(itemId, body),
      (row) => ({ ...body, sourceItemId: row.sourceItemId }),
    );
    return row;
  }
}

export default new ItemsService();
