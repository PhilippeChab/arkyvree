import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { lintRepo } from "./lintRepo.ts";

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

const lint = (files: Record<string, string>) => lintRepo(files, ["method-names"]);

describe("method-names", () => {
  test("a repository's public methods start with one of methodVerbs.json's verbs", () => {
    expect(
      lint({
        "server/repositories/Good.ts": `export class Good {
  findOne() {}
  existsByName() {}
  countUnread() {}
  createMany() {}
  markAllRead() {}
  lockById() {}
  protected where() {}
  private build() {}
  #own() {}
}
`,
        "server/repositories/concerns/Bad.ts":
          "export function Concern(Base) {\n  abstract class Concerned extends Base {\n    hasRows() {}\n  }\n  return Concerned;\n}\n",
        "server/repositories/Get.ts": "export class Get {\n  get = async () => 1;\n}\n",
      }),
    ).toEqual(["method-names server/repositories/Get.ts", "method-names server/repositories/concerns/Bad.ts"]);
  });

  test("a service reads with get, writes with its CRUD verbs, or takes an action", () => {
    expect(
      lint({
        "server/services/Good.ts": `class GoodService {
  getCampaign() {}
  addItem() {}
  hardDeleteCharacter() {}
  forkRuleset() {}
  private findOrphan() {}
}
export default new GoodService();
`,
        "server/services/Find.ts": "class FindService {\n  findOne() {}\n}\nexport default new FindService();\n",
        "server/services/Me.ts": "class MeService {\n  static me() {}\n}\nexport default new MeService();\n",
        "server/services/Field.ts":
          "import { tally } from './tally.ts';\nclass FieldService {\n  readonly tally = tally;\n  readonly getTally = tally;\n}\nexport default new FieldService();\n",
      }),
    ).toEqual([
      "method-names server/services/Field.ts",
      "method-names server/services/Find.ts",
      "method-names server/services/Me.ts",
    ]);
  });

  test("a policy checks with can or is, and builds one with for", () => {
    expect(
      lint({
        "server/services/policies/Good.ts":
          "export class GoodPolicy {\n  static for() {}\n  static isGameMaster() {}\n  canUpdate() {}\n  protected isOwner() {}\n}\n",
        "server/services/policies/Bad.ts": "export class BadPolicy {\n  static member() {}\n}\n",
      }),
    ).toEqual(["method-names server/services/policies/Bad.ts"]);
  });

  test("classes elsewhere name their methods freely", () => {
    expect(lint({ "server/rulesets/Engine.ts": "export class Engine {\n  compute() {}\n}\n" })).toEqual([]);
  });
});
