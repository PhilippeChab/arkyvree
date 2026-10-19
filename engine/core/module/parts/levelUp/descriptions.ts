/**
 * What the level-up part's operations answer in a shape every ruleset shares: the wizard's steps, and a character's
 * choices at its next level, opened whole.
 */

import type { OpenedPicker, PickFilters } from "@/engine/core/module/pickers.ts";
import type { Klass } from "@/shared/relations.ts";

/** A pool with room left at a level, and its picker: what fills the room. */
interface OpenedPool<Option> {
  picker: OpenedPicker<PickFilters, { id: string }, Option>;
  pool: { id: string; name: string };
  room: number;
}

/**
 * A character's choices at its next level, opened whole (`openLevelChoices`): the class picker, and the level the
 * query plans when it names its class (`level`): its steps as its ruleset describes them (`steps`), and a picker for
 * each pool with room left at it, a feat pool's (`featPools`) and a power pool's, at each power level with room left
 * of a pool that counts them by level (`powerPools`). The server reads each picker's options whole.
 */
export interface OpenedLevelChoices<Steps, ClassOption, FeatOption, PowerOption> {
  classPicker: OpenedPicker<{ kind: string }, Klass, ClassOption>;
  level: {
    featPools: OpenedPool<FeatOption>[];
    powerPools: (OpenedPool<PowerOption> & { powerLevel?: number })[];
    steps: Steps;
  } | null;
}

/** A level-up wizard's step, as its ruleset lists it: its name, which the ruleset answers the step by, and its label. */
export interface WizardStep<N extends string = string> {
  label: string;
  name: N;
}
