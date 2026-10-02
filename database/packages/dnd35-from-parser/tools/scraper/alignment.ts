import { eqStr, or } from "@/database/packages/dnd35/content/requirements.ts";
import type { RequirementEntry } from "@/database/packages/dnd35/content/types.ts";

/** A prerequisite's alignment ("Any nonevil", "Lawful neutral"), as a check of the character's. */
export function parseAlignmentRequirement(text: string): RequirementEntry | undefined {
  const lower = text.toLowerCase().trim().replace(/\.$/, "");
  const path = "identity.beliefs.alignment";

  if (lower.startsWith("any evil")) {
    return or(eqStr(path, "Lawful Evil"), eqStr(path, "Neutral Evil"), eqStr(path, "Chaotic Evil"));
  }
  if (lower.startsWith("any good")) {
    return or(eqStr(path, "Lawful Good"), eqStr(path, "Neutral Good"), eqStr(path, "Chaotic Good"));
  }
  if (lower.startsWith("any lawful")) {
    return or(eqStr(path, "Lawful Good"), eqStr(path, "Lawful Neutral"), eqStr(path, "Lawful Evil"));
  }
  if (lower.startsWith("any chaotic")) {
    return or(eqStr(path, "Chaotic Good"), eqStr(path, "Chaotic Neutral"), eqStr(path, "Chaotic Evil"));
  }
  if (lower.startsWith("any non-evil") || lower.startsWith("any nonevil")) {
    return or(
      eqStr(path, "Lawful Good"),
      eqStr(path, "Neutral Good"),
      eqStr(path, "Chaotic Good"),
      eqStr(path, "Lawful Neutral"),
      eqStr(path, "True Neutral"),
      eqStr(path, "Chaotic Neutral"),
    );
  }
  if (lower.startsWith("any non-good") || lower.startsWith("any nongood")) {
    return or(
      eqStr(path, "Lawful Neutral"),
      eqStr(path, "True Neutral"),
      eqStr(path, "Chaotic Neutral"),
      eqStr(path, "Lawful Evil"),
      eqStr(path, "Neutral Evil"),
      eqStr(path, "Chaotic Evil"),
    );
  }
  if (lower.startsWith("any non-lawful") || lower.startsWith("any nonlawful")) {
    return or(
      eqStr(path, "Neutral Good"),
      eqStr(path, "True Neutral"),
      eqStr(path, "Neutral Evil"),
      eqStr(path, "Chaotic Good"),
      eqStr(path, "Chaotic Neutral"),
      eqStr(path, "Chaotic Evil"),
    );
  }
  if (lower.startsWith("any non-chaotic") || lower.startsWith("any nonchaotic")) {
    return or(
      eqStr(path, "Lawful Good"),
      eqStr(path, "Lawful Neutral"),
      eqStr(path, "Lawful Evil"),
      eqStr(path, "Neutral Good"),
      eqStr(path, "True Neutral"),
      eqStr(path, "Neutral Evil"),
    );
  }

  const alignmentNames = [
    "lawful good",
    "neutral good",
    "chaotic good",
    "lawful neutral",
    "true neutral",
    "chaotic neutral",
    "lawful evil",
    "neutral evil",
    "chaotic evil",
  ];

  // Comma-separated list of alignments (e.g. "Neutral good, lawful neutral, neutral, chaotic neutral, or neutral evil.")
  if (lower.includes(",")) {
    const parts = lower
      .replace(/\.$/, "")
      .split(/,\s*/)
      .map((s) => s.replace(/^or\s+/, "").trim())
      .filter(Boolean);
    const matched: RequirementEntry[] = [];
    for (const part of parts) {
      const normalized = part === "neutral" ? "true neutral" : part;
      const titleCase = normalized
        .split(" ")
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(" ");
      if (alignmentNames.includes(normalized)) {
        matched.push(eqStr(path, titleCase));
      }
    }
    if (matched.length > 0) return or(...matched);
  }

  // Specific alignment
  for (const name of alignmentNames) {
    if (lower === name || (name === "true neutral" && lower === "neutral")) {
      const titleCase = name
        .split(" ")
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(" ");
      return eqStr(path, titleCase);
    }
  }

  return undefined;
}
