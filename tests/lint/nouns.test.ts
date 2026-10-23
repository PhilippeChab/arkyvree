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
          "engine/core/fresh/Feats.ts": "export const kinds = 1;\n",
          "client/src/fresh/text.tsx": "export const t = <p>Pick a spell</p>;\n",
          "server/fresh/template.ts": "export const t = (id: string) => `/powers/${id}`;\n",
          // The engine's own words, and English's
          "engine/core/fresh/generic.ts": "export const track = (pool: string, step: string) => `${pool}:${step}`;\n",
          "engine/core/fresh/verbs.ts": "export const onSave = () => Promise.race([]);\n",
          "client/src/fresh/css.tsx": 'export const c = <div className="class" />;\n',
          "engine/core/fresh/comment.ts": "// A class level's feats, as 3.5 names them\nexport const rows = 1;\n",
          // A ruleset's folders name them
          "engine/rulesets/dnd3.5/fresh/Feats.ts": "export const klassLevelId = 1;\n",
          "content/dnd3.5/fresh/powers.ts": 'export const type = "powers";\n',
        },
        ["ruleset-nouns"],
      ),
    ).toEqual([
      "ruleset-nouns client/src/fresh/text.tsx",
      "ruleset-nouns engine/core/fresh/Feats.ts",
      "ruleset-nouns engine/core/fresh/name.ts",
      "ruleset-nouns engine/core/fresh/points.ts",
      "ruleset-nouns engine/core/fresh/save.ts",
      "ruleset-nouns engine/core/fresh/save.ts",
      "ruleset-nouns engine/core/fresh/stored.ts",
      "ruleset-nouns engine/core/fresh/string.ts",
      "ruleset-nouns server/fresh/template.ts",
    ]);
  });
});
