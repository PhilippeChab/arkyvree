import { describe, expect, test } from "bun:test";
import fs from "node:fs";

import { FLY_SECRETS, REQUIRED_IN_PRODUCTION } from "@/server/environment.ts";

describe("the environment", () => {
  test("docs/deployment.md's table lists exactly the variables set on Fly", () => {
    const doc = fs.readFileSync("docs/deployment.md", "utf8");
    const table = doc.slice(doc.indexOf("### Environment variables"), doc.indexOf("## Custom domain"));
    const listed = [...table.matchAll(/^\| (.+?) \|/gm)]
      .flatMap(([, cell]) => [...cell.matchAll(/`([A-Z0-9_]+)`/g)].map(([, name]) => name))
      .toSorted();
    expect(listed).toEqual([...FLY_SECRETS].toSorted());
  });

  test("what production requires is set on Fly", () => {
    const secrets = new Set<string>(FLY_SECRETS);
    expect(REQUIRED_IN_PRODUCTION.filter((name) => !secrets.has(name))).toEqual([]);
  });
});
