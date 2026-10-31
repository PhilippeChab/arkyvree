import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { lintRepo } from "./lintRepo.ts";

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("a table's name", () => {
  test("is read nowhere in the server and shared/, imported, through a namespace or a computed member", async () => {
    expect(
      await lintRepo(
        {
          "server/fresh/table.ts": 'import { getTableName } from "drizzle-orm";\nexport const name = getTableName;\n',
          "shared/fresh/table.ts": 'import * as orm from "drizzle-orm";\nexport const name = orm.getTableName;\n',
          "server/fresh/computed.ts": 'import * as orm from "drizzle-orm";\nexport const name = orm["getTableName"];\n',
          "server/fresh/template.ts": 'import * as orm from "drizzle-orm";\nexport const name = orm[`getTableName`];\n',
          "server/fresh/aliased.ts":
            'import { getTableName as tableOf } from "drizzle-orm";\nexport const name = tableOf;\n',
          "server/fresh/shorthand.ts":
            'import * as orm from "drizzle-orm";\nconst { getTableName } = orm;\nexport const name = getTableName;\n',
          "shared/fresh/keyed.ts":
            'import * as orm from "drizzle-orm";\nconst { "getTableName": tableOf } = orm;\nexport const name = tableOf;\n',
          // A key that reads nothing: an object's, and a plain string
          "server/fresh/object.ts": 'export const names = { "getTableName": 1, label: "getTableName" };\n',
          // Another folder may: a script reads its tables by name
          "scripts/fresh/table.ts": 'import { getTableName } from "drizzle-orm";\nexport const name = getTableName;\n',
        },
        ["table-names"],
      ),
    ).toEqual([
      "table-names server/fresh/aliased.ts",
      "table-names server/fresh/computed.ts",
      "table-names server/fresh/shorthand.ts",
      "table-names server/fresh/shorthand.ts",
      "table-names server/fresh/table.ts",
      "table-names server/fresh/table.ts",
      "table-names server/fresh/template.ts",
      "table-names shared/fresh/keyed.ts",
      "table-names shared/fresh/table.ts",
    ]);
  });
});
