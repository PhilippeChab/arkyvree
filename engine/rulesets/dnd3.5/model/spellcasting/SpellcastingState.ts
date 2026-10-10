import type ModifierEvaluator from "@/engine/core/modifiers/ModifierEvaluator.ts";
import type AbilitiesComponent from "@/engine/rulesets/dnd3.5/model/abilities/AbilitiesComponent.ts";
import type AptitudesComponent from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudesComponent.ts";
import { ALLOWED_ALL, type AptitudeLevelData } from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudesComponent.ts";
import AptitudeTargets from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";
import type ClassesComponent from "@/engine/rulesets/dnd3.5/model/classes/ClassesComponent.ts";
import type PowerGroupingsComponent from "@/engine/rulesets/dnd3.5/model/powers/PowerGroupingsComponent.ts";
import type PowersComponent from "@/engine/rulesets/dnd3.5/model/powers/PowersComponent.ts";
import type { KlassLevel, Modifier, Power, Property } from "@/shared/relations.ts";
import { MAX_SPELL_LEVEL } from "@/vocabulary/dnd3.5/spells.ts";

/**
 * Where a feat's tag on the spells of a list it gives slots in or joins to its class's list shows (a cleric's domain,
 * "Fire Domain"; a specialist wizard's school, "Evocation Specialist"): on that list and on the lists of the class whose
 * level gave the feat. `joinsClassList`: whether the list's spells join that class's list, as a domain's do.
 */
export interface SpellTagLists {
  aptitudeIds: string[];
  joinsClassList: boolean;
}

/** What a character's spellcasting holds: its bonus caster levels, its aptitudes' powers, its spell tags. */
export default abstract class SpellcastingState {
  constructor(
    protected readonly classes: ClassesComponent,
    protected readonly abilities: AbilitiesComponent,
    protected readonly aptitudes: AptitudesComponent,
    protected readonly powers: PowersComponent,
    protected readonly powerGroupings: PowerGroupingsComponent,
    protected readonly modifierEvaluator: ModifierEvaluator,
  ) {}

  /**
   * The highest arcane and divine spell levels the character casts (`spellcasting.arcane`, `spellcasting.divine`),
   * counted when read from its classes' slots: as the slot modifiers have given them so far, so requirements like Scribe
   * Scroll's read what the character casts when they're checked.
   */
  protected readonly casterLevels = (() => {
    const highest = (casterType: "Arcane" | "Divine") => this.highestSpellLevel(casterType);
    return {
      get arcane() {
        return highest("Arcane");
      },
      get divine() {
        return highest("Divine");
      },
    };
  })();

  protected allAptitudePowers: Array<
    Power & {
      aptitudeId: string;
      powerLevel: number | null;
      saveName: string | null;
    }
  > = [];

  protected aptitudePowerProperties: Property[] = [];

  /** Maps bonus klass level ID → granting source name (e.g. "Stormlord Level 1") */
  protected bonusKlassLevelAttribution = new Map<string, string>();

  protected bonusKlassLevelClassMap = new Map<string, string>();

  protected bonusKlassLevelModifiers: Modifier[] = [];

  protected bonusKlassLevels: KlassLevel[] = [];

  /** Each class's caster type, by its id: a class casting neither has none. */
  protected casterTypeByKlassId = new Map<string, "Arcane" | "Divine">();

  /** Each class's spell lists, by its id (`initialize`). */
  protected classListsByKlassId = new Map<string, Set<string>>();

  protected powerAptitudeLinks: { aptitudeId: string; powerId: string }[] = [];

  /** Where each spell tag shows, by its name. */
  protected spellTagLists: Record<string, SpellTagLists> = {};

  protected spellTags: Record<string, string[]> = {};

  /** The highest spell level any of the classes of a caster type has slots at, in any of its lists. */
  private highestSpellLevel(casterType: "Arcane" | "Divine"): number {
    const aptitudes = this.aptitudes.getAptitudes();
    let highest = 0;
    for (const [className, klassData] of Object.entries(this.classes.getCharacterClasses())) {
      if (this.casterTypeByKlassId.get(klassData.klass.id) !== casterType) continue;
      for (const key of this.spellListsOf(className)) {
        const aptitude = aptitudes[key] as Record<string, unknown> | undefined;
        if (!aptitude || !this.aptitudes.isLeveledAptitude(key)) continue;
        for (let spellLevel = MAX_SPELL_LEVEL; spellLevel > highest; spellLevel--) {
          const levelData = aptitude[String(spellLevel)] as AptitudeLevelData | undefined;
          if (levelData && levelData.allowed !== 0) {
            highest = spellLevel;
            break;
          }
        }
      }
    }
    return highest;
  }

  /**
   * A class's list that knows every spell of a spell level (`allowed` all known), if one does: where the spells of a
   * list joining it go.
   */
  protected classListKnowing(className: string, spellLevel: number | null) {
    if (spellLevel === null) return undefined;
    const aptitudes = this.aptitudes.getAptitudes();
    return this.spellListsOf(className).find((key) => {
      const level = (aptitudes[key] as Record<string, unknown> | undefined)?.[String(spellLevel)];
      return (level as AptitudeLevelData | undefined)?.allowed === ALLOWED_ALL;
    });
  }

  /** The class of each of the character's class levels. */
  protected classNameByKlassLevelId() {
    const classNames = new Map<string, string>();
    for (const [className, klassData] of Object.entries(this.classes.getCharacterClasses()))
      for (const level of klassData.levels) classNames.set(level.klassLevel.id, className);

    return classNames;
  }

  /**
   * The classes each spell list joins (`aptitudes.<list>.joinsclasslist`), by list: the class whose level gave the feat
   * that joins it, or the class level's own class. A cleric's domain joins the cleric's list.
   */
  protected joiningClassNames() {
    const aptitudes = this.aptitudes.getAptitudes() as Record<string, { joinsclasslist?: boolean }>;
    const classes = Object.entries(this.classes.getClasses());
    const classNameByKlassLevelId = this.classNameByKlassLevelId();
    const classOf = (modifier: Modifier) => {
      if (modifier.sourceType === "klass_levels")
        return classNameByKlassLevelId.get(modifier.sourceId) ?? this.bonusKlassLevelClassMap.get(modifier.sourceId);

      if (modifier.sourceType !== "feats") return undefined;
      return classes.find(([, klassData]) =>
        klassData.levels.some((level) => level.feats.some((feat) => feat.id === modifier.sourceId)),
      )?.[0];
    };

    const joining = new Map<string, Set<string>>();
    for (const modifier of this.modifierEvaluator.getModifiers().appliedModifiers) {
      const list = AptitudeTargets.parseJoin(modifier.target);
      if (list === undefined || aptitudes[list]?.joinsclasslist !== true || modifier.value === "false") continue;
      const className = classOf(modifier);
      if (!className) continue;
      const classNames = joining.get(list) ?? new Set<string>();
      classNames.add(className);
      joining.set(list, classNames);
    }
    return joining;
  }

  /**
   * A class's spell lists: those its levels give slots in, the levels the character hasn't taken included (a paladin's
   * before his fourth); a pious templar's paladin and blackguard lists, the slots of the one she didn't pick gated out.
   * None for a class without slots.
   */
  protected spellListsOf(className: string): string[] {
    const klassId = this.classes.getCharacterClasses()[className]?.klass.id;
    return [...((klassId && this.classListsByKlassId.get(klassId)) || [])];
  }
}
