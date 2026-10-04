import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";

/**
 * Each character's classes, each at the highest level the character has in it: what a character card shows. Names come
 * from the character's composed ruleset, whose maps resolve stored pre-COW ids, so a copied or renamed class shows its
 * own name.
 */
export function getClassLevelsByCharacter(
  characters: { id: string; rulesetId: string }[],
  levels: { characterId: string; klassLevelId: string }[],
  rulesetDataByRulesetId: Map<string, CachedRulesetData>,
): Map<string, { klass: string; level: number }[]> {
  const levelsByCharacter = new Map<string, Map<string, number>>();
  for (const level of levels) {
    const char = characters.find((c) => c.id === level.characterId);
    if (!char) continue;
    const rulesetData = rulesetDataByRulesetId.get(char.rulesetId);
    if (!rulesetData) continue;
    const klassLevel = rulesetData.klassLevelsById.get(level.klassLevelId);
    if (!klassLevel) continue;
    const klass = rulesetData.klassesById.get(klassLevel.klassId);
    const klassName = klass?.name || "Unknown";
    let bucket = levelsByCharacter.get(level.characterId);
    if (!bucket) {
      bucket = new Map();
      levelsByCharacter.set(level.characterId, bucket);
    }
    const currentLevel = bucket.get(klassName) || 0;
    if (klassLevel.level > currentLevel) {
      bucket.set(klassName, klassLevel.level);
    }
  }
  return new Map(
    [...levelsByCharacter].map(([characterId, bucket]) => [
      characterId,
      [...bucket].map(([klass, level]) => ({ klass, level })),
    ]),
  );
}
