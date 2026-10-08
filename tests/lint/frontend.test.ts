import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { fixRepo, lines, lintRepo } from "./lintRepo.ts";

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("frontend rules", () => {
  test("an icon button is named by its aria-label, whether or not a Tooltip shows its name", async () => {
    expect(
      await lintRepo(
        {
          "client/src/a.tsx": 'export const a = <IconButton aria-label="Delete" />;\n',
          "client/src/b.tsx": 'export const b = (\n  <Tooltip title="Delete">\n    <IconButton />\n  </Tooltip>\n);\n',
          "client/src/c.tsx": "export const c = <IconButton />;\n",
          "client/src/d.tsx":
            'export const d = (\n  <Tooltip title="Delete">\n    <IconButton aria-label="Delete" />\n  </Tooltip>\n);\n',
        },
        ["accessible-icon-buttons"],
      ),
    ).toEqual(["accessible-icon-buttons client/src/b.tsx", "accessible-icon-buttons client/src/c.tsx"]);
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

  test("a dialog is sm or md, its title its words, its lead line a DialogContentText 8px under it", async () => {
    const icons = 'import { GroupIcon } from "@/client/src/components/icons/index.ts";\n';
    expect(
      await lintRepo(
        {
          "client/src/narrow.tsx": 'export const n = <CreateDialog title="Create New Class" maxWidth="xs" />;\n',
          "client/src/modal.tsx": 'export const m = <Modal open maxWidth="xs" />;\n',
          "client/src/wide.tsx": 'export const w = <CreateDialog title="Create New Spell" maxWidth="md" />;\n',
          "client/src/container.tsx": 'export const c = <Container maxWidth="xs" />;\n',
          "client/src/icon.tsx": `${icons}export const i = <DialogTitle><Stack><GroupIcon /> Contributors</Stack></DialogTitle>;\n`,
          "client/src/help.tsx": "export const h = <DialogTitle><FaqHelpIcon text={help} /></DialogTitle>;\n",
          "client/src/lead.tsx": lines(
            "export const l = (",
            "  <DialogContent>",
            '    <Stack direction="row">',
            '      <Typography variant="body2">Contributors can edit this character.</Typography>',
            "    </Stack>",
            "  </DialogContent>",
            ");",
          ),
          "client/src/text.tsx": lines(
            "export const t = (",
            "  <DialogContent>",
            "    <Stack spacing={3} sx={{ pt: 1 }}>",
            "      <DialogContentText>We sent a code.</DialogContentText>",
            "      <Typography>Then this.</Typography>",
            "    </Stack>",
            "  </DialogContent>",
            ");",
          ),
          "client/src/gap.tsx": lines(
            "export const g = (",
            "  <DialogContent>",
            "    <Stack spacing={3} sx={{ pt: 2 }}>",
            "      <TextField />",
            "    </Stack>",
            "  </DialogContent>",
            ");",
          ),
          "client/src/foot.tsx": "export const f = <DialogContent sx={{ pb: 3.5 }}><TextField /></DialogContent>;\n",
          "client/src/reset.tsx": "export const r = <DialogContent sx={{ p: 0 }}>{step}</DialogContent>;\n",
          "client/src/apart.tsx": lines(
            "export const a = (",
            "  <FormDialog>",
            "    <DialogTitle>Delete Account</DialogTitle>",
            "    <form noValidate>",
            "      <DialogContent />",
            "    </form>",
            "  </FormDialog>",
            ");",
          ),
          "client/src/inside.tsx": lines(
            "export const i = (",
            "  <FormDialog>",
            "    <form noValidate>",
            "      <DialogTitle>Delete Account</DialogTitle>",
            "      <DialogContent />",
            "    </form>",
            "  </FormDialog>",
            ");",
          ),
        },
        ["dialog-conventions"],
      ),
    ).toEqual([
      "dialog-conventions client/src/apart.tsx",
      "dialog-conventions client/src/foot.tsx",
      "dialog-conventions client/src/gap.tsx",
      "dialog-conventions client/src/icon.tsx",
      "dialog-conventions client/src/lead.tsx",
      "dialog-conventions client/src/modal.tsx",
      "dialog-conventions client/src/narrow.tsx",
    ]);
  });

  test("a query key starts from lib/queryKeys.ts", async () => {
    expect(
      await lintRepo(
        {
          "client/src/a.ts": "export const a = { queryKey: [...QUERY_KEYS.feats(id), search] };\n",
          "client/src/b.ts": "export const b = { queryKey: QUERY_KEYS.feats(id) };\n",
          "client/src/c.ts": 'export const c = { queryKey: ["feats", id] };\n',
          "client/src/lib/queryKeys.ts": 'export const k = { queryKey: ["feats"] };\n',
        },
        ["query-keys"],
      ),
    ).toEqual(["query-keys client/src/c.ts"]);
  });

  test("a field the viewer can't edit is readOnly, never a disabled one restyled", async () => {
    expect(
      await lintRepo(
        {
          "client/src/restyled.tsx":
            'export const r = <TextField disabled sx={{ "& .MuiInputBase-input.Mui-disabled": { color: "text.primary" } }} />;\n',
          "client/src/label.tsx":
            'export const l = { "& .MuiInputLabel-root.Mui-disabled": { color: "text.secondary" } };\n',
          "client/src/readOnly.tsx": "export const o = <TextField slotProps={{ input: { readOnly } }} />;\n",
          "client/src/tabs.tsx": 'export const t = { "& .MuiTabs-scrollButtons.Mui-disabled": { opacity: 0.3 } };\n',
        },
        ["form-fields"],
      ),
    ).toEqual(["form-fields client/src/label.tsx", "form-fields client/src/restyled.tsx"]);
  });

  test("a key its domain's helper invalidates is invalidated through it", async () => {
    const invalidate = "queryClient.invalidateQueries({ queryKey: QUERY_KEYS.characters.detail(id) })";
    expect(
      await lintRepo(
        {
          "client/src/sheet.ts": `export const s = () => ${invalidate};\n`,
          "client/src/helper.ts": "export const h = () => invalidateCharacter(queryClient, id);\n",
          "client/src/removed.ts":
            "export const r = () => queryClient.removeQueries({ queryKey: QUERY_KEYS.characters.detail(id) });\n",
          "client/src/query.ts": "export const q = { queryKey: QUERY_KEYS.characters.detail(id) };\n",
          "client/src/lib/queries.ts": `export const i = () => ${invalidate};\n`,
        },
        ["query-keys"],
      ),
    ).toEqual(["query-keys client/src/sheet.ts"]);
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
          "client/src/f.ts":
            "export const f = () => {\n  const { mutate: save } = useMutation({ mutationFn });\n  return save;\n};\n",
          "client/src/g.ts":
            "export const g = () => {\n  const saveMutation = useMutation({ mutationFn });\n  return saveMutation.mutate;\n};\n",
        },
        ["client-apis"],
      ),
    ).toEqual([
      "client-apis client/src/b.ts",
      "client-apis client/src/c.tsx",
      "client-apis client/src/d.ts",
      "client-apis client/src/e.tsx",
      "client-apis client/src/f.ts",
    ]);
  });

  test("a form's field is bound through useController: never register, never a watched value", async () => {
    expect(
      await lintRepo(
        {
          "client/src/bound.tsx": 'export const b = <NameField control={form.control} name="name" />;\n',
          "client/src/registered.tsx": 'export const r = <TextField {...form.register("name")} />;\n',
          "client/src/watched.tsx":
            'export const w = <Toggle value={form.watch("private")} onChange={(v) => form.setValue("private", v, { shouldDirty: true })} />;\n',
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

  test("a field written in the user's event is marked dirty", async () => {
    expect(
      await lintRepo(
        {
          "client/src/dirty.tsx": 'export const d = () => form.setValue("slot", "", { shouldDirty: true });\n',
          "client/src/clean.tsx": 'export const c = () => form.setValue("slot", "");\n',
          "client/src/destructured.tsx":
            "export const t = () => setValue(`items.${i}.name`, name, { shouldTouch: true });\n",
          "client/src/state.tsx": "export const s = () => setValue(next);\n",
        },
        ["controlled-inputs"],
      ),
    ).toEqual(["controlled-inputs client/src/clean.tsx", "controlled-inputs client/src/destructured.tsx"]);
  });

  test("a field's error shows where its binding puts it, never read from formState.errors", async () => {
    expect(
      await lintRepo(
        {
          "client/src/bound.tsx":
            'export const b = <FormTextField control={form.control} name="username" helperText="Optional" />;\n',
          "client/src/read.tsx":
            "export const r = <Typography>{form.formState.errors.username?.message}</Typography>;\n",
          "client/src/destructured.tsx":
            "export function D() {\n  const { formState: { errors } } = form;\n  return <Typography>{errors.name?.message}</Typography>;\n}\n",
          "client/src/field.tsx":
            "export const f = <TextField error={!!fieldState.error} helperText={fieldState.error?.message} />;\n",
        },
        ["controlled-inputs"],
      ),
    ).toEqual(["controlled-inputs client/src/destructured.tsx", "controlled-inputs client/src/read.tsx"]);
  });

  test("a form's unsaved edits are read from its sync or its dialog, which guard the page's reload", async () => {
    expect(
      await lintRepo(
        {
          "client/src/synced.tsx": "export const s = <SaveButton canSave={sync.isDirty} pending={busy} />;\n",
          "client/src/read.tsx": "export const r = <SaveButton canSave={form.formState.isDirty} pending={busy} />;\n",
          "client/src/destructured.tsx":
            "export function D() {\n  const { isDirty } = form.formState;\n  return <SaveButton canSave={isDirty} pending={busy} />;\n}\n",
          "client/src/nested.tsx":
            "export function N() {\n  const { formState: { isDirty } } = form;\n  return <SaveButton canSave={isDirty} pending={busy} />;\n}\n",
          "client/src/registered.tsx": "export function G() {\n  useDirtyForm(changed);\n  return null;\n}\n",
          "client/src/hooks/useFormSync.ts":
            "export function useFormSync() {\n  useDirtyForm(form.formState.isDirty);\n}\n",
          "client/src/components/common/FormDialog.tsx":
            "export function FormDialog() {\n  useDirtyForm(open && dirty);\n}\n",
        },
        ["dirty-forms"],
      ),
    ).toEqual([
      "dirty-forms client/src/destructured.tsx",
      "dirty-forms client/src/nested.tsx",
      "dirty-forms client/src/read.tsx",
      "dirty-forms client/src/registered.tsx",
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
          "client/src/bracket.tsx": 'export async function b() {\n  await rpc.api.feats["$get"]();\n}\n',
          "client/src/held.tsx": "const api = rpc.api.feats;\nexport async function e() {\n  await api.$get();\n}\n",
          "client/src/named.tsx":
            "export function N() {\n  const exportFn = () => rpc.api.feats.$post({});\n  return exportFn;\n}\n",
          "client/src/declared.ts": "export async function deleteFn() {\n  await rpc.api.feats.$delete();\n}\n",
          "client/src/pages/a/featQueries.ts":
            "async function fetchFeat() {\n  return parseResponse(await rpc.api.feats.$get());\n}\nexport const f = fetchFeat;\n",
        },
        ["api-calls-in-queries"],
      ),
    ).toEqual([
      "api-calls-in-queries client/src/bracket.tsx",
      "api-calls-in-queries client/src/direct.tsx",
      "api-calls-in-queries client/src/held.tsx",
    ]);
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

  test("a card's chips row holds chips alone: what failed to load is its notice", async () => {
    const failed = '<LoadError what="Abilities" error={error} />';
    expect(
      await lintRepo(
        {
          "client/src/chips.tsx": `export const c = <EntityDetailsCard title="Skill Details" chips={${failed}} />;\n`,
          "client/src/render.tsx": `export const r = <RulesetEntityDetail renderChips={() => ${failed}} />;\n`,
          "client/src/notice.tsx": `export const n = <EntityDetailsCard title="Skill Details" notice={${failed}} />;\n`,
        },
        ["load-errors"],
      ),
    ).toEqual(["load-errors client/src/chips.tsx", "load-errors client/src/render.tsx"]);
  });

  test("a component destructures its props in its signature, typed by one named type", async () => {
    expect(
      await lintRepo(
        {
          "client/src/Named.tsx": "export function Named({ title }: NamedProps) {\n  return title;\n}\n",
          "client/src/Inline.tsx": "export function Inline({ title }: { title: string }) {\n  return title;\n}\n",
          "client/src/Omitted.tsx":
            'export function Omitted({ title }: Omit<NamedProps, "id">) {\n  return title;\n}\n',
          "client/src/Joined.tsx":
            "export function Joined({ title }: NamedProps & { id: string }) {\n  return title;\n}\n",
          "client/src/Whole.tsx": "export function Whole(props: NamedProps) {\n  return props.title;\n}\n",
          "client/src/Spread.tsx":
            "export function Spread({ ...props }: NamedProps) {\n  return <Card {...props} />;\n}\n",
          "client/src/Wrapped.tsx":
            "export const W = memo(function Wrapped({ title }: { title: string }) {\n  return title;\n});\n",
          "client/src/helper.ts": "export function helper(value: { a: number }) {\n  return value.a;\n}\n",
        },
        ["component-props"],
      ),
    ).toEqual([
      "component-props client/src/Inline.tsx",
      "component-props client/src/Joined.tsx",
      "component-props client/src/Omitted.tsx",
      "component-props client/src/Whole.tsx",
      "component-props client/src/Wrapped.tsx",
    ]);
  });

  test("React's types and functions are named imports, and a ref is a prop", async () => {
    expect(
      await lintRepo(
        {
          "client/src/named.tsx": 'import { type ReactNode, StrictMode } from "react";\nexport type N = ReactNode;\n',
          "client/src/default.tsx": 'import React from "react";\nexport const d = React;\n',
          "client/src/namespace.tsx": "export type N = React.ReactNode;\n",
          "client/src/member.tsx": "export const m = React.StrictMode;\n",
          "client/src/forwarded.tsx": 'import { forwardRef } from "react";\nexport const f = forwardRef;\n',
        },
        ["react-imports"],
      ),
    ).toEqual([
      "react-imports client/src/default.tsx",
      "react-imports client/src/forwarded.tsx",
      "react-imports client/src/member.tsx",
      "react-imports client/src/namespace.tsx",
    ]);
  });

  test("an icon comes from components/icons", async () => {
    expect(
      await lintRepo(
        {
          "client/src/named.tsx":
            'import { AddIcon } from "@/client/src/components/icons/index.ts";\nexport const n = AddIcon;\n',
          "client/src/barrel.tsx": 'import { Add as AddIcon } from "@mui/icons-material";\nexport const b = AddIcon;\n',
          "client/src/path.tsx": 'import AddIcon from "@mui/icons-material/Add";\nexport const p = AddIcon;\n',
          "client/src/components/icons/index.ts": 'export { Add as AddIcon } from "@mui/icons-material";\n',
        },
        ["icons"],
      ),
    ).toEqual(["icons client/src/barrel.tsx", "icons client/src/path.tsx"]);
  });

  test("every removal shows the bin", async () => {
    expect(
      await lintRepo(
        {
          "client/src/menu.tsx": 'export const m = <ActionMenuItem icon={RemoveIcon} label="Remove Level" />;\n',
          "client/src/button.tsx":
            'export const b = <IconButton aria-label="Remove Level"><RemoveIcon fontSize="small" /></IconButton>;\n',
          "client/src/row.tsx": "export const r = <RowAction icon={EditIcon} label={`Delete ${name}`} />;\n",
          "client/src/bin.tsx": 'export const b = <RowAction icon={DeleteIcon} label="Remove" />;\n',
          "client/src/restorable.tsx":
            'export const r = <RowAction icon={DeleteIcon} label={restorable ? "Delete" : "Delete Permanently"} />;\n',
          "client/src/lower.tsx":
            'export const l = <IconButton aria-label="Lower Strength"><RemoveIcon /></IconButton>;\n',
          "client/src/leave.tsx":
            'export const l = <RowAction icon={me ? LeaveIcon : DeleteIcon} label={me ? "Leave" : "Remove"} />;\n',
        },
        ["icons"],
      ),
    ).toEqual(["icons client/src/button.tsx", "icons client/src/menu.tsx", "icons client/src/row.tsx"]);
  });

  test("a glyph goes by one name in components/icons, one meaning per glyph", async () => {
    expect(
      await lintRepo(
        {
          "client/src/components/icons/index.ts":
            'export { Group as ContributorsIcon, Groups as PlayersIcon, Group as SharedIcon } from "@mui/icons-material";\n',
          "client/src/components/icons/other.ts":
            'export { Face as RacesIcon, Face as PeoplesIcon } from "@mui/icons-material";\n',
        },
        ["icons"],
      ),
    ).toEqual(["icons client/src/components/icons/index.ts"]);
  });

  test("what shows on a condition only is cond && <X />; a chain of alternatives ends in null", async () => {
    expect(
      await lintRepo(
        {
          "client/src/and.tsx": "export const a = (open: boolean) => open && <Panel />;\n",
          "client/src/lone.tsx": "export const l = (open: boolean) => (open ? <Panel /> : null);\n",
          "client/src/flipped.tsx": "export const f = (open: boolean) => (open ? null : <Panel />);\n",
          "client/src/chain.tsx": "export const c = (a: boolean, b: boolean) => (a ? <A /> : b ? <B /> : null);\n",
          "client/src/value.tsx": "export const v = (a: boolean) => (a ? 1 : null);\n",
        },
        ["jsx-conditionals"],
      ),
    ).toEqual(["jsx-conditionals client/src/flipped.tsx", "jsx-conditionals client/src/lone.tsx"]);
  });

  test("a JSX element's attributes stand on consecutive lines, which --fix closes up", async () => {
    const gapped = lines("export const g = (", "  <Chip", '    label="A"', "", '    color="primary"', "  />", ");");
    const closed = lines("export const c = (", "  <Chip", '    label="A"', '    color="primary"', "  />", ");");
    const lastGap = lines(
      "export const l = (",
      "  <Chip",
      '    label="A"',
      "",
      "  >",
      "    {child}",
      "  </Chip>",
      ");",
    );
    expect(
      await lintRepo(
        { "client/src/gapped.tsx": gapped, "client/src/closed.tsx": closed, "server/sheets/last.tsx": lastGap },
        ["jsx-attribute-lines"],
      ),
    ).toEqual(["jsx-attribute-lines client/src/gapped.tsx", "jsx-attribute-lines server/sheets/last.tsx"]);
    expect((await fixRepo({ "client/src/gapped.tsx": gapped }, ["jsx-attribute-lines"]))["client/src/gapped.tsx"]).toBe(
      closed.replace("const c", "const g"),
    );
  });

  test("a component file is named for what it exports, and a page is XPage.tsx", async () => {
    expect(
      await lintRepo(
        {
          "client/src/components/Card.tsx":
            "export function Card() {\n  return null;\n}\nexport function CardBody() {\n  return null;\n}\n",
          "client/src/components/Panel.tsx": "export function Box() {\n  return null;\n}\n",
          "client/src/components/FormFields.tsx":
            "export function NameField() {\n  return null;\n}\nexport function EmailField() {\n  return null;\n}\n",
          "client/src/components/statHelpers.tsx": "export function StatField() {\n  return null;\n}\n",
          "client/src/components/tooltips.tsx": "export function faqTooltip() {\n  return null;\n}\n",
          "client/src/pages/a/SignIn.tsx": "export default function SignIn() {\n  return null;\n}\n",
          "client/src/pages/a/LegalPage.tsx": "export default function LegalPage() {\n  return null;\n}\n",
          "client/src/App.tsx": "function App() {\n  return null;\n}\nexport default App;\n",
        },
        ["component-files"],
      ),
    ).toEqual([
      "component-files client/src/App.tsx",
      "component-files client/src/components/Panel.tsx",
      "component-files client/src/components/statHelpers.tsx",
      "component-files client/src/pages/a/SignIn.tsx",
    ]);
  });

  test("a hook is the one its own module is named for, and gives an object", async () => {
    expect(
      await lintRepo(
        {
          "client/src/hooks/useOpen.ts": "export function useOpen() {\n  return { open: true };\n}\n",
          "client/src/hooks/useTwo.ts":
            "export function useTwo() {\n  return { a: 1 };\n}\nexport function useOther() {\n  return { b: 2 };\n}\n",
          "client/src/hooks/useTuple.ts": "export function useTuple() {\n  return [1, 2] as const;\n}\n",
          "client/src/components/Card.tsx":
            "function useCard() {\n  return { a: 1 };\n}\nexport function Card() {\n  return useCard().a;\n}\n",
        },
        ["hook-files"],
      ),
    ).toEqual([
      "hook-files client/src/components/Card.tsx",
      "hook-files client/src/hooks/useTuple.ts",
      "hook-files client/src/hooks/useTwo.ts",
    ]);
  });

  test("a type lives with the code it describes, never in a types/ folder nor a types.ts grab bag", async () => {
    expect(
      await lintRepo(
        {
          "client/src/types/character.ts": "export interface A {\n  a: string;\n}\n",
          "client/src/pages/x/types.ts": "export interface A {\n  a: string;\n}\n",
          "client/src/pages/x/levelUpTypes.ts": "export interface A {\n  a: string;\n}\n",
          "client/src/hooks/google.d.ts": "interface Window {\n  a: string;\n}\n",
          "client/src/types/globals.d.ts": "interface Window {\n  b: string;\n}\n",
          "server/types.ts": "export interface A {\n  a: string;\n}\n",
        },
        ["no-types-modules"],
      ),
    ).toEqual(["no-types-modules client/src/pages/x/types.ts", "no-types-modules client/src/types/character.ts"]);
  });

  test("a component's own handler is handleX; onX names a prop", async () => {
    expect(
      await lintRepo(
        {
          "client/src/Handled.tsx":
            "export function Handled() {\n  const handleClick = () => 1;\n  return <Button onClick={handleClick} />;\n}\n",
          "client/src/Prop.tsx":
            "export function Prop() {\n  const onClick = () => 1;\n  return <Button onClick={onClick} />;\n}\n",
          "client/src/Callback.tsx":
            "export function Callback() {\n  const onSave = useCallback(() => 1, []);\n  return <Button onClick={onSave} />;\n}\n",
          "client/src/helper.ts": "export const onReady = () => 1;\n",
        },
        ["handler-names"],
      ),
    ).toEqual(["handler-names client/src/Callback.tsx", "handler-names client/src/Prop.tsx"]);
  });

  test("a constant built from a literal is SCREAMING_CASE, and one sx takes ends in _SX", async () => {
    expect(
      await lintRepo(
        {
          "client/src/named.tsx":
            "const PAGE_SIZE = 20;\nconst CELL_SX = { px: 1 };\nexport const n = <Box sx={CELL_SX} key={PAGE_SIZE} />;\n",
          "client/src/camel.tsx": "const pageSize = 20;\nexport const c = pageSize;\n",
          "client/src/style.tsx": "const CELL = { px: 1 };\nexport const s = <Box sx={{ ...CELL, py: 1 }} />;\n",
          "client/src/computed.tsx":
            "const client = new QueryClient();\nconst toLabel = (x: string) => x;\nexport const used = useThing(client, toLabel);\n",
        },
        ["constant-names"],
      ),
    ).toEqual(["constant-names client/src/camel.tsx", "constant-names client/src/style.tsx"]);
  });

  test("a query's options come from a factory; it waits with skipToken, keeps data with keepPreviousData, names its times", async () => {
    expect(
      await lintRepo(
        {
          "client/src/lib/queries.ts":
            "export const q = queryOptions({ queryKey: k, queryFn: () => f(), staleTime: FIVE_MINUTES });\n",
          "client/src/pages/a/featQueries.ts": "export const f = queryOptions({ queryKey: k, queryFn: () => f() });\n",
          "client/src/pages/a/Inline.tsx": "export const i = () => useQuery({ queryKey: k, queryFn: () => f() });\n",
          "client/src/pages/a/Factory.tsx": "export const y = () => useQuery({ ...featQuery(id), enabled: open });\n",
          "client/src/pages/a/Gated.tsx": "export const g = () => useQuery({ ...featQuery(id), enabled: !!id });\n",
          "client/src/pages/a/Kept.tsx":
            "export const p = () => useQuery({ ...featQuery(id), placeholderData: (prev) => prev });\n",
          "client/src/pages/a/Timed.tsx": "export const t = () => useQuery({ ...featQuery(id), staleTime: 5000 });\n",
          "client/src/pages/a/Written.tsx": "export const w = () => queryClient.setQueryData(k, v);\n",
          "client/src/pages/a/Mutated.tsx":
            "export const m = () => useMutation({ mutationFn: f, onSuccess: (v) => queryClient.setQueryData(k, v) });\n",
          "client/src/pages/a/Saved.tsx":
            "export const s = () => useEntitySave({ saveFn: f, storeSaved: (v) => queryClient.setQueryData(k, v) });\n",
          "client/src/pages/a/Paged.tsx": "export const n = (data: Data) => data.pages.flatMap((p) => p.items);\n",
        },
        ["queries"],
      ),
    ).toEqual([
      "queries client/src/pages/a/Gated.tsx",
      "queries client/src/pages/a/Inline.tsx",
      "queries client/src/pages/a/Kept.tsx",
      "queries client/src/pages/a/Paged.tsx",
      "queries client/src/pages/a/Timed.tsx",
      "queries client/src/pages/a/Written.tsx",
    ]);
  });

  test("a request's answer is read with parseResponse", async () => {
    expect(
      await lintRepo(
        {
          "client/src/parsed.ts":
            "export const p = { mutationFn: () => parseResponse(rpc.api.feats.$post({ json })) };\n",
          "client/src/raw.ts": "export const r = { mutationFn: () => rpc.api.feats.$post({ json }) };\n",
          "client/src/bracketRaw.ts": 'export const b = { mutationFn: () => rpc.api.feats["$post"]({ json }) };\n',
          "client/src/heldRaw.ts":
            "const api = rpc.api.feats;\nexport const h = { mutationFn: () => api.$post({ json }) };\n",
          "client/src/pages/a/rawQueries.ts":
            "async function fetchRaw() {\n  return rpc.api.feats.$get();\n}\nexport const x = fetchRaw;\n",
          "client/src/blob.ts":
            "export const d = { mutationFn: async () => (await rpc.api.exports.download.$get()).blob() };\n",
        },
        ["parsed-responses"],
      ),
    ).toEqual([
      "parsed-responses client/src/bracketRaw.ts",
      "parsed-responses client/src/heldRaw.ts",
      "parsed-responses client/src/pages/a/rawQueries.ts",
      "parsed-responses client/src/raw.ts",
    ]);
  });

  test("a member named by an identifier is read with a dot", async () => {
    expect(
      await lintRepo(
        {
          "client/src/bracket.ts": 'export const b = rpc.api.characters["share"].$post;\n',
          "client/src/optional.ts": 'export const o = attrs?.["intelligence"];\n',
          "client/src/param.ts": 'export const p = rpc.api.characters[":id"];\n',
          "client/src/dashed.ts": 'export const d = rpc.api.rulesets["class-levels"];\n',
          "client/src/typed.ts": 'export type T = Api["$get"];\n',
          "server/x.ts": 'export const s = o["a"];\n',
        },
        ["dot-notation"],
      ),
    ).toEqual(["dot-notation client/src/bracket.ts", "dot-notation client/src/optional.ts"]);
  });

  test("an error shows through errorMessage", async () => {
    expect(
      await lintRepo(
        {
          "client/src/named.ts": 'export const n = () => snackbar.error(error, "Failed to save feat");\n',
          "client/src/raw.ts": "export const r = { onError: (error: Error) => setError(error.message) };\n",
          "client/src/caught.ts":
            "export function c() {\n  try {\n    f();\n  } catch (e) {\n    show(e.message);\n  }\n}\n",
          "client/src/field.ts": "export const f = (error: FieldError) => error.message;\n",
        },
        ["error-reads"],
      ),
    ).toEqual(["error-reads client/src/caught.ts", "error-reads client/src/raw.ts"]);
  });

  test("what the browser keeps is a store's, read and written through its guards", async () => {
    expect(
      await lintRepo(
        {
          "client/src/stores/browserStorage.ts": 'export const p = () => localStorage.getItem("x");\n',
          "client/src/stores/prefs.ts": 'export const r = () => readStored("local", "x");\n',
          "client/src/stores/raw.ts": 'export const w = () => localStorage.setItem("x", "1");\n',
          "client/src/page.ts": 'export const g = () => localStorage.getItem("x");\n',
          "client/src/session.ts": 'export const s = () => window.sessionStorage.setItem("x", "1");\n',
          "client/src/own.ts": "export const o = (x: { localStorage: string }) => x.localStorage;\n",
        },
        ["browser-storage"],
      ),
    ).toEqual([
      "browser-storage client/src/page.ts",
      "browser-storage client/src/session.ts",
      "browser-storage client/src/stores/raw.ts",
    ]);
  });

  test("whether the user is a demo's is useIsDemo, and its countdown the demo banner's", async () => {
    expect(
      await lintRepo(
        {
          "client/src/gate.tsx": "export function G() {\n  return useIsDemo() && <Banner />;\n}\n",
          "client/src/read.tsx": "export function R() {\n  return useAuthStore((s) => !!s.user?.expiresAt);\n}\n",
          "client/src/user.ts": "export const u = (user: AuthUser) => !!user.expiresAt;\n",
          "client/src/share.ts": "export const s = (link: ShareLink) => link.expiresAt;\n",
          "client/src/countdown.tsx": "export function C() {\n  return useDemoTimeRemaining().minutes;\n}\n",
          "client/src/components/layout/DemoBanner.tsx":
            "export function D() {\n  return useDemoTimeRemaining().minutes;\n}\n",
          "client/src/hooks/useIsDemo.ts": "export const i = () => useAuthStore((s) => !!s.user?.expiresAt);\n",
          "client/src/stores/authUser.ts": "export const a = (user: AuthUser) => user.expiresAt;\n",
        },
        ["demo-reads"],
      ),
    ).toEqual([
      "demo-reads client/src/countdown.tsx",
      "demo-reads client/src/read.tsx",
      "demo-reads client/src/user.ts",
    ]);
  });

  test("a date is shown through lib/formatDate.ts", async () => {
    expect(
      await lintRepo(
        {
          "client/src/lib/formatDate.ts": "export const f = (d: Date) => d.toLocaleDateString();\n",
          "client/src/local.ts": "export const l = (d: Date) => d.toLocaleDateString();\n",
          "client/src/intl.ts": "export const i = new Intl.DateTimeFormat();\n",
          "client/src/number.ts": "export const n = (x: number) => x.toLocaleString();\n",
        },
        ["date-formats"],
      ),
    ).toEqual(["date-formats client/src/intl.ts", "date-formats client/src/local.ts"]);
  });

  test("a control that only navigates is a link, an external one an anchor, the URL and router state read through their guards, a customization page's path built", async () => {
    expect(
      await lintRepo(
        {
          "client/src/linked.tsx": 'export const l = <Button component={Link} to="/x">Go</Button>;\n',
          "client/src/clicked.tsx": 'export const c = <Button onClick={() => navigate("/x")}>Go</Button>;\n',
          "client/src/back.tsx": "export const b = <Button onClick={() => navigate(-1)}>Back</Button>;\n",
          "client/src/card.tsx": 'export const d = <ListCard onClick={() => navigate("/x")} />;\n',
          "client/src/stat.tsx": 'export const s = <StatCard onClick={() => navigate("/x")} />;\n',
          "client/src/menu.tsx":
            'export const m = <ActionMenuItem label="Edit" onClick={menu.closeMenuAnd(() => navigate("/x"))} />;\n',
          "client/src/handler.tsx":
            'export function H() {\n  const handleProfile = () => {\n    menu.closeMenu();\n    navigate("/profile");\n  };\n' +
            '  return <ActionMenuItem label="Profile" onClick={handleProfile} />;\n}\n',
          "client/src/item.tsx":
            'export const i = <ActionMenuItem label="Profile" to="/profile" onClick={menu.closeMenu} />;\n',
          "client/src/acting.tsx":
            'export function A() {\n  const handleSave = () => {\n    save();\n    navigate("/x");\n  };\n' +
            "  return <Button onClick={handleSave}>Save</Button>;\n}\n",
          "client/src/window.tsx": 'export const w = () => window.open("https://x", "_blank");\n',
          "client/src/params.tsx":
            'import { useSearchParams } from "react-router-dom";\nexport const p = useSearchParams;\n',
          "client/src/hooks/useParam.ts":
            'import { useSearchParams } from "react-router-dom";\nexport const h = useSearchParams;\n',
          "client/src/alias.tsx":
            'import { Link as RouterLink } from "react-router-dom";\nexport const a = RouterLink;\n',
          "client/src/customized.tsx": "export const c = (id: string) => `feats/${id}/customization`;\n",
          "client/src/built.tsx":
            'export const b = (id: string) => `/rulesets/x/${buildCustomizationPath("feats", id)}/requirements`;\n',
          "client/src/state.tsx": "export const s = location.state?.openLevelUp === true;\n",
          "client/src/guarded.tsx": "export const g = entityPageState(location.state).from;\n",
          "client/src/redirectLink.tsx": "export const r = `/sign-in?redirect=${encodeURIComponent(to)}`;\n",
          "client/src/redirectParam.tsx": 'export const p = useSearchParam("redirect");\n',
          "client/src/components/auth/authRedirect.ts":
            "export const b = (to: string) => `/sign-in?redirect=${encodeURIComponent(to)}`;\n",
          "client/src/components/auth/useAuthRedirect.ts": 'export const u = () => useSearchParam("redirect");\n',
        },
        ["navigation"],
      ),
    ).toEqual([
      "navigation client/src/alias.tsx",
      "navigation client/src/clicked.tsx",
      "navigation client/src/customized.tsx",
      "navigation client/src/handler.tsx",
      "navigation client/src/menu.tsx",
      "navigation client/src/params.tsx",
      "navigation client/src/redirectLink.tsx",
      "navigation client/src/redirectParam.tsx",
      "navigation client/src/stat.tsx",
      "navigation client/src/state.tsx",
      "navigation client/src/window.tsx",
    ]);
  });

  test("an element that opens on click spreads clickableProps, and a row takes CLICKABLE_ROW_SX's tint", async () => {
    expect(
      await lintRepo(
        {
          "client/src/row.tsx":
            "export const r = <TableRow {...(open && clickableProps(open))} sx={[open && CLICKABLE_ROW_SX, ROW_SX]} />;\n",
          "client/src/toggle.tsx":
            'export const g = <TableRow {...toggleProps(open, toggle, "row")} sx={[CLICKABLE_ROW_SX, { bgcolor: "action.hover" }]} />;\n',
          "client/src/card.tsx": "export const c = <Card {...clickableProps(open)} sx={CLICKABLE_SX} />;\n",
          "client/src/untinted.tsx": "export const u = <TableRow {...clickableProps(open)} sx={CLICKABLE_SX} />;\n",
          "client/src/hover.tsx": "export const h = <TableRow hover sx={ROW_ACTIONS_HOVER_SX} />;\n",
          "client/src/tinted.tsx":
            'export const t = <Stack {...clickableProps(open)} sx={[CLICKABLE_SX, { "&:hover": { bgcolor: "action.hover" } }]} />;\n',
          "client/src/bare.tsx": "export const b = <Box onClick={open} />;\n",
          "client/src/button.tsx": "export const t = <Button onClick={open}>Open</Button>;\n",
        },
        ["clickable-elements"],
      ),
    ).toEqual([
      "clickable-elements client/src/bare.tsx",
      "clickable-elements client/src/hover.tsx",
      "clickable-elements client/src/tinted.tsx",
      "clickable-elements client/src/untinted.tsx",
    ]);
  });

  test("a Tooltip wraps a control that can be disabled in a span, and describes one its text names", async () => {
    expect(
      await lintRepo(
        {
          "client/src/span.tsx":
            'export const s = (\n  <Tooltip title="Why">\n    <span>\n      <Button disabled>Save</Button>\n    </span>\n  </Tooltip>\n);\n',
          "client/src/bare.tsx":
            'export const b = (\n  <Tooltip title="Why">\n    <IconButton aria-label="Save" disabled />\n  </Tooltip>\n);\n',
          "client/src/named.tsx":
            'export const n = (\n  <Tooltip title="Saves the feat">\n    <Button>Save</Button>\n  </Tooltip>\n);\n',
          "client/src/described.tsx":
            'export const d = (\n  <Tooltip title="Saves the feat" describeChild>\n    <Button>Save</Button>\n  </Tooltip>\n);\n',
        },
        ["tooltips"],
      ),
    ).toEqual(["tooltips client/src/bare.tsx", "tooltips client/src/named.tsx"]);
  });

  test("a Tooltip has no arrow", async () => {
    expect(
      await lintRepo(
        {
          "client/src/arrow.tsx": 'export const a = <Tooltip title="Edit" arrow><span /></Tooltip>;\n',
          "client/src/plain.tsx": 'export const p = <Tooltip title="Edit" placement="right"><span /></Tooltip>;\n',
        },
        ["tooltips"],
      ),
    ).toEqual(["tooltips client/src/arrow.tsx"]);
  });
});
