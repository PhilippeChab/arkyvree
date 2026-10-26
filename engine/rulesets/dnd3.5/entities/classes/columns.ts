import type { FormField } from "@/engine/core/fields/index.ts";
import type { ListDescription } from "@/engine/core/module/index.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import { DEFAULT_HIT_DIE, HIT_DIE_VALUES } from "@/vocabulary/dnd3.5/classes.ts";
import { CLASS_HD } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A 3.5 class's columns, as its form shows them beside its name and description: its hit die (`CLASS_HD`). */
export const CLASS_COLUMNS: FormField[] = [
  {
    default: DEFAULT_HIT_DIE,
    field: CLASS_HD,
    help: "The die each of the class's levels rolls for hit points",
    input: "choice",
    label: "Hit Die",
    labels: HIT_DIE_VALUES.map((die) => `d${die}`),
    multiple: false,
    options: HIT_DIE_VALUES,
    required: true,
  },
];

/**
 * A 3.5 class level's columns, after its fields: its base bonus to each of the ruleset's saves (its `baseBonus` links),
 * and the feats it grants, each through the aptitude it's taken for (its `grants` links).
 */
export const CLASS_LEVEL_COLUMNS: FormField[] = [
  {
    help: "The base bonus the level gives each save",
    input: "amounts",
    label: "Saves",
    max: RULESET_LIMITS.saveBase,
    min: 0,
    references: "saves",
    role: "baseBonus",
  },
  {
    help: "Select feats with aptitudes granted at this level",
    input: "grants",
    label: "Feats",
    references: "feats",
    role: "grants",
  },
];

/** A 3.5 class's list: its name, its hit die as dice notation writes it ("d10"), its description. */
export const CLASS_LIST: ListDescription = {
  nameShare: 25,
  columns: [
    {
      field: CLASS_HD,
      label: "Hit Die",
      labels: Object.fromEntries(HIT_DIE_VALUES.map((die) => [die, `d${die}`])),
      reads: "chip",
      share: 15,
    },
  ],
};
