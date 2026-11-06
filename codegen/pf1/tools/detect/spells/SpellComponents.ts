import { COMPONENT_TEXT_LABELS, SPELL_COMPONENT_ABBREVIATIONS } from "@/codegen/pf1/tools/terms/spells.ts";
import { capitalize } from "@/shared/text.ts";

/** A component as its line writes it: its abbreviation ("M", "F/DF") and the text in parentheses after it, if any. */
const COMPONENT = /^([A-Z]+(?:\/[A-Z]+)*)\s*(?:\((.*)\))?$/;

/** A pointer to the spell's text, which a components line may end with ("; see text") or give in parentheses. */
const SEE_TEXT = /^see text$/i;

/**
 * `text` split at each `separator` outside parentheses, each part trimmed: "V, S, M (a bit of fur, glass)" is V, S and
 * M (a bit of fur, glass).
 */
function splitOutsideParentheses(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let part = "";
  for (const char of text) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === separator && depth === 0) {
      parts.push(part.trim());
      part = "";
    } else {
      part += char;
    }
  }
  return [...parts, part.trim()].filter(Boolean);
}

/**
 * A spell's components line read ("V, S, M (rhubarb leaf and an adder's stomach), F (a dart)", "V, S, F/DF (a tiny
 * bell)"): its components, each the vocabulary's ("F/DF" is a focus and a divine focus), and what its material
 * component and focus are, which its description states (`texts`). What it can't read is listed (`unread`).
 */
export class SpellComponents {
  constructor(private readonly line: string) {}

  /** Its components as written, each its abbreviations and its text in parentheses; a pointer to its text left out. */
  private parts(): { abbreviations: string[]; text?: string; written: string }[] {
    const [list = "", ...rest] = splitOutsideParentheses(this.line, ";");
    return [
      ...splitOutsideParentheses(list, ",").map((written) => {
        const [, abbreviations, text] = written.match(COMPONENT) ?? [];
        return { abbreviations: abbreviations?.split("/") ?? [], text: text?.trim(), written };
      }),
      ...rest.filter((written) => !SEE_TEXT.test(written)).map((written) => ({ abbreviations: [], written })),
    ];
  }

  /** Its components, each the vocabulary's, each once. */
  names(): string[] {
    const names = this.parts().flatMap(({ abbreviations }) =>
      abbreviations.flatMap((abbreviation) => SPELL_COMPONENT_ABBREVIATIONS[abbreviation] ?? []),
    );
    return [...new Set(names)];
  }

  /**
   * What its material component and its focus are, as its description states them: "Material Component: Diamond worth
   * 5,000 gp.", "Focus: A dart.". A verbal component's words ("V (bard only)") and a pointer to its text aren't.
   */
  texts(): string[] {
    return this.parts().flatMap(({ abbreviations, text }) => {
      const label = COMPONENT_TEXT_LABELS[abbreviations[0]];
      if (!label || !text || SEE_TEXT.test(text)) return [];
      return [`${label}: ${capitalize(text)}${/[.!?]$/.test(text) ? "" : "."}`];
    });
  }

  /** What the line gives that no reading takes: a component it can't read, or more than a pointer to its text. */
  unread(): string[] {
    return this.parts()
      .filter(
        ({ abbreviations }) =>
          abbreviations.length === 0 ||
          abbreviations.some((abbreviation) => !SPELL_COMPONENT_ABBREVIATIONS[abbreviation]),
      )
      .map(({ written }) => `component "${written}"`);
  }
}
