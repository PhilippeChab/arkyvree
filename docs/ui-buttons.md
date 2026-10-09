# Action button conventions

The frontend uses MUI Buttons + MenuItems for actions. Color and variant carry **intent**, so users can read a button's consequence at a glance.

## Intent palette

| Intent | Examples | Button | MenuItem |
|---|---|---|---|
| **Default action** | Create, Update, Save, Send Invite, Invite, Generate Link, Subscribe, Link Character | `variant="contained"` (default color) | n/a |
| **Destructive** | Delete, Remove, Reject, Unsubscribe from Extension, Unlink (a Google account), Revoke Link, Delete Account | `variant="contained" color="error"` | `sx={{ color: "error.main" }}` |
| **Caution** (reversible self-action) | Archive, Leave (ruleset/character/campaign), Proceed Anyway | `variant="contained" color="warning"` | `sx={{ color: "warning.main" }}` |
| **Positive** | Publish, Accept, Unarchive | `variant="contained" color="success"` | `sx={{ color: "success.main" }}` |
| **Cancel / Close** | Cancel, Close (in dialogs) | `variant="outlined" color="inherit"` | n/a |

Page action menus use `ActionMenuItem` (`components/common`), whose `intent` (`destructive` / `caution` / `positive`) applies the MenuItem column, and a row's actions `RowAction`, whose `intent` colors its icon: grey otherwise, Edit included.

`arkyvree/button-intents` holds the Button column: a `Button` colored `error`, `warning` or `success` is `variant="contained"`, wherever it stands (a dialog, a panel's row, an alert).

Apply the matrix even when the destructive action fires directly with no confirm dialog (e.g. inline Reject buttons in notification surfaces and invite cards) — the visual treatment is what tells the user the click is consequential.

## How this works in the theme

`client/src/theme/appTheme.ts` makes contained buttons palette-aware: `MuiButton`'s `contained` override switches on `ownerState.color` (`containedGradient`) so `color="error"` actually renders red, `color="success"` green, `color="warning"` orange. The default branch keeps the project's gold gradient. Don't try to bypass this with `sx={{ background: … }}` on the Button — go through the `color` prop so theming stays consistent in light and dark mode.

`outlined` is a special case: it preserves the tan/red theme treatment for `primary` (the default) and renders a neutral border-on-text-color treatment for `color="inherit"` (used for Cancel). Other `color` values fall through to MUI's default outlined palette.

## Cancel / Close placement

Cancel/Close sits **left** of the primary action in `DialogFooter` (`components/common`), which ends every dialog. The four wrappers in `client/src/components/common/StandardDialogs.tsx` (`CreateDialog`, `EditDialog`, `ConfirmDialog`, `DeleteDialog`) render it already — prefer them over hand-rolling a dialog so the convention stays automatic.

For confirmations, `ConfirmDialog` takes the intent directly: `intent="caution"` for Archive / Leave, `"positive"` for Publish, `"destructive"` for destructive actions (`DeleteDialog` is that preset), plus a `confirmLabel` naming the action and an optional `confirmIcon`. `DialogFooter`'s action takes its `intent` the same way: the one type and color map is `Intent` (`components/common/intent.ts`), shared with `ActionMenuItem` and `RowAction`.

## Pair patterns to know

- **Accept + Reject (invites, notifications):** both `variant="contained"`, Accept = `success`, Reject = `error`. Visually equal-weight because both choices are equally consequential and there's no confirm.
- **Primary + Cancel (form dialogs):** primary = contained gold, Cancel = outlined inherit. Hierarchy is clear.
- **Unarchive + Delete Permanently (the header menu of an archived record's page):** Archive is replaced by Unarchive (`positive`) and Delete Permanently (`destructive`) sits below it. See `CharacterDetailsPage.tsx` and `CampaignDetailsPage.tsx`.
- **Self-action vs admin-action on the same surface:** When one row action or dialog handles both "leave on my own behalf" and "remove someone else", branch the intent (and the dialog copy) on whether the row is the current user's. Self → `caution` + "Leave …"; other → `destructive` + "Remove …", each with its icon (`LeaveIcon`, `DeleteIcon`) and in one wording: "You will lose access unless you're invited again." for a leave, "This action cannot be undone." for a removal. See `PlayersSection.tsx`'s row `RowAction` (`isCurrentUser`: Leave / Remove) and `RemovePlayerDialog` in `PlayerDialogs.tsx` (`isSelfRemoval`: Leave Campaign / Remove Player), and a contributor's Leave and Remove, both a `RemoveContributorDialog` (`components/contributors`, `isSelfRemoval`).

## Anti-patterns

- ❌ `<Button variant="contained" sx={{ background: "red" }}>Delete</Button>` — bypasses the theme and the dark-mode palette. Use `color="error"` instead.
- ❌ `<Button>Delete</Button>` with no color on a destructive confirm — reads as a default action. Use `color="error" variant="contained"`.
- ❌ `<Button>Cancel</Button>` in a dialog with no variant/color — reads heavier than intended next to a contained submit. Use `variant="outlined" color="inherit"`, or rely on `StandardDialogs`.
- ❌ Confirming an Archive with `DeleteDialog` — its red "Delete" button reads as destruction. Use `ConfirmDialog` with `intent="caution"` and a label like "Archive Character".
- ❌ Splitting Cancel into a Modal that wraps a `<form>` — `Modal` doesn't run the dirty-form close guard. Use `FormDialog` (see [docs/frontend.md](./frontend.md#dialog-conventions)).

## Loading state

Pair the action's `color` with `<DiceSpinner>` in wrapper mode so the button doesn't shrink when loading flips:

```tsx
<Button onClick={onConfirm} variant="contained" color="error" disabled={isPending}>
  <DiceSpinner size="small" loading={isPending}>Delete</DiceSpinner>
</Button>
```

Static `startIcon` stays outside the wrapper.
