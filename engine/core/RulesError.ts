/** What a ruleset's rules refuse a request as: the server answers each as it answers its own errors of that kind. */
export type Refusal = "conflict" | "invalid" | "unprocessable";

/**
 * A request a ruleset's rules refuse: a weapon held in one hand that takes two, an aptitude the rules count on renamed.
 * The engine names the refusal; the server answers it with its status (`toJson`).
 */
export default class RulesError extends Error {
  constructor(refusal: Refusal, message: string) {
    super(message);
    this.name = "RulesError";
    this.refusal = refusal;
  }

  readonly refusal: Refusal;
}
