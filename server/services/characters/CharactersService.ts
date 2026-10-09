import { getTableName } from "drizzle-orm";

import { charactersInCharacter } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { include } from "@/lib/mixins.ts";
import { type RulesetScope, withRulesetScope, withRulesetScopes } from "@/server/cache/rulesetCache/index.ts";
import { db, type Db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import {
  Activities,
  Campaigns,
  CharacterAbilities,
  CharacterLanguages,
  CharacterLevels,
  Characters,
  Languages,
  Races,
  Visibility,
  visibilityMap,
} from "@/server/repositories/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { Alignment, Gender } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";

import { readBondedInputs, readCharacterInput } from "./characterInputs.ts";
import { Archives } from "./concerns/Archives.ts";
import { findEditableCharacterOrBonded, getEditableCharacter } from "./editableCharacter.ts";
import { enqueueCharacterPdf, findExportableCharacter } from "./pdf.ts";

class CharactersService extends include(Object, Archives) {
  /**
   * Replace a character's language set in-place, the engine refusing those it can't speak (`checkCharacterLanguages`):
   * deletes the existing rows and inserts the new set. Caller is responsible for the surrounding transaction and its
   * ruleset's scope.
   */
  private async replaceCharacterLanguages(
    tx: Db,
    scope: RulesetScope,
    characterRecord: { id: string; rulesetId: string },
    languageIds: string[],
  ): Promise<void> {
    // Proxy auto-canonicalizes the `ids` input through cowContext, so
    // Languages.findMany returns the post-COW rows regardless of which
    // form the client sent.
    const languages = await Languages.findMany(tx, { ids: languageIds });
    Engine.for(scope).characters().checkLanguages(characterRecord.rulesetId, languageIds, languages);

    const existing = await CharacterLanguages.findMany(tx, { characterId: characterRecord.id });
    for (const lang of existing)
      await CharacterLanguages.delete(tx, { characterId: characterRecord.id, languageId: lang.languageId });

    for (const languageId of languageIds)
      await CharacterLanguages.create(tx, { characterId: characterRecord.id, languageId });
  }

  async createCharacter(
    session: Session,
    characterData: {
      abilities: Record<string, number>;
      age?: number;
      alignment: Alignment;
      deity?: string;
      description?: string;
      gender: Gender;
      height?: string;
      name: string;
      notes?: string;
      privateNotes?: string;
      raceId: string;
      rulesetId: string;
      weight?: string;
      xp: number;
    },
  ) {
    return await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, characterData.rulesetId, async (scope) => {
          (await RulesetsPolicy.for(tx, session, scope.ruleset)).canCreateCharacter();
          const plan = Engine.for(scope).characters().planCreate(characterData);

          const [newCharacter] = await Characters.create(tx, {
            userId: session.userId,
            rulesetId: characterData.rulesetId,
            raceId: characterData.raceId,
            name: characterData.name,
            xp: characterData.xp,
            alignment: characterData.alignment,
            age: characterData.age,
            gender: characterData.gender,
            height: characterData.height,
            weight: characterData.weight,
            deity: characterData.deity,
            description: characterData.description,
            notes: characterData.notes,
            privateNotes: characterData.privateNotes,
          });

          await CharacterAbilities.createMany(
            tx,
            plan.abilities.map((ability) => ({ characterId: newCharacter.id, ...ability })),
          );

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
    formData: {
      alignment?: string;
      gender?: string;
    },
    where: { search?: string },
    pagination: { limit: number; page: number },
  ) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const { sourceChain } = scope.rulesetData.cow;

      const picker = Engine.for(scope).characters().openRacePicker(formData);
      // Races.findPage's output has its FK fields auto-resolved by
      // the Proxy since cowContext is active. No manual `CowData.resolveRows` pass.
      const result = await Races.findPage(
        db,
        { rulesetId, ancestorRulesetIds: sourceChain, ...picker.filters, search: where.search },
        pagination,
      );

      // The requirements come from the composed view, which merges siblings' into the winner's
      const items = picker.annotate(result.items);
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
      orderBy?: "name" | "createdAt" | "updatedAt";
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
        const cards = Engine.describeCharacterCards(views, charactersList, levels);
        const enrichedCharacters = charactersList.map((char) => {
          const { levels: classLevels, race, totalLevel } = cards.get(char.id)!;
          return {
            id: char.id,
            name: char.name,
            description: char.description,
            race,
            levels: classLevels,
            totalLevel,
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

      return await withRulesetScope(tx, characterRecord.rulesetId, async () => {
        // Repo composite WHERE auto-expands abilityId through cowContext so
        // stored pre-COW rows still match when the client sends post-COW ids.
        for (const [abilityId, score] of Object.entries(abilities)) {
          const rows = await CharacterAbilities.update(tx, { score }, { characterId, abilityId });
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
      age?: number | null;
      alignment?: Alignment;
      deity?: string;
      description?: string;
      gender?: Gender;
      height?: string | null;
      languageIds?: string[];
      name?: string;
      notes?: string;
      privateNotes?: string;
      updatedAt?: string;
      weight?: string | null;
      xp?: number;
    },
  ) {
    return await withTransaction(async (tx) => {
      const characterRecord = await findEditableCharacterOrBonded(tx, characterId, session.userId);
      if (!characterRecord) throw new NotFoundError("Character not found");

      const { languageIds, updatedAt: expectedUpdatedAt, ...characterFields } = updateData;

      const updatedRows = await Characters.update(tx, characterFields, { id: characterId, expectedUpdatedAt });
      if (expectedUpdatedAt && updatedRows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

      const [updatedCharacter] = updatedRows;

      // Apply languages atomically when present. `undefined` = leave alone;
      // `[]` = clear all. Wrapped in withRulesetScope because language ids
      // need COW canonicalization against the character's ruleset.
      if (languageIds !== undefined) {
        await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
          await this.replaceCharacterLanguages(tx, scope, characterRecord, languageIds);
        });
      }

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
