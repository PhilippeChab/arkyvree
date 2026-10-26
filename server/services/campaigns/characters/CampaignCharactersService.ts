import { getTableName } from "drizzle-orm";

import { playerCharactersInCampaign } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { withRulesetScope, withRulesetScopes } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import {
  Activities,
  Campaigns,
  CharacterAdvancements,
  CharacterContributors,
  Characters,
  PLAYER_KINDS,
  PlayerCharacters,
  Players,
  Visibility,
} from "@/server/repositories/index.ts";
import {
  describeCharacterCards,
  enqueueCharacterPdf,
  findExportableCharacter,
  readCharacterInput,
  readChildInputs,
} from "@/server/services/characters/index.ts";
import { CampaignsPolicy } from "@/server/services/policies/index.ts";
import type { CharacterVisibility } from "@/shared/campaigns.ts";
import type { Session } from "@/shared/relations.ts";

class CampaignCharactersService {
  /**
   * Whether a character linked with `visibility` shows the viewer its name and physical traits only: Partial hides the
   * rest from incidental viewers. The link's player, the Game Master and anyone with edit rights (the character's owner
   * or an active contributor) see it whole: they're not incidental viewers.
   */
  private isPartial(visibility: string, viewer: { canEdit: boolean; isGM: boolean; isOwner: boolean }) {
    return visibility === "Partial" && !viewer.isOwner && !viewer.isGM && !viewer.canEdit;
  }

  /** The session's player row in the campaign: a 404 when there's no such campaign, a 403 when they aren't in it. */
  private async getMember(session: Session, campaignId: string) {
    const campaign = await Campaigns.findOne(db, { id: campaignId }, Visibility.All);
    if (!campaign) throw new NotFoundError("Campaign not found");

    return (await CampaignsPolicy.for(db, session, campaign)).canRead();
  }

  async enqueuePdf(session: Session, campaignId: string, characterId: string) {
    // Not found for every refusal, as for the character's own export.
    const character = await findExportableCharacter(session.userId, characterId, campaignId);
    if (!character) throw new NotFoundError("Character not found in this campaign");

    await enqueueCharacterPdf(session, character, campaignId);
  }

  async getCharacter(session: Session, campaignId: string, characterId: string) {
    const member = await this.getMember(session, campaignId);

    const link = await PlayerCharacters.findOne(db, { characterId, campaignId });
    if (!link) throw new NotFoundError("Character not found in this campaign");

    const isOwner = link.playerId === member.id;
    const isGM = member.role === "Game Master";

    // Private characters are only visible to the owner and GMs
    if (!isOwner && !isGM && link.visibility === "Private")
      throw new NotFoundError("Character not found in this campaign");

    // Full character build for all visible cases (Public, Partial, owner, GM)
    const character = await Characters.findOne(db, { id: characterId });
    if (!character) throw new NotFoundError("Character not found");

    const isCharacterOwner = character.userId === session.userId;
    const contributorRole = isCharacterOwner
      ? undefined
      : await CharacterContributors.findRole(db, { userId: session.userId, characterId });
    const canEdit = isCharacterOwner || contributorRole !== undefined;

    const isPartial = this.isPartial(link.visibility, { canEdit, isGM, isOwner });

    const viewer = {
      visibility: link.visibility as CharacterVisibility,
      isOwner,
      canEdit,
      canDownloadPdf: canEdit || isGM,
      isPartial,
    };
    // Its editors and the Game Master read its private notes, which the others' sheet holds none of
    const readsPrivateNotes = canEdit || isGM;
    return await withRulesetScope(db, character.rulesetId, async (scope) => {
      const input = await readCharacterInput(db, character);
      // A partial reading shows none of the character's children (3.5's bonded creatures)
      const children = isPartial ? [] : await readChildInputs(db, input, Visibility.All);
      const reading = isPartial ? "partial" : readsPrivateNotes ? "show" : "hide";
      const described = Engine.for(scope).character(input).describeForMember(children, reading);
      return { ...viewer, ...described, shareToken: canEdit ? described.shareToken : null };
    });
  }

  async getCharacters(
    session: Session,
    campaignId: string,
    where: { orderBy?: "createdAt" | "updatedAt"; orderDir?: "asc" | "desc"; search?: string },
    pagination: { limit: number; page: number },
  ) {
    const member = await this.getMember(session, campaignId);

    const isGM = member.role === "Game Master";

    // Get all players in this campaign (include archived for archived campaigns)
    const campaignPlayers = await Players.findMany(db, { campaignId }, Visibility.All);
    const playerIds = campaignPlayers.map((p) => p.id);

    if (playerIds.length === 0) return { items: [], page: 1, nextPage: undefined };

    // Get linked characters with pagination; GMs see all characters regardless of visibility
    const paginatedResult = await PlayerCharacters.findPage(
      db,
      { playerIds, search: where.search, visibilityPlayerId: isGM ? undefined : member.id },
      pagination,
    );
    const linkedCharacters = paginatedResult.items;
    const paginationMeta = { page: paginatedResult.page, nextPage: paginatedResult.nextPage };

    if (linkedCharacters.length === 0) return { items: [], page: paginationMeta.page, nextPage: undefined };

    const characterMeta = new Map(
      linkedCharacters.map((linked) => [
        linked.characterId,
        { playerId: linked.playerId, visibility: linked.visibility },
      ]),
    );
    const characterIds = linkedCharacters.map((linked) => linked.characterId);

    // Get character details using direct query with character IDs
    const characters = await Characters.findMany(db, { ids: characterIds });

    if (characters.length === 0) return { items: [], page: paginationMeta.page, nextPage: paginationMeta.nextPage };

    // Batch fetch advancements for all characters, and the ones the session contributes to: it edits them
    const advancements = await CharacterAdvancements.findMany(db, { characterIds });
    const contributions = await CharacterContributors.findMany(db, {
      characterIds,
      status: "Active",
      userId: session.userId,
    });
    const contributedIds = new Set(contributions.map((contribution) => contribution.characterId));

    // A Partial character shows the other players its name and race, and none of its build
    const partialIds = new Set(
      characters
        .filter((char) => {
          const meta = characterMeta.get(char.id);
          const canEdit = char.userId === session.userId || contributedIds.has(char.id);
          const isOwner = meta?.playerId === member.id;
          return this.isPartial(meta?.visibility ?? "Private", { canEdit, isGM, isOwner });
        })
        .map((char) => char.id),
    );

    // Resolve race / class names via each character's composed ruleset cache
    // so COW'd or renamed entities render their post-COW names.
    return await withRulesetScopes(
      db,
      characters.map((c) => c.rulesetId),
      async (views) => {
        const cards = describeCharacterCards(views, characters, advancements, partialIds);

        // Maintain order from linkedCharacters (which is already sorted by createdAt desc)
        const characterMap = new Map(characters.map((c) => [c.id, c]));
        const orderedCharacters = characterIds
          .map((id) => characterMap.get(id))
          .filter((char): char is NonNullable<typeof char> => char !== undefined);

        // Map to final format, a Partial character's card its partial reading's
        const enrichedCharacters = orderedCharacters.map((char) => {
          const meta = characterMeta.get(char.id);
          const isOwn = meta?.playerId === member.id;
          const isPartial = partialIds.has(char.id);

          const card = cards.get(char.id)!;

          return {
            id: char.id,
            name: char.name,
            description: isPartial ? null : char.description,
            chips: card.chips,
            visibility: meta?.visibility ?? "Private",
            isOwn,
            isPartial,
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

  async linkCharacter(session: Session, campaignId: string, characterId: string, visibility: CharacterVisibility) {
    return await withTransaction(async (tx) => {
      const campaign = await Campaigns.findOne(tx, { id: campaignId }, Visibility.All);
      if (!campaign) throw new NotFoundError("Campaign not found");

      (await CampaignsPolicy.for(tx, session, campaign)).canModify();

      const player = await Players.findOne(tx, {
        campaignId,
        userId: session.userId,
      });
      if (!player) throw new NotFoundError("Player not found in this campaign");

      const character = await Characters.findOne(tx, { id: characterId, userId: session.userId });
      if (!character) throw new NotFoundError("Character not found");

      if (!PLAYER_KINDS.includes(character.kind))
        throw new BadRequestError("Only player characters can be linked to a campaign");

      // The campaign's exact ruleset: not a fork of it, nor its parent.
      if (character.rulesetId !== campaign.rulesetId)
        throw new BadRequestError("Only characters built on the campaign's ruleset can be linked");

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

  async updateCharacterVisibility(
    session: Session,
    campaignId: string,
    characterId: string,
    visibility: CharacterVisibility,
  ) {
    return await withTransaction(async (tx) => {
      const campaign = await Campaigns.findOne(tx, { id: campaignId }, Visibility.All);
      if (!campaign) throw new NotFoundError("Campaign not found");

      const policy = await CampaignsPolicy.for(tx, session, campaign);
      policy.canModify();

      const player = policy.canRead();

      const link = await PlayerCharacters.findOne(tx, { characterId });
      if (!link || link.playerId !== player.id)
        throw new ForbiddenError("You do not own this character in this campaign");

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
}

export default new CampaignCharactersService();
