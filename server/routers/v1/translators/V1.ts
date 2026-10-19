import { toV1Character, toV1Characters } from "./characters.ts";
import { toLevelChoicesQuery, toV1LevelChoices } from "./levelChoices.ts";
import { toV1Classes, toV1Feats, toV1Races, toV1Ruleset, toV1Rulesets, toV1Skills, toV1Spells } from "./rulesets.ts";

/**
 * Version 1's translators, one per kind: from what a service answers to v1's shape, and from a v1 request to what a
 * service takes (`levelChoicesQuery`). Each is typed by the service it reads, so an answer that changes inside the app
 * stops its translator compiling until v1's shape is kept. A new version copies the last, replacing only what changed
 * (`const V2 = { ...V1, character: … }`), and v1 keeps working untouched.
 */
export const V1 = {
  character: toV1Character,
  characters: toV1Characters,
  classes: toV1Classes,
  feats: toV1Feats,
  levelChoices: toV1LevelChoices,
  levelChoicesQuery: toLevelChoicesQuery,
  races: toV1Races,
  ruleset: toV1Ruleset,
  rulesets: toV1Rulesets,
  skills: toV1Skills,
  spells: toV1Spells,
};
