import type { DetailedCharacterInterface } from "@/engine/core/module/index.ts";
import { buildCharacter } from "@/server/builds/index.ts";
import { db } from "@/server/database/index.ts";
import { Characters, Visibility } from "@/server/repositories/index.ts";
import type { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { BONDED_KIND_SLUGS, type BondedKind } from "@/shared/dnd3.5/bondedKinds.ts";
import type { Character } from "@/shared/relations.ts";

export type BondedEntry = { detailed: DetailedCharacterInterface; record: Character };

export async function loadBondedByKind(
  rulesetModule: Awaited<ReturnType<typeof RulesetFactory.fromRulesetId>>,
  masterId: string,
): Promise<Partial<Record<BondedKind, BondedEntry>>> {
  const out: Partial<Record<BondedKind, BondedEntry>> = {};
  for (const kind of BONDED_KIND_SLUGS) {
    const record = await Characters.findOne(
      db,
      {
        parentCharacterId: masterId,
        kind,
      },
      Visibility.All,
    );
    if (!record) continue;
    const detailed = await buildCharacter(rulesetModule, record, { kind });
    out[kind] = { record, detailed };
  }
  return out;
}
