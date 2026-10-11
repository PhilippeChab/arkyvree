import type { Db } from "@/drizzle/database.ts";
import { itemsInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { include } from "@/lib/mixins.ts";
import { type RulesetScope, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Items } from "@/server/repositories/index.ts";
import EntityWriter from "@/server/services/rulesets/EntityWriter.ts";
import type { ItemLocation } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";

import { Variants } from "./concerns/Variants.ts";

interface ItemBody {
  costGp?: number | null;
  description?: string | null;
  isTemplate?: boolean;
  name: string;
  slot?: ItemLocation | null;
  sourceItemId?: string | null;
  type?: string | null;
  updatedAt?: string;
  weight?: number | null;
}

class ItemsService extends include(Object, Variants) {
  /** What its creates, updates and deletes write, in one order around the plans its rules give. */
  private readonly writer = new EntityWriter("items", Items, itemsInRules, "Item");

  /**
   * The items made from a template that a change to it in the scope's ruleset reaches (`copiesOf`: the ids they may
   * hold): its view's, and those of the rulesets built on it. Not another ruleset's, whose view reads its own copy or
   * the original.
   */
  private async findCopies(tx: Db, { ruleset, rulesetData }: RulesetScope, copiesOf: string[]) {
    return await Items.findMany(tx, { rulesetId: ruleset.id, ...rulesetData.cow.listFilters, sourceItemIds: copiesOf });
  }

  async createItem(session: Session, rulesetId: string, body: ItemBody) {
    return await this.writer.create(session, rulesetId, body.name, (scope) =>
      Engine.for(scope).entities("items").planCreate(body),
    );
  }

  async deleteItem(session: Session, rulesetId: string, itemId: string) {
    return await this.writer.delete(
      session,
      rulesetId,
      itemId,
      (scope) => Engine.for(scope).entities("items").planDelete(itemId),
      {
        // The items made from a template its delete reaches: refused while it has any
        refuse: async (tx, scope, plan) => {
          if (plan.copiesOf) plan.checkCopies(await this.findCopies(tx, scope, plan.copiesOf));
        },
      },
    );
  }

  /**
   * A duplicate of an item (`sourceItemId`): it points at the same template, and takes its source's customizations when
   * its source isn't a template; a template's copies get their properties from the template.
   */
  async duplicateItem(session: Session, rulesetId: string, sourceItemId: string, body: ItemBody) {
    return await this.writer.create(session, rulesetId, body.name, (scope) =>
      Engine.for(scope).entities("items").planDuplicate(sourceItemId, body),
    );
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
      const list = Engine.for(scope).entities("items").openList(where);
      const result = await Items.findPage(
        db,
        { rulesetId, ...scope.rulesetData.cow.listFilters, ...where, ...list.filters },
        pagination,
      );
      return { ...result, items: list.describe(result.items) };
    });
  }

  async updateItem(session: Session, rulesetId: string, itemId: string, body: ItemBody) {
    return await this.writer.update(
      session,
      rulesetId,
      body,
      async (scope, { tx }) => {
        const plan = Engine.for(scope).entities("items").planEdit(itemId, body);
        // The items made from a template its type change reaches: refused while any is of another type
        if (plan.copiesOf) plan.checkCopies(await this.findCopies(tx, scope, plan.copiesOf));
        return plan;
      },
      (row) => ({ ...body, sourceItemId: row.sourceItemId }),
    );
  }
}

export default new ItemsService();
