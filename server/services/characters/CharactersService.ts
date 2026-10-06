import { getTableName } from "drizzle-orm";

import { charactersInCharacter } from "@/drizzle/schema.ts";
import { withRulesetScope, withRulesetScopes } from "@/server/cache/rulesetCache/index.ts";
import { findScopedEntity } from "@/server/cow/index.ts";
import { db, type Db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { include } from "@/server/mixins.ts";
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
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type { CharacterKind, Holders } from "@/server/rulesets/types.ts";
import DetailedCharacterRequirements from "@/server/rulesets/universal/DetailedCharacterRequirements.ts";
import { getClassLevelsByCharacter } from "@/server/services/characters/classLevels.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { BondedKind } from "@/shared/dnd3.5/bondedKinds.ts";
import type { Alignment, Gender } from "@/shared/enums.ts";
import type { Requirement, Session } from "@/shared/relations.ts";

import { type BondedEntry, loadBondedByKind } from "./bonded.ts";
import { Archives } from "./concerns/Archives.ts";
import { findEditableCharacterOrBonded, getEditableCharacter } from "./editableCharacter.ts";
import { enqueueCharacterPdf, findExportableCharacter } from "./pdf.ts";

class CharactersService extends include(Object, Archives) {
  /**
   * Replace a character's language set in-place. Validates each id resolves
   * to a language in the character's ruleset (or its COW ancestor chain),
   * then deletes existing rows and inserts the new set. Caller is responsible
   * for the surrounding transaction + withRulesetScope.
   */
  private async replaceCharacterLanguages(
    tx: Db,
    characterRecord: { id: string; rulesetId: string },
    rulesetData: { cow: { sourceChain: string[] } },
    languageIds: string[],
  ): Promise<void> {
    if (languageIds.length > 0) {
      // Proxy auto-canonicalizes the `ids` input through cowContext, so
      // Languages.findMany returns the post-COW rows regardless of which
      // form the client sent.
      const languages = await Languages.findMany(tx, { ids: languageIds });
      if (languages.length !== languageIds.length) {
        throw new BadRequestError("Some languages were not found");
      }
      const validRulesetIds = new Set([characterRecord.rulesetId, ...rulesetData.cow.sourceChain]);
      if (languages.some((l) => !validRulesetIds.has(l.rulesetId))) {
        throw new BadRequestError("Some languages do not belong to the character's ruleset");
      }
    }

    const existing = await CharacterLanguages.findMany(tx, { characterId: characterRecord.id });
    for (const lang of existing) {
      await CharacterLanguages.delete(tx, { characterId: characterRecord.id, languageId: lang.languageId });
    }
    for (const languageId of languageIds) {
      await CharacterLanguages.create(tx, { characterId: characterRecord.id, languageId });
    }
  }

  async createCharacter(
    session: Session,
    characterData: {
      rulesetId: string;
      raceId: string;
      name: string;
      xp: number;
      alignment: Alignment;
      abilities: Record<string, number>;
      age?: number;
      gender: Gender;
      height?: string;
      weight?: string;
      deity?: string;
      description?: string;
      notes?: string;
    },
  ) {
    return await withTransaction(async (tx) => {
      return await withRulesetScope(tx, characterData.rulesetId, async ({ ruleset, rulesetData }) => {
        (await RulesetsPolicy.for(tx, session, ruleset)).canCreateCharacter();

        const race = findScopedEntity(
          rulesetData.racesById,
          characterData.raceId,
          characterData.rulesetId,
          rulesetData.cow.sourceChain,
          "Race",
        );
        if (race.kind !== "pc") {
          throw new BadRequestError("Race is not valid for a player character");
        }

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
        });

        // Create character ability scores from ruleset abilities
        if (rulesetData.abilities.length > 0) {
          await CharacterAbilities.createMany(
            tx,
            rulesetData.abilities.map((ability) => ({
              characterId: newCharacter.id,
              abilityId: ability.id,
              score: characterData.abilities[ability.id] ?? 10,
            })),
          );
        }

        // Log the activity
        await Activities.create(tx, {
          userId: session.userId,
          targetId: newCharacter.id,
          targetTable: getTableName(charactersInCharacter),
          type: "createCharacter",
        });

        return newCharacter;
      });
    });
  }

  async enqueuePdf(session: Session, characterId: string) {
    const characterRecord = await findExportableCharacter(session.userId, characterId);
    if (!characterRecord) {
      throw new NotFoundError("Character not found");
    }

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
    return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
      const { sourceChain } = rulesetData.cow;

      // Races.findPage's output has its FK fields auto-resolved by
      // the Proxy since cowContext is active. No manual `CowData.resolveRows` pass.
      const result = await Races.findPage(
        db,
        { rulesetId, ancestorRulesetIds: sourceChain, kind: "pc", search: where.search },
        pagination,
      );

      const races = result.items;

      if (races.length === 0) return { items: [], page: result.page, nextPage: result.nextPage };

      // Requirements come from the composed cache — compose pre-merges sibling
      // requirements into the winner's bucket, so the lookup is already correct
      // across multi-extension COW forks.
      const requirementsByRace = new Map<string, Requirement[]>();
      let anyRequirements = false;
      for (const race of races) {
        const reqs = rulesetData.requirementsByEntity.get(race.id);
        if (reqs && reqs.length > 0) {
          requirementsByRace.set(race.id, reqs);
          anyRequirements = true;
        }
      }

      if (!anyRequirements) {
        return {
          items: races.map((race) => ({ ...race, eligible: true })),
          page: result.page,
          nextPage: result.nextPage,
        };
      }

      // Build a minimal identity holder from form data.
      // Only include fields that are actually provided — missing fields cause
      // path traversal to fail gracefully (node not in tree → lenient evaluation).
      const identityData: Record<string, Record<string, unknown>> = {
        physiology: {},
        beliefs: {},
        background: {},
        meta: {},
      };
      if (formData.alignment) identityData.beliefs.alignment = formData.alignment;
      if (formData.gender) identityData.physiology.gender = formData.gender;

      const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
      const targetPaths = rulesetModule.createTargetPaths();
      const holders: Holders = {
        identity: { getIdentity: () => identityData },
      };

      const annotatedRaces = races.map((race) => {
        const reqs = requirementsByRace.get(race.id);
        if (!reqs || reqs.length === 0) return { ...race, eligible: true };

        const tempRequirements = new DetailedCharacterRequirements(targetPaths);
        tempRequirements.evaluateRequirements(holders, [reqs]);
        const { unmetRequirementGroups } = tempRequirements.getRequirements();
        // Only check unmetRequirementGroups — invalidRequirements represent
        // paths we can't evaluate from partial form data (treated as passing)
        return { ...race, eligible: unmetRequirementGroups.length === 0 };
      });

      return { items: annotatedRaces, page: result.page, nextPage: result.nextPage };
    });
  }

  async getCharacter(session: Session, characterId: string) {
    const record = await Characters.findOne(db, { id: characterId }, Visibility.All);
    if (!record) {
      throw new NotFoundError("Character not found");
    }

    if (record.kind !== "pc") {
      if (!record.parentCharacterId) {
        throw new NotFoundError("Character not found");
      }
      await getEditableCharacter(db, session, record.parentCharacterId, Visibility.All);

      const rulesetModule = await RulesetFactory.fromRulesetId(record.rulesetId);
      const detailedBonded = rulesetModule.createDetailedCharacter(record, record.kind as CharacterKind);
      await detailedBonded.build();

      return {
        character: record,
        detailedCharacter: detailedBonded,
        bondedByKind: {} as Partial<Record<BondedKind, BondedEntry>>,
      };
    }

    const characterRecord = await getEditableCharacter(db, session, characterId, Visibility.All);

    const rulesetModule = await RulesetFactory.fromRulesetId(characterRecord.rulesetId);
    const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
    await detailedCharacter.build();

    const bondedByKind = await loadBondedByKind(rulesetModule, characterId);

    return {
      character: characterRecord,
      detailedCharacter,
      bondedByKind,
    };
  }

  async getCharacters(
    session: Session,
    where: {
      visibility?: keyof typeof visibilityMap;
      search?: string;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      accessRole?: "owner" | "contributor";
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

    const levels = characterIds.length > 0 ? await CharacterLevels.findMany(db, { characterIds }) : [];

    // Resolve race / klass names via each character's composed ruleset cache
    // so COW'd or renamed entities render their post-COW names (the detail
    // page already does this via rulesetData; the list used to hit Races/
    // Klasses.findMany directly and returned stale pre-COW names).
    return await withRulesetScopes(
      db,
      charactersList.map((c) => c.rulesetId),
      async (rulesetDataByRulesetId) => {
        const classLevelsByCharacter = getClassLevelsByCharacter(charactersList, levels, rulesetDataByRulesetId);

        // Map to final format
        const enrichedCharacters = charactersList.map((char) => {
          const classLevels = classLevelsByCharacter.get(char.id) ?? [];
          const rulesetData = rulesetDataByRulesetId.get(char.rulesetId);
          const race = rulesetData?.racesById.get(char.raceId);

          return {
            id: char.id,
            name: char.name,
            description: char.description,
            race: race?.name ?? "Unknown",
            levels: classLevels,
            totalLevel: classLevels.reduce((sum, lvl) => sum + lvl.level, 0),
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
    if (!campaign) {
      throw new NotFoundError("Campaign not found");
    }

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
          if (rows.length === 0) {
            throw new NotFoundError("Ability not found");
          }
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
      name?: string;
      age?: number;
      gender?: Gender;
      height?: string;
      weight?: string;
      deity?: string;
      xp?: number;
      alignment?: Alignment;
      description?: string;
      notes?: string;
      languageIds?: string[];
      updatedAt?: string;
    },
  ) {
    return await withTransaction(async (tx) => {
      const characterRecord = await findEditableCharacterOrBonded(tx, characterId, session.userId);
      if (!characterRecord) {
        throw new NotFoundError("Character not found");
      }

      const { languageIds, updatedAt: expectedUpdatedAt, ...characterFields } = updateData;

      const updatedRows = await Characters.update(tx, characterFields, { id: characterId, expectedUpdatedAt });
      if (expectedUpdatedAt && updatedRows.length === 0) {
        throw new ConflictError(STALE_ENTITY_MESSAGE);
      }
      const [updatedCharacter] = updatedRows;

      // Apply languages atomically when present. `undefined` = leave alone;
      // `[]` = clear all. Wrapped in withRulesetScope because language ids
      // need COW canonicalization against the character's ruleset.
      if (languageIds !== undefined) {
        await withRulesetScope(tx, characterRecord.rulesetId, async ({ rulesetData }) => {
          await this.replaceCharacterLanguages(tx, characterRecord, rulesetData, languageIds);
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

      return await withRulesetScope(tx, characterRecord.rulesetId, async ({ rulesetData }) => {
        await this.replaceCharacterLanguages(tx, characterRecord, rulesetData, languageIds);

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
