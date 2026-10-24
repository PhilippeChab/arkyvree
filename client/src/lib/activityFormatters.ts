import { type ChangedField, getActivityName } from "@/shared/activity.ts";
import { formatOperator } from "@/shared/customization/operators.ts";
import { formatPropertyType } from "@/shared/customization/properties.ts";
import { formatSegment } from "@/shared/customization/target.ts";
import { BASE_RULES_OPTIONS } from "@/shared/enums.ts";
import { isRecord } from "@/shared/isRecord.ts";

import { formatDecimal } from "./formatNumeric.ts";
import { oneOf } from "./oneOf.ts";
import type { RulesDescription, RulesDescriptions, RulesWords } from "./queries.ts";
import { entityTypeLabel, entityTypeOfActivityName, getActivityLabelOverrides } from "./rulesetLabels.ts";

/** An entity's column, as its rules describe its form's. */
type Column = NonNullable<RulesDescription["columns"][string]>[number];

/** A ruleset entity's change, as its notification says it: its verb, by the type's (`createFeat`) */
const CONTENT_CHANGES: Record<string, string> = { create: "created", delete: "deleted", update: "updated" };

/** An activity type, its verb and the entity it names as the engine does: `createKlass`, `updateKlassLevel`. */
const ENTITY_ACTIVITY = /^([a-z]+)([A-Z]\w*)$/;

const NOTIFICATION_MESSAGES: Record<string, (actor: string, d: Record<string, unknown>) => string> = {
  // Campaign invites
  createCampaignInvite: (actor, d) => `${actor} invited you to ${d.campaignName || "a campaign"}`,
  acceptCampaignInvite: (actor) => `${actor} accepted your campaign invite`,
  rejectCampaignInvite: (actor) => `${actor} rejected your campaign invite`,

  // Contributor invites
  inviteContributor: (actor, d) =>
    `${actor} invited you to contribute to ${d.rulesetName || "a ruleset"} as ${d.role || "Editor"}`,
  acceptContributorInvite: (actor) => `${actor} accepted your contributor invite`,
  rejectContributorInvite: (actor) => `${actor} rejected your contributor invite`,
  // An older one carries no ruleset's name
  revokeContributor: (actor, d) =>
    d.rulesetName ? `${actor} revoked your access to ${d.rulesetName}` : `${actor} revoked your contributor access`,
  updateContributorRole: (actor, d) => `${actor} changed your role to ${d.role || "Editor"}`,
  leaveRuleset: (actor) => `${actor} stopped contributing to your ruleset`,

  // Character contributor invites
  inviteCharacterContributor: (actor, d) => `${actor} invited you to edit ${d.characterName || "a character"}`,
  acceptCharacterContributorInvite: (actor, d) =>
    `${actor} accepted your invite to edit ${d.characterName || "your character"}`,
  rejectCharacterContributorInvite: (actor, d) =>
    `${actor} rejected your invite to edit ${d.characterName || "your character"}`,
  revokeCharacterContributor: (actor, d) => `${actor} revoked your access to ${d.characterName || "a character"}`,
  leaveCharacter: (actor, d) => `${actor} stopped contributing to ${d.characterName || "your character"}`,

  // Ruleset content beside an entity's own change (`contentChange`) and what it holds (`heldChange`): customizations —
  // create
  createModifier: (actor, d) => `${actor} added a modifier to ${d.entityName || "an entity"}`,
  createRequirement: (actor, d) => `${actor} added a requirement to ${d.entityName || "an entity"}`,
  createProperty: (actor, d) => `${actor} added a property to ${d.entityName || "an entity"}`,

  // Ruleset content — update
  updateModifier: (actor, d) => `${actor} updated a modifier on ${d.entityName || "an entity"}`,
  updateRequirement: (actor, d) => `${actor} updated a requirement on ${d.entityName || "an entity"}`,
  updateProperty: (actor, d) => `${actor} updated a property on ${d.entityName || "an entity"}`,

  // Ruleset content — delete
  deleteModifier: (actor, d) => `${actor} removed a modifier from ${d.entityName || "an entity"}`,
  deleteRequirement: (actor, d) => `${actor} removed a requirement from ${d.entityName || "an entity"}`,
  deleteProperty: (actor, d) => `${actor} removed a property from ${d.entityName || "an entity"}`,

  // Exports
  pdfReady: (_actor, d) => `Your PDF for ${d.characterName || "your character"} is ready to download`,
  pdfFailed: (_actor, d) => `PDF generation failed for ${d.characterName || "your character"}`,
};

/** A field that points to another entity by its id (`primaryAbilityId`, `sourceItemId`): its name, then "Id". */
const REFERENCE_FIELD = /^(\w+)Id$/;

/**
 * A ruleset entity's create, update or delete, named in its ruleset's word ("Ann created spell Fireball"): the entity
 * its type names (`createKlass`), by its rules' words (`entityTypeOfActivityName`).
 */
function contentChange(type: string, actor: string, d: Record<string, unknown>, rules: RulesDescriptions | undefined) {
  const [, verb = "", name = ""] = ENTITY_ACTIVITY.exec(type) ?? [];
  const words = wordsOf(d, rules);
  const entityType = entityTypeOfActivityName(name, words);
  if (!Object.hasOwn(CONTENT_CHANGES, verb) || !entityType) return undefined;
  const word = entityTypeLabel(entityType, words).toLowerCase();
  return `${actor} ${CONTENT_CHANGES[verb]} ${word} ${d.entityName || ""}`.trim();
}

/**
 * A changed field as an activity says it: named and read as its entity's column (`columns`, its rules': "Hit Die set to
 * d8", "Cost: 15.00 gp → 20.00 gp"), else by its key.
 */
function formatChange(change: ChangedField, columns: readonly Column[]): string {
  // An entity a field points to is recorded by its id, which says nothing to a reader: only that it changed
  const reference = REFERENCE_FIELD.exec(change.field)?.[1];
  if (reference) return `${formatSegment(reference)} updated`;

  const column = columns.find((own) => own.key === change.field);
  const label = column?.label ?? formatSegment(change.field);
  if (change.from == null && change.to == null) return `${label} updated`;

  const shown = (value: string) => (column && readColumn(column, value)) ?? value;
  if (change.from && change.to) return `${label}: ${shown(change.from)} → ${shown(change.to)}`;

  if (change.to) return `${label} set to ${shown(change.to)}`;

  return `${label} cleared`;
}

/**
 * A ruleset's change to what one of its entities holds, as its notification says it, by its type, as its rules describe
 * it (`rules`, its base rules', else every base rules'): a level of a kind another owns, an owned entity being its
 * owner's level (3.5's `createKlassLevel`: "Ann added a level to Fighter"), the progression of a kind whose row opens it
 * (3.5's `updateKlassProgression`), a link through a kind's join (3.5's `addKlassSkill`: "Ann added Climb to Fighter");
 * none for another type.
 */
function heldChange(type: string, actor: string, d: Record<string, unknown>, rules: RulesDescriptions | undefined) {
  const baseRules = oneOf(d.baseRules, BASE_RULES_OPTIONS);
  const described = baseRules ? [rules?.[baseRules]] : Object.values(rules ?? {});
  for (const each of described) {
    if (!each) continue;
    // What it's of: its entity's name, else its kind's word
    const of = (kind: string) => String(d.entityName || `a ${entityTypeLabel(kind, each.words).toLowerCase()}`);
    for (const { owner, type: owned } of each.customizationPages) {
      if (!owner) continue;
      const name = getActivityName(owned);
      if (type === `create${name}`) return `${actor} added a level to ${of(owner)}`;
      if (type === `update${name}`) return `${actor} updated a level of ${of(owner)}`;
      if (type === `delete${name}`) return `${actor} removed a level from ${of(owner)}`;
    }
    for (const kind of each.kinds) {
      if (kind.opens === "progression" && type === `update${getActivityName(kind.type)}Progression`)
        return `${actor} updated the progression of ${of(kind.type)}`;
      const { links } = kind;
      if (!links) continue;
      const target = d[links.targetName] || `a ${entityTypeLabel(links.type, each.words).toLowerCase()}`;
      if (type === `add${getActivityName(links.join)}`) return `${actor} added ${String(target)} to ${of(kind.type)}`;
      if (type === `remove${getActivityName(links.join)}`)
        return `${actor} removed ${String(target)} from ${of(kind.type)}`;
    }
  }
  return undefined;
}

function isChangedField(value: unknown): value is ChangedField {
  return isRecord(value) && typeof value.field === "string";
}

/** An activity's payload: the fields its type records, or none. */
function payload(data: unknown): Record<string, unknown> {
  return isRecord(data) ? data : {};
}

/**
 * A column's value as its form reads it (`value`, as an activity records it): a choice's label ("d8"), a decimal in its
 * unit ("15.00 gp"); none for one that reads as it is.
 */
function readColumn(column: Column, value: string): string | null {
  if (column.input === "choice") {
    const index = column.options.findIndex((option) => String(option) === value);
    return index >= 0 ? (column.labels?.[index] ?? null) : null;
  }
  if (column.input !== "decimal") return null;
  const decimal = formatDecimal(value);
  return decimal === null ? null : `${decimal}${column.unit ? ` ${column.unit}` : ""}`;
}

/**
 * The words of the base rules an activity's ruleset follows, as its rules describe them (`rules`): when it doesn't say
 * (an older activity's), every base rules', the first's word of a type winning.
 */
function wordsOf(d: Record<string, unknown>, rules: RulesDescriptions | undefined): RulesWords | undefined {
  if (!rules) return undefined;
  const baseRules = oneOf(d.baseRules, BASE_RULES_OPTIONS);
  if (baseRules) return rules[baseRules].words;
  return Object.values(rules).reduceRight<RulesWords>((words, described) => ({ ...words, ...described.words }), {});
}

/**
 * What an activity of `type` changed: its fields (named as the columns of the entity it names, `rules`: every base
 * rules'), its level, its modifier's or requirement's change, its property.
 */
export function formatActivityDetails(type: string, data: unknown, rules?: RulesDescriptions): string | null {
  const d = payload(data);
  const parts: string[] = [];
  const baseRules = oneOf(d.baseRules, BASE_RULES_OPTIONS);
  // The columns of the entity its type names, its own alone: another entity's field of the same key reads its own way
  const entityType = entityTypeOfActivityName(ENTITY_ACTIVITY.exec(type)?.[2] ?? "", wordsOf(d, rules));
  const columns = (entityType && baseRules && rules?.[baseRules].columns[entityType]) || [];

  if (Array.isArray(d.changedFields))
    for (const change of d.changedFields.filter(isChangedField)) parts.push(formatChange(change, columns));

  if (d.level != null) parts.push(`Level ${d.level}`);

  // A modifier's or a requirement's change
  if (d.target && typeof d.operator === "string" && d.operator) {
    const operator = formatOperator(type.endsWith("Requirement") ? "requirement" : "modifier", d.operator);
    parts.push(`${operator}${d.value ? ` ${d.value}` : ""} on ${d.target}`);
  }

  // Property details
  if (typeof d.propertyType === "string" && d.propertyType)
    parts.push(`${formatPropertyType(d.propertyType)}: ${d.value ?? ""}`);

  return parts.length > 0 ? parts.join("\n") : null;
}

/**
 * An activity's type as a label, in its ruleset's words (`rules`, every base rules': "createKlass" → "Create Class"),
 * with the entity it names.
 */
export function formatActivityType(type: string, data?: unknown, rules?: RulesDescriptions): string {
  const d = payload(data);
  let formatted = formatSegment(type);
  for (const [code, word] of Object.entries(getActivityLabelOverrides(wordsOf(d, rules))))
    formatted = formatted.replace(new RegExp(`\\b${code}\\b`, "g"), word);

  if (d.entityName) formatted += `: ${d.entityName}`;

  return formatted;
}

/** A notification's message, its entity named in its ruleset's words (`rules`, every base rules'). */
export function formatNotificationMessage(type: string, data: unknown, rules?: RulesDescriptions): string {
  const d = payload(data);
  const actorName = typeof d.actorName === "string" && d.actorName ? d.actorName : "Someone";

  const formatter = NOTIFICATION_MESSAGES[type];
  if (formatter) return formatter(actorName, d);
  const held = heldChange(type, actorName, d, rules);
  if (held) return held;
  const change = contentChange(type, actorName, d, rules);
  if (change) return change;

  const typeFormatted = formatActivityType(type, data, rules).toLowerCase();
  return `${actorName}: ${typeFormatted}`;
}
