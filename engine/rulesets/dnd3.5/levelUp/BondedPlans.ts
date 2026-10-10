import type { BondedLevelsPlan, BondedPlan, CharacterInput, NewBondedCreature } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import BondedRaceData from "@/engine/rulesets/dnd3.5/model/bonded/BondedRaceData.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { BONDED_KIND_BY_SLUG, BONDED_KIND_SLUGS, type BondedKind } from "@/shared/dnd3.5/bondedKinds.ts";
import type { Character } from "@/shared/relations.ts";

/**
 * What a master's bonded creature of a kind becomes once the master's levels change. Without a race for the kind, the
 * creature the master had goes (`removedId`). With one, the master keeps the creature of that race it has (`keptId`),
 * or one is made (`created`) in place of the one of another race it had; the creature kept or made has `levels`.
 */
type BondedCreaturePlan = { removedId?: string } & (
  | { created: NewBondedCreature; levels: BondedLevels }
  | { keptId: string; levels: BondedLevels }
  | { levels?: undefined }
);

/** The levels a bonded creature has: its class's first `hitDice`. */
interface BondedLevels {
  hitDice: number;
  klassId: string;
}

/**
 * The master's (`master`, its row) creature of `kind` and `race`, named for it, with its stat block's scores (a cat's
 * Strength 3, a heavy warhorse's 18), 10 without one. It takes its master's alignment and gender, and has no experience
 * of its own: its levels follow its master's.
 */
function buildCreature(
  master: Character,
  kind: BondedKind,
  race: { id: string; name: string },
  abilities: RulesetData["abilities"],
): NewBondedCreature {
  const stats = BondedRaceData.getStats(race.name);
  return {
    abilities: abilities.map((ability) => ({
      abilityId: ability.id,
      score: stats?.abilities[ability.name.toLowerCase() as keyof typeof stats.abilities] ?? 10,
    })),
    row: {
      alignment: master.alignment,
      gender: master.gender,
      kind,
      name: race.name,
      parentCharacterId: master.id,
      raceId: race.id,
      rulesetId: master.rulesetId,
      userId: master.userId,
      xp: 0,
    },
  };
}

/** What a master's bonded creatures become as its levels make them. */
export default class BondedPlans {
  constructor(
    private readonly rulesetData: Pick<RulesetData, "abilities" | "klasses" | "klassLevelsByKlass" | "races">,
  ) {}

  /**
   * What the master's creature of `kind` becomes, from the one it has (`existing`): refused when the ruleset lacks the
   * race the master's levels pick for it, or the class it levels in. A creature it makes takes after its master's row
   * (`record`).
   */
  planBondedCreature(
    master: DetailedCharacter,
    record: Character,
    kind: BondedKind,
    existing: { id: string; raceId: string } | undefined,
  ): BondedCreaturePlan {
    const { rulesetData } = this;
    const raceName = master.components.bonded.getBondedRace(kind);
    if (!raceName) return { removedId: existing?.id };
    const race = rulesetData.races.find((r) => r.name === raceName && r.kind === kind);
    if (!race) throw new RulesError("invalid", `Bonded ${kind} race "${raceName}" not found in ruleset`);
    const { className } = BONDED_KIND_BY_SLUG[kind];
    const klass = rulesetData.klasses.find((k) => k.name === className && k.kind === kind);
    if (!klass) throw new RulesError("invalid", `${className} class not found in ruleset — content seed missing`);
    // Each grant feat adds to bonded.<kind>.level by a template (a druid's `{{ [classes.druid.level] }}`, a ranger's
    // `{{ floor([classes.ranger.level] / 2) }}`): a class that gives a creature needs only a feat with its template
    const levels = { hitDice: Math.max(1, master.components.bonded.getBondedLevel(kind)), klassId: klass.id };
    if (existing?.raceId === race.id) return { keptId: existing.id, levels };
    return { created: buildCreature(record, kind, race, rulesetData.abilities), levels, removedId: existing?.id };
  }

  /**
   * The levels a bonded creature takes or loses, from those it has (in the order it took them), to have its class's
   * first `hitDice`: its next ones, refused when the class lacks one, or its last ones. A level stores 1 hit point:
   * the creature's build gives it its hit points, from its master's or its hit dice.
   */
  planBondedLevels(levels: { id: string }[], { hitDice, klassId }: BondedLevels): BondedLevelsPlan {
    const klassLevelByLevel = new Map(
      (this.rulesetData.klassLevelsByKlass.get(klassId) ?? []).map((klassLevel) => [klassLevel.level, klassLevel]),
    );
    const added: BondedLevelsPlan["added"] = [];
    for (let level = levels.length + 1; level <= hitDice; level++) {
      const klassLevel = klassLevelByLevel.get(level);
      if (!klassLevel)
        throw new RulesError("invalid", `Bonded class is missing level ${level} — content seed incomplete`);
      added.push({ hp: 1, klassLevelId: klassLevel.id });
    }
    return { added, removedIds: levels.slice(hitDice).map((level) => level.id) };
  }

  /**
   * What a master's bonded creatures become as its levels make them, kind by kind, from the creatures it has (`bonded`,
   * each with its rows): the creature it had removed (`removedId`), and the one it keeps (`keptId`) or makes (`created`,
   * its row whole, after its master's, `record`) with the levels it takes or loses (`levels`: a new one has none yet).
   */
  planMasterCreatures(master: DetailedCharacter, record: Character, bonded: CharacterInput[]): BondedPlan[] {
    return BONDED_KIND_SLUGS.map((kind) => {
      const existing = bonded.find((input) => input.record.kind === kind);
      const plan = this.planBondedCreature(master, record, kind, existing?.record);
      if (!plan.levels) return { kind, levels: undefined, removedId: plan.removedId };
      const levels = this.planBondedLevels("keptId" in plan ? (existing?.rows.levels ?? []) : [], plan.levels);
      return { ...plan, kind, levels };
    });
  }
}
