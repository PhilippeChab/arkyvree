import { type ChangedField, type ChangedLink, type ChangedLinks, getActivityName } from "@/shared/activity.ts";
import { formatFieldName } from "@/shared/customization/fields.ts";
import { formatOperator } from "@/shared/customization/operators.ts";
import { formatSegment } from "@/shared/customization/target.ts";
import { BASE_RULES_OPTIONS } from "@/shared/enums.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { formatSigned } from "@/shared/text.ts";

import { formatDecimal } from "./formatNumeric.ts";
import { oneOf } from "./oneOf.ts";
import type { RulesDescription, RulesDescriptions, RulesWords } from "./queries.ts";
import { entityTypeLabel, entityTypeOfActivityName, getActivityLabelOverrides } from "./rulesetLabels.ts";

/** A field of an entity's form that holds a value, as its rules describe it: any but a group. */
type ValueField = Exclude<NonNullable<RulesDescription["fields"][string]>[number], { input: "group" }>;

/** A ruleset entity's change, as its notification says it: its verb, by the type's (`createFeat`) */
const CONTENT_CHANGES: Record<string, string> = { create: "created", delete: "deleted", update: "updated" };

/** An activity type, its verb and the entity it names as the engine does: `createClass`, `updateClassLevel`. */
const ENTITY_ACTIVITY = /^([a-z]+)([A-Z]\w*)$/;

/** A flag's value as an activity records it, as a reader says it. */
const FLAG_WORDS: Readonly<Record<string, string>> = { false: "No", true: "Yes" };

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
  createField: (actor, d) => `${actor} added a field to ${d.entityName || "an entity"}`,

  // Ruleset content — update
  updateModifier: (actor, d) => `${actor} updated a modifier on ${d.entityName || "an entity"}`,
  updateRequirement: (actor, d) => `${actor} updated a requirement on ${d.entityName || "an entity"}`,
  updateField: (actor, d) => `${actor} updated a field on ${d.entityName || "an entity"}`,

  // Ruleset content — delete
  deleteModifier: (actor, d) => `${actor} removed a modifier from ${d.entityName || "an entity"}`,
  deleteRequirement: (actor, d) => `${actor} removed a requirement from ${d.entityName || "an entity"}`,
  deleteField: (actor, d) => `${actor} removed a field from ${d.entityName || "an entity"}`,

  // Exports
  pdfReady: (_actor, d) => `Your PDF for ${d.characterName || "your character"} is ready to download`,
  pdfFailed: (_actor, d) => `PDF generation failed for ${d.characterName || "your character"}`,
};

/**
 * A ruleset entity's create, update or delete, named in its ruleset's word ("Ann created spell Fireball"): the entity
 * its type names (`createClass`), by its rules' words (`entityTypeOfActivityName`).
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
 * The fields of an activity's entity type (`entityType`) that hold a value, a group's among them, as the base rules its
 * ruleset follows describe them (`rules`): when it doesn't say (an older activity's), every base rules', the first's
 * field of a stored field or a role winning; none for another type.
 */
function fieldsOf(
  d: Record<string, unknown>,
  entityType: string | undefined,
  rules: RulesDescriptions | undefined,
): readonly ValueField[] {
  if (!rules || !entityType) return [];
  const baseRules = oneOf(d.baseRules, BASE_RULES_OPTIONS);
  const described = baseRules
    ? (rules[baseRules].fields[entityType] ?? [])
    : Object.values(rules).flatMap((each) => each.fields[entityType] ?? []);
  const leaves = (fields: typeof described): ValueField[] =>
    fields.flatMap((field) => (field.input === "group" ? leaves(field.fields) : [field]));
  return leaves(described);
}

/**
 * A changed value as an activity says it, which records it where it's stored (a stored field, a single link's role):
 * labeled as it records its declaration's label ("School", "Saving Throw"), else (an older one's) as its entity's field
 * (`fields`, its rules') or by its name in words ("Name", "Item Is Template"); its values read as its field's input reads
 * them ("Hit Die: d8 → d10", "Cost: 15.00 gp → 20.00 gp"), a flag's as "Yes" or "No", a single link's by the name it
 * records.
 */
function formatChange(change: ChangedField, fields: readonly ValueField[]): string {
  const field = fields.find((own) => (own.field ?? own.role) !== undefined && (own.field ?? own.role) === change.field);
  // A stored field none labels, by its name in words ("ITEM_IS_TEMPLATE" → "Item Is Template"), else as a key reads
  const words = /^[A-Z0-9_]+$/.test(change.field) ? formatFieldName(change.field) : formatSegment(change.field);
  const label = change.label ?? field?.label ?? words;
  // An older one recorded a link's target by its id, which says nothing to a reader: only that it changed
  if (change.label === undefined && (field?.input === "ref" || field?.input === "template")) return `${label} updated`;
  if (change.from == null && change.to == null) return `${label} updated`;

  const shown = (value: string) => (field && readValue(field, value)) ?? FLAG_WORDS[value] ?? value;
  if (change.from && change.to) return `${label}: ${shown(change.from)} → ${shown(change.to)}`;

  if (change.to) return `${label} set to ${shown(change.to)}`;

  return `${label} cleared`;
}

/**
 * An entry of a list of links as an activity says it: its target's name, then its own columns where it carries them
 * (the pool it's through, its tier by its rules' name of it, `tiers`, its amount signed, whether it's free): "Power
 * Attack (Fighter Bonus Feats, free)", "Wizard (Level 3)", "Fortitude (+2)".
 */
function formatLinkEntry(link: ChangedLink, tiers: RulesDescription["tiers"]): string {
  const columns = [
    link.viaName,
    link.tier != null ? (tiers.find((tier) => tier.level === link.tier)?.label ?? `Level ${link.tier}`) : undefined,
    link.amount != null ? formatSigned(link.amount) : undefined,
    link.free ? "free" : undefined,
  ].filter((column) => !!column);
  return columns.length > 0 ? `${link.toName} (${columns.join(", ")})` : link.toName;
}

/**
 * A list of links' change as an activity says it, labeled as its role's field ("Aptitudes: added Fighter Bonus Feats;
 * removed Wizard Bonus Feats"), each entry by its target's name with its own columns (`formatLinkEntry`).
 */
function formatLinksChange(change: ChangedLinks, tiers: RulesDescription["tiers"]): string {
  const entries = (links: readonly ChangedLink[]) => links.map((link) => formatLinkEntry(link, tiers)).join(", ");
  const parts = [
    ...(change.added.length > 0 ? [`added ${entries(change.added)}`] : []),
    ...(change.removed.length > 0 ? [`removed ${entries(change.removed)}`] : []),
  ];
  return `${change.label}: ${parts.join("; ")}`;
}

/**
 * A ruleset's change to what one of its entities holds, as its notification says it, by its type, as its rules describe
 * it (`rules`, its base rules', else every base rules'): a level of a kind another owns, an owned entity being its
 * owner's level (3.5's `createClassLevel`: "Ann added a level to Fighter"), the progression of a kind whose row opens it
 * (3.5's `updateClassProgression`), a link of the role a kind's page edits (3.5's `addClassSkill`: "Ann added Climb to
 * Fighter", its target's name at `toName`, as every link's activity records it); none for another type.
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
      const target = d.toName || `a ${entityTypeLabel(links.type, each.words).toLowerCase()}`;
      if (type === `add${getActivityName(links.role)}`) return `${actor} added ${String(target)} to ${of(kind.type)}`;
      if (type === `remove${getActivityName(links.role)}`)
        return `${actor} removed ${String(target)} from ${of(kind.type)}`;
    }
  }
  return undefined;
}

function isChangedField(value: unknown): value is ChangedField {
  return isRecord(value) && typeof value.field === "string";
}

function isChangedLinks(value: unknown): value is ChangedLinks {
  return (
    isRecord(value) &&
    typeof value.role === "string" &&
    typeof value.label === "string" &&
    Array.isArray(value.added) &&
    Array.isArray(value.removed)
  );
}

/** An activity's payload: the fields its type records, or none. */
function payload(data: unknown): Record<string, unknown> {
  return isRecord(data) ? data : {};
}

/**
 * A field's value as its input reads it (`value`, as an activity records it): a choice's label ("d8"), a decimal in its
 * unit ("15.00 gp"); none for one that reads as it is.
 */
function readValue(field: ValueField, value: string): string | null {
  if (field.input === "choice") {
    const index = field.options.findIndex((option) => String(option) === value);
    return index >= 0 ? (field.labels?.[index] ?? null) : null;
  }
  if (field.input !== "decimal") return null;
  const decimal = formatDecimal(value);
  return decimal === null ? null : `${decimal}${field.unit ? ` ${field.unit}` : ""}`;
}

/**
 * The tiers of the base rules an activity's ruleset follows, as its rules describe them (`rules`): when it doesn't say
 * (an older activity's), the first base rules' that has any.
 */
function tiersOf(d: Record<string, unknown>, rules: RulesDescriptions | undefined): RulesDescription["tiers"] {
  if (!rules) return [];
  const baseRules = oneOf(d.baseRules, BASE_RULES_OPTIONS);
  if (baseRules) return rules[baseRules].tiers;
  return Object.values(rules).find((described) => described.tiers.length > 0)?.tiers ?? [];
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
 * What an activity of `type` changed: its fields and its single links, each by its declaration's label (an older one's
 * as the fields of the entity it names, `rules`: every base rules'), each value as its field's input reads it, its lists of links' entries added and removed,
 * its level, a link's target (`toName`), its modifier's or requirement's change, its field's value.
 */
export function formatActivityDetails(type: string, data: unknown, rules?: RulesDescriptions): string | null {
  const d = payload(data);
  const parts: string[] = [];
  // The fields of the entity its type names, its own alone: another entity's field of the same name reads its own way
  const entityType = entityTypeOfActivityName(ENTITY_ACTIVITY.exec(type)?.[2] ?? "", wordsOf(d, rules));
  const fields = fieldsOf(d, entityType, rules);

  const changes: unknown[] = Array.isArray(d.changedFields) ? d.changedFields : [];
  for (const change of changes) {
    if (isChangedField(change)) parts.push(formatChange(change, fields));
    else if (isChangedLinks(change)) parts.push(formatLinksChange(change, tiersOf(d, rules)));
  }

  if (d.level != null) parts.push(`Level ${d.level}`);

  // A link's target, as every link's activity records it: a class skill's added or removed
  if (typeof d.toName === "string" && d.toName) parts.push(d.toName);

  // A modifier's or a requirement's change
  if (d.target && typeof d.operator === "string" && d.operator) {
    const operator = formatOperator(type.endsWith("Requirement") ? "requirement" : "modifier", d.operator);
    parts.push(`${operator}${d.value ? ` ${d.value}` : ""} on ${d.target}`);
  }

  // A field's value
  if (typeof d.field === "string" && d.field) parts.push(`${formatFieldName(d.field)}: ${d.value ?? ""}`);

  return parts.length > 0 ? parts.join("\n") : null;
}

/**
 * An activity's type as a label, in its ruleset's words (`rules`, every base rules': "createClass" → "Create Class"),
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
