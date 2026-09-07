import { eq, sql, getTableName } from "drizzle-orm";

import { type alignment, charactersInCharacter, type gender } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, InternalError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import {
  Activities,
  Campaigns,
  CharacterAbilities,
  CharacterLanguages,
  CharacterLevels,
  Characters,
  Languages,
  Modifiers,
  Races,
} from "@/server/repositories/index.ts";
import { CharactersPolicy } from "@/server/services/policies/index.ts";
import { purgeAttachmentsForRecords, urlForSlot } from "@/server/services/AttachmentsService.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { pingWorker } from "@/server/queue.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type { CharacterKind, DetailedCharacterInterface, Holders } from "@/server/rulesets/types.ts";
import { BONDED_KINDS, type BondedKind } from "@/server/services/characters/levels/dnd3.5/bondedReconcile.ts";
import type { Character } from "@/shared/relations.ts";
import DetailedCharacterRequirements from "@/server/rulesets/universal/DetailedCharacterRequirements.ts";
import { getRulesetPolicy } from "@/server/services/rulesets/helpers.ts";
import { withRulesetScope, withRulesetScopes } from "@/server/services/rulesets/cow.ts";
import BaseService from "@/server/services/BaseService.ts";
import type { Requirement, Session } from "@/shared/relations.ts";
import type { Db } from "@/server/database/index.ts";

/**
 * Replace a character's language set in-place. Validates each id resolves
 * to a language in the character's ruleset (or its COW ancestor chain),
 * then deletes existing rows and inserts the new set. Caller is responsible
 * for the surrounding transaction + withRulesetScope.
 */
async function replaceCharacterLanguages(
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
    const validRulesetIds = new Set([
      characterRecord.rulesetId,
      ...rulesetData.cow.sourceChain,
    ]);
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

export type BondedEntry = { record: Character; detailed: DetailedCharacterInterface };

export async function loadBondedByKind(
  rulesetModule: Awaited<ReturnType<typeof RulesetFactory.fromRulesetId>>,
  masterId: string,
): Promise<Partial<Record<BondedKind, BondedEntry>>> {
  const out: Partial<Record<BondedKind, BondedEntry>> = {};
  for (const kind of BONDED_KINDS) {
    const record = await Characters.findOne(db, {
      parentCharacterId: masterId,
      kind,
    }, Visibility.All);
    if (!record) continue;
    const detailed = rulesetModule.createDetailedCharacter(record, kind);
    await detailed.build();
    out[kind] = { record, detailed };
  }
  return out;
}

async function findEditableCharacterOrBonded(
  tx: Db,
  characterId: string,
  userId: string,
) {
  const pc = await Characters.findOneEditable(tx, { id: characterId, userId });
  if (pc) return pc;
  const bonded = await Characters.findOne(tx, { id: characterId });
  if (!bonded || bonded.kind === "pc" || !bonded.parentCharacterId) return null;
  const master = await Characters.findOneEditable(tx, {
    id: bonded.parentCharacterId,
    userId,
  });
  return master ? bonded : null;
}

export const CharactersMethods = {
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

      // Races.findManyByRulesetId output has its FK fields auto-resolved by
      // the Proxy since cowContext is active. No manual resolveOverrides pass.
      const result = await Races.findManyByRulesetId(
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
  },

  async createCharacter(
    session: Session,
    characterData: {
      rulesetId: string;
      raceId: string;
      name: string;
      xp: number;
      alignment: typeof alignment.enumValues[number];
      abilities: Record<string, number>;
      age?: number;
      gender: typeof gender.enumValues[number];
      height?: string;
      weight?: string;
      deity?: string;
      description?: string;
      notes?: string;
    },
  ) {
    return await withTransaction(async (tx) => {
      return await withRulesetScope(tx, characterData.rulesetId, async ({ ruleset, rulesetData }) => {
        await (await getRulesetPolicy(tx, session, ruleset)).canCreateCharacter(tx);

        // Validate race belongs to this ruleset or any ancestor in its source chain.
        const race = rulesetData.racesById.get(characterData.raceId);
        if (!race) throw new NotFoundError("Race not found in this ruleset");
        const validRulesetIds = new Set([characterData.rulesetId, ...rulesetData.cow.sourceChain]);
        if (!validRulesetIds.has(race.rulesetId)) {
          throw new NotFoundError("Race not found in this ruleset");
        }
        if (race.kind !== "pc") {
          throw new BadRequestError("Race is not valid for a player character");
        }

        // Create the character
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
          await CharacterAbilities.createMany(tx,
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
  },

  async getCharacter(session: Session, characterId: string) {
    const record = await Characters.findOne(db, { id: characterId }, Visibility.All);
    if (!record) {
      throw new NotFoundError("Character not found");
    }

    if (record.kind !== "pc") {
      if (!record.parentCharacterId) {
        throw new NotFoundError("Character not found");
      }
      const masterRecord = await Characters.findOneEditable(db, {
        id: record.parentCharacterId,
        userId: session.userId,
      }, Visibility.All);
      if (!masterRecord) {
        throw new NotFoundError("Character not found");
      }

      const rulesetModule = await RulesetFactory.fromRulesetId(record.rulesetId);
      const detailedBonded = rulesetModule.createDetailedCharacter(record, record.kind as CharacterKind);
      await detailedBonded.build();

      return {
        character: record,
        detailedCharacter: detailedBonded,
        bondedByKind: {} as Partial<Record<BondedKind, BondedEntry>>,
      };
    }

    const characterRecord = await Characters.findOneEditable(db, {
      id: characterId,
      userId: session.userId,
    }, Visibility.All);

    if (!characterRecord) {
      throw new NotFoundError("Character not found");
    }

    const rulesetModule = await RulesetFactory.fromRulesetId(characterRecord.rulesetId);
    const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
    await detailedCharacter.build();

    const bondedByKind = await loadBondedByKind(rulesetModule, characterId);

    return {
      character: characterRecord,
      detailedCharacter,
      bondedByKind,
    };
  },

  async updateCharacter(
    session: Session,
    characterId: string,
    updateData: {
      name?: string;
      age?: number;
      gender?: typeof gender.enumValues[number];
      height?: string;
      weight?: string;
      deity?: string;
      xp?: number;
      alignment?: typeof alignment.enumValues[number];
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
          await replaceCharacterLanguages(tx, characterRecord, rulesetData, languageIds);
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
  },

  async updateAbilities(
    session: Session,
    characterId: string,
    abilities: Record<string, number>,
  ) {
    return await withTransaction(async (tx) => {
      const characterRecord = await Characters.findOneEditable(tx, {
        id: characterId,
        userId: session.userId,
      });

      if (!characterRecord) {
        throw new NotFoundError("Character not found");
      }

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
  },

  async updateLanguages(
    session: Session,
    characterId: string,
    languageIds: string[],
  ) {
    return await withTransaction(async (tx) => {
      const characterRecord = await Characters.findOneEditable(tx, {
        id: characterId,
        userId: session.userId,
      });

      if (!characterRecord) {
        throw new NotFoundError("Character not found");
      }

      return await withRulesetScope(tx, characterRecord.rulesetId, async ({ rulesetData }) => {
        await replaceCharacterLanguages(tx, characterRecord, rulesetData, languageIds);

        await Activities.create(tx, {
          userId: session.userId,
          targetId: characterId,
          targetTable: getTableName(charactersInCharacter),
          type: "updateCharacter",
        });
      });
    });
  },

  async getMyCharacters(
    session: Session,
    where: {
      visibility?: Visibility;
      search?: string;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      accessRole?: "owner" | "contributor";
    },
    pagination: { limit: number; page: number },
  ) {
    // Fetch basic character data with pagination
    const result = await Characters.findMany(
      db,
      { userId: session.userId, ...where },
      pagination,
    );

    const charactersList = result.items;
    const characterIds = charactersList.map((char) => char.id);

    const levels = characterIds.length > 0
      ? await CharacterLevels.findMany(db, { characterIds })
      : [];

    // Resolve race / klass names via each character's composed ruleset cache
    // so COW'd or renamed entities render their post-COW names (the detail
    // page already does this via rulesetData; the list used to hit Races/
    // Klasses.findMany directly and returned stale pre-COW names).
    return await withRulesetScopes(db, charactersList.map((c) => c.rulesetId), async (rulesetDataByRulesetId) => {

    // Group levels by character and class
    const levelsByCharacter = new Map<string, Map<string, number>>();
    for (const level of levels) {
      const char = charactersList.find((c) => c.id === level.characterId);
      if (!char) continue;
      const rulesetData = rulesetDataByRulesetId.get(char.rulesetId);
      if (!rulesetData) continue;
      // klassLevelsById / klassesById auto-resolve stored pre-COW ids.
      const klassLevel = rulesetData.klassLevelsById.get(level.klassLevelId);
      if (!klassLevel) continue;
      const klass = rulesetData.klassesById.get(klassLevel.klassId);
      const klassName = klass?.name || "Unknown";
      let bucket = levelsByCharacter.get(level.characterId);
      if (!bucket) {
        bucket = new Map();
        levelsByCharacter.set(level.characterId, bucket);
      }
      const currentLevel = bucket.get(klassName) || 0;
      if (klassLevel.level > currentLevel) {
        bucket.set(klassName, klassLevel.level);
      }
    }

    // Map to final format
    const enrichedCharacters = charactersList.map((char) => {
      const classLevels = Array.from(levelsByCharacter.get(char.id)?.entries() || [])
        .map(([klass, level]) => ({ klass, level }));
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
    });
  },

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

    return await Characters.findUnlinked(
      db,
      { userId: session.userId, rulesetId: campaign.rulesetId, search: where.search },
      pagination,
    );
  },

  async archiveCharacter(session: Session, characterId: string) {
    return await withTransaction(async (tx) => {
      const existingCharacter = await Characters.findOne(tx, {
        id: characterId,
        userId: session.userId,
      });

      if (!existingCharacter || existingCharacter.kind !== "pc") {
        throw new NotFoundError("Character not found");
      }

      // Archive flips deletedAt on the character row only — level/inventory/
      // language children stay live. They're unreachable once the parent is
      // hidden from the list, and keeping them live makes archive/unarchive
      // symmetric: the unarchive un-cascade below is a no-op for characters
      // archived this way, and still repairs legacy cascade-archived rows.
      const rows = await Characters.archive(tx, { id: characterId });
      const archivedCharacter = rows[0];

      if (!archivedCharacter) {
        throw new InternalError("Failed to archive character");
      }

      await Activities.create(tx, {
        userId: session.userId,
        targetId: archivedCharacter.id,
        targetTable: getTableName(charactersInCharacter),
        type: "archiveCharacter",
      });

      return archivedCharacter;
    });
  },

  async hardDeleteCharacter(session: Session, characterId: string) {
    return await withTransaction(async (tx) => {
      const existingCharacter = await Characters.findOne(
        tx,
        { id: characterId, userId: session.userId },
        Visibility.ArchivedOnly,
      );

      if (!existingCharacter || existingCharacter.kind !== "pc") {
        throw new NotFoundError("Character not found");
      }

      await new CharactersPolicy(session, existingCharacter).canHardDelete();

      // Bonded children cascade via FK on delete, but their polymorphic
      // attachments and character-scoped modifiers don't — purge them here
      // alongside the master's before the row is gone.
      const bondedChildren = await tx.query.charactersInCharacter.findMany({
        where: eq(charactersInCharacter.parentCharacterId, characterId),
        columns: { id: true },
      });
      const allIds = [characterId, ...bondedChildren.map((c) => c.id)];

      await purgeAttachmentsForRecords(tx, "Character", allIds);
      await Modifiers.deleteMany(tx, { sourceIds: allIds, sourceType: "characters" });

      await Characters.delete(tx, { id: characterId });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetTable: getTableName(charactersInCharacter),
        type: "hardDeleteCharacter",
      });

      return { id: characterId };
    });
  },

  async unarchiveCharacter(session: Session, characterId: string) {
    return await withTransaction(async (tx) => {
      const existingCharacter = await Characters.findOne(tx, {
        id: characterId,
        userId: session.userId,
      }, Visibility.ArchivedOnly);

      if (!existingCharacter || existingCharacter.kind !== "pc") {
        throw new NotFoundError("Character not found");
      }

      const rows = await Characters.unarchive(tx, { id: characterId });
      const unarchivedCharacter = rows[0];

      if (!unarchivedCharacter) {
        throw new InternalError("Failed to unarchive character");
      }

      await Activities.create(tx, {
        userId: session.userId,
        targetId: unarchivedCharacter.id,
        targetTable: getTableName(charactersInCharacter),
        type: "unarchiveCharacter",
      });

      return unarchivedCharacter;
    });
  },

  async generateShareToken(session: Session, characterId: string) {
    return await withTransaction(async (tx) => {
      const characterRecord = await Characters.findOne(tx, {
        id: characterId,
        userId: session.userId,
      });

      if (!characterRecord || characterRecord.kind !== "pc") {
        throw new NotFoundError("Character not found");
      }

      const shareToken = crypto.randomUUID();
      const [updated] = await Characters.update(tx, { shareToken }, { id: characterId });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetTable: getTableName(charactersInCharacter),
        type: "generateShareToken",
      });

      return updated;
    });
  },

  async revokeShareToken(session: Session, characterId: string) {
    return await withTransaction(async (tx) => {
      const characterRecord = await Characters.findOne(tx, {
        id: characterId,
        userId: session.userId,
      });

      if (!characterRecord || characterRecord.kind !== "pc") {
        throw new NotFoundError("Character not found");
      }

      const [updated] = await Characters.update(tx, { shareToken: null }, { id: characterId });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetTable: getTableName(charactersInCharacter),
        type: "revokeShareToken",
      });

      return updated;
    });
  },

  async getSharedCharacter(shareToken: string) {
    const characterRecord = await Characters.findOne(db, { shareToken });

    if (!characterRecord) {
      throw new NotFoundError("Character not found");
    }

    const rulesetModule = await RulesetFactory.fromRulesetId(characterRecord.rulesetId);
    const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
    await detailedCharacter.build();

    const bondedByKind = await loadBondedByKind(rulesetModule, characterRecord.id);
    const portraitUrl = await urlForSlot("Character", characterRecord.id, "portrait");

    return {
      character: characterRecord,
      detailedCharacter,
      bondedByKind,
      portraitUrl,
    };
  },

  async enqueuePdf(session: Session, characterId: string) {
    const characterRecord = await findEditableCharacterOrBonded(db, characterId, session.userId);
    if (!characterRecord) {
      throw new NotFoundError("Character not found");
    }

    await withTransaction(async (tx) => {
      await tx.execute(
        sql`SELECT graphile_worker.add_job(
          'generatePdf',
          ${JSON.stringify({
            userId: session.userId,
            characterId,
            characterName: characterRecord.name,
          })}::json,
          max_attempts := 2,
          queue_name := ${"pdf-" + session.userId}
        )`,
      );

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterRecord.id,
        targetTable: getTableName(charactersInCharacter),
        type: "generatePdf",
      });
    });

    pingWorker();
  },

  async generateSharedPdf(shareToken: string) {
    const characterRecord = await Characters.findOne(db, { shareToken });

    if (!characterRecord) {
      throw new NotFoundError("Character not found");
    }

    const rulesetModule = await RulesetFactory.fromRulesetId(characterRecord.rulesetId);
    const { detailedCharacter, CharacterSheetComponent } = await rulesetModule
      .createDetailedCharacterWithSheet(characterRecord);

    const portraitUrl = await urlForSlot("Character", characterRecord.id, "portrait");

    return {
      detailedCharacter,
      CharacterSheetComponent,
      portraitUrl,
      kind: characterRecord.kind as CharacterKind,
    };
  },

} as const;

class CharactersService extends BaseService<typeof CharactersMethods> {
  static initialize() {
    return new CharactersService(CharactersMethods);
  }
}

export default CharactersService;
