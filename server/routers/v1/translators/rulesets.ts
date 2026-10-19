/** A ruleset and its content as v1 answers them: what each is, named, without the database's timestamps. */

import type { ClassesService } from "@/server/services/rulesets/classes/index.ts";
import type { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import type { RulesetsService } from "@/server/services/rulesets/index.ts";
import type { PowersService } from "@/server/services/rulesets/powers/index.ts";
import type { RacesService } from "@/server/services/rulesets/races/index.ts";
import type { SkillsService } from "@/server/services/rulesets/skills/index.ts";

/** A class of a ruleset's. */
interface V1Class {
  description: string | null;
  hitDie: number;
  id: string;
  kind: string;
  name: string;
}

/** A feat of a ruleset's: the pools it's picked in (a class's bonus feats, General) among them. */
interface V1Feat {
  description: string | null;
  id: string;
  name: string;
  pools: { id: string; name: string }[];
  selectable: boolean;
  stackable: boolean;
}

/** A page of a ruleset's things, as v1 answers it. */
interface V1Page<T> {
  items: T[];
  nextPage: number | null;
  page: number;
}

/** A race of a ruleset's. */
interface V1Race {
  description: string | null;
  id: string;
  kind: string;
  name: string;
  size: string;
  speed: number;
}

/** A skill of a ruleset's. */
interface V1Skill {
  description: string | null;
  id: string;
  name: string;
  usableUntrained: boolean;
}

/** A spell of a ruleset's: the lists it's on, each at its level. */
interface V1Spell {
  description: string | null;
  id: string;
  lists: { id: string; level: number | null; name: string }[];
  name: string;
}

/** What a service's page answers: its items, its page and the next one. */
type PageOf<F extends (...args: never[]) => Promise<{ items: unknown[] }>> = Awaited<ReturnType<F>>;

/** A ruleset, as the app's own API answers it. */
type Ruleset = Awaited<ReturnType<typeof RulesetsService.getRuleset>>;

/** A ruleset in a list, as the app's own API answers it. */
type RulesetListItem = PageOf<typeof RulesetsService.getRulesets>["items"][number];

/** A ruleset as v1 answers it. */
export interface V1Ruleset {
  baseRules: string;
  description: string;
  extensionIds: string[];
  id: string;
  kind: string;
  name: string;
  parentId: string | null;
  private: boolean;
  status: string;
  system: boolean;
}

/** A page of a service's, its items each as `toItem` answers it. */
function toPage<T, R>(
  { items, nextPage, page }: { items: T[]; nextPage?: number; page: number },
  toItem: (item: T) => R,
): V1Page<R> {
  return { items: items.map(toItem), nextPage: nextPage ?? null, page };
}

/** A page of a ruleset's classes. */
export function toV1Classes(page: PageOf<typeof ClassesService.getClasses>) {
  return toPage(page, ({ description, hd, id, kind, name }): V1Class => ({
    description,
    hitDie: hd,
    id,
    kind,
    name,
  }));
}

/** A page of a ruleset's feats. */
export function toV1Feats(page: PageOf<typeof FeatsService.getFeats>) {
  return toPage(page, (feat): V1Feat => ({
    description: feat.description,
    id: feat.id,
    name: feat.name,
    pools: feat.featsAptitudesInRules.map(({ aptitudesInRule }) => ({
      id: aptitudesInRule.id,
      name: aptitudesInRule.name,
    })),
    selectable: feat.selectable,
    stackable: feat.stackable,
  }));
}

/** A page of a ruleset's races. */
export function toV1Races(page: PageOf<typeof RacesService.getRaces>) {
  return toPage(page, ({ baseSpeed, description, id, kind, name, size }): V1Race => ({
    description,
    id,
    kind,
    name,
    size,
    speed: baseSpeed,
  }));
}

/** A ruleset, in a list or on its own, as v1 answers it. */
export function toV1Ruleset(ruleset: Ruleset | RulesetListItem): V1Ruleset {
  return {
    baseRules: ruleset.baseRules,
    description: ruleset.description,
    extensionIds: ruleset.extensionRulesetIds,
    id: ruleset.id,
    kind: ruleset.kind,
    name: ruleset.name,
    parentId: ruleset.rulesetId,
    private: ruleset.private,
    status: ruleset.status,
    system: ruleset.system,
  };
}

/** A page of rulesets. */
export function toV1Rulesets(page: PageOf<typeof RulesetsService.getRulesets>) {
  return toPage(page, toV1Ruleset);
}

/** A page of a ruleset's skills. */
export function toV1Skills(page: PageOf<typeof SkillsService.getSkills>) {
  return toPage(page, ({ description, id, name, usableWithoutTraining }): V1Skill => ({
    description,
    id,
    name,
    usableUntrained: usableWithoutTraining,
  }));
}

/** A page of a ruleset's spells. */
export function toV1Spells(page: PageOf<typeof PowersService.getPowers>) {
  return toPage(page, (spell): V1Spell => ({
    description: spell.description,
    id: spell.id,
    lists: spell.powersAptitudesInRules.map(({ aptitudesInRule, level }) => ({
      id: aptitudesInRule.id,
      level,
      name: aptitudesInRule.name,
    })),
    name: spell.name,
  }));
}
