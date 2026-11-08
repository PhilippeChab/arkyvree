import {
  readChoiceOptions,
  readProficiencyFeats,
  readSkill,
  readTool,
} from "@/codegen/dnd5.2/tools/detect/proficiencies.ts";
import type { Choice } from "@/codegen/dnd5.2/tools/types/common.ts";
import type { ModifierSeed } from "@/content/core/builders/customization/types.ts";
import { classFeatures, classSkills, toolPicks } from "@/content/dnd5.2/builders/aptitudes/names.ts";
import { poolRoom } from "@/content/dnd5.2/builders/aptitudes/rooms.ts";
import { grantFeat } from "@/content/dnd5.2/builders/feats/possession.ts";
import type { FeatSeed } from "@/content/dnd5.2/builders/feats/types.ts";
import { SKILL_PROFICIENCIES_POOL } from "@/vocabulary/dnd5.2/feats.ts";
import { FEAT_SELECTABLE } from "@/vocabulary/dnd5.2/fields/index.ts";
import { SKILL_NAMES } from "@/vocabulary/dnd5.2/skills.ts";

import type { ClassEntries } from "./ClassEntries.ts";

/** A choice of proficiencies read: what it's of, the pool it's picked in, how many it picks, and its options. */
interface ReadChoice {
  kind: "skills" | "tools";
  options: string[];
  picks: number;
  pool: string;
}

/** A pool of tools a class or a background picks a proficiency among: its name and its tools. */
export interface ToolPicks {
  pool: string;
  tools: string[];
}

/**
 * A class's proficiencies as the feats a character gains with its first level in it: its starting proficiencies' (the
 * class its first: its saving throws, armor training, weapons and tools granted, and its skill and tool picks' rooms)
 * and its multiclass proficiencies' (the class one it multiclasses into: what the Multiclassing rules keep of them,
 * and a skill or a tool to pick where they give one). Its skill picks are among the skills its skill choice names (its
 * skills' pool, `classSkills`), its tool picks among the tools its tool choice names (its tools' pool, `toolPicks`).
 */
export class ClassProficiencies {
  constructor(
    private readonly entries: ClassEntries,
    private readonly tools: readonly string[],
  ) {}

  /** The feat of a class's proficiencies when a character multiclasses into it: "Fighter Multiclass Proficiencies". */
  static multiclassName(className: string): string {
    return `${className} Multiclass Proficiencies`;
  }

  /** The feat of a class's proficiencies when it's a character's first: "Fighter Starting Proficiencies". */
  static startingName(className: string): string {
    return `${className} Starting Proficiencies`;
  }

  /** `choices` read: each a skill choice (its class's skills' pool) or a tool choice (its tools' pool), else throws. */
  private choices(choices: readonly Choice[]): ReadChoice[] {
    const name = this.entries.name();
    return choices.map((choice) => {
      const names = readChoiceOptions(choice);
      const skills = names.flatMap((option) => readSkill(option) ?? []);
      const tools = names.flatMap((option) => readTool(option, this.tools) ?? []);
      // Any skill (a bard's): a room in the pool of every skill's proficiency, a skill a ruleset adds included
      if (names.length > 0 && skills.length === names.length && skills.length === SKILL_NAMES.length)
        return { kind: "skills", pool: SKILL_PROFICIENCIES_POOL, picks: choice.choose, options: [] };
      if (names.length > 0 && skills.length === names.length)
        return { kind: "skills", pool: classSkills(name), picks: choice.choose, options: skills };
      if (names.length > 0 && tools.length === names.length)
        return { kind: "tools", pool: toolPicks(name), picks: choice.choose, options: tools };
      throw new Error(`${name}: a choice of proficiencies is neither of skills nor of tools: ${choice.desc ?? ""}`);
    });
  }

  /**
   * A proficiencies' feat: the feats `proficiencies` are granted, and a room in each choice's pool. A multiclass's
   * choice of skills must be among its class's.
   */
  private proficienciesFeat(name: string, intro: string, proficiencies: string[], choices: ReadChoice[]): FeatSeed {
    const granted = proficiencies.flatMap((proficiency) => readProficiencyFeats(proficiency, this.tools));
    const modifiers: ModifierSeed[] = [
      ...granted.map((feat) => grantFeat(feat)),
      ...choices.map(({ pool, picks }) => poolRoom(pool, picks)),
    ];
    const picked = choices.map(({ kind, options, picks, pool }) =>
      pool === SKILL_PROFICIENCIES_POOL
        ? `${picks} skill${picks === 1 ? "" : "s"} of your choice`
        : `${picks} of the ${kind} ${options.join(", ")}`,
    );
    const gained = [...granted, ...picked];
    return {
      name,
      description: `${intro}: ${gained.length > 0 ? gained.join("; ") : "no proficiency"}.`,
      aptitudes: [classFeatures(this.entries.name())],
      ...(modifiers.length > 0 ? { modifiers } : {}),
      fields: { [FEAT_SELECTABLE]: false },
    };
  }

  /** The skills its skill picks are among, those its starting skill choice names. */
  classSkills(): string[] {
    const pool = classSkills(this.entries.name());
    return this.choices(this.entries.entry().proficiency_choices)
      .filter((choice) => choice.pool === pool)
      .flatMap(({ options }) => options);
  }

  /** The feat of the proficiencies a character multiclassing into the class gains with its first level in it. */
  multiclassFeat(): FeatSeed {
    const name = this.entries.name();
    const { proficiencies = [], proficiency_choices = [] } = this.entries.entry().multi_classing;
    const choices = this.choices(proficiency_choices);
    const skills = new Set(this.classSkills());
    const outside = choices.filter(({ pool }) => pool === classSkills(name)).flatMap(({ options }) => options);
    if (outside.some((skill) => !skills.has(skill))) throw new Error(`${name}: a multiclass skill isn't its class's`);
    return this.proficienciesFeat(
      ClassProficiencies.multiclassName(name),
      `What multiclassing into ${name} gives`,
      proficiencies.map(({ name: proficiency }) => proficiency),
      choices,
    );
  }

  /** The feat of the proficiencies a character gains with its first level, when the class is its first. */
  startingFeat(): FeatSeed {
    const name = this.entries.name();
    const { proficiencies, proficiency_choices } = this.entries.entry();
    return this.proficienciesFeat(
      ClassProficiencies.startingName(name),
      `What a ${name} starts with`,
      proficiencies.map(({ name: proficiency }) => proficiency),
      this.choices(proficiency_choices),
    );
  }

  /** The class's pool of tools to pick among, if it gives a tool pick: its choices' tools, its multiclass's among them. */
  toolPicks(): ToolPicks[] {
    const { multi_classing, proficiency_choices } = this.entries.entry();
    const choices = this.choices([...proficiency_choices, ...(multi_classing.proficiency_choices ?? [])]);
    const tools = [
      ...new Set(
        choices.filter(({ pool }) => pool !== classSkills(this.entries.name())).flatMap(({ options }) => options),
      ),
    ];
    return tools.length > 0 ? [{ pool: toolPicks(this.entries.name()), tools }] : [];
  }
}
