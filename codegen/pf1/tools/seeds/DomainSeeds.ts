import DomainDetails from "@/codegen/pf1/tools/detect/DomainDetails.ts";
import type { DomainEntry, DomainReference } from "@/codegen/pf1/tools/types/domains.ts";
import type { DomainSeed } from "@/content/pf1/builders/domains/types.ts";

import { Memos } from "./Memos.ts";

/** A domain spell its line names that no spell of the book is. */
export interface UnknownDomainSpell {
  domain: string;
  level: number;
  name: string;
}

/** The roman numerals a spell's name may end its series with ("Summon Monster IX"), by their value. */
const ROMAN_NUMERALS: Record<string, string> = {
  i: "1",
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
};

/**
 * A spell's name as a key that its every writing shares: lowercase, its degree last ("mass cure critical wounds" is "Cure
 * Critical Wounds, Mass"), its series' numeral a number ("summon monster IX" is "Summon Monster 9"), its letters alone.
 */
function spellKey(name: string): string {
  const words = name.toLowerCase().replace(/,/g, " ").split(/\s+/).filter(Boolean);
  const degree = /^(mass|greater|lesser)$/.test(words[0] ?? "") ? words.shift()! : undefined;
  return [...words, ...(degree ? [degree] : [])]
    .map((word) => ROMAN_NUMERALS[word] ?? word)
    .join("")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * A domains reference's seeds: its domains (`seeds`, a subdomain left out: they're other books'), each described by its
 * granted powers, its spells named as the book's spells name them (`spellNames`), each at its level.
 */
export class DomainSeeds {
  constructor(
    readonly ref: DomainReference,
    /** The names of the book's spells, which its domains' spells are named as: a later one wins over an earlier one of its key. */
    private readonly spellNames: string[],
  ) {}

  /** What it built, by what it is. */
  private readonly memos = new Memos();

  /** Its domains, its subdomains left out. */
  private domains(): DomainEntry[] {
    return this.ref.raw.filter((entry) => !entry.subdomain);
  }

  /** The book's spells by their key (`spellKey`). */
  private spellsByKey(): Map<string, string> {
    return this.memos.of("spellsByKey", () => new Map(this.spellNames.map((name) => [spellKey(name), name])));
  }

  /** Its domains' seeds, each spell by the name the book's spells give it: one they don't have is left out. */
  seeds(): DomainSeed[] {
    return this.memos.of("seeds", () =>
      this.domains().map((entry) => {
        const details = new DomainDetails(entry);
        const spells = details.spells().flatMap(({ level, name }) => {
          const named = this.spellsByKey().get(spellKey(name));
          return named ? [{ name: named, level }] : [];
        });
        return { name: entry.name, description: details.description(), spells };
      }),
    );
  }

  /** The spells its domains' lines name that no spell of the book is, which their seeds leave out. */
  unknownSpells(): UnknownDomainSpell[] {
    return this.domains().flatMap((entry) =>
      new DomainDetails(entry)
        .spells()
        .filter(({ name }) => !this.spellsByKey().has(spellKey(name)))
        .map(({ level, name }) => ({ domain: entry.name, level, name })),
    );
  }
}
