import type { Db } from "@/server/database/index.ts";
import { CharacterLevelFeats } from "@/server/repositories/index.ts";
import type { RulesetModuleOf } from "@/server/rulesets/RulesetFactory.ts";

/**
 * A level's selections checked for a save (`checkLevelSelections`), then its non-stackable feats against those the
 * character already has (`checkNotTaken`). The other levels' picks are read in the save's transaction, which sees the
 * levels a level-up has just written, and only when a feat that doesn't stack is submitted.
 */
export async function validateAndFetchLevelSelections(
  tx: Db,
  { levelUp }: RulesetModuleOf,
  params: Parameters<RulesetModuleOf["levelUp"]["checkLevelSelections"]>[0] & {
    otherLevels: { id: string; klassLevelId: string }[];
  },
) {
  const selections = levelUp.checkLevelSelections(params);
  if (selections.fetchedFeats.some((feat) => !feat.stackable)) {
    const picks = await CharacterLevelFeats.findMany(tx, {
      characterLevelIds: params.otherLevels.map((level) => level.id),
    });
    levelUp.checkNotTaken(
      selections.fetchedFeats,
      picks.map((pick) => pick.featId),
      params.otherLevels,
      selections.autoGrantedRecords,
      params.rulesetData,
    );
  }
  return selections;
}
