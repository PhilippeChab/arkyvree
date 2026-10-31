/** A ruleset as v1 answers it: what it is, its settings, its extensions and its changes. */

import type { z } from "zod";

import type {
  v1Ruleset,
  v1RulesetChanges,
  v1RulesetExtensions,
  v1RulesetSettings,
  v1RulesetSummary,
} from "@/server/routers/v1/schemas/rulesets.ts";
import type { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import type { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import type { RulesetsService } from "@/server/services/rulesets/index.ts";
import type { RulesetSettingsService } from "@/server/services/rulesets/settings/index.ts";

import type { Answer } from "./answers.ts";

/** A ruleset in a list, as the app's own API answers it. */
type RulesetListItem = Answer<typeof RulesetsService.getRulesets>["items"][number];

/** A ruleset, with what the key's user may do with it. */
export function toV1Ruleset(ruleset: Answer<typeof RulesetsService.getRuleset>): z.infer<typeof v1Ruleset> {
  return {
    ...toV1RulesetSummary(ruleset),
    contributorRole: ruleset.contributorRole,
    permissions: ruleset.permissions,
  };
}

/** What a fork changed of the ruleset it's forked from. */
export function toV1RulesetChanges(
  changes: Answer<typeof RulesetChangesService.getChanges>,
): z.infer<typeof v1RulesetChanges> {
  return changes.map((change) => ({
    entityId: "entityId" in change ? change.entityId : null,
    kind: change.entityType,
    name: change.name,
    sourceId: "sourceEntityId" in change ? change.sourceEntityId : null,
    status: change.status,
  }));
}

/** The extensions a ruleset is subscribed to. */
export function toV1RulesetExtensions(
  extensions: Answer<typeof RulesetExtensionsService.getExtensions>,
): z.infer<typeof v1RulesetExtensions> {
  return extensions.map((extension) => ({
    description: extension.extensionDescription,
    id: extension.extensionId,
    name: extension.extensionName,
    subscribedAt: extension.subscribedAt,
    updateAvailable: extension.updateAvailable,
  }));
}

/** A ruleset's settings: its own fields and links. */
export function toV1RulesetSettings(
  settings: Answer<typeof RulesetSettingsService.getSettings>,
): z.infer<typeof v1RulesetSettings> {
  return { fields: { ...settings.fields }, links: { ...settings.links } };
}

/** A ruleset, in a page of them or on its own. */
export function toV1RulesetSummary(
  ruleset: Answer<typeof RulesetsService.getRuleset> | RulesetListItem,
): z.infer<typeof v1RulesetSummary> {
  return {
    baseRules: ruleset.baseRules,
    createdAt: ruleset.createdAt,
    description: ruleset.description,
    id: ruleset.id,
    kind: ruleset.kind,
    name: ruleset.name,
    ownerId: ruleset.userId,
    parentId: ruleset.rulesetId,
    parentName: ruleset.rulesetName ?? null,
    private: ruleset.private,
    starCount: ruleset.starCount,
    starred: ruleset.isStarred,
    status: ruleset.status,
    system: ruleset.system,
    updatedAt: ruleset.updatedAt,
  };
}
