/** What the level-up part's `describe*` operations answer in a shape every ruleset shares: the wizard's steps. */

/** A level-up wizard's step, as its ruleset lists it: its name, which the ruleset answers the step by, and its label. */
export interface WizardStep<N extends string = string> {
  label: string;
  name: N;
}
