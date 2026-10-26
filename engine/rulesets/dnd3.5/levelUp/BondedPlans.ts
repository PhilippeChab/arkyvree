import type { CharacterInput, ChildLevelsPlan, ChildrenPlan, NewChild } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import CharacterValues, {
  type Dnd35CharacterFieldsWrite,
  RACE_ROLE,
} from "@/engine/rulesets/dnd3.5/characters/CharacterValues.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import BondedRaceData from "@/engine/rulesets/dnd3.5/rules/BondedRaceData.ts";
import type Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Character } from "@/shared/relations.ts";
import { STARTING_ABILITY_SCORE } from "@/vocabulary/dnd3.5/abilities.ts";
import { BONDED_KIND_BY_SLUG, BONDED_KIND_SLUGS, type BondedKind } from "@/vocabulary/dnd3.5/bondedKinds.ts";
import { CHARACTER_ALIGNMENT, CHARACTER_GENDER, CHARACTER_XP } from "@/vocabulary/dnd3.5/fields/index.ts";

/** The levels a bonded creature has: its class's first `hitDice`. */
interface BondedLevels {
  classId: string;
  hitDice: number;
}

/**
 * What a master's bonded creature of a kind becomes once the master's levels change. Without a race for the kind, the
 * creature the master had goes (`removedId`). With one, the master keeps the creature of that race it has (`keptId`),
 * or one is made (`created`) in place of the one of another race it had; the creature kept or made has `levels`.
 */
type BondedCreaturePlan = { removedId?: string } & (
  | { created: NewChild; levels: BondedLevels }
  | { keptId: string; levels: BondedLevels }
  | { levels?: undefined }
);

/**
 * The master's (`master`, its row) creature of `kind` and `race`, named for it, with its stat block's scores (a cat's
 * Strength 3, a heavy warhorse's 18), 10 without one. It takes its master's alignment and gender, and has no experience
 * of its own: its levels follow its master's.
 */
function buildCreature(
  master: Character,
  kind: BondedKind,
  race: { id: string; name: string },
  abilities: Dnd35View["abilities"],
): NewChild {
  const stats = BondedRaceData.getStats(race.name);
  const own = CharacterValues.fieldsOf(master);
  return {
    links: {
      score: abilities.map((ability) => ({
        entityId: ability.id,
        amount: stats?.abilities[ability.name.toLowerCase() as keyof typeof stats.abilities] ?? STARTING_ABILITY_SCORE,
      })),
    },
    row: {
      kind,
      name: race.name,
      parentCharacterId: master.id,
      rulesetId: master.rulesetId,
      userId: master.userId,
      fields: {
        [CHARACTER_ALIGNMENT]: own[CHARACTER_ALIGNMENT],
        [CHARACTER_GENDER]: own[CHARACTER_GENDER],
        [CHARACTER_XP]: 0,
      } satisfies Dnd35CharacterFieldsWrite,
      links: { [RACE_ROLE]: race.id },
    },
  };
}

/** What a master's bonded creatures become as its levels make them. */
export default class BondedPlans {
  constructor(private readonly view: Pick<Dnd35View, "abilities" | "classes" | "classLevelsByClass" | "races">) {}

  /**
   * What the master's creature of `kind` becomes, from the one it has (`existing`): refused when the ruleset lacks the
   * race the master's levels pick for it, or the class it levels in. A creature it makes takes after its master's row
   * (`record`).
   */
  planBondedCreature(
    master: DetailedCharacter,
    record: Character,
    kind: BondedKind,
    existing: Pick<Character, "id" | "links"> | undefined,
  ): BondedCreaturePlan {
    const { view } = this;
    const raceName = master.components.bonded.getBondedRace(kind);
    if (!raceName) return { removedId: existing?.id };
    const race = view.races.find((r) => r.name === raceName && r.partition === kind);
    if (!race) throw new RulesError("invalid", `Bonded ${kind} race "${raceName}" not found in ruleset`);
    const { className } = BONDED_KIND_BY_SLUG[kind];
    const klass = view.classes.find((k) => k.name === className && k.partition === kind);
    if (!klass) throw new RulesError("invalid", `${className} class not found in ruleset — content seed missing`);
    // Each grant feat adds to bonded.<kind>.level by a template (a druid's `{{ [classes.druid.level] }}`, a ranger's
    // `{{ floor([classes.ranger.level] / 2) }}`): a class that gives a creature needs only a feat with its template
    const levels = { hitDice: Math.max(1, master.components.bonded.getBondedLevel(kind)), classId: klass.id };
    if (existing && existing.links[RACE_ROLE] === race.id) return { keptId: existing.id, levels };
    return { created: buildCreature(record, kind, race, view.abilities), levels, removedId: existing?.id };
  }

  /**
   * The levels a bonded creature takes or loses, from those it has (in the order it took them), to have its class's
   * first `hitDice`: its next ones, refused when the class lacks one, or its last ones. A level stores 1 hit point:
   * the creature's build gives it its hit points, from its master's or its hit dice.
   */
  planBondedLevels(levels: { id: string }[], { hitDice, classId }: BondedLevels): ChildLevelsPlan {
    const classLevelByLevel = new Map(
      (this.view.classLevelsByClass.get(classId) ?? []).map((classLevel) => [classLevel.position, classLevel]),
    );
    const added: ChildLevelsPlan["added"] = [];
    for (let level = levels.length + 1; level <= hitDice; level++) {
      const classLevel = classLevelByLevel.get(level);
      if (!classLevel)
        throw new RulesError("invalid", `Bonded class is missing level ${level} — content seed incomplete`);
      added.push({ trackId: classLevel.id, picks: [{ step: "hp", amount: 1 }] });
    }
    return { added, removedIds: levels.slice(hitDice).map((level) => level.id) };
  }

  /**
   * What a master's bonded creatures become as its levels make them, kind by kind, from the creatures it has (`bonded`,
   * each with its rows): the creature it had removed (`removedId`), and the one it keeps (`keptId`) or makes (`created`,
   * its row whole, after its master's, `record`) with the levels it takes or loses (`levels`: a new one has none yet).
   */
  planMasterCreatures(master: DetailedCharacter, record: Character, bonded: CharacterInput[]): ChildrenPlan {
    return {
      children: BONDED_KIND_SLUGS.map((kind) => {
        const existing = bonded.find((input) => input.record.kind === kind);
        const plan = this.planBondedCreature(master, record, kind, existing?.record);
        if (!plan.levels) return { kind, levels: undefined, removedId: plan.removedId };
        const levels = this.planBondedLevels("keptId" in plan ? (existing?.rows.advancements ?? []) : [], plan.levels);
        return { ...plan, kind, levels };
      }),
    };
  }
}
