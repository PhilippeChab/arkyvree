import { getActivityLabelOverrides } from "./rulesetLabels.ts";

function extractBaseRules(data: unknown): string | undefined {
  if (data && typeof data === "object" && "baseRules" in data) {
    const br = (data as Record<string, unknown>).baseRules;
    return typeof br === "string" ? br : undefined;
  }
  return undefined;
}

export function formatActivityType(type: string, data?: unknown): string {
  let formatted = type.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase());

  const baseRules = extractBaseRules(data);
  if (baseRules) {
    const overrides = getActivityLabelOverrides(baseRules);
    for (const [generic, specific] of Object.entries(overrides)) {
      formatted = formatted.replaceAll(generic, specific);
    }
  }

  const d = (data ?? {}) as Record<string, unknown>;
  if (d.entityName) {
    formatted += `: ${d.entityName}`;
  }

  return formatted;
}

export function formatActivityDate(dateString: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

export function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatActivityDate(dateString);
}

const NOTIFICATION_MESSAGES: Record<string, (actor: string, d: Record<string, unknown>) => string> = {
  // Campaign invites
  createCampaignInvite: (actor, d) => `${actor} invited you to ${d.campaignName || "a campaign"}`,
  acceptCampaignInvite: (actor) => `${actor} accepted your campaign invite`,
  rejectCampaignInvite: (actor) => `${actor} declined your campaign invite`,
  revokeCampaignInvite: (actor) => `${actor} revoked your campaign invite`,

  // Contributor invites
  inviteContributor: (actor, d) => `${actor} invited you to contribute to ${d.rulesetName || "a ruleset"} as ${d.role || "Editor"}`,
  acceptContributorInvite: (actor) => `${actor} accepted your contributor invite`,
  rejectContributorInvite: (actor) => `${actor} declined your contributor invite`,
  revokeContributor: (actor) => `${actor} revoked your contributor access`,
  updateContributorRole: (actor, d) => `${actor} changed your role to ${d.role || "Editor"}`,
  leaveRuleset: (actor) => `${actor} left your ruleset`,

  // Character contributor invites
  inviteCharacterContributor: (actor, d) => `${actor} invited you to edit ${d.characterName || "a character"}`,
  acceptCharacterContributorInvite: (actor, d) => `${actor} accepted your invite to edit ${d.characterName || "your character"}`,
  rejectCharacterContributorInvite: (actor, d) => `${actor} declined your invite to edit ${d.characterName || "your character"}`,
  revokeCharacterContributor: (actor, d) => `${actor} revoked your access to ${d.characterName || "a character"}`,
  leaveCharacter: (actor, d) => `${actor} stopped contributing to ${d.characterName || "your character"}`,

  // Ruleset content — create
  createFeat: (actor, d) => `${actor} created feat ${d.entityName || ""}`.trim(),
  createPower: (actor, d) => `${actor} created spell ${d.entityName || ""}`.trim(),
  createKlass: (actor, d) => `${actor} created class ${d.entityName || ""}`.trim(),
  createItem: (actor, d) => `${actor} created item ${d.entityName || ""}`.trim(),
  createRace: (actor, d) => `${actor} created race ${d.entityName || ""}`.trim(),
  createSkill: (actor, d) => `${actor} created skill ${d.entityName || ""}`.trim(),
  createSave: (actor, d) => `${actor} created save ${d.entityName || ""}`.trim(),
  createMechanic: (actor, d) => `${actor} created mechanic ${d.entityName || ""}`.trim(),
  createLanguage: (actor, d) => `${actor} created language ${d.entityName || ""}`.trim(),
  createAptitude: (actor, d) => `${actor} created aptitude ${d.entityName || ""}`.trim(),
  createKlassLevel: (actor, d) => `${actor} added a level to ${d.entityName || "a class"}`,
  addKlassSkill: (actor, d) => `${actor} added ${d.skillName || "a skill"} to ${d.entityName || "a class"}`,
  createModifier: (actor, d) => `${actor} added a modifier to ${d.entityName || "an entity"}`,
  createRequirement: (actor, d) => `${actor} added a requirement to ${d.entityName || "an entity"}`,
  createProperty: (actor, d) => `${actor} added a property to ${d.entityName || "an entity"}`,

  // Ruleset content — update
  updateFeat: (actor, d) => `${actor} updated feat ${d.entityName || ""}`.trim(),
  updatePower: (actor, d) => `${actor} updated spell ${d.entityName || ""}`.trim(),
  updateKlass: (actor, d) => `${actor} updated class ${d.entityName || ""}`.trim(),
  updateItem: (actor, d) => `${actor} updated item ${d.entityName || ""}`.trim(),
  updateRace: (actor, d) => `${actor} updated race ${d.entityName || ""}`.trim(),
  updateSkill: (actor, d) => `${actor} updated skill ${d.entityName || ""}`.trim(),
  updateSave: (actor, d) => `${actor} updated save ${d.entityName || ""}`.trim(),
  updateMechanic: (actor, d) => `${actor} updated mechanic ${d.entityName || ""}`.trim(),
  updateLanguage: (actor, d) => `${actor} updated language ${d.entityName || ""}`.trim(),
  updateAptitude: (actor, d) => `${actor} updated aptitude ${d.entityName || ""}`.trim(),
  updateKlassLevel: (actor, d) => `${actor} updated a level of ${d.entityName || "a class"}`,
  updateModifier: (actor, d) => `${actor} updated a modifier on ${d.entityName || "an entity"}`,
  updateRequirement: (actor, d) => `${actor} updated a requirement on ${d.entityName || "an entity"}`,
  updateProperty: (actor, d) => `${actor} updated a property on ${d.entityName || "an entity"}`,

  // Ruleset content — delete
  deleteFeat: (actor, d) => `${actor} deleted feat ${d.entityName || ""}`.trim(),
  deletePower: (actor, d) => `${actor} deleted spell ${d.entityName || ""}`.trim(),
  deleteKlass: (actor, d) => `${actor} deleted class ${d.entityName || ""}`.trim(),
  deleteItem: (actor, d) => `${actor} deleted item ${d.entityName || ""}`.trim(),
  deleteRace: (actor, d) => `${actor} deleted race ${d.entityName || ""}`.trim(),
  deleteSkill: (actor, d) => `${actor} deleted skill ${d.entityName || ""}`.trim(),
  deleteSave: (actor, d) => `${actor} deleted save ${d.entityName || ""}`.trim(),
  deleteMechanic: (actor, d) => `${actor} deleted mechanic ${d.entityName || ""}`.trim(),
  deleteLanguage: (actor, d) => `${actor} deleted language ${d.entityName || ""}`.trim(),
  deleteAptitude: (actor, d) => `${actor} deleted aptitude ${d.entityName || ""}`.trim(),
  deleteKlassLevel: (actor, d) => `${actor} removed a level from ${d.entityName || "a class"}`,
  removeKlassSkill: (actor, d) => `${actor} removed ${d.skillName || "a skill"} from ${d.entityName || "a class"}`,
  deleteModifier: (actor, d) => `${actor} removed a modifier from ${d.entityName || "an entity"}`,
  deleteRequirement: (actor, d) => `${actor} removed a requirement from ${d.entityName || "an entity"}`,
  deleteProperty: (actor, d) => `${actor} removed a property from ${d.entityName || "an entity"}`,

  // Exports
  pdfReady: (_actor, d) => `Your PDF for ${d.characterName || "your character"} is ready to download`,
  pdfFailed: (_actor, d) => `PDF generation failed for ${d.characterName || "your character"}`,
};

export function formatNotificationMessage(type: string, data: unknown): string {
  const d = (data ?? {}) as Record<string, unknown>;
  const actorName = (d.actorName as string) || "Someone";

  const formatter = NOTIFICATION_MESSAGES[type];
  if (formatter) return formatter(actorName, d);

  const typeFormatted = formatActivityType(type, data).toLowerCase();
  return `${actorName}: ${typeFormatted}`;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  description: "Description",
  type: "Type",
  slot: "Slot",
  weight: "Weight",
  costGp: "Cost (gp)",
  hd: "Hit die",
  size: "Size",
  baseSpeed: "Base speed",
  primaryAbilityId: "Primary ability",
  abilityId: "Ability",
  saveEffect: "Save effect",
  saveId: "Save",
};

function formatChange(change: { field: string; from?: string; to?: string }): string {
  const label = FIELD_LABELS[change.field] ?? change.field;
  if (change.from == null && change.to == null) {
    return `${label} updated`;
  }
  if (change.from && change.to) {
    return `${label}: ${change.from} → ${change.to}`;
  }
  if (change.to) {
    return `${label} set to ${change.to}`;
  }
  return `${label} cleared`;
}

export function formatActivityDetails(data: unknown): string | null {
  const d = (data ?? {}) as Record<string, unknown>;
  const parts: string[] = [];

  if (d.changedFields && Array.isArray(d.changedFields)) {
    const changes = d.changedFields as { field: string; from?: string; to?: string }[];
    for (const change of changes) {
      parts.push(formatChange(change));
    }
  }
  if (d.level != null) {
    parts.push(`Level ${d.level}`);
  }
  // Modifier details
  if (d.target && d.operator) {
    parts.push(`${d.operator} ${d.value ?? ""} on ${d.target}`.trim());
  }
  // Property details
  if (d.propertyType) {
    parts.push(`${FIELD_LABELS[d.propertyType as string] ?? d.propertyType}: ${d.value ?? ""}`);
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

export const ACTIONABLE_NOTIFICATION_TYPES = new Set(["createCampaignInvite", "inviteContributor", "inviteCharacterContributor"]);

export const DOWNLOADABLE_NOTIFICATION_TYPES = new Set(["pdfReady"]);
