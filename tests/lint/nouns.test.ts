import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { lintRepo } from "./lintRepo.ts";

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("a ruleset's nouns", () => {
  test("are named in its folders alone: by a name, a string, a text or a file's name, never by a comment", async () => {
    expect(
      await lintRepo(
        {
          "engine/core/fresh/name.ts": "export const klassLevelId = 1;\n",
          "engine/core/fresh/string.ts": 'export const type = "klass_levels";\n',
          "engine/core/fresh/stored.ts": 'export const type = "classes";\n',
          "engine/core/fresh/save.ts": "export const read = (row: { saveId: string }) => row.saveId;\n",
          "engine/core/fresh/points.ts": "export const hitPoints = 1;\n",
          "engine/core/fresh/regex.ts": "export const isPick = (name: string) => /feat/.test(name);\n",
          "engine/core/fresh/numbered.ts": "export const feat2 = 1;\n",
          "engine/core/fresh/imported.ts": 'import { Aptitude } from "./x.ts";\nexport const x = Aptitude;\n',
          "engine/core/fresh/Feats.ts": "export const kinds = 1;\n",
          "client/src/fresh/text.tsx": "export const t = <p>Pick a spell</p>;\n",
          "client/src/fresh/program.tsx": "export const t = <p>A file PCGen saved</p>;\n",
          "engine/core/fresh/kind.ts": 'export const isHeld = (type: string) => type === "items";\n',
          "engine/core/fresh/registry.ts":
            'import type { ViewKinds } from "./x.ts";\nexport type Held = ViewKinds["mechanics"];\n',
          "server/fresh/held.ts": "export const key = (kind: string) => `${kind}` === `items`;\n",
          // A kind's stored name where it can only be a kind: handed to a call, in a list, a property's value, a case, a
          // record's key
          "engine/core/fresh/call.ts": 'export const read = (byId: (type: string) => number) => byId("items");\n',
          "engine/core/fresh/includes.ts": 'export const held = (types: string[]) => types.includes("mechanics");\n',
          "engine/core/fresh/value.ts": 'export const query = { type: "items" };\n',
          "engine/core/fresh/list.ts": 'export const kinds = ["mechanics"];\n',
          "engine/core/fresh/case.ts":
            'export const isHeld = (type: string) => {\n  switch (type) {\n    case "items":\n      return true;\n    default:\n      return false;\n  }\n};\n',
          "engine/core/fresh/record.ts": 'export type Held = Record<"items", number>;\n',
          // A page's items, by name, by a type's key, a property's key, a computed member, an `in` test or a key's type
          "client/src/fresh/picked.ts":
            'interface Page { items: string[]; total: number }\nexport type Items = Pick<Page, "items">;\nexport type Rest = Omit<Page, "items">;\n',
          "client/src/fresh/keyed.ts":
            'export const page = { "items": [1] };\nexport const read = (p: Record<string, unknown>) => p["items"];\nexport const has = (p: object) => "items" in p;\n',
          "client/src/fresh/keyof.ts": 'interface Page { items: string[] }\nexport const key: keyof Page = "items";\n',
          "client/src/fresh/page.ts":
            'interface Page { items: string[] }\nexport type Item = Page["items"][number];\nexport const read = (page: Page) => page.items;\n',
          "server/fresh/template.ts": "export const t = (id: string) => `/powers/${id}`;\n",
          // The engine's own words, and English's
          "engine/core/fresh/generic.ts": "export const track = (pool: string, step: string) => `${pool}:${step}`;\n",
          "engine/core/fresh/verbs.ts": "export const onSave = () => Promise.race([]);\n",
          "client/src/fresh/saving.tsx": "export const s = <p>Saving changes</p>;\n",
          "client/src/fresh/css.tsx": 'export const c = <div className="class" />;\n',
          "engine/core/fresh/comment.ts": "// A class level's feats, as 3.5 names them\nexport const rows = 1;\n",
          // A ruleset's folders name them
          "engine/rulesets/dnd3.5/fresh/Feats.ts": "export const klassLevelId = 1;\n",
          "content/dnd3.5/fresh/powers.ts": 'export const type = "powers";\n',
        },
        ["ruleset-nouns"],
      ),
    ).toEqual([
      "ruleset-nouns client/src/fresh/program.tsx",
      "ruleset-nouns client/src/fresh/text.tsx",
      "ruleset-nouns engine/core/fresh/Feats.ts",
      "ruleset-nouns engine/core/fresh/call.ts",
      "ruleset-nouns engine/core/fresh/case.ts",
      "ruleset-nouns engine/core/fresh/imported.ts",
      "ruleset-nouns engine/core/fresh/imported.ts",
      "ruleset-nouns engine/core/fresh/includes.ts",
      "ruleset-nouns engine/core/fresh/kind.ts",
      "ruleset-nouns engine/core/fresh/list.ts",
      "ruleset-nouns engine/core/fresh/name.ts",
      "ruleset-nouns engine/core/fresh/numbered.ts",
      "ruleset-nouns engine/core/fresh/points.ts",
      "ruleset-nouns engine/core/fresh/record.ts",
      "ruleset-nouns engine/core/fresh/regex.ts",
      "ruleset-nouns engine/core/fresh/registry.ts",
      "ruleset-nouns engine/core/fresh/save.ts",
      "ruleset-nouns engine/core/fresh/save.ts",
      "ruleset-nouns engine/core/fresh/stored.ts",
      "ruleset-nouns engine/core/fresh/string.ts",
      "ruleset-nouns engine/core/fresh/value.ts",
      "ruleset-nouns server/fresh/held.ts",
      "ruleset-nouns server/fresh/template.ts",
    ]);
  });
});
