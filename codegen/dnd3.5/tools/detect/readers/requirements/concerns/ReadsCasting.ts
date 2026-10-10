import type { BaseRequirementReading } from "@/codegen/dnd3.5/tools/detect/readers/requirements/BaseRequirementReading.ts";
import { gte, or } from "@/content/core/builders/customization/requirements.ts";
import type { RequirementEntry } from "@/content/core/builders/customization/types.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** A caster level, of either kind or arcane: "Caster level 5th", "arcane caster level 1st". */
const CASTER_LEVEL = /\b(?:(arcane) )?caster level (\d+)(?:st|nd|rd|th)/i;

/** Casting a prerequisite asks, to its sentence's end: "Able to cast at least one summoning spell of 3rd level or higher". */
const CASTING = /\bab(?:ility|le) to cast\b[^.;]*/i;

/** Casting it rules out, which no requirement says: "no ability to cast divine spells". */
const NO_CASTING = /\bno\s+ability to cast\b|\bmust not have\b.*\bability to cast\b/i;

/**
 * The kinds of spells a casting names: "arcane spells", "arcane and divine spells" (each), "arcane or divine spells"
 * (either), "zone of truth as a divine spell".
 */
const SPELL_KINDS = /\b(arcane|divine)(?: (and|or) (arcane|divine))? spells?\b/i;

/** The spell level a casting asks: "3rd-level spells", "a spell of 3rd level or higher". */
const SPELL_LEVEL = /\b(\d+)(?:st|nd|rd|th)[- ]level\b/i;

/** Reading the spellcasting a prerequisite asks: a caster level, spells of a level or a kind, a spell it names. */
export function ReadsCasting<B extends Constructor<BaseRequirementReading>>(Base: B) {
  abstract class ReadingCasting extends Base {
    /**
     * The caster level `text` asks ("Caster level 5th", "Arcane caster level 5th", a spell-like ability's "at caster
     * level 6th or higher"): the character's highest, of either kind or arcane, a spellcasting class's level with the
     * caster levels other classes add to it. Not the highest spell level it casts: a wizard 5 casts 3rd-level spells.
     */
    protected casterLevelRequirements(text: string): RequirementEntry[] {
      const casterLevel = CASTER_LEVEL.exec(text);
      if (!casterLevel) return [];
      const path = casterLevel[1] ? "spellcasting.arcanecasterlevel" : "spellcasting.casterlevel";
      return [gte(path, parseInt(casterLevel[2], 10))];
    }

    /**
     * The spellcasting `text` asks, read in its sentence: spells of the level it names ("3rd-level spells", "a spell of
     * 3rd level or higher"), else from 1st; of the kind it names ("arcane spells", "as a divine spell"), of each of two
     * ("arcane and divine spells"), else of either kind ("arcane or divine spells"). So a spell or a kind of spell it
     * names ("Ability to cast summon monster III", "able to cast any cure wounds spell") is any spellcasting, which only
     * a spellcaster casts. Nothing for casting it rules out ("no ability to cast divine spells"), nor for an ability it
     * uses ("Ability to use lesser invocations": no spell).
     */
    protected castingRequirements(text: string): RequirementEntry[] {
      const casting = CASTING.exec(text)?.[0];
      if (!casting || NO_CASTING.test(text)) return [];
      const level = parseInt(SPELL_LEVEL.exec(casting)?.[1] ?? "1", 10);
      const kinds = SPELL_KINDS.exec(casting);
      if (!kinds || kinds[2]?.toLowerCase() === "or") return [this.spellcastingOfEitherKind(level)];
      return [kinds[1], kinds[3]]
        .filter((kind) => kind !== undefined)
        .map((kind) => gte(`spellcasting.${kind.toLowerCase()}`, level));
    }

    /** Arcane or divine spellcasting of `level` or higher. */
    protected spellcastingOfEitherKind(level: number): RequirementEntry {
      return or(gte("spellcasting.arcane", level), gte("spellcasting.divine", level));
    }
  }
  return ReadingCasting;
}
