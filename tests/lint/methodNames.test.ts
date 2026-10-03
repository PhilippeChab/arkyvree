import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { lintRepo } from "./lintRepo.ts";

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

const lint = (files: Record<string, string>) => lintRepo(files, ["method-names"]);

describe("method-names", () => {
  test("a repository's public methods start with one of methodVerbs.json's verbs", async () => {
    expect(
      await lint({
        "server/repositories/Good.ts": `export class Good {
  findOne() {}
  existsWithName() {}
  countUnread() {}
  createMany() {}
  markRead() {}
  lock() {}
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

  test("a repository method never names a filter: filters go in its where", async () => {
    expect(
      await lint({
        "server/repositories/Good.ts":
          "export class Good {\n  findOneWithBlob() {}\n  countPerRuleset() {}\n  findPage() {}\n  private findByIds() {}\n}\n",
        "server/repositories/By.ts": "export class By {\n  findManyByUser() {}\n}\n",
        "server/repositories/All.ts": "export class All {\n  archiveAllForUser() {}\n}\n",
        "server/repositories/In.ts": "export class In {\n  existsInCampaign() {}\n}\n",
      }),
    ).toEqual([
      "method-names server/repositories/All.ts",
      "method-names server/repositories/By.ts",
      "method-names server/repositories/In.ts",
    ]);
  });

  test("a service reads with get, writes with its CRUD verbs, or takes an action", async () => {
    expect(
      await lint({
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

  test("a service method names its resource, never an id lookup or the session's scope", async () => {
    expect(
      await lint({
        "server/services/Good.ts":
          "class GoodService {\n  getCampaign() {}\n  signIn() {}\n  markAllRead() {}\n}\nexport default new GoodService();\n",
        "server/services/ById.ts":
          "class ByIdService {\n  getCampaignById() {}\n}\nexport default new ByIdService();\n",
        "server/services/My.ts": "class MyService {\n  getMyStats() {}\n}\nexport default new MyService();\n",
      }),
    ).toEqual(["method-names server/services/ById.ts", "method-names server/services/My.ts"]);
  });

  test("a policy checks with can or is, and builds one with for", async () => {
    expect(
      await lint({
        "server/services/policies/Good.ts":
          "export class GoodPolicy {\n  static for() {}\n  static isGameMaster() {}\n  canUpdate() {}\n  protected isOwner() {}\n}\n",
        "server/services/policies/Bad.ts": "export class BadPolicy {\n  static member() {}\n}\n",
      }),
    ).toEqual(["method-names server/services/policies/Bad.ts"]);
  });

  test("classes elsewhere name their methods freely", async () => {
    expect(await lint({ "server/rulesets/Engine.ts": "export class Engine {\n  compute() {}\n}\n" })).toEqual([]);
  });
});
