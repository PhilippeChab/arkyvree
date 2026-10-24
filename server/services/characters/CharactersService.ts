import { getTableName } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { charactersInCharacter } from "@/drizzle/schema.ts";
import {
  type CharacterLanguage,
  type CreationPickQuery,
  Engine,
  type FieldsRequest,
  type LinkPicksPlan,
  type Race,
} from "@/engine/index.ts";
import { include } from "@/lib/mixins.ts";
import { type RulesetScope, withRulesetScope, withRulesetScopes } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import {
  Activities,
  Campaigns,
  CharacterLevels,
  CharacterLinks,
  Characters,
  Entities,
  Visibility,
  visibilityMap,
} from "@/server/repositories/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { Character, Session } from "@/shared/relations.ts";

import { describeCharacterCards } from "./characterCards.ts";
import { readBondedInputs, readCharacterInput } from "./characterInputs.ts";
import { Archives } from "./concerns/Archives.ts";
import { Imports } from "./concerns/Imports.ts";
import { findEditableCharacterOrBonded, getEditableCharacter } from "./editableCharacter.ts";
import { enqueueCharacterPdf, findExportableCharacter } from "./pdf.ts";

class CharactersService extends include(Object, Archives, Imports) {
  /**
   * Replace a character's picked languages in-place, as the engine plans them from its rows (`planLinkPicks`: each the
   * view's language, a copy's when the ruleset copied one; those its race and classes give it left out; refused when
   * the view has none, it's sent twice, or a new pick is past what its rules let it speak): deletes the existing rows
   * and inserts the new set. Caller is responsible for the surrounding transaction and its ruleset's scope.
   */
  private async replaceCharacterLanguages(
    tx: Db,
    scope: RulesetScope,
    characterRecord: Character,
    languageIds: string[],
  ): Promise<void> {
    const character = await readCharacterInput(tx, characterRecord);
    const plan = Engine.for(scope).character(character).planLinkPicks("languages", languageIds);
    await this.writeLanguages(tx, characterRecord.id, plan);
  }

  /** A character's languages as a plan has them: its picks replaced. */
  private async writeLanguages(tx: Db, characterId: string, plan: LinkPicksPlan): Promise<void> {
    const existing = await CharacterLinks.findMany<CharacterLanguage>(tx, { link: "languages", characterId });
    for (const lang of existing)
      await CharacterLinks.delete(tx, { link: "languages", characterId, entityId: lang.languageId });

    for (const languageId of plan.entityIds) await CharacterLinks.create(tx, "languages", { characterId, languageId });
  }

  async createCharacter(
    session: Session,
    characterData: {
      abilities: Record<string, number>;
      fields: FieldsRequest;
      name: string;
      notes?: string;
      raceId: string;
      rulesetId: string;
    },
  ) {
    return await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, characterData.rulesetId, async (scope) => {
          (await RulesetsPolicy.for(tx, session, scope.ruleset)).canCreateCharacter();
          const { abilities, fields, raceId } = characterData;
          const plan = Engine.for(scope).characters().planCreate({ fields, picks: { raceId }, scores: { abilities } });

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

  async getAvailableRaces(
    rulesetId: string,
    formData: CreationPickQuery,
    where: { search?: string },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const picker = Engine.for(scope).characters().openCreationPicker("raceId", formData);
      const result = await Entities.findPage<Race>(
        db,
        {
          entityType: "races",
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
   * A character's sheet, as the API answers it: a player character's with its bonded creatures', or a creature's, which
   * its master's editors read.
   */
  async getCharacter(session: Session, characterId: string) {
    const record = await Characters.findOne(db, { id: characterId }, Visibility.All);
    if (!record) throw new NotFoundError("Character not found");
    await getEditableCharacter(db, session, record.parentCharacterId ?? record.id, Visibility.All);

    return await withRulesetScope(db, record.rulesetId, async (scope) => {
      const character = await readCharacterInput(db, record);
      return Engine.for(scope)
        .character(character)
        .describe(await readBondedInputs(db, character, Visibility.All));
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

    const levels = await CharacterLevels.findMany(db, { characterIds });

    // Each card from its character's ruleset's view: a copied or renamed race or class shows its name there
    return await withRulesetScopes(
      db,
      charactersList.map((c) => c.rulesetId),
      async (views) => {
        // The user's own characters: every card whole
        const cards = describeCharacterCards(views, charactersList, levels, new Set());
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

  /** How a new character of a ruleset (`rulesetId`) sets its ability scores, as its rules answer it. */
  async getCreation(rulesetId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => Engine.for(scope).characters().describeCreation());
  }

  /**
   * What a character the session may edit (or a bonded creature of one) speaks, and what its picked languages
   * (`languageIds`, as its edit is being made) leave it room for: what its languages picker offers.
   */
  async getLanguages(session: Session, characterId: string, languageIds: string[]) {
    const record = await findEditableCharacterOrBonded(db, characterId, session.userId);
    if (!record) throw new NotFoundError("Character not found");

    return await withRulesetScope(db, record.rulesetId, async (scope) =>
      Engine.for(scope)
        .character(await readCharacterInput(db, record))
        .describeLinkPicks("languages", languageIds),
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

  async updateAbilities(session: Session, characterId: string, abilities: Record<string, number>) {
    return await withTransaction(async (tx) => {
      const characterRecord = await getEditableCharacter(tx, session, characterId);

      return await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
        const plan = Engine.for(scope).characters().planScores("abilities", abilities);
        // A score stored before its ability was copied names the source: the copy's id the client sends matches it
        for (const { amount, entityId } of plan.links) {
          const abilityIds = scope.rulesetData.cow.getEquivalentIds(entityId);
          const rows = await CharacterLinks.updateAmount(tx, amount, {
            link: "abilities",
            characterId,
            entityIds: abilityIds,
          });
          if (rows.length === 0) throw new NotFoundError("Ability not found");
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

  async updateCharacter(
    session: Session,
    characterId: string,
    updateData: {
      fields?: FieldsRequest;
      languageIds?: string[];
      name?: string;
      notes?: string;
      privateNotes?: string;
      updatedAt?: string;
    },
  ) {
    return await withTransaction(async (tx) => {
      const characterRecord = await findEditableCharacterOrBonded(tx, characterId, session.userId);
      if (!characterRecord) throw new NotFoundError("Character not found");

      const { fields, languageIds, updatedAt: expectedUpdatedAt, ...characterFields } = updateData;

      // Its fields, by the keys its sheet sends them, and its languages, as its ruleset writes them: each checked. The
      // engine reads the language ids as the character's ruleset's view does
      const planned =
        fields || languageIds
          ? await withRulesetScope(tx, characterRecord.rulesetId, async (scope) =>
              Engine.for(scope)
                .character(await readCharacterInput(tx, characterRecord))
                .planEdit({ fields, ...(languageIds && { links: { languages: languageIds } }) }),
            )
          : undefined;

      const updatedRows = await Characters.update(
        tx,
        { ...characterFields, ...planned?.columns },
        { id: characterId, expectedUpdatedAt },
      );
      if (expectedUpdatedAt && updatedRows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

      const [updatedCharacter] = updatedRows;

      // Its languages, atomically with it, when it sends them: none sent leaves them alone, `[]` clears them
      if (planned?.links?.languages) await this.writeLanguages(tx, characterId, planned.links.languages);

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetTable: getTableName(charactersInCharacter),
        type: "updateCharacter",
      });

      return updatedCharacter;
    });
  }

  async updateLanguages(session: Session, characterId: string, languageIds: string[]) {
    return await withTransaction(async (tx) => {
      const characterRecord = await getEditableCharacter(tx, session, characterId);

      return await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
        await this.replaceCharacterLanguages(tx, scope, characterRecord, languageIds);

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
