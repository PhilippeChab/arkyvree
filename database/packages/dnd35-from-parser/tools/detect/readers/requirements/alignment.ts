import { eqStr, or } from "@/database/packages/dnd35/content/customization/requirements.ts";
import type { RequirementEntry } from "@/database/packages/dnd35/content/customization/types.ts";

/** The nine alignments, lowercased: what a prerequisite names one by ("neutral" is true neutral). */
const ALIGNMENT_NAMES = [
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

/** The character's alignment, which an alignment prerequisite checks. */
const ALIGNMENT_PATH = "identity.beliefs.alignment";

/** The alignments a prerequisite's "Any …" names, by what it starts with, in the order they're checked. */
// oxfmt-ignore
const ANY_ALIGNMENTS: { alignments: string[]; prefixes: string[] }[] = [
  { prefixes: ["any evil"], alignments: ["Lawful Evil", "Neutral Evil", "Chaotic Evil"] },
  { prefixes: ["any good"], alignments: ["Lawful Good", "Neutral Good", "Chaotic Good"] },
  { prefixes: ["any lawful"], alignments: ["Lawful Good", "Lawful Neutral", "Lawful Evil"] },
  { prefixes: ["any chaotic"], alignments: ["Chaotic Good", "Chaotic Neutral", "Chaotic Evil"] },
  { prefixes: ["any non-evil", "any nonevil"], alignments: ["Lawful Good", "Neutral Good", "Chaotic Good", "Lawful Neutral", "True Neutral", "Chaotic Neutral"] },
  { prefixes: ["any non-good", "any nongood"], alignments: ["Lawful Neutral", "True Neutral", "Chaotic Neutral", "Lawful Evil", "Neutral Evil", "Chaotic Evil"] },
  { prefixes: ["any non-lawful", "any nonlawful"], alignments: ["Neutral Good", "True Neutral", "Neutral Evil", "Chaotic Good", "Chaotic Neutral", "Chaotic Evil"] },
  { prefixes: ["any non-chaotic", "any nonchaotic"], alignments: ["Lawful Good", "Lawful Neutral", "Lawful Evil", "Neutral Good", "True Neutral", "Neutral Evil"] },
];

/** A comma-separated list of alignments ("Neutral good, lawful neutral, neutral, or neutral evil"): any of them. */
function listedAlignments(lower: string): RequirementEntry | undefined {
  const parts = lower
    .replace(/\.$/, "")
    .split(/,\s*/)
    .map((s) => s.replace(/^or\s+/, "").trim())
    .filter(Boolean);
  const matched: RequirementEntry[] = [];
  for (const part of parts) {
    const normalized = part === "neutral" ? "true neutral" : part;
    if (ALIGNMENT_NAMES.includes(normalized)) matched.push(eqStr(ALIGNMENT_PATH, titleCase(normalized)));
  }
  return matched.length > 0 ? or(...matched) : undefined;
}

/** An alignment's name as the seed writes it: "lawful good" → "Lawful Good". */
function titleCase(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** A prerequisite's alignment ("Any nonevil", "Lawful neutral"), as a check of the character's. */
export function readAlignmentRequirement(text: string): RequirementEntry | undefined {
  const lower = text.toLowerCase().trim().replace(/\.$/, "");

  const any = ANY_ALIGNMENTS.find(({ prefixes }) => prefixes.some((prefix) => lower.startsWith(prefix)));
  if (any) return or(...any.alignments.map((alignment) => eqStr(ALIGNMENT_PATH, alignment)));

  if (lower.includes(",")) {
    const listed = listedAlignments(lower);
    if (listed) return listed;
  }

  // Specific alignment
  const name = ALIGNMENT_NAMES.find((name) => lower === name || (name === "true neutral" && lower === "neutral"));
  return name ? eqStr(ALIGNMENT_PATH, titleCase(name)) : undefined;
}
