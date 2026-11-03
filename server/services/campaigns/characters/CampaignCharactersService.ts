import { Engine } from "@/engine/index.ts";
import { withRulesetScope, withRulesetScopes } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import {
  Activities,
  CharacterAdvancements,
  Characters,
  paginateItems,
  type Pagination,
  PlayerCharacters,
  Players,
  Visibility,
} from "@/server/repositories/index.ts";
import { getReadableCampaign } from "@/server/services/campaigns/readableCampaign.ts";
import {
  describeCharacterCards,
  describeCharacterPermissions,
  enqueueCharacterPdf,
  findExportableCharacter,
  readCharacterInput,
  readChildInputs,
  toNotesReading,
} from "@/server/services/characters/index.ts";
import { CharactersPolicy, isAllowed } from "@/server/services/policies/index.ts";
import { lockNamedCharacter, withCampaignWrite } from "@/server/services/writes/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { CharacterVisibility } from "@/shared/campaigns.ts";
import type { Session } from "@/shared/relations.ts";

class CampaignCharactersService {
  async enqueuePdf(session: Session, campaignId: string, characterId: string) {
    // Not found for every refusal, as for the character's own export.
    const exportable = await findExportableCharacter(session, characterId, campaignId);
    if (!exportable) throw new NotFoundError("Character not found in this campaign");

    return await enqueueCharacterPdf(session, exportable.character, campaignId);
  }

  async getCharacter(session: Session, campaignId: string, characterId: string) {
    const { policy } = await getReadableCampaign(db, session, campaignId);

    const link = await PlayerCharacters.findOne(db, { characterId, campaignId });
    if (!link) throw new NotFoundError("Character not found in this campaign");
    policy.canSeeCharacter(link);

    const isOwner = policy.isLinkOwner(link);

    // Full character build for all visible cases (Public, Partial, owner, GM)
    const character = await Characters.findOne(db, { id: characterId });
    if (!character) throw new NotFoundError("Character not found");

    const characterPolicy = await CharactersPolicy.for(db, session, character);
    const isPartial = policy.isPartialReader(link, characterPolicy);

    const viewer = {
      visibility: link.visibility,
      isOwner,
      isPartial,
      // What the session may do with it, as on its own sheet, but its export: the campaign's, its Game Master's too
      permissions: {
        ...describeCharacterPermissions(characterPolicy),
        canExport: isAllowed(() => policy.canExportCharacter(characterPolicy)),
      },
    };
    // Who reads its private notes is the policy's: the others' sheet holds none of them
    const readsPrivateNotes = policy.isPrivateNotesReader(characterPolicy);
    return await withRulesetScope(db, character.rulesetId, async (scope) => {
      const input = await readCharacterInput(db, character);
      // A partial reading shows none of the character's children (3.5's bonded creatures)
      const children = isPartial ? [] : await readChildInputs(db, input, Visibility.All);
      const reading = isPartial ? "partial" : toNotesReading(readsPrivateNotes);
      const described = Engine.for(scope).character(input).describeForMember(children, reading);
      // Its share token is its editors' alone: the engine answers none
      return { ...viewer, ...described, shareToken: characterPolicy.isEditor() ? character.shareToken : null };
    });
  }

  async getCharacters(
    session: Session,
    campaignId: string,
    where: { orderBy?: "createdAt" | "updatedAt"; orderDir?: "asc" | "desc"; search?: string },
    pagination: Pagination,
  ) {
    const { policy } = await getReadableCampaign(db, session, campaignId);

    // Get all players in this campaign
    const campaignPlayers = await Players.findMany(db, { campaignId });
    const playerIds = campaignPlayers.map((p) => p.id);

    if (playerIds.length === 0) return { items: [], page: 1, nextPage: undefined };

    // Its linked characters the session sees, a page at a time
    const paginatedResult = await PlayerCharacters.findPage(
      db,
      { playerIds, search: where.search, ...policy.canSeeCharacters() },
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

    // Batch fetch advancements for all characters, and the session's policies on them, read for the page at once
    const advancements = await CharacterAdvancements.findMany(db, { characterIds });
    const policies = await CharactersPolicy.forMany(db, session, characters);

    // A Partial character shows the other players its name and race, and none of its build
    const partialIds = new Set(
      characters
        .filter((char) => {
          const meta = characterMeta.get(char.id);
          const characterPolicy = policies.get(char.id);
          return !!meta && !!characterPolicy && policy.isPartialReader(meta, characterPolicy);
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

        // Each card as the engine describes it (a Partial character's its partial reading's), with its link's facts
        const enrichedCharacters = orderedCharacters.map((char) => {
          // Every character on the page is one of its links'
          const meta = characterMeta.get(char.id)!;
          return {
            ...cards.get(char.id)!,
            visibility: meta.visibility,
            isOwn: policy.isLinkOwner(meta),
            // Its visibility's change, as its policy decides it: its own seat's link, in a campaign that isn't archived
            canSetVisibility: isAllowed(() => policy.canSetCharacterVisibility(meta)),
            isPartial: partialIds.has(char.id),
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

  /**
   * The session's characters it could link to the campaign, a page at a time: of its own player characters, archived or
   * not, those `linkCharacter` takes, as each one's policy decides it from the session's seat (`isLinkable`). They're
   * read whole with their links and policies, in as many queries whatever their number, then paged, so a page holds as
   * many as it's asked for.
   */
  async getLinkableCharacters(
    session: Session,
    campaignId: string,
    where: { search?: string },
    pagination: Pagination,
  ) {
    const { campaign, policy } = await getReadableCampaign(db, session, campaignId);
    const seat = policy.canLinkCharacter();

    const owned = await Characters.findMany(db, { search: where.search, userId: session.userId }, Visibility.All);
    const links = await PlayerCharacters.findMany(db, { characterIds: owned.map(({ id }) => id) });
    const linkOf = new Map(links.map((link) => [link.characterId, link]));
    const policies = await CharactersPolicy.forMany(db, session, owned);
    const linkable = owned.filter(({ id }) => policies.get(id)?.isLinkable(campaign, { link: linkOf.get(id), seat }));
    return paginateItems(linkable, pagination);
  }

  async linkCharacter(session: Session, campaignId: string, characterId: string, visibility: CharacterVisibility) {
    return await withCampaignWrite(session, campaignId, async (tx, { policy }) => {
      // The character's row locked after its campaign's, as campaigns lock before characters, so its writes (its
      // delete, which asks whether it's in a campaign) and its link to another campaign wait for this one, and a second
      // link sees the first
      await lockNamedCharacter(tx, characterId);
      // Archived or not: its policy refuses an archived one, another record the campaign can't take
      const character = await Characters.findOne(tx, { id: characterId }, Visibility.All);
      if (!character) throw new NotFoundError("Character not found");

      // Its link, if it has one, which its policy refuses from the seat, before the campaign's state
      const link = await PlayerCharacters.findOne(tx, { characterId });
      const player = policy.canLinkCharacter(await CharactersPolicy.for(tx, session, character), link);

      const [linkedCharacter] = await PlayerCharacters.create(tx, {
        playerId: player.id,
        characterId,
        visibility,
      });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetType: TARGET_TYPES.playerCharacters,
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
    return await withCampaignWrite(session, campaignId, async (tx, { policy }) => {
      const link = await PlayerCharacters.findOne(tx, { campaignId, characterId });
      const player = policy.canSetCharacterVisibility(link);

      const [updated] = await PlayerCharacters.update(tx, { visibility }, { playerId: player.id, characterId });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetType: TARGET_TYPES.playerCharacters,
        type: "updateCharacterVisibility",
        data: { campaignId, characterId, visibility },
      });

      return updated;
    });
  }
}

export default new CampaignCharactersService();
