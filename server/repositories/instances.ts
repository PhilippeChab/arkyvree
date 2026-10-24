/** The repositories' shared instances, each wrapped in the request cache (`withRequestCache`). */

import { emailVerificationsInAccount, passwordResetsInAccount } from "@/drizzle/schema.ts";

import AccountCodesRepository from "./accounts/AccountCodesRepository.ts";
import OauthAccountsRepository from "./accounts/OauthAccountsRepository.ts";
import SessionsRepository from "./accounts/SessionsRepository.ts";
import UsersRepository from "./accounts/UsersRepository.ts";
import ActivitiesRepository from "./activities/ActivitiesRepository.ts";
import AttachmentsRepository from "./attachments/AttachmentsRepository.ts";
import BlobsRepository from "./attachments/BlobsRepository.ts";
import CampaignsRepository from "./campaigns/CampaignsRepository.ts";
import InvitesRepository from "./campaigns/InvitesRepository.ts";
import PlayerCharactersRepository from "./campaigns/PlayerCharactersRepository.ts";
import PlayersRepository from "./campaigns/PlayersRepository.ts";
import CharacterAdvancementsRepository from "./characters/CharacterAdvancementsRepository.ts";
import CharacterContributorsRepository from "./characters/CharacterContributorsRepository.ts";
import CharacterInventoryRepository from "./characters/CharacterInventoryRepository.ts";
import CharactersRepository from "./characters/CharactersRepository.ts";
import ExportsRepository from "./exports/ExportsRepository.ts";
import NotificationsRepository from "./notifications/NotificationsRepository.ts";
import ContributorsRepository from "./rulesets/ContributorsRepository.ts";
import EntityReferencesRepository from "./rulesets/EntityReferencesRepository.ts";
import EntitySnapshotsRepository from "./rulesets/EntitySnapshotsRepository.ts";
import ModifiersRepository from "./rulesets/ModifiersRepository.ts";
import RequirementsRepository from "./rulesets/RequirementsRepository.ts";
import RulesetEntitiesRepository from "./rulesets/RulesetEntitiesRepository.ts";
import RulesetExtensionsRepository from "./rulesets/RulesetExtensionsRepository.ts";
import RulesetsRepository from "./rulesets/RulesetsRepository.ts";
import StarredRulesetsRepository from "./rulesets/StarredRulesetsRepository.ts";
import StoredCharacterLinks from "./stored/StoredCharacterLinks.ts";
import StoredEntities from "./stored/StoredEntities.ts";
import StoredJoins from "./stored/StoredJoins.ts";
import StoredPicks from "./stored/StoredPicks.ts";
import StoredProperties from "./stored/StoredProperties.ts";
import { withRequestCache } from "./withRequestCache.ts";

export const Activities = withRequestCache("Activities", new ActivitiesRepository());
export const Attachments = withRequestCache("Attachments", new AttachmentsRepository());
export const Blobs = withRequestCache("Blobs", new BlobsRepository());
export const Campaigns = withRequestCache("Campaigns", new CampaignsRepository());
export const CharacterAdvancements = withRequestCache("CharacterAdvancements", new CharacterAdvancementsRepository());
export const CharacterContributors = withRequestCache("CharacterContributors", new CharacterContributorsRepository());
export const CharacterInventory = withRequestCache("CharacterInventory", new CharacterInventoryRepository());
export const CharacterLinks = withRequestCache("CharacterLinks", new StoredCharacterLinks());
export const Characters = withRequestCache("Characters", new CharactersRepository());
export const Contributors = withRequestCache("Contributors", new ContributorsRepository());
export const EmailVerifications = withRequestCache(
  "EmailVerifications",
  new AccountCodesRepository(emailVerificationsInAccount),
);
export const Entities = withRequestCache("Entities", new StoredEntities());
export const EntityReferences = withRequestCache("EntityReferences", new EntityReferencesRepository());
export const EntitySnapshots = withRequestCache("EntitySnapshots", new EntitySnapshotsRepository());
export const Exports = withRequestCache("Exports", new ExportsRepository());
export const Invites = withRequestCache("Invites", new InvitesRepository());
export const Joins = withRequestCache("Joins", new StoredJoins());
export const Modifiers = withRequestCache("Modifiers", new ModifiersRepository());
export const Notifications = withRequestCache("Notifications", new NotificationsRepository());
export const OauthAccounts = withRequestCache("OauthAccounts", new OauthAccountsRepository());
export const PasswordResets = withRequestCache("PasswordResets", new AccountCodesRepository(passwordResetsInAccount));
export const Picks = withRequestCache("Picks", new StoredPicks());
export const PlayerCharacters = withRequestCache("PlayerCharacters", new PlayerCharactersRepository());
export const Players = withRequestCache("Players", new PlayersRepository());
export const Properties = withRequestCache("Properties", new StoredProperties());
export const Requirements = withRequestCache("Requirements", new RequirementsRepository());
export const RulesetEntities = withRequestCache("RulesetEntities", new RulesetEntitiesRepository());
export const RulesetExtensions = withRequestCache("RulesetExtensions", new RulesetExtensionsRepository());
export const Rulesets = withRequestCache("Rulesets", new RulesetsRepository());
export const Sessions = withRequestCache("Sessions", new SessionsRepository());
export const StarredRulesets = withRequestCache("StarredRulesets", new StarredRulesetsRepository());
export const Users = withRequestCache("Users", new UsersRepository());
