import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { lintRepo } from "./lintRepo.ts";

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("frontend rules", () => {
  test("an icon button has an accessible name: an aria-label, or a Tooltip right around it", async () => {
    expect(
      await lintRepo(
        {
          "client/src/a.tsx": 'export const a = <IconButton aria-label="Delete" />;\n',
          "client/src/b.tsx": 'export const b = (\n  <Tooltip title="Delete">\n    <IconButton />\n  </Tooltip>\n);\n',
          "client/src/c.tsx": "export const c = <IconButton />;\n",
          "client/src/d.tsx":
            'export const d = (\n  <Tooltip title="Delete">\n    <span>\n      <IconButton disabled />\n    </span>\n  </Tooltip>\n);\n',
          "client/src/e.tsx":
            'export const e = (\n  <Tooltip title="Delete" describeChild>\n    <IconButton />\n  </Tooltip>\n);\n',
        },
        ["accessible-icon-buttons"],
      ),
    ).toEqual([
      "accessible-icon-buttons client/src/c.tsx",
      "accessible-icon-buttons client/src/d.tsx",
      "accessible-icon-buttons client/src/e.tsx",
    ]);
  });

  test("a dialog goes full screen on a phone, and a form is never in a Modal", async () => {
    expect(
      await lintRepo(
        {
          "client/src/a.tsx": "export const a = <Dialog open fullScreen={isMobile} />;\n",
          "client/src/b.tsx": "export const b = <Dialog open />;\n",
          "client/src/c.tsx": "export const c = (\n  <Modal>\n    <Box>\n      <form />\n    </Box>\n  </Modal>\n);\n",
          "client/src/d.tsx": 'export const d = (\n  <Modal>\n    <Box component="form" />\n  </Modal>\n);\n',
          "client/src/e.tsx": "export const e = (\n  <FormDialog>\n    <form />\n  </FormDialog>\n);\n",
          "client/src/f.tsx": 'export const f = (\n  <Modal>\n    <Box component={"form"} />\n  </Modal>\n);\n',
        },
        ["dialog-conventions"],
      ),
    ).toEqual([
      "dialog-conventions client/src/b.tsx",
      "dialog-conventions client/src/c.tsx",
      "dialog-conventions client/src/d.tsx",
      "dialog-conventions client/src/f.tsx",
    ]);
  });

  test("a query key starts from lib/queryKeys.ts", async () => {
    expect(
      await lintRepo(
        {
          "client/src/a.ts": "export const a = { queryKey: [...queryKeys.feats(id), search] };\n",
          "client/src/b.ts": "export const b = { queryKey: queryKeys.feats(id) };\n",
          "client/src/c.ts": 'export const c = { queryKey: ["feats", id] };\n',
          "client/src/lib/queryKeys.ts": 'export const k = { queryKey: ["feats"] };\n',
        },
        ["query-keys"],
      ),
    ).toEqual(["query-keys client/src/c.ts"]);
  });

  test("a mutation runs with mutate, and a loader is a DiceSpinner", async () => {
    expect(
      await lintRepo(
        {
          "client/src/a.ts": "export const a = () => save.mutate(values);\n",
          "client/src/b.ts": "export const b = () => save.mutateAsync(values);\n",
          "client/src/c.tsx":
            'import { Box, CircularProgress } from "@mui/material";\nexport const c = [Box, CircularProgress];\n',
          "client/src/d.ts":
            "export const d = () => {\n  const { mutateAsync } = useSave();\n  return mutateAsync;\n};\n",
          "client/src/e.tsx": 'import * as Mui from "@mui/material";\nexport const e = <Mui.CircularProgress />;\n',
        },
        ["client-apis"],
      ),
    ).toEqual([
      "client-apis client/src/b.ts",
      "client-apis client/src/c.tsx",
      "client-apis client/src/d.ts",
      "client-apis client/src/e.tsx",
    ]);
  });

  test("a form's field is bound through useController: never register, never a watched value", async () => {
    expect(
      await lintRepo(
        {
          "client/src/bound.tsx": 'export const b = <NameField control={form.control} name="name" />;\n',
          "client/src/registered.tsx": 'export const r = <TextField {...form.register("name")} />;\n',
          "client/src/watched.tsx":
            'export const w = <Toggle value={form.watch("private")} onChange={(v) => form.setValue("private", v)} />;\n',
          "client/src/held.tsx":
            'const digits = watch("digits");\nexport const h = <CodeInput digits={digits} onChange={setDigits} />;\n',
          "client/src/shown.tsx": 'const name = watch("name");\nexport const s = <Typography>{name}</Typography>;\n',
        },
        ["controlled-inputs"],
      ),
    ).toEqual([
      "controlled-inputs client/src/held.tsx",
      "controlled-inputs client/src/registered.tsx",
      "controlled-inputs client/src/watched.tsx",
    ]);
  });
});
