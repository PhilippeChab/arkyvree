/** A ruleset as v1 answers it: what it is, its settings, the fields it declares, its extensions and its changes. */

import type { z } from "zod";

import { toV1Kind } from "@/server/routers/v1/kinds.ts";
import type {
  v1Ruleset,
  v1RulesetChanges,
  v1RulesetExtensions,
  v1RulesetSettings,
} from "@/server/routers/v1/schemas/rulesets.ts";
import type { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import type { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import type { RulesetFieldsService } from "@/server/services/rulesets/fields/index.ts";
import type { RulesetsService } from "@/server/services/rulesets/index.ts";
import type { RulesetSettingsService } from "@/server/services/rulesets/settings/index.ts";

import type { Answer } from "./answers.ts";

/** A field a ruleset declares, as the engine describes it. */
type FieldDeclaration = Answer<typeof RulesetFieldsService.getFields>[keyof Answer<
  typeof RulesetFieldsService.getFields
>][number];

/** A ruleset in a list, as the app's own API answers it. */
type RulesetListItem = Answer<typeof RulesetsService.getRulesets>["items"][number];

/** A field a ruleset declares, the kind a reference names as v1's routes do (`classes`, `spells`). */
function toFieldDeclaration(field: FieldDeclaration): unknown {
  if (field.input === "group") return { ...field, fields: field.fields.map(toFieldDeclaration) };
  if (field.input === "ref") return { ...field, references: toV1Kind(field.references) };
  return field;
}

/** The fields a ruleset declares, by entity kind, each kind as v1's routes name it (`class-levels`, `spells`). */
export function toV1FieldDeclarations(declarations: Answer<typeof RulesetFieldsService.getFields>) {
  return Object.fromEntries(
    Object.entries(declarations).map(([entityType, fields]) => [toV1Kind(entityType), fields.map(toFieldDeclaration)]),
  );
}

/** A ruleset, in a list or on its own, as v1 answers it. */
export function toV1Ruleset(
  ruleset: Answer<typeof RulesetsService.getRuleset> | RulesetListItem,
): z.infer<typeof v1Ruleset> {
  return {
    baseRules: ruleset.baseRules,
    description: ruleset.description,
    extensionIds: ruleset.extensionRulesetIds,
    id: ruleset.id,
    kind: ruleset.kind,
    name: ruleset.name,
    parentId: ruleset.rulesetId,
    private: ruleset.private,
    starCount: ruleset.starCount,
    starred: ruleset.isStarred,
    status: ruleset.status,
    system: ruleset.system,
  };
}

/** What a fork changed of the ruleset it's forked from, each entity's kind as v1's routes name it. */
export function toV1RulesetChanges(
  changes: Answer<typeof RulesetChangesService.getChanges>,
): z.infer<typeof v1RulesetChanges> {
  return changes.map((change) => ({
    entityId: "entityId" in change ? change.entityId : null,
    kind: toV1Kind(change.entityType),
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

/** A ruleset's settings: its own fields. */
export function toV1RulesetSettings({
  fields,
}: Answer<typeof RulesetSettingsService.getSettings>): z.infer<typeof v1RulesetSettings> {
  return { fields };
}
