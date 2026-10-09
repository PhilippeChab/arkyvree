/** What a ruleset's rules refuse a request as: the server answers each as it answers its own errors of that kind. */
export type Refusal = "conflict" | "invalid" | "not-found" | "unprocessable";

/** One thing a refusal says a character fails: the kind of check (`category`), what it's about, and why. */
export type RulesIssue = {
  category: string;
  entityName?: string;
  entityType?: string;
  message: string;
  requirementTree?: string;
};

/**
 * A request a ruleset's rules refuse: a weapon held in one hand that takes two, an aptitude the rules count on renamed,
 * a class level a plan names that the class doesn't have. The engine names the refusal, and what the character fails
 * (`issues`: a level's requirements, its pools) when it's invalid; the server answers it with its status (`toJson`).
 */
export default class RulesError extends Error {
  constructor(refusal: Refusal, message: string, issues?: RulesIssue[]) {
    super(message);
    this.name = "RulesError";
    this.refusal = refusal;
    this.issues = issues;
  }

  /** Refuses what a character fails, when it fails anything: its issues, their messages as the refusal's own. */
  static refuseIssues(issues: RulesIssue[]) {
    if (issues.length > 0) throw new RulesError("invalid", issues.map((issue) => issue.message).join("; "), issues);
  }

  readonly issues?: RulesIssue[];

  readonly refusal: Refusal;
}
