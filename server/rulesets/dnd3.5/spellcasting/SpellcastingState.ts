import type { RulesetData } from "@/engine/core/view/index.ts";
import type AbilitiesComponent from "@/server/rulesets/dnd3.5/abilities/AbilitiesComponent.ts";
import type AptitudesComponent from "@/server/rulesets/dnd3.5/aptitudes/AptitudesComponent.ts";
import { ALLOWED_ALL, type AptitudeLevelData } from "@/server/rulesets/dnd3.5/aptitudes/AptitudesComponent.ts";
import { parseAptitudeJoin } from "@/server/rulesets/dnd3.5/aptitudes/aptitudeTargets.ts";
import type ClassesComponent from "@/server/rulesets/dnd3.5/classes/ClassesComponent.ts";
import type PowerGroupingsComponent from "@/server/rulesets/dnd3.5/powers/PowerGroupingsComponent.ts";
import type PowersComponent from "@/server/rulesets/dnd3.5/powers/PowersComponent.ts";
import type ModifierEvaluator from "@/server/rulesets/engine/modifiers/ModifierEvaluator.ts";
import type { SpellTagLists } from "@/shared/dnd3.5/spellGroups.ts";
import type { KlassLevel, Modifier, Power, Property } from "@/shared/relations.ts";

import { collectClassLists } from "./spellLists.ts";

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

  /**
   * The highest arcane and divine spell levels the character casts (`spellcasting.arcane`, `spellcasting.divine`):
   * estimated from its spell slots' modifiers before modifiers apply, so requirements like Scribe Scroll's can read
   * them, then computed from its classes' slots after.
   */
  protected casterLevels = { arcane: 0, divine: 0 };

  /** Each class's spell lists, by its id (`loadClassLists`). */
  protected classListsByKlassId = new Map<string, Set<string>>();

  protected powerAptitudeLinks: { aptitudeId: string; powerId: string }[] = [];

  /** Where each spell tag shows, by its name. */
  protected spellTagLists: Record<string, SpellTagLists> = {};

  protected spellTags: Record<string, string[]> = {};

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
      const list = parseAptitudeJoin(modifier.target);
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

  /** Reads each class's spell lists off the ruleset, its levels' slots (`collectClassLists`): `spellListsOf`'s. */
  loadClassLists(rulesetData: Pick<RulesetData, "klassLevels" | "modifiersBySource">) {
    this.classListsByKlassId = collectClassLists(rulesetData);
  }
}
