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
import type { MulticlassSlots } from "@/vocabulary/dnd5.2/classes.ts";
import { MULTICLASS_SPELL_SLOTS, SPELL_LEVELS } from "@/vocabulary/dnd5.2/spells.ts";

/**
 * What the `spellcasting` paths read, as the SRD 5.2.1 counts it: the levels the character's classes count toward the
 * Multiclass Spellcaster table (`casterlevel`: all a class's whose levels all count, half those whose half do, rounded
 * up together), its spell slots at each spell level (`slots`, by level from 1: its one casting class's own, its levels'
 * on its list, or the Multiclass Spellcaster table's once it casts from several), the highest of them (`highestslot`),
 * and its Pact Magic slots and their level (`pact`), apart, which a warlock's levels add.
 */
export interface CastingLevels {
  readonly casterlevel: number;
  readonly highestslot: number;
  pact: { level: number; slots: number };
  readonly slots: Readonly<Record<string, number>>;
}

/** The spell lists a spell's tags read, and whether its list joins its class's. */
export interface SpellTagLists {
  aptitudeIds: string[];
  joinsClassList: boolean;
}

/**
 * A character's spellcasting's state, which its concerns read: its slots, counted when read off its classes' levels,
 * and the spells its lists know.
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

  /**
   * The character's slots and caster levels, counted when read, so a planned level counts; and its Pact Magic, which its
   * modifiers add to (a warlock's levels').
   */
  protected readonly castingLevels: CastingLevels = (() => {
    const casterLevel = () => this.countCasterLevels();
    const slots = () => this.countSlots();
    return {
      get casterlevel() {
        return casterLevel();
      },
      get highestslot() {
        return Math.max(0, ...Object.entries(this.slots).flatMap(([level, count]) => (count > 0 ? [+level] : [])));
      },
      pact: { level: 0, slots: 0 },
      get slots() {
        return slots();
      },
    };
  })();

  protected allAptitudeSpells: Pick<HeldSpell, "entity" | "saveName" | "spellLevel" | "viaId">[] = [];

  protected classListsByClassId = new Map<string, Set<string>>();

  protected listIdsBySpell = new Map<string, string[]>();

  /** How each class's levels count toward a multiclass's slots, by the class's id: its field's. */
  protected multiclassSlotsByClassId = new Map<string, MulticlassSlots>();

  protected spellTagLists: Record<string, SpellTagLists> = {};

  protected spellTags: Record<string, string[]> = {};

  /**
   * The character's classes that cast spells, each by its name with its level, its own slots and how its levels count
   * toward a multiclass's slots (its field's, `MULTICLASS_SLOTS`): those whose spell lists hold a slot, their levels' or
   * a modifier's, whatever their field says. A homebrew caster with the field's default casts as the SRD's do.
   */
  private castingClasses() {
    return Object.entries(this.classes.getCharacterClasses()).flatMap(([className, { klass, level }]) => {
      const slots = this.ownSlotsOf(className);
      if (!Object.values(slots).some((count) => count > 0)) return [];
      return [{ className, counted: this.multiclassSlotsByClassId.get(klass.id), level, slots }];
    });
  }

  /**
   * The levels the character's casting classes count toward the Multiclass Spellcaster table, as the Multiclassing rules
   * add them: all the levels of each class whose levels all count, and half the levels of those whose half do, together,
   * rounded up.
   */
  private countCasterLevels(casting = this.castingClasses()): number {
    let all = 0;
    let half = 0;
    for (const { counted, level } of casting) {
      if (counted === "All its levels") all += level;
      else if (counted === "Half its levels") half += level;
    }
    return all + Math.ceil(half / 2);
  }

  /**
   * The character's spell slots by spell level, from the 1st. Casting from one class whose levels count (the SRD's
   * "follow the rules for that class"), that class's own; from several, the Multiclass Spellcaster table's at the levels
   * they count. A casting class whose levels don't count keeps its own slots beside them.
   */
  private countSlots(): Record<string, number> {
    const casting = this.castingClasses();
    const sharing = casting.filter(({ counted }) => counted === "All its levels" || counted === "Half its levels");
    const shared = sharing.length > 1;
    const slots = Object.fromEntries(SPELL_LEVELS.slice(1).map((level) => [String(level), 0]));
    if (shared) {
      const row = MULTICLASS_SPELL_SLOTS[Math.min(this.countCasterLevels(sharing), MULTICLASS_SPELL_SLOTS.length) - 1];
      for (const level of SPELL_LEVELS.slice(1)) slots[String(level)] += row?.[level - 1] ?? 0;
    }
    for (const klass of casting) {
      if (shared && sharing.includes(klass)) continue;
      for (const [level, count] of Object.entries(klass.slots)) slots[level] += count;
    }
    return slots;
  }

  /**
   * A class's own spell slots by spell level, from the 1st (`className`): what its spell lists' spell levels hold, its
   * levels' slots and what the character's modifiers add (`aptitudes.<list>.<level>.uses`).
   */
  private ownSlotsOf(className: string): Record<string, number> {
    const aptitudes = this.aptitudes.getAptitudes();
    const slots = Object.fromEntries(SPELL_LEVELS.slice(1).map((level) => [String(level), 0]));
    for (const key of this.spellListsOf(className)) {
      const list = aptitudes[key] as Record<string, unknown> | undefined;
      for (const level of Object.keys(slots))
        slots[level] += (list?.[level] as AptitudeLevelData | undefined)?.uses ?? 0;
    }
    return slots;
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
