/** What the level-up part's `describe*` operations answer in a shape every ruleset shares: the wizard's steps. */

/**
 * A level-up wizard's step, as its ruleset lists it: its name, its kind, which the ruleset answers the step by, and its
 * label.
 */
export interface WizardStep<N extends LevelStepKind = LevelStepKind> {
  label: string;
  name: N;
}

/**
 * The kinds of step the generic level wizard shows, each its step's name: an ability increase (`abilities`), points
 * spent over a list (`skills`), and picks in pools, of feats (`feats`) and of powers by level (`powers`). A ruleset lists
 * those its levels take, each answering in its kind's shape; one whose step no kind covers adds a kind.
 */
export type LevelStepKind = "abilities" | "feats" | "powers" | "skills";
