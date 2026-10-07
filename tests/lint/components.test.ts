import { describe, expect, setDefaultTimeout, test } from "bun:test";

import { lines, lintRepo } from "./lintRepo.ts";

// Each test runs oxlint, which a busy suite can slow past the default 5s.
setDefaultTimeout(30_000);

describe("component rules", () => {
  test("a dialog's footer is a DialogFooter", async () => {
    expect(
      await lintRepo(
        {
          "client/src/raw.tsx": 'import { DialogActions } from "@mui/material";\nexport const r = <DialogActions />;\n',
          "client/src/footer.tsx": "export const f = <DialogFooter onCancel={close} />;\n",
          "client/src/steps.tsx":
            'export const s = <DialogFooter onCancel={close} action={{ label: "Next" }}><Button onClick={back}>Back</Button></DialogFooter>;\n',
          "client/src/action.tsx":
            'export const a = <DialogFooter onCancel={close}><Button variant="contained" onClick={next}>Next</Button></DialogFooter>;\n',
          "client/src/components/common/DialogFooter.tsx":
            'import { DialogActions } from "@mui/material";\nexport const d = <DialogActions />;\n',
        },
        ["dialog-footers"],
      ),
    ).toEqual(["dialog-footers client/src/action.tsx", "dialog-footers client/src/raw.tsx"]);
  });

  test("a button that adds something is an AddButton", async () => {
    expect(
      await lintRepo(
        {
          "client/src/raw.tsx": "export const r = <Button startIcon={<AddIcon />}>Add</Button>;\n",
          "client/src/words.tsx": 'export const w = <Button variant="contained" onClick={add}>Add Item</Button>;\n',
          "client/src/other.tsx": "export const o = <Button startIcon={<EditIcon />}>Edit</Button>;\n",
          "client/src/address.tsx": "export const d = <Button onClick={go}>Address Book</Button>;\n",
          "client/src/add.tsx": 'export const a = <AddButton label="Add" onClick={add} />;\n',
          "client/src/components/common/AddButton.tsx": "export const b = <Button startIcon={<AddIcon />} />;\n",
        },
        ["add-buttons"],
      ),
    ).toEqual(["add-buttons client/src/raw.tsx", "add-buttons client/src/words.tsx"]);
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
          "client/src/pages/characters/details/components/dnd3.5/SkillsStep.tsx":
            "export const s = <Tooltip title={skill.description}><span /></Tooltip>;\n",
          "client/src/pages/characters/details/components/dnd3.5/OptionTooltip.tsx":
            'export const w = <Tooltip title="Edit"><span /></Tooltip>;\n',
        },
        ["option-tooltips"],
      ),
    ).toEqual([
      "option-tooltips client/src/cut.tsx",
      "option-tooltips client/src/pages/characters/details/components/dnd3.5/SkillsStep.tsx",
      "option-tooltips client/src/tree.tsx",
    ]);
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
          "client/src/components/characters/validation/ValidationIssuesAlert.tsx":
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
          "client/src/period.tsx": "export const p = <BlankNote>No feats at this level.</BlankNote>;\n",
          "client/src/search.tsx":
            'export const s = <BlankNote>Nothing matches "{search}" — try another search</BlankNote>;\n',
          "client/src/options.tsx": 'export const o = <Autocomplete noOptionsText="No values found." />;\n',
          "client/src/bare.tsx": 'export const b = <Autocomplete noOptionsText="No values found" />;\n',
        },
        ["blank-notes"],
      ),
    ).toEqual([
      "blank-notes client/src/alert.tsx",
      "blank-notes client/src/line.tsx",
      "blank-notes client/src/options.tsx",
      "blank-notes client/src/period.tsx",
    ]);
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

  test("a character sheet's page loads with the sheet's skeleton", async () => {
    expect(
      await lintRepo(
        {
          "client/src/shared.tsx": "export const s = loading ? <PageLoader /> : <CharacterSheetBody />;\n",
          "client/src/sheet.tsx": "export const c = loading ? <CharacterDetailSkeleton /> : <CharacterSheetBody />;\n",
          "client/src/list.tsx": "export const l = loading ? <PageLoader /> : <ListCardGrid />;\n",
        },
        ["page-loaders"],
      ),
    ).toEqual(["page-loaders client/src/shared.tsx"]);
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

  test("a page starts 32px under the app bar, a tab's content 56px under its tabs", async () => {
    const own = 'export const o = <Box role="tabpanel" sx={{ py: 3 }} />;\n';
    expect(
      await lintRepo(
        {
          "client/src/top.tsx": 'export const t = <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 } }} />;\n',
          "client/src/column.tsx": 'export const c = <Container maxWidth="xl" />;\n',
          "client/src/end.tsx": 'export const e = <Container maxWidth="lg" sx={{ pb: { xs: 5, sm: 7 } }} />;\n',
          "client/src/invite.tsx": 'export const i = <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 8 } }} />;\n',
          "client/src/panel.tsx": own,
          "client/src/tab.tsx": "export const p = <SectionTabPanel hidden={hidden} />;\n",
          "client/src/components/common/SectionTabs.tsx": own,
        },
        ["page-gaps"],
      ),
    ).toEqual(["page-gaps client/src/panel.tsx", "page-gaps client/src/top.tsx"]);
  });

  test("a page's title is its header's", async () => {
    const title = 'export const t = <Typography component="h1">Fighter</Typography>;\n';
    expect(
      await lintRepo(
        {
          "client/src/pages/rulesets/components/EntityDetailLayout.tsx": title,
          "client/src/header.tsx": "export const h = <DetailPageHeader title={name} description={ruleset} />;\n",
          "client/src/components/common/DetailPageHeader.tsx": title,
          "client/src/components/auth/AuthPage.tsx": title,
        },
        ["page-titles"],
      ),
    ).toEqual(["page-titles client/src/pages/rulesets/components/EntityDetailLayout.tsx"]);
  });

  test("a panel is a Panel: flat paper, its padding and corner the theme's", async () => {
    expect(
      await lintRepo(
        {
          "client/src/card.tsx":
            "export const c = <Card><CardContent><CardTitle>Theme</CardTitle></CardContent></Card>;\n",
          "client/src/auth.tsx": 'export const a = <Card><Typography component="h1">Sign In</Typography></Card>;\n',
          "client/src/list.tsx": "export const l = <Card onClick={open}><Avatar /></Card>;\n",
          "client/src/paper.tsx": "export const p = <Paper sx={{ p: { xs: 2, sm: 3 } }}><Box /></Paper>;\n",
          "client/src/stack.tsx": "export const s = <Stack component={Paper} spacing={3} sx={{ p: 3 }} />;\n",
          "client/src/banner.tsx": "export const b = <Paper sx={{ p: 4, background: gradient }} />;\n",
          "client/src/frame.tsx": 'export const f = <Paper variant="outlined" sx={{ p: 1 }} />;\n',
          "client/src/bare.tsx": 'export const r = <Paper sx={{ overflow: "hidden" }} />;\n',
          "client/src/corner.tsx": "export const k = <Panel sx={{ borderRadius: 3 }} />;\n",
          "client/src/padded.tsx": "export const d = <Panel sx={{ py: 6 }} />;\n",
          "client/src/panel.tsx": 'export const n = <Panel spacing={3} sx={{ textAlign: "center" }} />;\n',
          "client/src/components/common/Panel.tsx": "export const o = <Stack component={Paper} sx={{ p: 4 }} />;\n",
        },
        ["panels"],
      ),
    ).toEqual([
      "panels client/src/auth.tsx",
      "panels client/src/card.tsx",
      "panels client/src/corner.tsx",
      "panels client/src/padded.tsx",
      "panels client/src/paper.tsx",
      "panels client/src/stack.tsx",
    ]);
  });

  test("a list's actions sit in its toolbar, the list 24px under it and its Load More 16px under the list", async () => {
    const more = "<LoadMoreButton hasNextPage={more} isFetchingNextPage={fetching} onClick={next} />";
    expect(
      await lintRepo(
        {
          "client/src/close.tsx": "export const c = <Stack spacing={2}><SearchBar /><Table /></Stack>;\n",
          "client/src/toolbar.tsx":
            "export const t = <Stack spacing={3}>{canEdit && <ListToolbar />}<Table /></Stack>;\n",
          "client/src/far.tsx": `export const f = <Stack spacing={3}><Table />${more}</Stack>;\n`,
          "client/src/more.tsx": `export const m = <Stack spacing={2}><Table />${more}</Stack>;\n`,
          "client/src/bare.tsx":
            'export const b = <Stack direction="row" sx={{ justifyContent: "flex-end" }}><AddButton label="Add" /></Stack>;\n',
          "client/src/save.tsx":
            'export const s = <Stack direction="row" sx={{ justifyContent: "flex-end" }}><Button>Save</Button></Stack>;\n',
          "client/src/bar.tsx": 'export const a = <ListToolbar actions={<AddButton label="Add" onClick={add} />} />;\n',
        },
        ["list-toolbars"],
      ),
    ).toEqual([
      "list-toolbars client/src/bare.tsx",
      "list-toolbars client/src/close.tsx",
      "list-toolbars client/src/far.tsx",
    ]);
  });

  test("a skeleton means loading: a table's is a TableSkeleton, anything else's a spinner", async () => {
    const own = "export const o = <Skeleton />;\n";
    expect(
      await lintRepo(
        {
          "client/src/table.tsx":
            "export const t = <Table><TableHead /><TableBody><TableRow><TableCell><Skeleton /></TableCell></TableRow></TableBody></Table>;\n",
          "client/src/rows.tsx":
            "export const r = <TableRow><TableCell colSpan={2}><Skeleton /></TableCell></TableRow>;\n",
          "client/src/hidden.tsx": 'export const h = <>{partial && <Skeleton variant="rounded" height={40} />}</>;\n',
          "client/src/bars.tsx": 'export const b = <Stack spacing={1}><Skeleton variant="rectangular" /></Stack>;\n',
          "client/src/components/common/TableSkeleton.tsx": own,
          "client/src/components/characters/CharacterDetailSkeleton.tsx": own,
          "client/src/pages/rulesets/components/EntityDetailLayout.tsx": own,
        },
        ["skeletons"],
      ),
    ).toEqual(["skeletons client/src/bars.tsx", "skeletons client/src/hidden.tsx", "skeletons client/src/table.tsx"]);
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
          "client/src/stock.tsx":
            'export const s = <DetailPageHeader description={ruleset.description || "Explore the rules"} />;\n',
          "client/src/words.tsx":
            'export const w = <Typography>{description || "No description provided"}</Typography>;\n',
          "client/src/shared.tsx": "export const d = <Typography>{description || NO_DESCRIPTION}</Typography>;\n",
          "client/src/form.ts": 'export const f = { description: item.description ?? "" };\n',
          "client/src/components/common/EmptyValue.tsx": `${own}export const NO_DESCRIPTION = "No description provided";\n`,
        },
        ["empty-values"],
      ),
    ).toEqual([
      "empty-values client/src/fallback.tsx",
      "empty-values client/src/helper.ts",
      "empty-values client/src/stock.tsx",
      "empty-values client/src/text.tsx",
      "empty-values client/src/words.tsx",
    ]);
  });

  test("a notification shows through NotificationMessage, and what it changed through ActivityDetails", async () => {
    const details = "export const d = <Tooltip title={formatActivityDetails(data)} />;\n";
    const own = "export const m = <Typography>{formatNotificationMessage(type, data)}</Typography>;\n";
    expect(
      await lintRepo(
        {
          "client/src/bell.tsx": own,
          "client/src/card.tsx": "export const c = <NotificationMessage notification={notification} unread />;\n",
          "client/src/components/notifications/ActivityDetails.tsx": details,
          "client/src/components/notifications/NotificationMessage.tsx": own,
          "client/src/log.tsx": details,
        },
        ["notification-messages"],
      ),
    ).toEqual(["notification-messages client/src/bell.tsx", "notification-messages client/src/log.tsx"]);
  });

  test("a row's actions are a RowActions of RowActions, in a row that reveals them", async () => {
    const own = 'export const o = <Stack className="row-actions" sx={ROW_ACTIONS_SX} />;\n';
    expect(
      await lintRepo(
        {
          "client/src/table.tsx": lines(
            "export const t = (",
            "  <TableRow sx={[CLICKABLE_SX, ROW_ACTIONS_HOVER_SX]}>",
            "    <TableCell>",
            "      <RowActions>",
            '        {canEdit && <RowAction icon={EditIcon} label="Edit" onClick={edit} />}',
            '        <RowAction icon={DeleteIcon} label="Delete" intent="destructive" onClick={remove} />',
            "      </RowActions>",
            "    </TableCell>",
            "  </TableRow>",
            ");",
          ),
          "client/src/button.tsx": lines(
            "export const b = (",
            "  <TableRow sx={ROW_ACTIONS_HOVER_SX}>",
            "    <RowActions>",
            '      <IconButton aria-label="Edit" onClick={edit} />',
            "    </RowActions>",
            "  </TableRow>",
            ");",
          ),
          "client/src/hidden.tsx": lines(
            "export const h = (",
            "  <TableRow>",
            "    <RowActions>",
            '      <RowAction icon={EditIcon} label="Edit" onClick={edit} />',
            "    </RowActions>",
            "  </TableRow>",
            ");",
          ),
          "client/src/class.tsx": 'export const c = <Stack className="row-actions" />;\n',
          "client/src/render.tsx": lines(
            "export const r = (",
            "  <ContributorsTable",
            '    renderActions={(row) => <Tooltip title="Remove"><IconButton aria-label="Remove" /></Tooltip>}',
            "  />",
            ");",
          ),
          "client/src/callback.tsx": lines(
            "export const k = (",
            "  <ContributorsTable",
            '    renderActions={(row) => <RowAction icon={DeleteIcon} label="Remove" onClick={remove} />}',
            "  />",
            ");",
          ),
          "client/src/components/common/RowActions.tsx": own,
        },
        ["row-actions"],
      ),
    ).toEqual([
      "row-actions client/src/button.tsx",
      "row-actions client/src/class.tsx",
      "row-actions client/src/hidden.tsx",
      "row-actions client/src/render.tsx",
    ]);
  });
});
