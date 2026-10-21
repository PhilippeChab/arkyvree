import { toV1Activity, toV1TargetPage } from "./activities.ts";
import { toV1Attachment, toV1DirectUpload } from "./attachments.ts";
import {
  toV1Campaign,
  toV1CampaignCharacter,
  toV1CampaignCharacterLink,
  toV1CampaignCharacterSummary,
  toV1CampaignInvite,
  toV1CampaignPlayer,
  toV1CampaignSummary,
  toV1LinkableCharacter,
  toV1PlayerSlot,
} from "./campaigns.ts";
import {
  toV1CharacterCreation,
  toV1CharacterLanguages,
  toV1ImportedCharacter,
  toV1ImportSource,
  toV1InventoryEntry,
  toV1Placement,
  toV1RaceOption,
  toV1SavedLevel,
} from "./characterParts.ts";
import {
  toInventoryEditRequest,
  toInventoryRequest,
  toLevelEditRequest,
  toLevelSaveRequest,
} from "./characterRequests.ts";
import { toV1Character, toV1Characters } from "./characters.ts";
import {
  toV1Class,
  toV1ClassFeatPools,
  toV1ClassLevel,
  toV1ClassProgression,
  toV1ClassSkills,
  toV1ClassSpellCounts,
  toV1Entity,
  toV1Feat,
  toV1Item,
  toV1Language,
  toV1Modifier,
  toV1Names,
  toV1Race,
  toV1Requirement,
  toV1Save,
  toV1Skill,
  toV1Spell,
  toV1TargetPath,
  toV1TargetPathCheck,
} from "./content.ts";
import {
  toClassRequest,
  toItemRequest,
  toRaceRequest,
  toRequirementRequest,
  toSkillRequest,
} from "./contentRequests.ts";
import { toV1Contributor, toV1Contributors } from "./contributors.ts";
import { toV1Stats } from "./dashboard.ts";
import { toV1Export } from "./exports.ts";
import {
  toV1InviteStatus,
  toV1ReceivedCampaignInvite,
  toV1ReceivedCampaignInvites,
  toV1ReceivedCharacterInvite,
  toV1ReceivedRulesetInvite,
} from "./invites.ts";
import { toLevelChoicesQuery, toV1LevelChoices } from "./levelChoices.ts";
import { toV1Notification, toV1UnreadNotifications } from "./notifications.ts";
import { toV1Page } from "./pages.ts";
import {
  toV1FieldDeclarations,
  toV1Ruleset,
  toV1RulesetChanges,
  toV1RulesetExtensions,
  toV1RulesetSettings,
} from "./rulesets.ts";
import { toV1ShareLink } from "./sharing.ts";
import { toV1Found, toV1Written } from "./written.ts";

/**
 * Version 1's translators, one per kind: from what a service answers to v1's shape, and from a v1 request to what a
 * service takes (`levelChoicesQuery`, `raceRequest`). Each is typed by the service it reads and by v1's schema of its
 * answer (`schemas/`), so an answer that changes inside the app stops its translator compiling until v1's shape is
 * kept. A page's items are each translated by their kind's (`V1.page(feats, V1.feat)`). A new version copies the last,
 * replacing only what changed (`const V2 = { ...V1, character: … }`), and v1 keeps working untouched.
 */
export const V1 = {
  activity: toV1Activity,
  attachment: toV1Attachment,
  campaign: toV1Campaign,
  campaignCharacter: toV1CampaignCharacter,
  campaignCharacterLink: toV1CampaignCharacterLink,
  campaignCharacterSummary: toV1CampaignCharacterSummary,
  campaignInvite: toV1CampaignInvite,
  campaignPlayer: toV1CampaignPlayer,
  campaignSummary: toV1CampaignSummary,
  character: toV1Character,
  characterCreation: toV1CharacterCreation,
  characterLanguages: toV1CharacterLanguages,
  characters: toV1Characters,
  class: toV1Class,
  classFeatPools: toV1ClassFeatPools,
  classLevel: toV1ClassLevel,
  classProgression: toV1ClassProgression,
  classRequest: toClassRequest,
  classSkills: toV1ClassSkills,
  classSpellCounts: toV1ClassSpellCounts,
  contributor: toV1Contributor,
  contributors: toV1Contributors,
  directUpload: toV1DirectUpload,
  entity: toV1Entity,
  export: toV1Export,
  feat: toV1Feat,
  fieldDeclarations: toV1FieldDeclarations,
  found: toV1Found,
  importedCharacter: toV1ImportedCharacter,
  importSource: toV1ImportSource,
  inventoryEditRequest: toInventoryEditRequest,
  inventoryEntry: toV1InventoryEntry,
  inventoryRequest: toInventoryRequest,
  inviteStatus: toV1InviteStatus,
  item: toV1Item,
  itemRequest: toItemRequest,
  language: toV1Language,
  levelChoices: toV1LevelChoices,
  levelChoicesQuery: toLevelChoicesQuery,
  levelEditRequest: toLevelEditRequest,
  levelSaveRequest: toLevelSaveRequest,
  linkableCharacter: toV1LinkableCharacter,
  modifier: toV1Modifier,
  names: toV1Names,
  notification: toV1Notification,
  page: toV1Page,
  placement: toV1Placement,
  playerSlot: toV1PlayerSlot,
  race: toV1Race,
  raceOption: toV1RaceOption,
  raceRequest: toRaceRequest,
  receivedCampaignInvite: toV1ReceivedCampaignInvite,
  receivedCampaignInvites: toV1ReceivedCampaignInvites,
  receivedCharacterInvite: toV1ReceivedCharacterInvite,
  receivedRulesetInvite: toV1ReceivedRulesetInvite,
  requirement: toV1Requirement,
  requirementRequest: toRequirementRequest,
  ruleset: toV1Ruleset,
  rulesetChanges: toV1RulesetChanges,
  rulesetExtensions: toV1RulesetExtensions,
  rulesetSettings: toV1RulesetSettings,
  save: toV1Save,
  savedLevel: toV1SavedLevel,
  shareLink: toV1ShareLink,
  skill: toV1Skill,
  skillRequest: toSkillRequest,
  spell: toV1Spell,
  stats: toV1Stats,
  targetPage: toV1TargetPage,
  targetPath: toV1TargetPath,
  targetPathCheck: toV1TargetPathCheck,
  unreadNotifications: toV1UnreadNotifications,
  written: toV1Written,
};
