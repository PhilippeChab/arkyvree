import { getTableName } from "drizzle-orm";

import { playerCharactersInCampaign } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import {
  Activities,
  Campaigns,
  CharacterContributors,
  CharacterLevels,
  Characters,
  PlayerCharacters,
  Players,
} from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import {
  enqueueCharacterPdf,
  findExportableCharacter,
  getClassLevelsByCharacter,
  loadBondedByKind,
} from "@/server/services/characters/index.ts";
import { CampaignsPolicy } from "@/server/services/policies/index.ts";
import { withRulesetScopes } from "@/server/services/rulesets/cow/index.ts";
import type { Session } from "@/shared/relations.ts";

type VisibilityType = "Private" | "Public" | "Partial";

class CampaignCharactersService {
  async getCharacter(session: Session, campaignId: string, characterId: string) {
    // Verify the requesting user is a campaign member
    const member = await CampaignsPolicy.canRead(db, session, campaignId);

    const link = await PlayerCharacters.findOne(db, { characterId, campaignId });
    if (!link) throw new NotFoundError("Character not found in this campaign");

    const isOwner = link.playerId === member.id;
    const isGM = member.role === "Game Master";

    // Private characters are only visible to the owner and GMs
    if (!isOwner && !isGM && link.visibility === "Private") {
      throw new NotFoundError("Character not found in this campaign");
    }

    // Full character build for all visible cases (Public, Partial, owner, GM)
    const character = await Characters.findOne(db, { id: characterId });
    if (!character) throw new NotFoundError("Character not found");

    const isCharacterOwner = character.userId === session.userId;
    const contributorRole = isCharacterOwner
      ? null
      : await CharacterContributors.findRole(db, { userId: session.userId, characterId });
    const canEdit = isCharacterOwner || contributorRole !== null;

    // Partial visibility hides build details from incidental viewers. The
    // link-slot owner, GM, and anyone with edit rights (character owner or
    // active character contributor) always see the full sheet — they're not
    // incidental viewers.
    const isPartial = link.visibility === "Partial" && !isOwner && !isGM && !canEdit;

    const rulesetModule = await RulesetFactory.fromRulesetId(character.rulesetId);
    const detailedCharacter = rulesetModule.createDetailedCharacter(character);
    await detailedCharacter.build();

    const bondedByKind = isPartial ? {} : await loadBondedByKind(rulesetModule, character.id);

    return {
      visibility: link.visibility as VisibilityType,
      isOwner,
      canEdit,
      canDownloadPdf: canEdit || isGM,
      isPartial,
      canViewPrivateNotes: isGM || canEdit,
      character,
      detailedCharacter,
      bondedByKind,
    };
  }

  async getCharacters(
    session: Session,
    campaignId: string,
    where: { search?: string; orderBy?: "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    const member = await CampaignsPolicy.canRead(db, session, campaignId);

    const isGM = member.role === "Game Master";

    // Get all players in this campaign (include archived for archived campaigns)
    const campaignPlayers = await Players.findMany(db, { campaignId }, Visibility.All);
    const playerIds = campaignPlayers.map((p) => p.id);

    if (playerIds.length === 0) {
      return { items: [], page: 1, nextPage: undefined };
    }

    // Get linked characters with pagination; GMs see all characters regardless of visibility
    const paginatedResult = await PlayerCharacters.findPage(
      db,
      { playerIds, search: where.search, visibilityPlayerId: isGM ? undefined : member.id },
      pagination,
    );
    const linkedCharacters = paginatedResult.items;
    const paginationMeta = { page: paginatedResult.page, nextPage: paginatedResult.nextPage };

    if (linkedCharacters.length === 0) {
      return { items: [], page: paginationMeta.page, nextPage: undefined };
    }

    const characterMeta = new Map(
      linkedCharacters.map((pc) => [pc.characterId, { playerId: pc.playerId, visibility: pc.visibility }]),
    );
    const characterIds = linkedCharacters.map((pc) => pc.characterId);

    // Get character details using direct query with character IDs
    const characters = await Characters.findMany(db, { ids: characterIds });

    if (characters.length === 0) {
      return { items: [], page: paginationMeta.page, nextPage: paginationMeta.nextPage };
    }

    // Batch fetch levels for all characters
    const levels = await CharacterLevels.findMany(db, { characterIds });

    // Resolve race / klass names via each character's composed ruleset cache
    // so COW'd or renamed entities render their post-COW names.
    return await withRulesetScopes(
      db,
      characters.map((c) => c.rulesetId),
      async (rulesetDataByRulesetId) => {
        const classLevelsByCharacter = getClassLevelsByCharacter(characters, levels, rulesetDataByRulesetId);

        // Maintain order from linkedCharacters (which is already sorted by createdAt desc)
        const characterMap = new Map(characters.map((c) => [c.id, c]));
        const orderedCharacters = characterIds
          .map((id) => characterMap.get(id))
          .filter((char): char is NonNullable<typeof char> => char !== undefined);

        // Map to final format, limiting data for Partial visibility characters
        const enrichedCharacters = orderedCharacters.map((char) => {
          const meta = characterMeta.get(char.id);
          const isOwn = meta?.playerId === member.id;
          const isPartial = !isGM && !isOwn && meta?.visibility === "Partial";

          const classLevels = classLevelsByCharacter.get(char.id) ?? [];
          const totalLevel = classLevels.reduce((sum, lvl) => sum + lvl.level, 0);
          const rulesetData = rulesetDataByRulesetId.get(char.rulesetId);
          const race = rulesetData?.racesById.get(char.raceId);

          return {
            id: char.id,
            name: char.name,
            description: isPartial ? null : char.description,
            race: race?.name ?? "Unknown",
            levels: isPartial ? [] : classLevels,
            totalLevel,
            visibility: meta?.visibility ?? "Private",
            isOwn,
          };
        });

        return {
          items: enrichedCharacters,
          page: paginationMeta.page,
          nextPage: paginationMeta.nextPage,
        };
      },
    );
  }

  async updateCharacterVisibility(
    session: Session,
    campaignId: string,
    characterId: string,
    visibility: VisibilityType,
  ) {
    return await withTransaction(async (tx) => {
      const campaign = await Campaigns.findOne(tx, { id: campaignId }, Visibility.All);
      if (!campaign) {
        throw new NotFoundError("Campaign not found");
      }
      new CampaignsPolicy(session, campaign).canModify();

      const player = await CampaignsPolicy.canRead(tx, session, campaignId);

      const link = await PlayerCharacters.findOne(tx, { characterId });
      if (!link || link.playerId !== player.id) {
        throw new ForbiddenError("You do not own this character in this campaign");
      }

      const [updated] = await PlayerCharacters.update(tx, { visibility }, { playerId: player.id, characterId });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetTable: getTableName(playerCharactersInCampaign),
        type: "updateCharacterVisibility",
        data: { campaignId, characterId, visibility },
      });

      return updated;
    });
  }

  async enqueuePdf(session: Session, campaignId: string, characterId: string) {
    // Not found for every refusal, as for the character's own export.
    const character = await findExportableCharacter(session.userId, characterId, campaignId);
    if (!character) throw new NotFoundError("Character not found in this campaign");

    await enqueueCharacterPdf(session, character, campaignId);
  }

  async linkCharacter(session: Session, campaignId: string, characterId: string, visibility: VisibilityType) {
    return await withTransaction(async (tx) => {
      const campaign = await Campaigns.findOne(tx, { id: campaignId }, Visibility.All);
      if (!campaign) {
        throw new NotFoundError("Campaign not found");
      }
      new CampaignsPolicy(session, campaign).canModify();

      const player = await Players.findOne(tx, {
        campaignId,
        userId: session.userId,
      });
      if (!player) {
        throw new NotFoundError("Player not found in this campaign");
      }

      const character = await Characters.findOne(tx, { id: characterId, userId: session.userId });
      if (!character) {
        throw new NotFoundError("Character not found");
      }
      if (character.kind !== "pc") {
        throw new BadRequestError("Only player characters can be linked to a campaign");
      }
      // The campaign's exact ruleset: not a fork of it, nor its parent.
      if (character.rulesetId !== campaign.rulesetId) {
        throw new BadRequestError("Only characters built on the campaign's ruleset can be linked");
      }

      const existingLink = await PlayerCharacters.findOne(tx, { characterId });

      if (existingLink) {
        throw new ConflictError(
          existingLink.playerId === player.id
            ? "Character already linked to this campaign"
            : "Character is already linked to a campaign",
        );
      }

      const [linkedCharacter] = await PlayerCharacters.create(tx, {
        playerId: player.id,
        characterId,
        visibility,
      });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetTable: getTableName(playerCharactersInCampaign),
        type: "linkCharacter",
        data: { campaignId, characterId, visibility },
      });

      return linkedCharacter;
    });
  }
}

export default new CampaignCharactersService();
