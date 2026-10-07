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
          "client/src/custom.tsx":
            "export const c = <TextField select inputRef={inputRef} value={value} onChange={onChange} />;\n",
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

  test("a confirmation is a ConfirmDialog, over a dialog too, never by hand", async () => {
    expect(
      await lintRepo(
        {
          "client/src/bar.tsx": "export const b = <AnimatedAlert in={open} action={<Button>Discard</Button>} />;\n",
          "client/src/plain.tsx": 'export const p = <AnimatedAlert in={open} severity="info">Saved</AnimatedAlert>;\n',
          "client/src/asked.tsx": "export const a = <Stack><Typography>Are you sure?</Typography></Stack>;\n",
          "client/src/message.tsx":
            "export const m = <ConfirmDialog message={<>Are you sure you want to remove <b>it</b>?</>} />;\n",
          "client/src/inline.tsx":
            'export const i = <InlineConfirm open cancelLabel="Keep" confirmLabel="Revoke">Are you sure?</InlineConfirm>;\n',
          "client/src/components/common/ValidationIssuesAlert.tsx":
            "export const v = <AnimatedAlert in={open} action={<Button>Proceed Anyway</Button>} />;\n",
        },
        ["confirm-dialogs"],
      ),
    ).toEqual([
      "confirm-dialogs client/src/asked.tsx",
      "confirm-dialogs client/src/bar.tsx",
      "confirm-dialogs client/src/inline.tsx",
    ]);
  });

  test("a table's frame is a TableFrame, and the theme draws its header", async () => {
    expect(
      await lintRepo(
        {
          "client/src/framed.tsx": "export const f = <TableContainer component={Paper}><Table /></TableContainer>;\n",
          "client/src/bare.tsx": "export const b = <TableContainer><Table /></TableContainer>;\n",
          "client/src/strong.tsx":
            "export const s = <TableHead><TableRow><TableCell><strong>Name</strong></TableCell></TableRow></TableHead>;\n",
          "client/src/tinted.tsx":
            'export const t = <TableHead><TableRow sx={{ bgcolor: "action.hover" }} /></TableHead>;\n',
          "client/src/weighted.tsx":
            "const HEADER_SX = { fontWeight: 600 };\n" +
            "export const w = <TableHead><TableRow><TableCell sx={HEADER_SX}>Name</TableCell></TableRow></TableHead>;\n",
          "client/src/sized.tsx":
            'export const z = <TableHead><TableRow><TableCell sx={{ width: "20%" }}>Name</TableCell></TableRow></TableHead>;\n',
          "client/src/body.tsx":
            "export const y = <TableBody><TableRow><TableCell sx={{ fontWeight: 600 }}>Total</TableCell></TableRow></TableBody>;\n",
          "client/src/components/common/TableFrame.tsx":
            'export const o = <TableContainer component={Paper} variant="outlined" />;\n',
        },
        ["table-frames"],
      ),
    ).toEqual([
      "table-frames client/src/framed.tsx",
      "table-frames client/src/strong.tsx",
      "table-frames client/src/tinted.tsx",
      "table-frames client/src/weighted.tsx",
    ]);
  });

  test("a card's title is a CardTitle", async () => {
    const title =
      'export const t = <Typography component="h2" sx={{ typography: { xs: "h6", sm: "h5" } }}>Skills</Typography>;\n';
    expect(
      await lintRepo(
        {
          "client/src/title.tsx": title,
          "client/src/fixed.tsx": 'export const f = <Typography component="h2" variant="h6">Characters</Typography>;\n',
          "client/src/sub.tsx":
            'export const s = <Typography component="h3" sx={{ typography: { xs: "body1", sm: "h6" } }}>Set 1</Typography>;\n',
          "client/src/components/common/CardTitle.tsx": title,
        },
        ["card-titles"],
      ),
    ).toEqual(["card-titles client/src/title.tsx"]);
  });

  test("an empty list's line is a BlankNote", async () => {
    expect(
      await lintRepo(
        {
          "client/src/line.tsx": 'export const l = <Typography variant="body2">No local changes</Typography>;\n',
          "client/src/alert.tsx":
            'export const a = <Alert severity="info">No feats to select at this level.</Alert>;\n',
          "client/src/value.tsx": "export const v = <Typography>No</Typography>;\n",
          "client/src/slot.tsx": "export const s = <Typography>No {label}</Typography>;\n",
          "client/src/note.tsx": "export const n = <BlankNote>No local changes</BlankNote>;\n",
        },
        ["blank-notes"],
      ),
    ).toEqual(["blank-notes client/src/alert.tsx", "blank-notes client/src/line.tsx"]);
  });

  test("a page's first load is a PageLoader, and any other spinner takes a section's spacing alone", async () => {
    const page = "export const p = <DiceSpinner sx={{ py: { xs: 4, sm: 8 } }} />;\n";
    const large = 'export const l = <DiceSpinner size="large" />;\n';
    expect(
      await lintRepo(
        {
          "client/src/tall.tsx": "export const t = <DiceSpinner sx={{ minHeight: 400 }} />;\n",
          "client/src/large.tsx": large,
          "client/src/page.tsx": page,
          "client/src/section.tsx": "export const s = <DiceSpinner sx={{ py: 4 }} />;\n",
          "client/src/centred.tsx": "export const c = <DiceSpinner sx={{ flex: 1 }} />;\n",
          "client/src/deeper.tsx": "export const d = <DiceSpinner sx={{ py: 8 }} />;\n",
          "client/src/plain.tsx": "export const n = <DiceSpinner />;\n",
          "client/src/components/common/PageLoader.tsx": page,
          "client/src/components/characters/CharacterDetailSkeleton.tsx": large,
        },
        ["page-loaders"],
      ),
    ).toEqual([
      "page-loaders client/src/centred.tsx",
      "page-loaders client/src/deeper.tsx",
      "page-loaders client/src/large.tsx",
      "page-loaders client/src/page.tsx",
      "page-loaders client/src/tall.tsx",
    ]);
  });

  test("a heading under a card's is a SubsectionTitle 8px above its content, an entry's name an EntryTitle", async () => {
    const own = 'export const o = <Typography variant="subtitle1" component="h3">Granted</Typography>;\n';
    expect(
      await lintRepo(
        {
          "client/src/sub.tsx": 'export const s = <Typography variant="h6" component="h3">Combat Stats</Typography>;\n',
          "client/src/entry.tsx": 'export const e = <Typography component="h4">Dodge</Typography>;\n',
          "client/src/card.tsx": 'export const c = <Typography component="h2">Skills</Typography>;\n',
          "client/src/wide.tsx":
            "export const w = <Stack spacing={2}><SubsectionTitle>Combat Stats</SubsectionTitle><Box /></Stack>;\n",
          "client/src/tight.tsx":
            "export const t = <Stack spacing={1}>{/* Its stats */}<SubsectionTitle>Stats</SubsectionTitle><Box /></Stack>;\n",
          "client/src/row.tsx":
            'export const r = <Stack direction="row" spacing={2}><SubsectionTitle>Stats</SubsectionTitle><Chip /></Stack>;\n',
          "client/src/components/common/SubsectionTitle.tsx": own,
          "client/src/components/common/EntryTitle.tsx": own,
        },
        ["section-headings"],
      ),
    ).toEqual([
      "section-headings client/src/entry.tsx",
      "section-headings client/src/sub.tsx",
      "section-headings client/src/wide.tsx",
    ]);
  });

  test("a page's content sits 32px under its header", async () => {
    expect(
      await lintRepo(
        {
          "client/src/list.tsx":
            'export const l = <Stack spacing={3}><PageHeader title="Characters" /><Box /></Stack>;\n',
          "client/src/sheet.tsx": "export const s = <Stack spacing={2}><CharacterHeader /><Box /></Stack>;\n",
          "client/src/page.tsx": "export const p = <Stack spacing={4}><DetailPageHeader /><Box /></Stack>;\n",
          "client/src/other.tsx": "export const o = <Stack spacing={2}><Box /><Box /></Stack>;\n",
        },
        ["page-gaps"],
      ),
    ).toEqual(["page-gaps client/src/list.tsx", "page-gaps client/src/sheet.tsx"]);
  });

  test("a value that isn't there is an EmptyValue", async () => {
    const own = "export const o = <Box>—</Box>;\n";
    expect(
      await lintRepo(
        {
          "client/src/text.tsx": "export const t = <Typography>—</Typography>;\n",
          "client/src/fallback.tsx": 'export const f = <TableCell>{value || "—"}</TableCell>;\n',
          "client/src/helper.ts": 'export function slot(worn: boolean) {\n  return worn ? "Hand" : "—";\n}\n',
          "client/src/separator.tsx": "export const s = <Typography>— {uses}/day</Typography>;\n",
          "client/src/value.tsx": "export const v = <TableCell>{value ?? <EmptyValue />}</TableCell>;\n",
          "client/src/components/common/EmptyValue.tsx": own,
        },
        ["empty-values"],
      ),
    ).toEqual([
      "empty-values client/src/fallback.tsx",
      "empty-values client/src/helper.ts",
      "empty-values client/src/text.tsx",
    ]);
  });
});
