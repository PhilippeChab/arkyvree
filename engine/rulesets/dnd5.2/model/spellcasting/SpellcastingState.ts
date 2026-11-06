import { CharacterComponent } from "@/engine/core/character/index.ts";
import type AbilitiesComponent from "@/engine/rulesets/dnd5.2/model/abilities/AbilitiesComponent.ts";
import type AptitudesComponent from "@/engine/rulesets/dnd5.2/model/aptitudes/AptitudesComponent.ts";
import type { AptitudeLevelData } from "@/engine/rulesets/dnd5.2/model/aptitudes/AptitudesComponent.ts";
import AptitudeTargets, { ALLOWED_ALL } from "@/engine/rulesets/dnd5.2/model/aptitudes/AptitudeTargets.ts";
import type ClassesComponent from "@/engine/rulesets/dnd5.2/model/classes/ClassesComponent.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd5.2/model/loading/DetailedCharacterDataLoader.ts";
import type { HeldSpell } from "@/engine/rulesets/dnd5.2/model/loading/loadedEntities.ts";
import type SpellGroupingsComponent from "@/engine/rulesets/dnd5.2/model/spells/SpellGroupingsComponent.ts";
import type SpellsComponent from "@/engine/rulesets/dnd5.2/model/spells/SpellsComponent.ts";
import type { Modifier } from "@/shared/relations.ts";
import type { CasterType } from "@/vocabulary/dnd5.2/classes.ts";
import { MULTICLASS_SPELL_SLOTS, PACT_MAGIC_SLOTS, SPELL_LEVELS } from "@/vocabulary/dnd5.2/spells.ts";

/**
 * What the `spellcasting` paths read, as the SRD 5.2.1's Multiclassing rules count it: the levels the character's
 * classes count toward its spell slots (`casterlevel`: a full caster's all, a half caster's half, rounded up), its spell
 * slots at each spell level by the Multiclass Spellcaster table (`slots`, by level from 1), the highest of them
 * (`highestslot`), and its warlock's Pact Magic slots (`pact`), apart.
 */
export interface CastingLevels {
  readonly casterlevel: number;
  readonly highestslot: number;
  readonly pact: { readonly level: number; readonly slots: number };
  readonly slots: Readonly<Record<string, number>>;
}

/** The spell lists a spell's tags read, and whether its list joins its class's. */
export interface SpellTagLists {
  aptitudeIds: string[];
  joinsClassList: boolean;
}

/**
 * A character's spellcasting's state, which its concerns read: its slots, counted when read off its classes' levels
 * and caster types, and the spells its lists know.
 */
export default abstract class SpellcastingState extends CharacterComponent<LoadedCharacterData> {
  constructor(
    protected readonly classes: ClassesComponent,
    protected readonly abilities: AbilitiesComponent,
    protected readonly aptitudes: AptitudesComponent,
    protected readonly spells: SpellsComponent,
    protected readonly spellGroupings: SpellGroupingsComponent,
  ) {
    super();
  }

  /** The character's slots and caster levels, counted when read, so a planned level counts. */
  protected readonly castingLevels: CastingLevels = (() => {
    const casterLevel = () => this.countCasterLevels();
    const pact = () => this.pactSlots();
    return {
      get casterlevel() {
        return casterLevel();
      },
      get highestslot() {
        return Math.max(0, ...Object.entries(this.slots).flatMap(([level, count]) => (count > 0 ? [+level] : [])));
      },
      get pact() {
        return pact();
      },
      get slots() {
        // A character with no caster level has every level's slots, none of them
        const row = MULTICLASS_SPELL_SLOTS[Math.min(casterLevel(), MULTICLASS_SPELL_SLOTS.length) - 1];
        return Object.fromEntries(SPELL_LEVELS.slice(1).map((level) => [String(level), row?.[level - 1] ?? 0]));
      },
    };
  })();

  protected allAptitudeSpells: Pick<HeldSpell, "entity" | "saveName" | "spellLevel" | "viaId">[] = [];

  protected casterTypeByClassId = new Map<string, CasterType>();

  protected classListsByClassId = new Map<string, Set<string>>();

  protected listIdsBySpell = new Map<string, string[]>();

  protected spellTagLists: Record<string, SpellTagLists> = {};

  protected spellTags: Record<string, string[]> = {};

  /**
   * The levels the character's classes count toward its spell slots, as the Multiclassing rules add them: all its levels
   * in its full casters' classes, and half its levels in its half casters' classes, together, rounded up.
   */
  private countCasterLevels(): number {
    const levels = { Full: 0, Half: 0 };
    for (const { klass, level } of Object.values(this.classes.getCharacterClasses())) {
      const casterType = this.casterTypeByClassId.get(klass.id);
      if (casterType === "Full" || casterType === "Half") levels[casterType] += level;
    }
    return levels.Full + Math.ceil(levels.Half / 2);
  }

  /** Its Pact Magic slots: its pact caster's (a warlock's), by its level, none without one. */
  private pactSlots(): { level: number; slots: number } {
    const pactLevel = Object.values(this.classes.getCharacterClasses()).reduce(
      (total, { klass, level }) => total + (this.casterTypeByClassId.get(klass.id) === "Pact" ? level : 0),
      0,
    );
    return PACT_MAGIC_SLOTS[Math.min(pactLevel, PACT_MAGIC_SLOTS.length) - 1] ?? { level: 0, slots: 0 };
  }

  /**
   * The class's list that knows every spell of a level (`spellLevel`), one of the class's lists whose level is set to
   * all its spells: a cleric's, a druid's, which prepare from their whole list.
   */
  protected classListKnowing(className: string, spellLevel: number | null) {
    if (spellLevel === null) return undefined;
    const aptitudes = this.aptitudes.getAptitudes();
    return this.spellListsOf(className).find((key) => {
      const level = (aptitudes[key] as Record<string, unknown> | undefined)?.[String(spellLevel)];
      return (level as AptitudeLevelData | undefined)?.allowed === ALLOWED_ALL;
    });
  }

  /** Each of the character's class levels' class, by the level's id. */
  protected classNameByClassLevelId() {
    const classNames = new Map<string, string>();
    for (const [className, classData] of Object.entries(this.classes.getCharacterClasses()))
      for (const level of classData.levels) classNames.set(level.classLevel.id, className);

    return classNames;
  }

  /**
   * The classes whose list a list joins (`aptitudes.<list>.joinsclasslist` set true), by the list's key: a feat's or a
   * class level's modifier joins its class's.
   */
  protected joiningClassNames(appliedModifiers: Modifier[]) {
    const aptitudes = this.aptitudes.getAptitudes() as Record<string, { joinsclasslist?: boolean }>;
    const classes = Object.entries(this.classes.getClasses());
    const classNameByClassLevelId = this.classNameByClassLevelId();
    const classOf = (modifier: Modifier) => {
      if (modifier.sourceType === "class-levels") return classNameByClassLevelId.get(modifier.sourceId);
      if (modifier.sourceType !== "feats") return undefined;
      return classes.find(([, classData]) =>
        classData.levels.some((level) => level.feats.some(({ entity }) => entity.id === modifier.sourceId)),
      )?.[0];
    };

    const joining = new Map<string, Set<string>>();
    for (const modifier of appliedModifiers) {
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

  /** A class's spell lists, by their keys. */
  protected spellListsOf(className: string): string[] {
    const classId = this.classes.getCharacterClasses()[className]?.klass.id;
    return [...((classId && this.classListsByClassId.get(classId)) || [])];
  }
}
