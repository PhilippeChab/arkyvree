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

  test("a form is made with useFormWith, whose values are whole, never react-hook-form's useForm", async () => {
    expect(
      await lintRepo(
        {
          "client/src/hooks/useFormWith.ts":
            'import { useForm } from "react-hook-form";\nexport function useFormWith(values) {\n  return useForm({ defaultValues: values });\n}\n',
          "client/src/made.tsx":
            'import { useFormWith } from "@/client/src/hooks/index.ts";\nexport function Made() {\n  useFormWith({ name: "" });\n  return null;\n}\n',
          "client/src/partial.tsx":
            'import { useForm } from "react-hook-form";\nexport function Partial() {\n  useForm();\n  return null;\n}\n',
        },
        ["controlled-inputs"],
      ),
    ).toEqual(["controlled-inputs client/src/partial.tsx"]);
  });
  test("an effect never writes a form's field nor calls back its owner, but a handler it registers may", async () => {
    expect(
      await lintRepo(
        {
          "client/src/written.tsx":
            'export function W() {\n  useEffect(() => {\n    setValue("x", 1);\n  }, []);\n  return null;\n}\n',
          "client/src/renamed.tsx":
            'export function R({ wizard }) {\n  const { setValue: setPick } = wizard;\n  useEffect(() => {\n    setPick("x", 1);\n  }, [setPick]);\n  return null;\n}\n',
          "client/src/redirected.tsx":
            'export function D({ navigate }) {\n  useEffect(() => {\n    navigate("/x", { replace: true });\n  }, [navigate]);\n  return null;\n}\n',
          "client/src/called.tsx":
            "export function C({ onChange }) {\n  useEffect(() => {\n    onChange(1);\n  }, [onChange]);\n  return null;\n}\n",
          "client/src/subscribed.tsx":
            'export function S({ onMessage }) {\n  useEffect(() => socket.on("m", (m) => onMessage(m)), [onMessage]);\n  return null;\n}\n',
          "client/src/evented.tsx":
            'export function E({ onChange }) {\n  return <button onClick={() => { setValue("x", 1); onChange(1); }} />;\n}\n',
          "client/src/hooks/useFormSync.ts":
            "export function useFormSync(form) {\n  useEffect(() => {\n    form.reset({});\n  });\n}\n",
        },
        ["effect-writes"],
      ),
    ).toEqual([
      "effect-writes client/src/called.tsx",
      "effect-writes client/src/redirected.tsx",
      "effect-writes client/src/renamed.tsx",
      "effect-writes client/src/written.tsx",
    ]);
  });

  test("the API is called in a function a query or a mutation runs, named …Fn", async () => {
    expect(
      await lintRepo(
        {
          "client/src/direct.tsx": "export async function d() {\n  await rpc.api.feats.$get();\n}\n",
          "client/src/queried.tsx":
            "export const q = () => useQuery({ queryKey: k, queryFn: () => rpc.api.feats.$get() });\n",
          "client/src/handed.tsx":
            "export const h = <Picker pageFn={(s) => rpc.api.feats.$get({ query: { s } })} />;\n",
          "client/src/linked.tsx": "export const u = rpc.api.feats.$url();\n",
        },
        ["api-calls-in-queries"],
      ),
    ).toEqual(["api-calls-in-queries client/src/direct.tsx"]);
  });

  test("a failure to load is a LoadError, whose words are loadFailureMessage's", async () => {
    expect(
      await lintRepo(
        {
          "client/src/written.tsx": 'export const w = <Alert severity="error">Failed to load feats.</Alert>;\n',
          "client/src/worded.tsx":
            'export const x = <Alert severity="error">{loadFailureMessage("Feats", error)}</Alert>;\n',
          "client/src/other.tsx": 'export const o = <Alert severity="error">Missing required selections.</Alert>;\n',
          "client/src/info.tsx": 'export const i = <Alert severity="info">Loading feats</Alert>;\n',
          "client/src/components/common/LoadError.tsx":
            'export const l = <Alert severity="error">{loadFailureMessage(what, error)}</Alert>;\n',
        },
        ["load-errors"],
      ),
    ).toEqual(["load-errors client/src/worded.tsx", "load-errors client/src/written.tsx"]);
  });
});
