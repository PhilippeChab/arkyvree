import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { lintRepo } from "./lintRepo.ts";

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("feedback rules", () => {
  test("a dialog stays mounted, and one about a record opens through useDialogState", async () => {
    expect(
      await lintRepo(
        {
          "client/src/mounted.tsx": "export const m = <ConfirmDialog open={dialog.open} onClose={dialog.close} />;\n",
          "client/src/conditional.tsx": "export const c = removeTarget && <ConfirmDialog open={!!removeTarget} />;\n",
          "client/src/always.tsx": "export const a = <Modal open onClose={close} />;\n",
          "client/src/record.tsx": "export const r = <EditDialog open={target !== null} />;\n",
          "client/src/target.tsx":
            "export const t = dialog.target && <AddLevelModal open={dialog.open} onExited={dialog.onExited} />;\n",
          "client/src/flag.tsx":
            "export function F() {\n" +
            "  const [editOpen, setEditOpen] = useState(false);\n" +
            "  const [selected, setSelected] = useState<Row | null>(null);\n" +
            "  const handleEdit = (row: Row) => {\n" +
            "    setSelected(row);\n" +
            "    setEditOpen(true);\n" +
            "  };\n" +
            "  return <EditDialog open={editOpen} onClose={() => setEditOpen(false)} onEdit={handleEdit} item={selected} />;\n" +
            "}\n",
          "client/src/plain.tsx":
            "export function P() {\n" +
            "  const [addOpen, setAddOpen] = useState(false);\n" +
            "  const handleAdd = () => {\n" +
            "    reset();\n" +
            "    setAddOpen(true);\n" +
            "  };\n" +
            "  return <CreateDialog open={addOpen} onClose={() => setAddOpen(false)} onAdd={handleAdd} />;\n" +
            "}\n",
        },
        ["dialog-mounts"],
      ),
    ).toEqual([
      "dialog-mounts client/src/always.tsx",
      "dialog-mounts client/src/conditional.tsx",
      "dialog-mounts client/src/conditional.tsx",
      "dialog-mounts client/src/flag.tsx",
      "dialog-mounts client/src/record.tsx",
    ]);
  });

  test("a menu's action is an ActionMenuItem, and a panel a Popover", async () => {
    expect(
      await lintRepo(
        {
          "client/src/action.tsx":
            'export const a = <Menu open><ActionMenuItem icon={DeleteIcon} label="Delete Permanently" onClick={go} /></Menu>;\n',
          "client/src/raw.tsx": "export const r = <Menu open><MenuItem onClick={go}>Delete</MenuItem></Menu>;\n",
          "client/src/choice.tsx":
            "export const c = <Menu open><MenuItem selected={on} onClick={go}>Name</MenuItem></Menu>;\n",
          "client/src/panel.tsx": "export const p = <Menu open><Stack /></Menu>;\n",
        },
        ["menus"],
      ),
    ).toEqual(["menus client/src/panel.tsx", "menus client/src/raw.tsx"]);
  });

  test("a menu is sized by its items, opens where MUI puts it, and its delete is Delete Permanently", async () => {
    expect(
      await lintRepo(
        {
          "client/src/plain.tsx": "export const p = <Menu anchorEl={a} open onClose={close}><Divider /></Menu>;\n",
          "client/src/wide.tsx":
            "export const w = <Menu open slotProps={{ paper: { sx: { minWidth: 200 } } }}><Divider /></Menu>;\n",
          "client/src/anchored.tsx":
            'export const a = <Menu open anchorOrigin={{ vertical: "bottom", horizontal: "right" }}><Divider /></Menu>;\n',
          "client/src/delete.tsx":
            'export const d = <ActionMenuItem icon={DeleteIcon} label="Delete" onClick={go} />;\n',
        },
        ["menus"],
      ),
    ).toEqual(["menus client/src/anchored.tsx", "menus client/src/delete.tsx", "menus client/src/wide.tsx"]);
  });

  test("a button that starts a request shows it running", async () => {
    expect(
      await lintRepo(
        {
          "client/src/bare.tsx":
            "export const b = <Button onClick={() => m.mutate()} disabled={m.isPending}>Save</Button>;\n",
          "client/src/spinner.tsx":
            'export const s = <Button onClick={() => m.mutate()} disabled={m.isPending}><DiceSpinner size="small" loading={m.isPending}>Save</DiceSpinner></Button>;\n',
          "client/src/plain.tsx": "export const p = <Button onClick={close} disabled={busy}>Close</Button>;\n",
        },
        ["pending-buttons"],
      ),
    ).toEqual(["pending-buttons client/src/bare.tsx"]);
  });

  test("a page that couldn't load says why in loadFailureMessage's words", async () => {
    expect(
      await lintRepo(
        {
          "client/src/worded.tsx": 'export const w = <PageError message={loadFailureMessage("Profile", error)} />;\n',
          "client/src/written.tsx": 'export const x = <PageError message="Failed to load your profile." />;\n',
        },
        ["page-errors"],
      ),
    ).toEqual(["page-errors client/src/written.tsx"]);
  });

  test("a page that couldn't load shows a PageError, its way back named for where it goes", async () => {
    const message = 'message={loadFailureMessage("Skill", error)}';
    expect(
      await lintRepo(
        {
          "client/src/bare.tsx": `export const b = <EntityPageError ${message} backLabel="Back" backTo={to} />;\n`,
          "client/src/named.tsx": `export const n = <PageError ${message} backLabel="Back to Ruleset" backTo={to} />;\n`,
          "client/src/derived.tsx": `export const d = <EntityPageError ${message} backLabel={back.label} backTo={to} />;\n`,
          "client/src/strip.tsx":
            'export const s = <Container maxWidth="xl"><LoadError what="Dashboard" error={error} /></Container>;\n',
          "client/src/alert.tsx":
            'export const a = <Container maxWidth="xl"><Alert severity="error">Invalid address</Alert></Container>;\n',
          "client/src/section.tsx": 'export const t = <Stack><LoadError what="Feats" error={error} /></Stack>;\n',
        },
        ["page-errors"],
      ),
    ).toEqual([
      "page-errors client/src/alert.tsx",
      "page-errors client/src/bare.tsx",
      "page-errors client/src/strip.tsx",
    ]);
  });

  test("a picker says it's loading in its open list", async () => {
    const field = "renderInput={(params) => <TextField {...params} />}";
    expect(
      await lintRepo(
        {
          "client/src/dice.tsx": [
            "export const d = (",
            "  <Autocomplete",
            "    loading={loading}",
            "    renderInput={(params) => (",
            "      <TextField",
            "        {...params}",
            '        slotProps={{ input: { endAdornment: loading && <DiceSpinner size="small" /> } }}',
            "      />",
            "    )}",
            "  />",
            ");",
            "",
          ].join("\n"),
          "client/src/silent.tsx": `export const s = <Autocomplete noOptionsText={emptyOptionsText("Languages", error)} ${field} />;\n`,
          "client/src/loads.tsx": `export const l = <Autocomplete loading={loading} noOptionsText={emptyOptionsText("Items", error)} ${field} />;\n`,
          "client/src/spread.tsx": `export const p = <Autocomplete {...props} noOptionsText={emptyOptionsText("Aptitudes", error)} ${field} />;\n`,
          "client/src/fixed.tsx": `export const f = <Autocomplete options={TAGS} ${field} />;\n`,
        },
        ["pickers"],
      ),
    ).toEqual(["pickers client/src/dice.tsx", "pickers client/src/silent.tsx"]);
  });

  test("what reads a query reads its error too", async () => {
    expect(
      await lintRepo(
        {
          "client/src/both.ts":
            "export function a() {\n  const { data, error } = useQuery(q);\n  return [data, error];\n}\n",
          "client/src/data.ts": "export function b() {\n  const { data } = useQuery(q);\n  return data;\n}\n",
          "client/src/infinite.ts":
            "export function c() {\n  const { data, isLoading } = useInfiniteQuery(q);\n  return [data, isLoading];\n}\n",
          "client/src/whole.ts": "export function d() {\n  const query = useQuery(q);\n  return query.data;\n}\n",
          "client/src/wholeError.ts":
            "export function e() {\n  const query = useQuery(q);\n  return query.error ?? query.data;\n}\n",
          "client/src/returned.ts": "export function f() {\n  return useQuery(q);\n}\n",
          "client/src/listbox.ts":
            "export function g() {\n  const { items, onScroll } = useListboxQuery(q);\n  return [items, onScroll];\n}\n",
          "client/src/listboxError.ts":
            "export function h() {\n  const { items, error } = useListboxQuery(q);\n  return [items, error];\n}\n",
          "client/src/wrapper.ts":
            "export function i() {\n  const { data } = useRulesetSaves(id);\n  return data;\n}\n",
          "client/src/image.ts": "export function j() {\n  const { data } = useAttachment(slot);\n  return data;\n}\n",
        },
        ["query-errors"],
      ),
    ).toEqual([
      "query-errors client/src/data.ts",
      "query-errors client/src/infinite.ts",
      "query-errors client/src/listbox.ts",
      "query-errors client/src/whole.ts",
      "query-errors client/src/wrapper.ts",
    ]);
  });
});
