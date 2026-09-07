import { eq } from "drizzle-orm";
import { characterAbilitiesInCharacter, charactersInCharacter } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { BadRequestError, NotFoundError } from "@/server/errors/index.ts";
import {
  CharacterLevels,
  Characters,
} from "@/server/repositories/index.ts";
import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type Dnd35DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";
import { getBondedRaceStats } from "@/server/rulesets/dnd3.5/bondedRaceData.ts";
import { purgeAttachmentsForRecords } from "@/server/services/AttachmentsService.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow.ts";
import { BONDED_CLASS_NAME_BY_KIND, BONDED_KIND_SLUGS, type BondedKind } from "@/shared/dnd3.5/bondedKinds.ts";
import type { Character } from "@/shared/relations.ts";

export type { BondedKind };
export const BONDED_KINDS = BONDED_KIND_SLUGS;

export async function reconcileAllBondedKinds(
  tx: Db,
  masterRecord: Character,
  detailedMaster: Dnd35DetailedCharacter,
  rulesetData: CachedRulesetData,
): Promise<void> {
  for (const kind of BONDED_KINDS) {
    await reconcileBonded(tx, masterRecord, kind, detailedMaster, rulesetData);
  }
}

export async function reconcileBonded(
  tx: Db,
  masterRecord: Character,
  kind: BondedKind,
  detailedMaster: Dnd35DetailedCharacter,
  rulesetData: CachedRulesetData,
): Promise<void> {
  const className = BONDED_CLASS_NAME_BY_KIND[kind];
  const targetRaceName = detailedMaster
    .getDetailedCharacterBonds()
    .getBondedRace(kind);

  // SELECT … FOR UPDATE on the master serializes concurrent reconciles for
  // the same character — without it, two overlapping finalizeLevelUp /
  // updateLevel transactions both observe "no existing bonded" and both
  // INSERT, leaking an orphan row. The partial unique index on
  // (parent_character_id, kind) is the backstop for any path that skips
  // this helper.
  //
  // Reading deletedAt under the lock catches the archive-vs-reconcile race:
  // an outer transaction may have captured `masterRecord` as alive, then
  // blocked here while a concurrent archiveCharacter ran. Without this
  // check we'd insert a fresh live bonded under a now-archived master
  // (the cascade already ran), leaving an orphan visible only by deep link.
  const [lockedMaster] = await tx
    .select({ id: charactersInCharacter.id, deletedAt: charactersInCharacter.deletedAt })
    .from(charactersInCharacter)
    .where(eq(charactersInCharacter.id, masterRecord.id))
    .for("update");
  if (!lockedMaster || lockedMaster.deletedAt !== null) return;

  const existing = await Characters.findOne(tx, {
    parentCharacterId: masterRecord.id,
    kind,
  });

  if (!targetRaceName) {
    if (existing) {
      await purgeAttachmentsForRecords(tx, "Character", [existing.id]);
      await Characters.delete(tx, { id: existing.id });
    }
    return;
  }

  const targetRace = rulesetData.races.find((r) => r.name === targetRaceName && r.kind === kind);
  if (!targetRace) {
    throw new BadRequestError(
      `Bonded ${kind} race "${targetRaceName}" not found in ruleset`,
    );
  }

  const bondedKlass = rulesetData.klasses.find((k) => k.name === className && k.kind === kind);
  if (!bondedKlass) {
    throw new BadRequestError(
      `${className} class not found in ruleset — content seed missing`,
    );
  }

  const targetHD = computeBondedTargetHD(kind, detailedMaster);

  if (existing && existing.raceId === targetRace.id) {
    await syncBondedLevels(tx, existing.id, bondedKlass.id, targetHD, rulesetData);
    return;
  }

  if (existing) {
    await purgeAttachmentsForRecords(tx, "Character", [existing.id]);
    await Characters.delete(tx, { id: existing.id });
  }

  const bondedId = await createBonded(
    tx,
    masterRecord,
    kind,
    targetRace.id,
    targetRaceName,
    rulesetData,
  );
  await syncBondedLevels(tx, bondedId, bondedKlass.id, targetHD, rulesetData);
}

function computeBondedTargetHD(
  kind: BondedKind,
  detailedMaster: Dnd35DetailedCharacter,
): number {
  // Each grant feat writes its contribution to bonded.<kind>.level via a
  // template modifier (e.g. Druid → `{{ [classes.druid.level] }}`, Ranger →
  // `{{ floor([classes.ranger.level] / 2) }}`). Adding a new contributor
  // class needs only a feat with the right template — no change here.
  return Math.max(1, detailedMaster.getDetailedCharacterBonds().getBondedLevel(kind));
}

export async function reconcileBondedForCharacter(
  tx: Db,
  characterId: string,
): Promise<void> {
  const master = await Characters.findOne(tx, { id: characterId });
  if (!master) throw new NotFoundError(`Character ${characterId} not found`);
  if (master.kind !== "pc") return;

  await withRulesetScope(tx, master.rulesetId, async ({ ruleset, rulesetData }) => {
    const module = RulesetFactory.fromBaseRules(ruleset.baseRules);
    const detailed = module.createDetailedCharacter(master) as Dnd35DetailedCharacter;
    await detailed.build(tx, undefined, { ruleset, cowData: rulesetData.cow, rulesetData });
    await reconcileAllBondedKinds(tx, master, detailed, rulesetData);
  });
}

async function createBonded(
  tx: Db,
  master: Character,
  kind: BondedKind,
  raceId: string,
  raceName: string,
  rulesetData: CachedRulesetData,
): Promise<string> {
  const inserted = await Characters.create(tx, {
    userId: master.userId,
    rulesetId: master.rulesetId,
    raceId,
    kind,
    parentCharacterId: master.id,
    name: raceName,
    alignment: master.alignment,
    gender: master.gender,
    xp: 0,
  });
  const bonded = inserted[0];

  // Seed ability scores from the SRD stat block (Cat str=3, Heavy Warhorse
  // str=18, etc.). Falls back to 10 if no stat block exists for the race.
  const raceStats = getBondedRaceStats(raceName);
  await tx.insert(characterAbilitiesInCharacter).values(
    rulesetData.abilities.map((ability) => ({
      characterId: bonded.id,
      abilityId: ability.id,
      score: raceStats?.abilities[ability.name.toLowerCase() as keyof typeof raceStats.abilities] ?? 10,
    })),
  );

  return bonded.id;
}

async function syncBondedLevels(
  tx: Db,
  bondedId: string,
  bondedKlassId: string,
  targetHD: number,
  rulesetData: CachedRulesetData,
): Promise<void> {
  const existingLevels = await CharacterLevels.findMany(tx, {
    characterId: bondedId,
  });
  const currentHD = existingLevels.length;

  if (currentHD === targetHD) return;

  if (currentHD < targetHD) {
    const klassLevels = rulesetData.klassLevelsByKlassId.get(bondedKlassId) ?? [];
    const klassLevelByLevel = new Map(klassLevels.map((kl) => [kl.level, kl]));
    for (let lv = currentHD + 1; lv <= targetHD; lv++) {
      const kl = klassLevelByLevel.get(lv);
      if (!kl) {
        throw new BadRequestError(
          `Bonded class is missing level ${lv} — content seed incomplete`,
        );
      }
      await CharacterLevels.create(tx, {
        characterId: bondedId,
        klassLevelId: kl.id,
        hp: 1,
        abilityId: null,
      });
    }
    return;
  }

  const sorted = [...existingLevels].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  for (let i = 0; i < currentHD - targetHD; i++) {
    await CharacterLevels.delete(tx, { id: sorted[i].id });
  }
}
