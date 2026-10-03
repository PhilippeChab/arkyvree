import type DetailedCharacterAbilities from "@/server/rulesets/universal/DetailedCharacterAbilities.ts";
import type DetailedCharacterAptitudes from "@/server/rulesets/universal/DetailedCharacterAptitudes.ts";
import type DetailedCharacterClasses from "@/server/rulesets/universal/DetailedCharacterClasses.ts";
import type DetailedCharacterModifiers from "@/server/rulesets/universal/DetailedCharacterModifiers.ts";
import type DetailedCharacterPowerGroupings from "@/server/rulesets/universal/DetailedCharacterPowerGroupings.ts";
import type DetailedCharacterPowers from "@/server/rulesets/universal/DetailedCharacterPowers.ts";
import type { KlassLevel, Modifier, Power, Property } from "@/shared/relations.ts";

/** What a character's spellcasting holds: its bonus caster levels, its aptitudes' powers, its spell tags. */
export default abstract class SpellcastingState {
  constructor(
    protected readonly classes: DetailedCharacterClasses,
    protected readonly abilities: DetailedCharacterAbilities,
    protected readonly aptitudes: DetailedCharacterAptitudes,
    protected readonly characterPowers: DetailedCharacterPowers,
    protected readonly powerGroupings: DetailedCharacterPowerGroupings,
    protected readonly characterModifiers: DetailedCharacterModifiers,
  ) {}

  // Bonus caster level state
  protected bonusKlassLevelClassMap = new Map<string, string>();

  protected bonusKlassLevelModifiers: Modifier[] = [];

  protected bonusKlassLevels: KlassLevel[] = [];

  /** Maps bonus klass level ID → granting source name (e.g. "Stormlord Level 1") */
  protected bonusKlassLevelAttribution = new Map<string, string>();

  // Aptitude power data
  protected allAptitudePowers: Array<
    Power & {
      aptitudeId: string;
      powerLevel: number | null;
      saveName: string | null;
    }
  > = [];

  protected aptitudePowerProperties: Property[] = [];

  protected powerAptitudeLinks: { powerId: string; aptitudeId: string }[] = [];

  // Spell tags
  protected spellTags: Record<string, string[]> = {};
}
