import type { DomainEntry } from "@/codegen/pf1/tools/types/domains.ts";

/** A domain's spell as its Domain Spells line prints it: its level, and its name lowercase, its note left out. */
export interface PrintedDomainSpell {
  level: number;
  name: string;
}

/** The label of a domain's line of spells. */
const DOMAIN_SPELLS = "Domain Spells";

/** The label of a domain's line that opens its granted powers. */
const GRANTED_POWERS = "Granted Powers";

/**
 * A spell of a Domain Spells line: its level ("1st", "9th"), an em dash, its name up to a comma, a period or its note in
 * parentheses ("elemental body IV (air only)"). A line ends at its first period: past it, a page can carry another
 * source's notes.
 */
const SPELL = /(\d)(?:st|nd|rd|th)—([^,.(]+)/g;

/**
 * A domain's labelled lines read: its description (its granted powers, each power after the line that opens them, as
 * rules are its description) and its spells by level, as printed.
 */
export default class DomainDetails {
  constructor(private readonly entry: DomainEntry) {}

  /** Its granted powers: the line that opens them, then each power's, "Label: text", in its page's order. */
  description(): string {
    return this.entry.details
      .filter(({ label }) => label !== DOMAIN_SPELLS)
      .map(({ label, text }) => (label === GRANTED_POWERS ? text : `${label}: ${text}`))
      .join(" ");
  }

  /** Its spells as its Domain Spells line prints them, up to the line's first period: none without one. */
  spells(): PrintedDomainSpell[] {
    const line = this.entry.details.find(({ label }) => label === DOMAIN_SPELLS)?.text ?? "";
    const own = line.split(/\.(?:\s|$)/)[0];
    return [...own.matchAll(SPELL)].map(([, level, name]) => ({ level: Number(level), name: name.trim() }));
  }
}
