import type { Db } from "@/drizzle/database.ts";
import {
  type CreationPickQuery,
  Engine,
  type EntityRecord,
  type FieldsRequest,
  type LinkPicksPlan,
} from "@/engine/index.ts";
import { include } from "@/lib/mixins.ts";
import { withRulesetScope, withRulesetScopes } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import {
  Activities,
  CharacterAdvancements,
  CharacterLinks,
  Characters,
  Entities,
  type Pagination,
  Visibility,
  visibilityMap,
} from "@/server/repositories/index.ts";
import { withReadableRuleset } from "@/server/services/rulesets/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Session } from "@/shared/relations.ts";

import { describeCharacterCards } from "./characterCards.ts";
import { readCharacterInput, readChildInputs } from "./characterInputs.ts";
import { Archives } from "./concerns/Archives.ts";
import { Imports } from "./concerns/Imports.ts";
import { findEditableCharacterOrChild, getEditableCharacter } from "./editableCharacter.ts";
import { createNewCharacter } from "./newCharacterWrites.ts";
import { enqueueCharacterPdf, findExportableCharacter } from "./pdf.ts";

class CharactersService extends include(Object, Archives, Imports) {
  /** A character's picks of a picked link's role (`role`) as a plan has them: its picks replaced. */
  private async writeLinkPicks(tx: Db, characterId: string, role: string, plan: LinkPicksPlan): Promise<void> {
    await CharacterLinks.delete(tx, { characterId, role });
    await CharacterLinks.createMany(
      tx,
      characterId,
      role,
      plan.entityIds.map((entityId) => ({ entityId })),
    );
  }

  /**
   * A new character, as its form sends it: its ruleset, name and notes, its fields, the entity each of its creation's
   * picks names (`picks`, by its single link's role), and each scored link's amounts (`scores`, by role), as its
   * ruleset plans it.
   */
  async createCharacter(
    session: Session,
    characterData: {
      fields: FieldsRequest;
      name: string;
      notes?: string;
      picks: Record<string, string>;
      rulesetId: string;
      scores: Record<string, Record<string, number>>;
    },
  ) {
    return await withTransaction(
      async (tx) =>
        await withReadableRuleset(tx, session, characterData.rulesetId, async (scope, policy) => {
          policy.canCreateCharacter();
          const { fields, name, notes, picks, rulesetId, scores } = characterData;
          const { links, row } = Engine.for(scope).characters().planCreate({ fields, picks, scores });
          const newCharacter = await createNewCharacter(tx, {
            links,
            row: { ...row, name, notes, rulesetId, userId: session.userId },
          });

          // Log the activity
          await Activities.create(tx, {
            userId: session.userId,
            targetId: newCharacter.id,
            targetType: TARGET_TYPES.characters,
            type: "createCharacter",
          });

          return newCharacter;
        }),
    );
  }

  async enqueuePdf(session: Session, characterId: string) {
    const characterRecord = await findExportableCharacter(session.userId, characterId);
    if (!characterRecord) throw new NotFoundError("Character not found");

    await enqueueCharacterPdf(session, characterRecord);
  }

  /**
   * A character's sheet, as the API answers it: a player character's with its children's (3.5's bonded creatures), or a
   * child's, which its parent's editors read. Its editors alone read it, so it carries its share token.
   */
  async getCharacter(session: Session, characterId: string) {
    const record = await findEditableCharacterOrChild(db, characterId, session.userId, Visibility.All);
    if (!record) throw new NotFoundError("Character not found");

    return await withRulesetScope(db, record.rulesetId, async (scope) => {
      const character = await readCharacterInput(db, record);
      const described = Engine.for(scope)
        .character(character)
        .describe(await readChildInputs(db, character, Visibility.All));
      return { ...described, shareToken: record.shareToken };
    });
  }

  async getCharacters(
    session: Session,
    where: {
      accessRole?: "owner" | "contributor";
      orderBy?: "name" | "createdAt" | "lastChangedAt";
      orderDir?: "asc" | "desc";
      search?: string;
      visibility?: keyof typeof visibilityMap;
    },
    pagination: Pagination,
  ) {
    const { visibility, ...filters } = where;
    const result = await Characters.findPage(
      db,
      { userId: session.userId, ...filters, ...(visibility && { visibility: visibilityMap[visibility] }) },
      pagination,
    );

    const charactersList = result.items;
    const characterIds = charactersList.map((char) => char.id);

    const advancements = await CharacterAdvancements.findMany(db, { characterIds });

    // Each card from its character's ruleset's view: a copied or renamed race or class shows its name there
    return await withRulesetScopes(
      db,
      charactersList.map((c) => c.rulesetId),
      async (views) => {
        // The user's own characters: every card whole
        const cards = describeCharacterCards(views, charactersList, advancements, new Set());
        const enrichedCharacters = charactersList.map((char) => {
          const { chips } = cards.get(char.id)!;
          return {
            id: char.id,
            name: char.name,
            description: char.description,
            chips,
            accessRole: char.accessRole,
          };
        });

        return {
          items: enrichedCharacters,
          page: result.page,
          nextPage: result.nextPage,
        };
      },
    );
  }

  /**
   * How a new character of a ruleset (`rulesetId`) sets its scores of a scored link's role (`role`), as its rules answer
   * it.
   */
  async getCreation(session: Session, rulesetId: string, role: string) {
    return await withReadableRuleset(db, session, rulesetId, async (scope) =>
      Engine.for(scope).characters().describeCreation(role),
    );
  }

  /**
   * The options of a new character's creation pick (`role`, a single link's: 3.5's race) of a ruleset, as what its form
   * says so far narrows them (`formData`), a page of them, each checked.
   */
  async getCreationOptions(
    session: Session,
    rulesetId: string,
    role: string,
    formData: CreationPickQuery,
    where: { search?: string },
    pagination: Pagination,
  ) {
    return await withReadableRuleset(db, session, rulesetId, async (scope) => {
      const picker = Engine.for(scope).characters().openCreationPicker(role, formData);
      // Each option as an entity's row: its columns past those every kind's has are its kind's
      const result = await Entities.findPage<EntityRecord>(
        db,
        {
          rulesetId,
          ...scope.rulesetData.cow.listFilters,
          ...picker.filters,
          search: where.search,
        },
        pagination,
      );

      // The requirements come from the composed view, which merges siblings' into the winner's
      const items = picker.describe(result.items);
      return { items, page: result.page, nextPage: result.nextPage };
    });
  }

  /**
   * What a character the session may edit (or a child of one) has of a picked link's role (`role`), and what its picks
   * (`entityIds`, as its edit is being made) leave it room for: what the role's picker offers.
   */
  async getLinkPicks(session: Session, characterId: string, role: string, entityIds: string[]) {
    const record = await findEditableCharacterOrChild(db, characterId, session.userId);
    if (!record) throw new NotFoundError("Character not found");

    return await withRulesetScope(db, record.rulesetId, async (scope) =>
      Engine.for(scope)
        .character(await readCharacterInput(db, record))
        .describeLinkPicks(role, entityIds),
    );
  }

  async updateCharacter(
    session: Session,
    characterId: string,
    updateData: {
      fields?: FieldsRequest;
      links?: Record<string, string[]>;
      name?: string;
      notes?: string;
      privateNotes?: string;
      updatedAt?: string;
    },
  ) {
    return await withTransaction(async (tx) => {
      const characterRecord = await findEditableCharacterOrChild(tx, characterId, session.userId);
      if (!characterRecord) throw new NotFoundError("Character not found");

      const { fields, links, updatedAt: expectedUpdatedAt, ...characterFields } = updateData;

      // Its fields, by the keys its sheet sends them, and its picked links' picks, as its ruleset writes them: each
      // checked. The engine reads the picks' ids as the character's ruleset's view does
      const planned =
        fields || links
          ? await withRulesetScope(tx, characterRecord.rulesetId, async (scope) =>
              Engine.for(scope)
                .character(await readCharacterInput(tx, characterRecord))
                .planEdit({ fields, links }),
            )
          : undefined;

      const updatedRows = await Characters.update(
        tx,
        { ...characterFields, ...planned?.own, fields: planned?.fields },
        { id: characterId, expectedUpdatedAt },
      );
      if (expectedUpdatedAt && updatedRows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

      const [updatedCharacter] = updatedRows;

      // Its picked links' picks, atomically with it, when it sends them: none sent leaves them alone, `[]` clears them
      for (const [role, plan] of Object.entries(planned?.links ?? {}))
        await this.writeLinkPicks(tx, characterId, role, plan);

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetType: TARGET_TYPES.characters,
        type: "updateCharacter",
      });

      return updatedCharacter;
    });
  }

  /** Sets a character's amounts of a scored link's role (`role`: 3.5's `score`), as its ruleset plans them. */
  async updateScores(session: Session, characterId: string, role: string, scores: Record<string, number>) {
    return await withTransaction(async (tx) => {
      const characterRecord = await getEditableCharacter(tx, session, characterId);

      return await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
        const plan = Engine.for(scope).characters().planScores(role, scores);
        // An amount stored before its entity was copied names the source: the copy's id the client sends matches it
        for (const { amount, entityId } of plan.links) {
          const entityIds = scope.rulesetData.cow.getEquivalentIds(entityId);
          const rows = await CharacterLinks.updateAmount(tx, amount, { role, characterId, entityIds });
          if (rows.length === 0) throw new NotFoundError("Score not found");
        }

        await Activities.create(tx, {
          userId: session.userId,
          targetId: characterId,
          targetType: TARGET_TYPES.characters,
          type: "updateCharacter",
        });
      });
    });
  }
}

export default new CharactersService();
