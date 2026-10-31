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
          // Another folder may: a script reads its tables by name
          "scripts/fresh/table.ts": 'import { getTableName } from "drizzle-orm";\nexport const name = getTableName;\n',
        },
        ["table-names"],
      ),
    ).toEqual([
      "table-names server/fresh/computed.ts",
      "table-names server/fresh/table.ts",
      "table-names server/fresh/table.ts",
      "table-names shared/fresh/table.ts",
    ]);
  });
});
