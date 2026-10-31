import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { lintRepo } from "./lintRepo.ts";

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("a ruleset's nouns", () => {
  test("are named in its folders alone: by a name, a string, a text or a file's name, never by a comment", async () => {
    expect(
      await lintRepo(
        {
          "engine/core/fresh/name.ts": "export const classLevelId = 1;\n",
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
          "engine/rulesets/dnd3.5/fresh/Feats.ts": "export const classLevelId = 1;\n",
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

  test("leave a dropped table's columns and rows behind, as names and keys, and no table named by the server", async () => {
    expect(
      await lintRepo(
        {
          // A name, a key, a type's member, a destructured one, a string key, a private one, a JSX attribute: in a
          // ruleset's folders and the tests too
          "engine/rulesets/dnd3.5/fresh/name.ts": "export const characterLevelId = 1;\n",
          "engine/rulesets/dnd3.5/fresh/class.ts": "export const klassLevelId = 1;\n",
          "engine/rulesets/dnd3.5/fresh/key.ts": "export const row = { sourceItemId: null };\n",
          "engine/rulesets/dnd3.5/fresh/member.ts": "export interface Skill {\n  primaryAbilityId: string;\n}\n",
          "tests/fresh/destructured.ts": "export const read = ({ levelFeat }: { levelFeat: number }) => levelFeat;\n",
          "server/fresh/string.ts": 'export const row = { "target_table": "feats" };\n',
          "server/fresh/private.ts": 'export class Rows {\n  #targetTable = "";\n}\n',
          "client/src/fresh/jsx.tsx":
            "const Cost = (props: { costGp: number }) => props.costGp;\nexport const t = <Cost costGp={1} />;\n",
          "tests/routers/fresh/items.test.ts": "export const body = { costGp: 1 };\n",
          // A computed key, a computed read, a class's public member and method, an import and an export, a shorthand,
          // a method signature's string key and an enum's string member
          "engine/rulesets/dnd3.5/fresh/computed.ts": 'export const row = { ["costGp"]: 1 };\n',
          "engine/rulesets/dnd3.5/fresh/read.ts":
            'export const read = (row: Record<string, number>) => row["costGp"];\n',
          "engine/rulesets/dnd3.5/fresh/members.ts":
            "export class Rows {\n  levelFeat = 1;\n\n  targetTable() {\n    return 1;\n  }\n}\n",
          "engine/rulesets/dnd3.5/fresh/imported.ts":
            'import { sourceItemId } from "./x.ts";\nexport const id = sourceItemId;\n',
          "engine/rulesets/dnd3.5/fresh/exported.ts": "const characterLevelId = 1;\nexport { characterLevelId };\n",
          "engine/rulesets/dnd3.5/fresh/shorthand.ts": "const costGp = 1;\nexport const row = { costGp };\n",
          "engine/rulesets/dnd3.5/fresh/signature.ts": 'export interface Rows {\n  "sourceItemId"(): void;\n}\n',
          "engine/rulesets/dnd3.5/fresh/enum.ts": 'export enum Columns {\n  "target_table" = 1,\n}\n',
          // 3.5's codegen keeps `costGp` alone, and no other folder of the codegen keeps it
          "codegen/dnd3.5/fresh/name.ts": "export const primaryAbilityId = 1;\n",
          "codegen/core/fresh/cost.ts": "export const costGp = 1;\n",
          // A table's name, imported or read, in the server and shared/
          "server/fresh/table.ts": 'import { getTableName } from "drizzle-orm";\nexport const name = getTableName;\n',
          "shared/fresh/table.ts": 'import * as orm from "drizzle-orm";\nexport const name = orm.getTableName;\n',
          "server/fresh/computed.ts": 'import * as orm from "drizzle-orm";\nexport const name = orm["getTableName"];\n',
          // The migrations' tests, a name's own home (3.5's codegen's scraped cost), a string, a type's literal, a
          // template's key, an export's string name, a comment, a name that holds one (a level's feats), the live names,
          // and a script's table name
          "tests/scripts/db/fresh.test.ts": "export const row = { target_table: 1, costGp: 2 };\n",
          "codegen/dnd3.5/fresh/items.ts": "export interface Scraped {\n  costGp: number;\n}\n",
          "engine/core/fresh/string.ts": 'export const column = "costGp";\n',
          "engine/core/fresh/omitted.ts":
            'import type { Row } from "./x.ts";\nexport type Rest = Omit<Row, "costGp">;\n',
          "engine/core/fresh/template.ts": "export const row = { [`costGp`]: 1 };\n",
          "engine/core/fresh/named.ts": 'const cost = 1;\nexport { cost as "costGp" };\n',
          "engine/core/fresh/comment.ts": "// An item's cost was its `costGp` column\nexport const cost = 1;\n",
          "engine/rulesets/dnd3.5/fresh/plural.ts": "export const levelFeats = [];\n",
          "engine/rulesets/dnd3.5/fresh/live.ts":
            "export const read = (row: { isTemplate: boolean; raceId: string; saveId: string }) => row;\n",
          "scripts/fresh/table.ts": 'import { getTableName } from "drizzle-orm";\nexport const name = getTableName;\n',
        },
        ["dropped-names"],
      ),
    ).toEqual([
      // Its type's member, its read and its JSX attribute
      "dropped-names client/src/fresh/jsx.tsx",
      "dropped-names client/src/fresh/jsx.tsx",
      "dropped-names client/src/fresh/jsx.tsx",
      "dropped-names codegen/core/fresh/cost.ts",
      "dropped-names codegen/dnd3.5/fresh/name.ts",
      "dropped-names engine/rulesets/dnd3.5/fresh/class.ts",
      "dropped-names engine/rulesets/dnd3.5/fresh/computed.ts",
      "dropped-names engine/rulesets/dnd3.5/fresh/enum.ts",
      // Its declaration and its export
      "dropped-names engine/rulesets/dnd3.5/fresh/exported.ts",
      "dropped-names engine/rulesets/dnd3.5/fresh/exported.ts",
      // Its import and its read
      "dropped-names engine/rulesets/dnd3.5/fresh/imported.ts",
      "dropped-names engine/rulesets/dnd3.5/fresh/imported.ts",
      "dropped-names engine/rulesets/dnd3.5/fresh/key.ts",
      "dropped-names engine/rulesets/dnd3.5/fresh/member.ts",
      // Its field and its method
      "dropped-names engine/rulesets/dnd3.5/fresh/members.ts",
      "dropped-names engine/rulesets/dnd3.5/fresh/members.ts",
      "dropped-names engine/rulesets/dnd3.5/fresh/name.ts",
      "dropped-names engine/rulesets/dnd3.5/fresh/read.ts",
      // Its declaration and its shorthand
      "dropped-names engine/rulesets/dnd3.5/fresh/shorthand.ts",
      "dropped-names engine/rulesets/dnd3.5/fresh/shorthand.ts",
      "dropped-names engine/rulesets/dnd3.5/fresh/signature.ts",
      "dropped-names server/fresh/computed.ts",
      "dropped-names server/fresh/private.ts",
      "dropped-names server/fresh/string.ts",
      // Its import and its read
      "dropped-names server/fresh/table.ts",
      "dropped-names server/fresh/table.ts",
      "dropped-names shared/fresh/table.ts",
      // Its pattern's, its type's member and its read
      "dropped-names tests/fresh/destructured.ts",
      "dropped-names tests/fresh/destructured.ts",
      "dropped-names tests/fresh/destructured.ts",
      "dropped-names tests/routers/fresh/items.test.ts",
    ]);
  });

  test("spell `klass` in its types and a value that is one alone, where `class` is a reserved word", async () => {
    expect(
      await lintRepo(
        {
          "engine/rulesets/dnd3.5/fresh/id.ts": "export const klassId = 1;\n",
          "engine/rulesets/dnd3.5/fresh/level.ts":
            "export const read = (row: { klassLevel: number }) => row.klassLevel;\n",
          "engine/rulesets/dnd3.5/fresh/method.ts":
            "export class Plans {\n  getSavedKlassLevel() {\n    return 1;\n  }\n}\n",
          "engine/rulesets/dnd3.5/fresh/private.ts": "export class Plans {\n  #klasses = [];\n}\n",
          "client/src/fresh/jsx.tsx": "const KlassPage = () => null;\nexport const t = <KlassPage />;\n",
          "engine/rulesets/dnd3.5/fresh/klassLevels.ts": "export const levels = 1;\n",
          // An import's name: once where it's the file's own, never where it renames another module's export
          "engine/rulesets/dnd3.5/fresh/imported.ts":
            'import { KlassView } from "some-lib";\nexport const v = KlassView;\n',
          "engine/rulesets/dnd3.5/fresh/renamed.ts":
            'import { KlassThing as Thing, KlassOther as KlassMine } from "some-lib";\nexport const t = [Thing, KlassMine];\n',
          // Its types, a value that is one, a string (a stored row a migration reads) and a comment
          "engine/rulesets/dnd3.5/fresh/types.ts":
            "interface Klass { id: string }\ninterface KlassLevel { id: string }\nexport const idOf = (klass: Klass, level: KlassLevel) => klass.id + level.id;\n",
          "engine/rulesets/dnd3.5/fresh/stored.ts": 'export const type = "klass_levels";\n',
          "engine/rulesets/dnd3.5/fresh/comment.ts":
            "// A class level, which the code once named `klassLevel`\nexport const classLevelId = 1;\n",
        },
        ["klass-names"],
      ),
    ).toEqual([
      "klass-names client/src/fresh/jsx.tsx",
      "klass-names client/src/fresh/jsx.tsx",
      "klass-names engine/rulesets/dnd3.5/fresh/id.ts",
      "klass-names engine/rulesets/dnd3.5/fresh/imported.ts",
      "klass-names engine/rulesets/dnd3.5/fresh/imported.ts",
      "klass-names engine/rulesets/dnd3.5/fresh/klassLevels.ts",
      "klass-names engine/rulesets/dnd3.5/fresh/level.ts",
      "klass-names engine/rulesets/dnd3.5/fresh/level.ts",
      "klass-names engine/rulesets/dnd3.5/fresh/method.ts",
      "klass-names engine/rulesets/dnd3.5/fresh/private.ts",
      "klass-names engine/rulesets/dnd3.5/fresh/renamed.ts",
      "klass-names engine/rulesets/dnd3.5/fresh/renamed.ts",
    ]);
  });
});
