import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { lintRepo } from "./lintRepo.ts";

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("component rules", () => {
  test("a dialog's footer is a DialogFooter", async () => {
    expect(
      await lintRepo(
        {
          "client/src/raw.tsx": 'import { DialogActions } from "@mui/material";\nexport const r = <DialogActions />;\n',
          "client/src/footer.tsx": "export const f = <DialogFooter onCancel={close} />;\n",
          "client/src/components/common/DialogFooter.tsx":
            'import { DialogActions } from "@mui/material";\nexport const d = <DialogActions />;\n',
        },
        ["dialog-footers"],
      ),
    ).toEqual(["dialog-footers client/src/raw.tsx"]);
  });

  test("a button that adds something is an AddButton", async () => {
    expect(
      await lintRepo(
        {
          "client/src/raw.tsx": "export const r = <Button startIcon={<AddIcon />}>Add</Button>;\n",
          "client/src/other.tsx": "export const o = <Button startIcon={<EditIcon />}>Edit</Button>;\n",
          "client/src/add.tsx": 'export const a = <AddButton label="Add" onClick={add} />;\n',
          "client/src/components/common/AddButton.tsx": "export const b = <Button startIcon={<AddIcon />} />;\n",
        },
        ["add-buttons"],
      ),
    ).toEqual(["add-buttons client/src/raw.tsx"]);
  });

  test("an action written as a link is a LinkButton", async () => {
    expect(
      await lintRepo(
        {
          "client/src/raw.tsx": 'export const r = <MuiLink component="button" onClick={go}>Go</MuiLink>;\n',
          "client/src/anchor.tsx": 'export const a = <MuiLink href="/help">Help</MuiLink>;\n',
          "client/src/components/common/LinkButton.tsx": 'export const l = <MuiLink component="button" />;\n',
        },
        ["link-buttons"],
      ),
    ).toEqual(["link-buttons client/src/raw.tsx"]);
  });

  test("a chip switched by a selection is a ChoiceChip", async () => {
    expect(
      await lintRepo(
        {
          "client/src/raw.tsx": 'export const r = <Chip variant={on ? "filled" : "outlined"} label="A" />;\n',
          "client/src/plain.tsx": 'export const p = <Chip variant="outlined" label="A" />;\n',
          "client/src/components/common/ChoiceChip.tsx":
            'export const c = <Chip variant={on ? "filled" : "outlined"} />;\n',
        },
        ["choice-chips"],
      ),
    ).toEqual(["choice-chips client/src/raw.tsx"]);
  });

  test("the spinner at a list's foot is a NextPageSpinner", async () => {
    expect(
      await lintRepo(
        {
          "client/src/raw.tsx": 'export const r = <List><Stack><DiceSpinner size="small" /></Stack></List>;\n',
          "client/src/section.tsx": "export const s = <Stack><DiceSpinner /></Stack>;\n",
          "client/src/next.tsx": "export const n = <List><NextPageSpinner loading={busy} /></List>;\n",
        },
        ["next-page-spinners"],
      ),
    ).toEqual(["next-page-spinners client/src/raw.tsx"]);
  });

  test("an option's tooltip is an OptionTooltip", async () => {
    expect(
      await lintRepo(
        {
          "client/src/tree.tsx": "export const t = <Tooltip title={feat.requirementTree}><span /></Tooltip>;\n",
          "client/src/cut.tsx": "export const c = <Tooltip title={text.slice(0, 200)}><span /></Tooltip>;\n",
          "client/src/plain.tsx": 'export const p = <Tooltip title="Edit"><span /></Tooltip>;\n',
        },
        ["option-tooltips"],
      ),
    ).toEqual(["option-tooltips client/src/cut.tsx", "option-tooltips client/src/tree.tsx"]);
  });

  test("a menu keeps its anchor through useAnchorMenu", async () => {
    expect(
      await lintRepo(
        {
          "client/src/raw.tsx":
            "export function M() {\n  const [a] = useState<null | HTMLElement>(null);\n  return a;\n}\n",
          "client/src/map.tsx":
            "export function E() {\n  const [e] = useState<Record<string, HTMLElement | null>>({});\n  return e;\n}\n",
          "client/src/hook.tsx": "export function H() {\n  return useAnchorMenu();\n}\n",
        },
        ["anchor-menus"],
      ),
    ).toEqual(["anchor-menus client/src/raw.tsx"]);
  });

  test("a select bound to a form's field is a SelectField", async () => {
    expect(
      await lintRepo(
        {
          "client/src/ref.tsx": "export const r = <TextField select inputRef={field.ref} />;\n",
          "client/src/spread.tsx": "export const s = <TextField {...field} select />;\n",
          "client/src/bound.tsx": 'export const b = <FormTextField control={c} name="hd" select />;\n',
          "client/src/free.tsx": "export const f = <TextField select value={v} onChange={set} />;\n",
          "client/src/field.tsx":
            'export const g = <SelectField control={c} name="hd" label="Hit Die" options={o} />;\n',
        },
        ["select-fields"],
      ),
    ).toEqual([
      "select-fields client/src/bound.tsx",
      "select-fields client/src/ref.tsx",
      "select-fields client/src/spread.tsx",
    ]);
  });

  test("a form is noValidate, and its fields' checks are their rules", async () => {
    expect(
      await lintRepo(
        {
          "client/src/form.tsx": "export const f = <form onSubmit={submit} />;\n",
          "client/src/stack.tsx": 'export const s = <Stack component="form" onSubmit={submit} />;\n',
          "client/src/valid.tsx": 'export const v = <Stack component="form" noValidate onSubmit={submit} />;\n',
          "client/src/email.tsx": 'export const e = <FormTextField control={c} name="email" type="email" />;\n',
          "client/src/required.tsx": 'export const q = <FormTextField control={c} name="name" required />;\n',
          "client/src/ruled.tsx":
            'export const r = <FormTextField control={c} name="email" type="email" rules={OPTIONAL_EMAIL_RULES} />;\n',
          "client/src/bounds.tsx":
            'export const b = <FormTextField control={c} name="age" rules={{ required: true }} slotProps={{ htmlInput: { min: 1 } }} />;\n',
          "client/src/max.tsx":
            'export const m = <FormTextField control={c} name="level" rules={wholeNumberRules(1)} slotProps={{ htmlInput: { min: 1, max: 20 } }} />;\n',
          "client/src/whole.tsx":
            'export const w = <FormTextField control={c} name="level" rules={wholeNumberRules(1, "Required", 20)} slotProps={{ htmlInput: { min: 1, max: 20 } }} />;\n',
          "client/src/free.tsx":
            'export const t = <TextField type="number" slotProps={{ htmlInput: { min: 0 } }} />;\n',
        },
        ["form-validation"],
      ),
    ).toEqual([
      "form-validation client/src/bounds.tsx",
      "form-validation client/src/email.tsx",
      "form-validation client/src/form.tsx",
      "form-validation client/src/max.tsx",
      "form-validation client/src/required.tsx",
      "form-validation client/src/stack.tsx",
    ]);
  });

  test("a toggle keeps one label and says its state", async () => {
    expect(
      await lintRepo(
        {
          "client/src/flip.tsx":
            'export const f = <IconButton aria-label={on ? "Unstar ruleset" : "Star ruleset"} />;\n',
          "client/src/template.tsx":
            'export const t = <IconButton aria-label={`${open ? "Hide" : "Show"} details`} />;\n',
          "client/src/pair.tsx":
            'export const p = <IconButton aria-label={open ? "Collapse" : "Expand"} aria-expanded={open} />;\n',
          "client/src/toggle.tsx": 'export const g = <IconButton aria-label="Toggle scope" />;\n',
          "client/src/pressed.tsx": 'export const s = <IconButton aria-label="Star ruleset" aria-pressed={on} />;\n',
          "client/src/actions.tsx": 'export const a = <IconButton aria-label={self ? "Leave" : "Remove"} />;\n',
        },
        ["toggle-states"],
      ),
    ).toEqual([
      "toggle-states client/src/flip.tsx",
      "toggle-states client/src/pair.tsx",
      "toggle-states client/src/template.tsx",
      "toggle-states client/src/toggle.tsx",
    ]);
  });

  test("a toggle leads with one arrow", async () => {
    expect(
      await lintRepo(
        {
          "client/src/less.tsx": "export const l = <ExpandLessIcon />;\n",
          "client/src/more.tsx": "export const m = <ExpandMoreIcon />;\n",
          "client/src/accordion.tsx":
            'export const a = <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} />;\n',
          "client/src/arrow.tsx": "export const r = <ExpandArrow open={open} />;\n",
          "client/src/button.tsx":
            "export const b = <IconButton onClick={toggle}><ExpandArrow open={open} /></IconButton>;\n",
          "client/src/clickable.tsx":
            "export const c = <TableRow {...clickableProps(toggle)} aria-expanded={open} />;\n",
          "client/src/row.tsx": 'export const t = <TableRow {...toggleProps(open, toggle, "row")} />;\n',
          "client/src/components/common/ExpandArrow.tsx": "export const e = <ExpandMoreIcon />;\n",
        },
        ["expand-arrows"],
      ),
    ).toEqual([
      "expand-arrows client/src/button.tsx",
      "expand-arrows client/src/clickable.tsx",
      "expand-arrows client/src/less.tsx",
      "expand-arrows client/src/more.tsx",
    ]);
  });

  test("a dialog asks before a loss with an InlineConfirm, never by hand", async () => {
    expect(
      await lintRepo(
        {
          "client/src/bar.tsx": "export const b = <AnimatedAlert in={open} action={<Button>Discard</Button>} />;\n",
          "client/src/plain.tsx": 'export const p = <AnimatedAlert in={open} severity="info">Saved</AnimatedAlert>;\n',
          "client/src/asked.tsx": "export const a = <Stack><Typography>Are you sure?</Typography></Stack>;\n",
          "client/src/message.tsx":
            "export const m = <ConfirmDialog message={<>Are you sure you want to remove <b>it</b>?</>} />;\n",
          "client/src/inline.tsx":
            'export const i = <InlineConfirm open cancelLabel="Keep" confirmLabel="Revoke">Revoke this link?</InlineConfirm>;\n',
          "client/src/components/common/InlineConfirm.tsx":
            "export const c = <AnimatedAlert in={open} action={<Button>Go</Button>} />;\n",
        },
        ["inline-confirms"],
      ),
    ).toEqual(["inline-confirms client/src/asked.tsx", "inline-confirms client/src/bar.tsx"]);
  });
});
