import { toV1Activity } from "./activities.ts";
import { toV1Attachment } from "./attachments.ts";
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
  toV1Character,
  toV1Characters,
  toV1Creation,
  toV1CreationOption,
  toV1ImportedCharacter,
  toV1Inventory,
  toV1LinkRoom,
  toV1Modifiers,
} from "./characters.ts";
import { toV1Contributor, toV1Contributors } from "./contributors.ts";
import {
  toV1Entity,
  toV1EntityGroup,
  toV1EntityLinks,
  toV1EntitySummary,
  toV1EntityTable,
  toV1LabeledModifiers,
  toV1LabeledRequirements,
  toV1OwnedEntity,
  toV1PathCompletions,
  toV1Progression,
  toV1StoredEntity,
} from "./entities.ts";
import { toV1Export } from "./exports.ts";
import {
  toV1InviteStatus,
  toV1ReceivedCampaignInvite,
  toV1ReceivedCharacterInvite,
  toV1ReceivedRulesetInvite,
} from "./invites.ts";
import { toV1LevelPlan, toV1LevelPlanAnswer, toV1LevelSteps, toV1StepOptions } from "./levels.ts";
import { toV1Notification } from "./notifications.ts";
import { toV1Page } from "./pages.ts";
import { toV1Rules } from "./rules.ts";
import {
  toV1Ruleset,
  toV1RulesetChanges,
  toV1RulesetExtensions,
  toV1RulesetSettings,
  toV1RulesetSummary,
} from "./rulesets.ts";
import { toV1ShareLink } from "./sharing.ts";

/**
 * Version 1's translators: from what a service answers to v1's shape. Each is typed by the service it reads and by
 * v1's schema of its answer (`schemas/`), so an answer that changes inside the app stops its translator compiling
 * until v1's shape is kept. A new version copies the last, replacing only what changed (`const V2 = { ...V1, … }`),
 * and v1 keeps working untouched.
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
  characters: toV1Characters,
  contributor: toV1Contributor,
  contributors: toV1Contributors,
  creation: toV1Creation,
  creationOption: toV1CreationOption,
  entity: toV1Entity,
  entityGroup: toV1EntityGroup,
  entityLinks: toV1EntityLinks,
  entitySummary: toV1EntitySummary,
  entityTable: toV1EntityTable,
  export: toV1Export,
  importedCharacter: toV1ImportedCharacter,
  inventory: toV1Inventory,
  inviteStatus: toV1InviteStatus,
  labeledModifiers: toV1LabeledModifiers,
  labeledRequirements: toV1LabeledRequirements,
  levelPlan: toV1LevelPlan,
  levelPlanAnswer: toV1LevelPlanAnswer,
  levelSteps: toV1LevelSteps,
  linkableCharacter: toV1LinkableCharacter,
  linkRoom: toV1LinkRoom,
  modifiers: toV1Modifiers,
  notification: toV1Notification,
  ownedEntity: toV1OwnedEntity,
  page: toV1Page,
  pathCompletions: toV1PathCompletions,
  playerSlot: toV1PlayerSlot,
  progression: toV1Progression,
  receivedCampaignInvite: toV1ReceivedCampaignInvite,
  receivedCharacterInvite: toV1ReceivedCharacterInvite,
  receivedRulesetInvite: toV1ReceivedRulesetInvite,
  rules: toV1Rules,
  ruleset: toV1Ruleset,
  rulesetChanges: toV1RulesetChanges,
  rulesetExtensions: toV1RulesetExtensions,
  rulesetSettings: toV1RulesetSettings,
  rulesetSummary: toV1RulesetSummary,
  shareLink: toV1ShareLink,
  stepOptions: toV1StepOptions,
  storedEntity: toV1StoredEntity,
};
