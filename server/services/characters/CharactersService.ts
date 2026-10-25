import { getTableName } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { charactersInCharacter } from "@/drizzle/schema.ts";
import {
  type CreationPickQuery,
  Engine,
  type EntityRow,
  type FieldsRequest,
  type LinkPicksPlan,
} from "@/engine/index.ts";
import { include } from "@/lib/mixins.ts";
import { withRulesetScope, withRulesetScopes } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import {
  Activities,
  Campaigns,
  CharacterAdvancements,
  CharacterLinks,
  Characters,
  Entities,
  Visibility,
  visibilityMap,
} from "@/server/repositories/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

import { describeCharacterCards } from "./characterCards.ts";
import { readCharacterInput, readChildInputs } from "./characterInputs.ts";
import { Archives } from "./concerns/Archives.ts";
import { Imports } from "./concerns/Imports.ts";
import { findEditableCharacterOrChild, getEditableCharacter } from "./editableCharacter.ts";
import { enqueueCharacterPdf, findExportableCharacter } from "./pdf.ts";

class CharactersService extends include(Object, Archives, Imports) {
  /** A character's picks of a picked link (`link`) as a plan has them: its picks replaced. */
  private async writeLinkPicks(tx: Db, characterId: string, link: string, plan: LinkPicksPlan): Promise<void> {
    await CharacterLinks.delete(tx, { characterId, link });
    await CharacterLinks.createPlanned(
      tx,
      link,
      characterId,
      plan.entityIds.map((entityId) => ({ entityId })),
    );
  }

  /**
   * A new character, as its form sends it: its ruleset, name and notes, its fields, the entity each of its creation's
   * picks names (`picks`, by column), and each scored link's amounts (`scores`, by link), as its ruleset plans it.
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
        await withRulesetScope(tx, characterData.rulesetId, async (scope) => {
          (await RulesetsPolicy.for(tx, session, scope.ruleset)).canCreateCharacter();
          const { fields, picks, scores } = characterData;
          const plan = Engine.for(scope).characters().planCreate({ fields, picks, scores });

          const [newCharacter] = await Characters.create(tx, {
            ...plan.columns,
            userId: session.userId,
            rulesetId: characterData.rulesetId,
            name: characterData.name,
            notes: characterData.notes,
          });

          for (const [link, links] of Object.entries(plan.links))
            await CharacterLinks.createPlanned(tx, link, newCharacter.id, links);

          // Log the activity
          await Activities.create(tx, {
            userId: session.userId,
            targetId: newCharacter.id,
            targetTable: getTableName(charactersInCharacter),
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
   * child's, which its parent's editors read.
   */
  async getCharacter(session: Session, characterId: string) {
    const record = await Characters.findOne(db, { id: characterId }, Visibility.All);
    if (!record) throw new NotFoundError("Character not found");
    await getEditableCharacter(db, session, record.parentCharacterId ?? record.id, Visibility.All);

    return await withRulesetScope(db, record.rulesetId, async (scope) => {
      const character = await readCharacterInput(db, record);
      return Engine.for(scope)
        .character(character)
        .describe(await readChildInputs(db, character, Visibility.All));
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
    pagination: { limit: number; page: number },
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
   * How a new character of a ruleset (`rulesetId`) sets its scores of a scored link (`link`), as its rules answer it.
   */
  async getCreation(rulesetId: string, link: string) {
    return await withRulesetScope(db, rulesetId, async (scope) =>
      Engine.for(scope).characters().describeCreation(link),
    );
  }

  /**
   * The options of a new character's creation pick (`column`, a single link's: 3.5's race) of a ruleset, as what its
   * form says so far narrows them (`formData`), a page of them, each checked.
   */
  async getCreationOptions(
    rulesetId: string,
    column: string,
    formData: CreationPickQuery,
    where: { search?: string },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const picker = Engine.for(scope).characters().openCreationPicker(column, formData);
      // Each option as an entity's row: its columns past those every kind's has are its kind's
      const result = await Entities.findPage<EntityRow>(
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
   * What a character the session may edit (or a child of one) has of a picked link (`link`), and what its picks
   * (`entityIds`, as its edit is being made) leave it room for: what the link's picker offers.
   */
  async getLinkPicks(session: Session, characterId: string, link: string, entityIds: string[]) {
    const record = await findEditableCharacterOrChild(db, characterId, session.userId);
    if (!record) throw new NotFoundError("Character not found");

    return await withRulesetScope(db, record.rulesetId, async (scope) =>
      Engine.for(scope)
        .character(await readCharacterInput(db, record))
        .describeLinkPicks(link, entityIds),
    );
  }

  async getUnlinkedCharacters(
    session: Session,
    campaignId: string,
    where: { search?: string },
    pagination: { limit: number; page: number },
  ) {
    const campaign = await Campaigns.findOne(db, { id: campaignId });
    if (!campaign) throw new NotFoundError("Campaign not found");

    return await Characters.findUnlinkedPage(
      db,
      { userId: session.userId, rulesetId: campaign.rulesetId, search: where.search },
      pagination,
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
        { ...characterFields, ...planned?.columns },
        { id: characterId, expectedUpdatedAt },
      );
      if (expectedUpdatedAt && updatedRows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

      const [updatedCharacter] = updatedRows;

      // Its picked links' picks, atomically with it, when it sends them: none sent leaves them alone, `[]` clears them
      for (const [link, plan] of Object.entries(planned?.links ?? {}))
        await this.writeLinkPicks(tx, characterId, link, plan);

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetTable: getTableName(charactersInCharacter),
        type: "updateCharacter",
      });

      return updatedCharacter;
    });
  }

  /**
   * Replaces a character's picks of a picked link (`link`: 3.5's languages), as its ruleset plans them from its rows
   * (`planLinkPicks`: each the view's entity, a copy's when the ruleset copied one; those its rules give it left out;
   * refused when the view has none, it's sent twice, or a new pick is past what its rules let it have).
   */
  async updateLinkPicks(session: Session, characterId: string, link: string, entityIds: string[]) {
    return await withTransaction(async (tx) => {
      const characterRecord = await getEditableCharacter(tx, session, characterId);

      return await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
        const character = await readCharacterInput(tx, characterRecord);
        const plan = Engine.for(scope).character(character).planLinkPicks(link, entityIds);
        await this.writeLinkPicks(tx, characterId, link, plan);

        await Activities.create(tx, {
          userId: session.userId,
          targetId: characterId,
          targetTable: getTableName(charactersInCharacter),
          type: "updateCharacter",
        });
      });
    });
  }

  /** Sets a character's amounts of a scored link (`link`: 3.5's ability scores), as its ruleset plans them. */
  async updateScores(session: Session, characterId: string, link: string, scores: Record<string, number>) {
    return await withTransaction(async (tx) => {
      const characterRecord = await getEditableCharacter(tx, session, characterId);

      return await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
        const plan = Engine.for(scope).characters().planScores(link, scores);
        // An amount stored before its entity was copied names the source: the copy's id the client sends matches it
        for (const { amount, entityId } of plan.links) {
          const entityIds = scope.rulesetData.cow.getEquivalentIds(entityId);
          const rows = await CharacterLinks.updateAmount(tx, amount, { link, characterId, entityIds });
          if (rows.length === 0) throw new NotFoundError("Score not found");
        }

        await Activities.create(tx, {
          userId: session.userId,
          targetId: characterId,
          targetTable: getTableName(charactersInCharacter),
          type: "updateCharacter",
        });
      });
    });
  }
}

export default new CharactersService();
