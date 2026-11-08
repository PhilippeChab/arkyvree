import {
  readAbility,
  readChoiceOptions,
  readProficiencyFeats,
  readSkill,
  readTool,
} from "@/codegen/dnd5.2/tools/detect/proficiencies.ts";
import type { BackgroundEntry, BackgroundReference } from "@/codegen/dnd5.2/tools/types/backgrounds.ts";
import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import { backgroundAbilityScores, toolPicks } from "@/content/dnd5.2/builders/aptitudes/names.ts";
import { poolRoom } from "@/content/dnd5.2/builders/aptitudes/rooms.ts";
import type { BackgroundSeed } from "@/content/dnd5.2/builders/backgrounds/types.ts";
import { grantFeat } from "@/content/dnd5.2/builders/feats/possession.ts";
import type { FeatSeed } from "@/content/dnd5.2/builders/feats/types.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { stripSeparators } from "@/shared/text.ts";
import { BACKGROUND_ABILITY_INCREASES } from "@/vocabulary/dnd5.2/backgrounds.ts";
import { FEAT_FAMILY, FEAT_GENERATED } from "@/vocabulary/dnd5.2/fields/index.ts";

import type { ToolPicks } from "./classes/ClassProficiencies.ts";

/** A spread of a background's increases over its abilities: each ability it raises, and by how much. */
type Spread = [ability: string, amount: number][];

/** The ways `abilities` (a background's three) take its increases: +2 and +1 to two of them (6), +1 to each (1). */
function spreads(abilities: string[]): Spread[] {
  return BACKGROUND_ABILITY_INCREASES.flatMap((amounts): Spread[] =>
    amounts.length === abilities.length
      ? [abilities.map((ability, index): [string, number] => [ability, amounts[index]])]
      : abilities.flatMap((first) =>
          abilities
            .filter((second) => second !== first)
            .map((second): Spread => [
              [first, amounts[0]],
              [second, amounts[1]],
            ]),
        ),
  );
}

/**
 * A background reference's seeds (`seeds`): each background's description (its three abilities named) and its
 * modifiers (its Origin feat granted, one of a family's for the choice it's taken with: "Magic Initiate (Cleric)"; its
 * skills and its tool granted, or a room in its tools' pool when it gives a choice of them; a room in its ability
 * scores' pool), and the feats of that pool (`feats`), its seven ways to spread its increases, each a feat ("Acolyte:
 * Intelligence +2, Wisdom +1").
 */
export class BackgroundSeeds {
  constructor(
    readonly ref: BackgroundReference,
    private readonly tools: readonly string[],
  ) {}

  /** Each background's entry, as its override corrects it (the Sage's Magic Initiate). */
  private entries(): BackgroundEntry[] {
    return this.ref.raw.map((entry) => ({ ...entry, ...this.ref.overrides?.[entry.name] }));
  }

  /** A background's Origin feat, by name: the variant of the choice it's taken with ("Magic Initiate (Cleric)"). */
  private originFeat({ feat }: BackgroundEntry): string {
    return feat.note ? `${feat.name} (${feat.note})` : feat.name;
  }

  /** A background's tool choices' tools: none for a background that grants its tool. */
  private toolOptions({ name, proficiency_choices = [] }: BackgroundEntry): string[] {
    return proficiency_choices.flatMap((choice) =>
      readChoiceOptions(choice).map((option) => {
        const tool = readTool(option, this.tools);
        if (!tool) throw new Error(`${name}: a choice of "${option}", which no tool is`);
        return tool;
      }),
    );
  }

  /** The feats of its backgrounds' ability scores' pools: each background's seven ways to spread its increases. */
  feats(): FeatSeed[] {
    return this.entries().flatMap((entry) => {
      const abilities = entry.ability_scores.map(({ name }) => readAbility(name));
      return spreads(abilities).map((spread) => ({
        name: `${entry.name}: ${spread.map(([ability, amount]) => `${ability} +${amount}`).join(", ")}`,
        description: `${spread.map(([ability, amount]) => `+${amount} ${ability}`).join(", ")} (20 at most).`,
        aptitudes: [backgroundAbilityScores(entry.name)],
        modifiers: spread.map(([ability, amount]) => bonus(`abilities.${stripSeparators(ability)}.misc`, amount)),
        fields: { [FEAT_GENERATED]: true, [FEAT_FAMILY]: ["Background Ability Scores"] },
      }));
    });
  }

  /** Its backgrounds' seeds: each one's description and modifiers. */
  seeds(): BackgroundSeed[] {
    return this.entries().map((entry) => {
      const granted = entry.proficiencies.flatMap(({ name }) => readProficiencyFeats(name, this.tools));
      const choices = entry.proficiency_choices ?? [];
      const equipment = entry.equipment_options.flatMap((option) =>
        isRecord(option) && typeof option.desc === "string" ? [`Equipment: ${option.desc}.`] : [],
      );
      const abilities = entry.ability_scores.map(({ name }) => readAbility(name));
      const skills = entry.proficiencies.flatMap(({ name }) => readSkill(name) ?? []);
      const tools = [
        ...entry.proficiencies.flatMap(({ name }) => readTool(name, this.tools) ?? []),
        ...choices.map(({ desc }) => desc ?? ""),
      ];
      return {
        name: entry.name,
        description: [
          `Ability Scores: ${abilities.join(", ")}.`,
          `Feat: ${this.originFeat(entry)}.`,
          `Skill Proficiencies: ${skills.join(" and ")}.`,
          `Tool Proficiency: ${tools.join(", ")}.`,
          ...equipment,
        ].join("\n"),
        modifiers: [
          grantFeat(this.originFeat(entry)),
          ...granted.map((feat) => grantFeat(feat)),
          ...choices.map(({ choose }) => poolRoom(toolPicks(entry.name), choose)),
          poolRoom(backgroundAbilityScores(entry.name), 1),
        ],
      };
    });
  }

  /** The tools its backgrounds' tool picks are among, by the pool they're picked in (a soldier's Gaming Set). */
  toolPicks(): ToolPicks[] {
    return this.entries().flatMap((entry) => {
      const tools = this.toolOptions(entry);
      return tools.length > 0 ? [{ pool: toolPicks(entry.name), tools }] : [];
    });
  }
}
