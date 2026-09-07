# Action button conventions

The frontend uses MUI Buttons + MenuItems for actions. Color and variant carry **intent**, so users can read a button's consequence at a glance.

## Intent palette

| Intent | Examples | Button | MenuItem |
|---|---|---|---|
| **Default action** | Create, Update, Save, Submit, Invite, Generate Link, Subscribe, Link Character | `variant="contained"` (default color) | n/a |
| **Destructive** | Delete, Remove, Reject, Unsubscribe, Delete Account | `variant="contained" color="error"` | `sx={{ color: "error.main" }}` |
| **Caution** (reversible self-action) | Archive, Leave (ruleset/character/campaign) | `variant="contained" color="warning"` | `sx={{ color: "warning.main" }}` |
| **Positive** | Publish, Accept, Unarchive, Restore | `variant="contained" color="success"` | `sx={{ color: "success.main" }}` |
| **Cancel / Close / Dismiss** | Cancel, Close, Dismiss (in dialogs) | `variant="outlined" color="inherit"` | n/a |

Apply the matrix even when the destructive action fires directly with no confirm dialog (e.g. inline Reject buttons in notification surfaces and invite cards) — the visual treatment is what tells the user the click is consequential.

## How this works in the theme

`client/src/contexts/ThemeContext.tsx` makes contained buttons palette-aware: the override switches on `ownerState.color` so `color="error"` actually renders red, `color="success"` green, `color="warning"` orange. The default branch keeps the project's gold gradient. Don't try to bypass this with `sx={{ background: … }}` on the Button — go through the `color` prop so theming stays consistent in light and dark mode.

`outlined` is a special case: it preserves the tan/red theme treatment for `primary` (the default) and renders a neutral border-on-text-color treatment for `color="inherit"` (used for Cancel). Other `color` values fall through to MUI's default outlined palette.

## Cancel / Close placement

Cancel/Close sits **left** of the primary action in `<DialogActions>`. The four wrappers in `client/src/components/common/StandardDialogs.tsx` already do this — prefer them over hand-rolling a dialog so the convention stays automatic.

## Pair patterns to know

- **Accept + Reject (invites, notifications):** both `variant="contained"`, Accept = `success`, Reject = `error`. Visually equal-weight because both choices are equally consequential and there's no confirm.
- **Primary + Cancel (form dialogs):** primary = contained gold, Cancel = outlined inherit. Hierarchy is clear.
- **Archive + Hard-delete (3-dot menus on archived rows):** Archive is replaced by Unarchive (`success.main`) and Hard-delete (`error.main`) sits below it. See `CharacterDetailsPage.tsx` and `CampaignDetailsPage.tsx`.
- **Self-action vs admin-action on the same surface:** When one row IconButton or dialog handles both "leave on my own behalf" and "remove someone else", branch the color (and the dialog copy) on `isSelfRemoval`. Self → warning + "Leave …"; other → error + "Remove …". See `PlayersSection.tsx` row IconButton and `RemovePlayerDialog` in `CampaignDialogs.tsx`.

## Anti-patterns

- ❌ `<Button variant="contained" sx={{ background: "red" }}>Delete</Button>` — bypasses the theme and the dark-mode palette. Use `color="error"` instead.
- ❌ `<Button>Delete</Button>` with no color on a destructive confirm — reads as a default action. Use `color="error" variant="contained"`.
- ❌ `<Button>Cancel</Button>` in a dialog with no variant/color — reads heavier than intended next to a contained submit. Use `variant="outlined" color="inherit"`, or rely on `StandardDialogs`.
- ❌ Splitting Cancel into a Modal that wraps a `<form>` — `Modal` doesn't run the dirty-form close guard. Use `FormDialog` (see [CLAUDE.md](../CLAUDE.md) → Dialog Conventions).

## Loading state

Pair the action's `color` with `<DiceSpinner>` in wrapper mode so the button doesn't shrink when loading flips:

```tsx
<Button onClick={onConfirm} variant="contained" color="error" disabled={isPending}>
  <DiceSpinner size="small" loading={isPending}>Delete</DiceSpinner>
</Button>
```

Static `startIcon` stays outside the wrapper.
