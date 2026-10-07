import type { ChangedField } from "@/shared/activity.ts";
import { formatOperator } from "@/shared/customization/operators.ts";
import { formatPropertyType } from "@/shared/customization/properties.ts";
import { formatSegment } from "@/shared/customization/target.ts";
import { BASE_RULES_OPTIONS } from "@/shared/enums.ts";
import { isRecord } from "@/shared/isRecord.ts";

import { oneOf } from "./oneOf.ts";
import { entityTypeLabel, getActivityLabelOverrides } from "./rulesetLabels.ts";

/** A ruleset entity's change, as its notification says it: its verb, by the type's (`createFeat`) */
const CONTENT_CHANGES: Record<string, string> = { create: "created", delete: "deleted", update: "updated" };

/** The ruleset entities a change's notification names by their word, by their name in its type (`createKlass`) */
const CONTENT_ENTITY_TYPES: Record<string, string> = {
  Aptitude: "aptitudes",
  Feat: "feats",
  Item: "items",
  Klass: "klasses",
  Language: "languages",
  Mechanic: "mechanics",
  Power: "powers",
  Race: "races",
  Save: "saves",
  Skill: "skills",
};

/** The changed fields whose name doesn't read as their label (`formatSegment`'s "Hd") */
const FIELD_LABELS: Record<string, string> = {
  abilityId: "Ability",
  costGp: "Cost (gp)",
  hd: "Hit Die",
  primaryAbilityId: "Primary Ability",
  saveId: "Save",
};

const NOTIFICATION_MESSAGES: Record<string, (actor: string, d: Record<string, unknown>) => string> = {
  // Campaign invites
  createCampaignInvite: (actor, d) => `${actor} invited you to ${d.campaignName || "a campaign"}`,
  acceptCampaignInvite: (actor) => `${actor} accepted your campaign invite`,
  rejectCampaignInvite: (actor) => `${actor} declined your campaign invite`,
  revokeCampaignInvite: (actor) => `${actor} revoked your campaign invite`,

  // Contributor invites
  inviteContributor: (actor, d) =>
    `${actor} invited you to contribute to ${d.rulesetName || "a ruleset"} as ${d.role || "Editor"}`,
  acceptContributorInvite: (actor) => `${actor} accepted your contributor invite`,
  rejectContributorInvite: (actor) => `${actor} declined your contributor invite`,
  revokeContributor: (actor) => `${actor} revoked your contributor access`,
  updateContributorRole: (actor, d) => `${actor} changed your role to ${d.role || "Editor"}`,
  leaveRuleset: (actor) => `${actor} left your ruleset`,

  // Character contributor invites
  inviteCharacterContributor: (actor, d) => `${actor} invited you to edit ${d.characterName || "a character"}`,
  acceptCharacterContributorInvite: (actor, d) =>
    `${actor} accepted your invite to edit ${d.characterName || "your character"}`,
  rejectCharacterContributorInvite: (actor, d) =>
    `${actor} declined your invite to edit ${d.characterName || "your character"}`,
  revokeCharacterContributor: (actor, d) => `${actor} revoked your access to ${d.characterName || "a character"}`,
  leaveCharacter: (actor, d) => `${actor} stopped contributing to ${d.characterName || "your character"}`,

  // Ruleset content beside an entity's own change (`contentChange`): class levels and skills, customizations — create
  createKlassLevel: (actor, d) => `${actor} added a level to ${d.entityName || "a class"}`,
  addKlassSkill: (actor, d) => `${actor} added ${d.skillName || "a skill"} to ${d.entityName || "a class"}`,
  createModifier: (actor, d) => `${actor} added a modifier to ${d.entityName || "an entity"}`,
  createRequirement: (actor, d) => `${actor} added a requirement to ${d.entityName || "an entity"}`,
  createProperty: (actor, d) => `${actor} added a property to ${d.entityName || "an entity"}`,

  // Ruleset content — update
  updateKlassLevel: (actor, d) => `${actor} updated a level of ${d.entityName || "a class"}`,
  updateModifier: (actor, d) => `${actor} updated a modifier on ${d.entityName || "an entity"}`,
  updateRequirement: (actor, d) => `${actor} updated a requirement on ${d.entityName || "an entity"}`,
  updateProperty: (actor, d) => `${actor} updated a property on ${d.entityName || "an entity"}`,

  // Ruleset content — delete
  deleteKlassLevel: (actor, d) => `${actor} removed a level from ${d.entityName || "a class"}`,
  removeKlassSkill: (actor, d) => `${actor} removed ${d.skillName || "a skill"} from ${d.entityName || "a class"}`,
  deleteModifier: (actor, d) => `${actor} removed a modifier from ${d.entityName || "an entity"}`,
  deleteRequirement: (actor, d) => `${actor} removed a requirement from ${d.entityName || "an entity"}`,
  deleteProperty: (actor, d) => `${actor} removed a property from ${d.entityName || "an entity"}`,

  // Exports
  pdfReady: (_actor, d) => `Your PDF for ${d.characterName || "your character"} is ready to download`,
  pdfFailed: (_actor, d) => `PDF generation failed for ${d.characterName || "your character"}`,
};

/** The base rules an activity's ruleset follows, when it says */
function baseRulesOf(d: Record<string, unknown>) {
  return oneOf(d.baseRules, BASE_RULES_OPTIONS);
}

/** A ruleset entity's create, update or delete, named in its ruleset's word ("Ann created spell Fireball"). */
function contentChange(type: string, actor: string, d: Record<string, unknown>) {
  const [, verb = "", name = ""] = /^([a-z]+)([A-Z]\w*)$/.exec(type) ?? [];
  if (!Object.hasOwn(CONTENT_CHANGES, verb) || !Object.hasOwn(CONTENT_ENTITY_TYPES, name)) return undefined;
  const word = entityTypeLabel(CONTENT_ENTITY_TYPES[name], baseRulesOf(d)).toLowerCase();
  return `${actor} ${CONTENT_CHANGES[verb]} ${word} ${d.entityName || ""}`.trim();
}

function formatChange(change: ChangedField): string {
  const label = FIELD_LABELS[change.field] ?? formatSegment(change.field);
  if (change.from == null && change.to == null) return `${label} updated`;

  if (change.from && change.to) return `${label}: ${change.from} → ${change.to}`;

  if (change.to) return `${label} set to ${change.to}`;

  return `${label} cleared`;
}

function isChangedField(value: unknown): value is ChangedField {
  return isRecord(value) && typeof value.field === "string";
}

/** An activity's payload: the fields its type records, or none. */
function payload(data: unknown): Record<string, unknown> {
  return isRecord(data) ? data : {};
}

/** What an activity of `type` changed: its fields, its level, its modifier's or requirement's change, its property. */
export function formatActivityDetails(type: string, data: unknown): string | null {
  const d = payload(data);
  const parts: string[] = [];

  if (Array.isArray(d.changedFields))
    for (const change of d.changedFields.filter(isChangedField)) parts.push(formatChange(change));

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

/** An activity's type as a label, in its ruleset's words ("createKlass" → "Create Class"), with the entity it names. */
export function formatActivityType(type: string, data?: unknown): string {
  const d = payload(data);
  let formatted = formatSegment(type);
  for (const [code, word] of Object.entries(getActivityLabelOverrides(baseRulesOf(d))))
    formatted = formatted.replace(new RegExp(`\\b${code}\\b`, "g"), word);

  if (d.entityName) formatted += `: ${d.entityName}`;

  return formatted;
}

export function formatNotificationMessage(type: string, data: unknown): string {
  const d = payload(data);
  const actorName = typeof d.actorName === "string" && d.actorName ? d.actorName : "Someone";

  const formatter = NOTIFICATION_MESSAGES[type];
  if (formatter) return formatter(actorName, d);
  const change = contentChange(type, actorName, d);
  if (change) return change;

  const typeFormatted = formatActivityType(type, data).toLowerCase();
  return `${actorName}: ${typeFormatted}`;
}
