import type { BaseRequirementReading } from "@/codegen/dnd3.5/tools/detect/readers/requirements/BaseRequirementReading.ts";
import { eqStr, or } from "@/content/core/builders/customization/requirements.ts";
import type { RequirementEntry } from "@/content/core/builders/customization/types.ts";
import type { Constructor } from "@/lib/mixins.ts";

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
  // A neutral component on either axis: "any neutral alignment (NG, LN, N, CN, or NE)"
  { prefixes: ["any neutral"], alignments: ["Neutral Good", "Lawful Neutral", "True Neutral", "Chaotic Neutral", "Neutral Evil"] },
];

/** The alignments of the kind "Any …" starts with ("any nonevil"), in the order they're checked; none for another. */
function alignmentsOfKind(lower: string): string[] | undefined {
  return ANY_ALIGNMENTS.find(({ prefixes }) => prefixes.some((prefix) => lower.startsWith(prefix)))?.alignments;
}

/**
 * The alignments "Any …" names: those of a kind ("any nonevil"), those of each kind it joins ("any nonevil and
 * nonchaotic": lawful good, neutral good, lawful neutral and neutral), or every one but those it lists ("any but
 * lawful good"); none for another text.
 */
function anyAlignments(lower: string): string[] | undefined {
  const but = /^any (?:but|except) (.+)$/.exec(lower);
  if (but) {
    const listed = new Set(listedAlignments(but[1]));
    return listed.size > 0 ? ALIGNMENT_NAMES.filter((name) => !listed.has(name)).map(titleCase) : undefined;
  }
  const [first, ...others] = lower.split(/\s+and\s+(?:any\s+)?/);
  const alignments = alignmentsOfKind(first);
  const narrowing = others.map((kind) => alignmentsOfKind(`any ${kind}`)).filter((kinds) => kinds !== undefined);
  return alignments?.filter((alignment) => narrowing.every((kinds) => kinds.includes(alignment)));
}

/**
 * The alignments a list names, lowercased: "Neutral good, lawful neutral, neutral, or neutral evil", "Lawful good or
 * lawful neutral" ("neutral" is true neutral).
 */
function listedAlignments(lower: string): string[] {
  return lower
    .split(/,\s*(?:or\s+)?|\s+or\s+/)
    .map((part) => (part.trim() === "neutral" ? "true neutral" : part.trim()))
    .filter((part) => ALIGNMENT_NAMES.includes(part));
}

/** An alignment's name as the seed writes it: "lawful good" → "Lawful Good". */
function titleCase(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** Reading a prerequisite's alignment: "Any nonevil", "Any but lawful good", "Lawful neutral", a list of them. */
export function ReadsAlignment<B extends Constructor<BaseRequirementReading>>(Base: B) {
  abstract class ReadingAlignment extends Base {
    /**
     * A prerequisite's alignment, as a check of the character's: any of those "Any …" names ("Any nonevil", "Any but
     * lawful good"), of those it lists ("Lawful good or lawful neutral"), or the one it names ("Lawful neutral").
     */
    protected alignmentRequirement(text: string): RequirementEntry | undefined {
      const lower = text.toLowerCase().trim().replace(/\.$/, "");
      const alignments = anyAlignments(lower) ?? listedAlignments(lower).map(titleCase);
      if (alignments.length === 0) return undefined;
      const checks = alignments.map((alignment) => eqStr(ALIGNMENT_PATH, alignment));
      return checks.length === 1 ? checks[0] : or(...checks);
    }
  }
  return ReadingAlignment;
}
