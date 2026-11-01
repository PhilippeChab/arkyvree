import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { RulesService } from "@/server/services/rules/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";

import { type createKeyedApi, expectOk } from "./api.ts";
import { uniqueId } from "./seed.ts";

/** An item of a new character's form's `fields` section, as the rules lay it out. */
interface FormItem {
  key?: string;
  kind: string;
  min?: number;
  options?: (number | string)[];
  role?: string;
  start?: number;
}

/** A key's client, as `createKeyedApi` makes it. */
type KeyedApi = Awaited<ReturnType<typeof createKeyedApi>>["api"];

/** What `GET /v1/rules` answers of one base rules. */
export type V1Rules = Awaited<ReturnType<typeof readRulesOf>>;

/** The first of the rules' kinds that `matches`, refused when none does: what a test needs its rules to have. */
export function findKind(rules: V1Rules, matches: (kind: V1Rules["kinds"][number]) => boolean) {
  const kind = rules.kinds.find(matches);
  if (!kind) throw new Error("The rules have no kind a test needs");
  return kind;
}

/** A new character of `userId`'s on the seeded base ruleset, made as its rules' form lays it out (`createFormCharacter`). */
export async function createBaseCharacter(userId: string, name?: string) {
  return await createFormCharacter(userId, (await findSeededBase()).id, name);
}

/** `userId`'s private fork of a base ruleset, as the app forks one: subscribed to its extensions with `extensions`. */
export async function createFork(userId: string, rulesetId: string, { extensions = false } = {}) {
  const session = { userId };
  const fork = await RulesetsService.forkRuleset(session, rulesetId, { name: `Fork ${uniqueId()}`, private: true });
  if (extensions) {
    const extensionIds = (await Rulesets.findMany(db, { system: true }))
      .filter((ruleset) => ruleset.kind === "extension" && ruleset.rulesetId === rulesetId)
      .map(({ id }) => id);
    await RulesetExtensionsService.subscribeExtension(session, fork.id, extensionIds);
  }
  return fork;
}

/**
 * A new character of `userId`'s on a ruleset, made as its rules' form lays it out, whatever its base rules: each field
 * its form's start or first option, each pick its first eligible option, each score its start.
 */
export async function createFormCharacter(userId: string, rulesetId: string, name = `Character ${uniqueId()}`) {
  const session = { userId };
  const ruleset = await Rulesets.findOne(db, { id: rulesetId });
  if (!ruleset) throw new Error(`No ruleset ${rulesetId}`);
  const form = RulesService.getRules()[ruleset.baseRules].characterForm;
  const items = form.sections.flatMap((section) => (section.kind === "fields" ? section.lines.flat() : []));

  const fields: Record<string, number | string> = {};
  for (const item of items as FormItem[]) {
    if (!item.key || item.kind === "textarea") continue;
    if (item.kind === "number") fields[item.key] = item.start ?? item.min ?? 1;
    else if (item.kind === "select" && item.options?.[0] !== undefined) fields[item.key] = item.options[0];
    else if (item.kind === "text") fields[item.key] = "Test";
  }

  const picks: Record<string, string> = {};
  const narrowing = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, String(value)]));
  for (const { role } of (items as FormItem[]).filter((item) => item.kind === "pick")) {
    const page = { limit: 50, page: 1 };
    const options = await CharactersService.getCreationOptions(session, rulesetId, role!, narrowing, {}, page);
    const option = options.items.find(({ eligible }) => eligible);
    if (!option) throw new Error(`No eligible option for the creation pick ${role}`);
    picks[role!] = option.id;
  }

  const scores: Record<string, Record<string, number>> = {};
  for (const section of form.sections) {
    if (section.kind !== "scores") continue;
    const creation = await CharactersService.getCreation(session, rulesetId, section.role);
    scores[section.role] = Object.fromEntries(creation.entities.map(({ id }) => [id, creation.scores.start]));
  }

  return await CharactersService.createCharacter(session, {
    fields,
    name,
    picks,
    rulesetId,
    scores,
  });
}

/**
 * A base ruleset the seed installs, read through the key's client: v1's tests run on whichever base rules it is,
 * reading their names from `GET /v1/rules`.
 */
export async function findBaseRuleset(api: KeyedApi) {
  const { items } = await expectOk(api.v1.rulesets.$get({ query: { scope: "base" } }));
  if (!items[0]) throw new Error("No base ruleset is seeded");
  return items[0];
}

/** The key's user's character that `matches`, of a page of theirs, refused when none does. */
export async function findCharacter(api: KeyedApi, matches: (card: { id: string }) => boolean = () => true) {
  const { items } = await expectOk(api.v1.characters.$get({ query: { limit: "50" } }));
  const card = items.find(matches);
  if (!card) throw new Error("The user has no character a test needs");
  return card;
}

/**
 * A target path of a ruleset a modifier may add a number to, as its completions offer it (every path at once): one that
 * names a single target, no wildcard.
 */
export async function findNumberTarget(api: KeyedApi, rulesetId: string) {
  const completions = api.v1.rulesets[":id"].customization.target.paths.completions;
  const json = { flat: true, kind: "modifier" as const, limit: 100, partialPath: "", position: 0 };
  const { items } = await expectOk(completions.$post({ json, param: { id: rulesetId } }));
  const target = (items as { operators?: string[]; path?: string; valueType?: string }[]).find(
    ({ operators, path, valueType }) => valueType === "number" && operators?.includes("add") && !path?.includes("*"),
  );
  if (!target?.path) throw new Error("The ruleset has no target path a modifier adds a number to");
  return target.path;
}

/** The base ruleset the seed installs, as stored: v1's tests run on whichever base rules it is. */
export async function findSeededBase() {
  const base = (await Rulesets.findMany(db, { system: true })).find(
    ({ kind, rulesetId }) => kind === "ruleset" && !rulesetId,
  );
  if (!base) throw new Error("No base ruleset is seeded");
  return base;
}

/** A page of a kind's entities in a ruleset, through the key's client. */
export async function listEntities(api: KeyedApi, rulesetId: string, kind: string, query: Record<string, string> = {}) {
  const entities = api.v1.rulesets[":id"].entities[":kind"];
  return (await expectOk(entities.$get({ param: { id: rulesetId, kind }, query }))).items;
}

/**
 * A character's first level, planned from what the API offers: the plan step's first eligible track, each value step's
 * average, and nothing picked, chosen or spent in the others, which a forced save takes.
 */
export async function planFirstLevel(api: KeyedApi, characterId: string) {
  const character = api.v1.characters[":id"];
  const param = { id: characterId };
  const { steps } = await expectOk(character.levels.steps.$get({ param, query: {} }));
  const planned = steps.find(({ mechanic }) => mechanic === "plan");
  if (!planned) throw new Error("The level has no plan step");
  const step = { ...param, step: planned.name };
  const options = await expectOk(
    character["level-plan"].options[":step"].$post({ json: { plan: { steps: {} } }, param: step, query: {} }),
  );
  const track = options.items.find(({ eligible }) => eligible);
  if (!track) throw new Error("The plan step has no eligible track");

  const tracked = { [planned.name]: [{ position: 1, track: track.id }] };
  const answer = await expectOk(character["level-plan"].$post({ json: { steps: tracked }, param }));
  const payloads = steps.map(({ mechanic, name }) => {
    const answered = answer.steps[name];
    if (mechanic === "plan") return [name, tracked[planned.name]!] as const;
    if (answered?.mechanic === "value") return [name, answered.advancements.map(({ average }) => average)] as const;
    if (mechanic === "choose") return [name, [[]]] as const;
    return [name, []] as const;
  });
  return { steps: Object.fromEntries(payloads), track };
}

/** A ruleset's base rules' description, as `GET /v1/rules` answers it. */
export async function readRulesOf(api: KeyedApi, rulesetId: string) {
  const { baseRules } = await expectOk(api.v1.rulesets[":id"].$get({ param: { id: rulesetId } }));
  const rules = (await expectOk(api.v1.rules.$get()))[baseRules];
  if (!rules) throw new Error(`No rules for ${baseRules}`);
  return rules;
}
