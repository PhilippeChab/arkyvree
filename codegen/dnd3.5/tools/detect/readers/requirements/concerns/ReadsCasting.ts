import type { BaseRequirementReading } from "@/codegen/dnd3.5/tools/detect/readers/requirements/BaseRequirementReading.ts";
import { gte, or } from "@/content/core/builders/customization/requirements.ts";
import type { RequirementEntry } from "@/content/core/builders/customization/types.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** A caster level, of either kind or arcane: "Caster level 5th", "arcane caster level 1st". */
const CASTER_LEVEL = /\b(?:(arcane) )?caster level (\d+)(?:st|nd|rd|th)/i;

/** A spell or a kind of spell it names besides: "Ability to cast summon monster III", "able to cast any cure wounds spell". */
const CASTING_ANY = /\bab(?:ility|le) to cast\b/i;

/** Spells of a level, a kind or both: "Ability to cast 3rd-level arcane spells", "able to cast divine spells". */
const CASTING_SPELLS =
  /\bab(?:ility|le) to cast (?:the )?(?:(\d+)(?:st|nd|rd|th)[- ]level )?(arcane|divine)?\s*spells?/i;

/** Casting it rules out, which no requirement says: "no ability to cast divine spells". */
const NO_CASTING = /\bno\s+ability to cast\b|\bmust not have\b.*\bability to cast\b/i;

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
     * The spellcasting `text` asks: spells of a level, a kind or both ("Ability to cast 3rd-level arcane spells": arcane
     * spells of 3rd level), of either kind when it names none; and any spellcasting for a spell or a kind of spell it
     * names ("Ability to cast summon monster III", "able to cast any cure wounds spell"), which only a spellcaster
     * casts. Nothing for casting it rules out ("no ability to cast divine spells"), nor for an ability it uses
     * ("Ability to use lesser invocations": no spell).
     */
    protected castingRequirements(text: string): RequirementEntry[] {
      if (NO_CASTING.test(text)) return [];
      const spells = CASTING_SPELLS.exec(text);
      if (spells) {
        const level = spells[1] ? parseInt(spells[1], 10) : 1;
        const kind = spells[2]?.toLowerCase();
        return [kind ? gte(`spellcasting.${kind}`, level) : this.spellcastingOfEitherKind(level)];
      }
      return CASTING_ANY.test(text) ? [this.spellcastingOfEitherKind(1)] : [];
    }

    /** Arcane or divine spellcasting of `level` or higher. */
    protected spellcastingOfEitherKind(level: number): RequirementEntry {
      return or(gte("spellcasting.arcane", level), gte("spellcasting.divine", level));
    }
  }
  return ReadingCasting;
}
