/**
 * The client's conventions (AGENTS.md's Frontend Architecture), as rules:
 *
 * - `accessible-icon-buttons`: an `IconButton` has an accessible name: an `aria-label` (or `aria-labelledby`), or a
 *   `Tooltip` right around it. A tooltip around a `<span>` (a disabled button's), or one with `describeChild`, doesn't
 *   name the button. The attributes are written out: a spread (`{...buttonProps}`) doesn't count, whatever it holds.
 * - `dialog-conventions`: a `Dialog` goes full screen on a phone (`fullScreen={isMobile}`), and a form is never in a
 *   `Modal`, which skips the guard that keeps a dirty form open (`FormDialog`, `CreateDialog` and `EditDialog` have it).
 *   A dialog is laid out by the theme: its title is its text (a `HelpLabel` when it has help), its content has no
 *   `dividers` and sets no gap under the title, its prose is `DialogContentText`, and its paper is styled through
 *   `slotProps.paper`.
 * - `query-keys`: every query key comes from `lib/queryKeys.ts`: a key written as an array starts by spreading one
 *   (`[...queryKeys.rulesets.section(id, "feats"), search]`).
 * - `client-apis`: a mutation runs with `.mutate()` and its callbacks, never `.mutateAsync()`, and a loader is a
 *   `DiceSpinner`, never MUI's `CircularProgress`.
 * - `controlled-inputs`: every input is controlled, and a form's field is bound one way: through `useController` (the
 *   shared fields, `FormTextField`, `Controller`), never `register` (uncontrolled), and never a value `watch` reads
 *   with a `setValue` for its change. A form starts every field with a value: it's made with `useFormWith` (a whole
 *   `defaultValues`), never react-hook-form's `useForm`, which takes some. A field reaches its input through
 *   `inputRef`, never spread whole (`{...field}` with its `ref`), which a failed submit couldn't focus.
 * - `effect-writes`: an effect synchronizes with what's outside React, and never does what an event or a render does: it
 *   never writes a form's field (`setValue`, `resetField`, `reset`, but `useFormSync`'s, which follows the server),
 *   navigates (a redirect is a rendered `<Navigate>`) nor calls back its owner (an `on…` prop, or a callback a ref
 *   holds). A change happens in the event that causes it, and
 *   what follows from data is derived as it renders.
 * - `api-calls-in-queries`: the API is called through TanStack Query only: an `rpc` request (`$get`, `$post`…) is made in
 *   a function a query or a mutation runs, which caches, dedupes and reports it. Such a function is named `…Fn`, as
 *   TanStack's `queryFn` and `mutationFn` are, wherever it's handed (`useRulesetSection`'s `createFn`, an editor's
 *   `saveFn`).
 * - `date-formats`: a date is shown through `lib/formatDate.ts` (`formatDate`, `formatDateTime`, `formatRelativeTime`),
 *   in one locale and three forms: no `toLocaleDateString`, `toLocaleTimeString` or `Intl.DateTimeFormat` elsewhere.
 * - `sx-styles`: a style is written with `sx`, by the theme's scale: never `styled()` (nor `M.styled`), never a stylesheet but the
 *   fonts `main.tsx` loads (the page's own styles are the theme's `MuiCssBaseline`), and `style` only passes on one a component is given
 *   (`{ ...props.style, … }`, as MUI hands a list option), on an element or in a prop's object (`slotProps`).
 * - `error-alerts`: an error reaches the user one way per kind: a list, a section or a step that failed to load is a
 *   `LoadError` (`loadFailureMessage`'s words), a page that can't show is a `PageError`, a failed action is a toast
 *   (`snackbar.error`, which names what failed), a wrong value is its field's error, and the auth pages show their
 *   form's error. So an error `Alert` sits only in `LoadError`, the auth pages' layout and the toast, and every other
 *   `Alert` writes out its `severity` and `color`, so the rule can read them.
 * - `theme-colors`: a color is the theme's (`client/src/theme/`): elsewhere it's a palette token (`"text.secondary"`,
 *   `theme.palette.primary.main`), translucent through `alpha()`. No hex, `rgb()` or `hsl()` literal, no CSS color name
 *   (`"white"`), and no hex alpha appended to a color (`${theme.palette.primary.main}40`).
 * - `component-props`: a component's props are one named type, its own (`interface XProps`, `type XProps = Omit<…>`)
 *   or one its family shares (`RulesetSectionProps`, `EditorProps<Feat>`), never written in place: an object type, an
 *   intersection, `Omit<…>` / `Pick<…>` / `ComponentProps<…>` (a `memo` or `forwardRef` component too).
 * - `icons`: an icon comes from `components/icons`, named for what it means, so a meaning has one icon.
 * - `nav-links`: a control that only navigates is a link (`component={Link} to`), never an `onClick` that calls
 *   `navigate`; a card holds content of its own and opens on click. React Router's `Link` is `Link`, MUI's `MuiLink`.
 * - `browser-storage`: what the browser keeps is a store's (`client/src/stores/`, zustand's `persist`).
 * - `type-scale`: a size is the theme's: text takes a typography variant, an icon its size (`fontSize="tiny"`); a
 *   font weight is the theme's (`"fontWeightBold"`, `"fontWeightMedium"`, `"fontWeightRegular"`), a leading and a
 *   tracking the variant's (no `letterSpacing`, a `lineHeight` only `1`), and a `Typography` takes a fixed variant as
 *   its `variant`.
 * - `shape`: a corner is in the theme's units (`borderRadius: 1`) or a circle (`"50%"`), and a layer above the page is
 *   the theme's (`theme.zIndex`); a `zIndex` number orders siblings only (`0`, `1`).
 * - `borders`: a border is the theme's shorthand (`border: 1`), its color `borderColor`, its style `borderStyle`; a
 *   `Paper`, a `Card` or an `Accordion` takes its outline as a prop (`variant="outlined"`).
 * - `flex-layout`: a flex container is a `Stack`, its `direction` and `spacing` props (`useFlexGap`, the theme's
 *   default, makes `spacing` a gap), never another element with a flex `display`: a surface (`Paper`, `Card`,
 *   `DialogContent`) holds a `Stack`.
 * - `forms`: a form is a `Stack component="form" noValidate` (its rules check its fields, never the browser). Its fields
 *   stack `spacing={3}` apart and never set a `margin`; fields side by side are a `FieldRow`, a form's select is a
 *   `SelectField`, and a bound field's bounds are its `rules`, never the browser's `min`, `max`, `pattern` or `required`.
 * - `component-defaults`: what the theme sets for every instance (a tooltip's arrow and delay, `Collapse`'s timeout)
 *   isn't set again on one, nor is a value MUI gives by default (`<Chip variant="filled">`); `--fix` removes both.
 * - `label-case`: a button's, a menu item's, a field's and a dialog's words are in Title Case ("Mark All as Read").
 * - `search-fields`: a search box is a `SearchField`, never a `TextField` of its own.
 * - `button-intents`: a button is styled by its intent, as `docs/ui-buttons.md` sets it: the verb its label starts with
 *   (Delete, Archive, Publish, Cancel…) picks its variant and color.
 * - `button-sizes`: a button's size is its place's: an icon button is `large` in the app bar and a page header's
 *   corners, `small` anywhere else, written out; a text button is `large` only as a page's action (`PageActionButton`,
 *   a `PageHeader`'s `action`), MUI's own size in a section's header, a form, a dialog and an empty state, and `small`
 *   inside a block (a row, an alert, a toolbar, a field's tools). Load More is `large` on a list page, `small` in a
 *   dialog or a wizard step.
 * - `headings`: a `Typography` sized as a heading or a subtitle (`variant="h6"`, `typography: { xs: "h6" }`, which MUI
 *   renders as an `<h6>`) declares its element, and a heading's element picks its look: `h1` is `variant="h3"`, `h2`
 *   `h5`, `h3` `h6`, `h4` `subtitle1`, sized, weighted and colored by the theme; the outline stops at `h4`.
 * - `toast-wording`: a toast is a phrase ("Ruleset archived"), no final period, "!" or "successfully"; an error's
 *   fallback names what failed ("Failed to remove item").
 * - `confirm-wording`: a confirmation asks "Are you sure you want to …?", then says what follows; a deletion ends
 *   "This action cannot be undone."
 * - `page-errors`: a page that couldn't load says why in `loadFailureMessage`'s words.
 * - `tag-chips`: a chip is a `TagChip` (a role, a status, a fact, a pick to remove), a `ChoiceChip` (one of several to
 *   choose), or an Autocomplete's picked value, MUI's own small chip (`{...getItemProps({ index })}`).
 * - `expand-arrows`: a row or a header that shows or hides what's under it is the toggle (`toggleProps`) and shows
 *   its state with `ExpandArrow`, leading it; a component's own arrow (`expandIcon`) stays its own. A titled group
 *   that opens is a `Subsection`'s toggle, a button; a table row keeps its role (`toggleProps(open, onToggle, "row")`).
 * - `pending-buttons`: a button that starts a request shows it running, its label in a `DiceSpinner`.
 * - `menus`: a menu lists its items alone: an action is an `ActionMenuItem`, one of several to choose a `MenuItem`
 *   marked `selected` (a filter, a sort, a visibility); a panel that opens from a button is a `Popover`.
 * - `spacing`: the gap between blocks is their `Stack`'s `spacing` (a page's blocks are a `PageBody`'s, a row's its
 *   `spacing` or a flex component's `gap`), never a block's own margin, on any side; an indent is padding, a heading's
 *   gutter `gutterBottom`. A margin only aligns (`auto`) or resets (`0`), in a nested selector too. A gap is a step of
 *   the ladder, by what it spaces (`GAPS`): a row of icon buttons is 0.5 apart, of buttons or chips 1, a group of
 *   panels or cards 2. A padding is a step too, an indent (`pl: 6`), its role's per-screen shape (`PADDING_SHAPES`),
 *   or derived from data, never a constant that hides a step. A card's blocks are 2 apart, a panel's 3, read from the
 *   surface; a heading and what it titles are a `Subsection`.
 * - `surfaces`: a panel of a page is a `Section` (a `Paper`, its padding, its title); a `Card` is a card one opens:
 *   `StyledCard`, or one holding a `CardActionArea`.
 * - `shadows`: a shadow is the theme's: an elevation (`boxShadow: 2`, `0` for none; a `Paper`, a `Card` or an
 *   `Accordion` takes its `elevation`), or one of `theme/shadows.ts`'s colored ones (`glow`, `ring`, `iconGlow`,
 *   `textLift`), never written out.
 * - `motion`: motion is timed in `lib/animations.ts`: an animation it names (`ANIMATIONS`), a transition of its tokens
 *   (`transitionOf`), or a template of `DURATION` / `EASING`; keyframes are defined there alone.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { repoPath } from "./paths.mjs";

/** The border shorthands, which the theme writes from a width (`border: 1` is `1px solid`) */
const BORDER_SIDES = new Set(["border", "borderBottom", "borderLeft", "borderRight", "borderTop"]);

/** The fields bound to a form's (`components/common/FormFields.tsx`) */
const BOUND_FIELDS = new Set([
  "DescriptionField",
  "EmailField",
  "FormTextField",
  "NameField",
  "PasswordField",
  "SelectField",
]);

/** A button's look by its intent, as `docs/ui-buttons.md` sets it: the verb its label starts with picks the row */
// oxfmt-ignore
const BUTTON_INTENTS = [
  { verbs: ["Delete", "Remove", "Reject", "Revoke", "Unsubscribe", "Unlink"], variant: "contained", color: "error" },
  { verbs: ["Archive", "Leave"], variant: "contained", color: "warning" },
  { verbs: ["Publish", "Accept", "Unarchive", "Restore"], variant: "contained", color: "success" },
  { verbs: ["Cancel", "Close", "Dismiss"], variant: "outlined", color: "inherit" },
];

/** The surfaces a card is, whose blocks sit 2 apart */
const CARD_SURFACES = new Set(["Card", "CardContent", "StyledCard"]);

/** What a card renders: a container that opens on click and holds content of its own, so it can't be a link */
const CARDS = new Set(["ListCard", "StyledCard"]);

/** The style keys that color a chip, which its `color` prop sets */
const CHIP_COLOR_KEYS = new Set(["background", "backgroundColor", "bgcolor", "borderColor", "color"]);

/** The JSX attributes that take a color (`<path fill="…">`): any other attribute's hex text isn't one (`href="#add"`) */
const COLOR_ATTRIBUTES = new Set(["bgcolor", "color", "fill", "stopColor", "stroke"]);

/** A style value that holds a color: a gradient, a shadow, a border */
const COLOR_CONTEXT = /gradient\(|shadow\(|\bsolid\b|\bdashed\b|\dpx\b/;

/** A color function of written values (`rgba(0, 0, 0, 0.3)`, `oklch(…)`, `color(srgb …)`); `rgba(var(--…))` reads the theme's */
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[\d.]|\bcolor\(\s*[a-z-]+\s+[\d.]/i;

/** The style properties that take a color */
const COLOR_PROPERTIES = new Set([
  "background",
  "boxShadow",
  "filter",
  "outline",
  "textShadow",
  "backgroundColor",
  "bgcolor",
  "border",
  "borderBottom",
  "borderColor",
  "borderLeft",
  "borderRight",
  "borderTop",
  "caretColor",
  "color",
  "fill",
  "outlineColor",
  "stroke",
  "textDecorationColor",
]);

/** The wrappers a component is declared in (`memo(function Row(…) {…})`) */
const COMPONENT_WRAPPERS = new Set(["forwardRef", "memo"]);

/** CSS's color names, which a style never writes: the theme names its colors (`common.white`) */
// oxfmt-ignore
const CSS_COLOR_NAMES = new Set([
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black", "blanchedalmond", "blue",
  "blueviolet", "brown", "burlywood", "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk",
  "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki",
  "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen",
  "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "deeppink", "deepskyblue",
  "dimgray", "dimgrey", "dodgerblue", "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite",
  "gold", "goldenrod", "gray", "green", "greenyellow", "grey", "honeydew", "hotpink", "indianred", "indigo", "ivory",
  "khaki", "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan",
  "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon", "lightseagreen",
  "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen", "linen",
  "magenta", "maroon", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen",
  "mediumslateblue", "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream",
  "mistyrose", "moccasin", "navajowhite", "navy", "oldlace", "olive", "olivedrab", "orange", "orangered", "orchid",
  "palegoldenrod", "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum",
  "powderblue", "purple", "rebeccapurple", "red", "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown",
  "seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray", "slategrey", "snow", "springgreen",
  "steelblue", "tan", "teal", "thistle", "tomato", "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow",
  "yellowgreen",
]);

/** The ways to write a date that `lib/formatDate.ts` keeps to itself. */
const DATE_FORMATTERS = new Set(["toLocaleDateString", "toLocaleTimeString"]);

/** The hooks whose callback is an effect. */
const EFFECTS = new Set(["useEffect", "useLayoutEffect"]);

/** The surfaces MUI raises as a `Paper`: they take their depth as `elevation` and their outline as `variant` */
const ELEVATED = new Set(["Accordion", "Card", "Paper"]);

/** The components that show an error in an `Alert`: a load failure, the auth pages' form error, and the toast. */
const ERROR_ALERT_FILES = new Set([
  "client/src/components/common/LoadError.tsx",
  "client/src/components/auth/AuthLayout.tsx",
  "client/src/contexts/ToastContext.tsx",
]);

/** The arrows that show a group open or shut, which `ExpandArrow` draws */
const EXPAND_ARROWS = new Set(["ExpandLessIcon", "ExpandMoreIcon"]);

/** The props a component takes its own expand arrow by (`AccordionSummary`'s `expandIcon`, a tree's slots) */
const EXPAND_ICON_PROPS = new Set(["collapseIcon", "expandIcon"]);

/** The form writes an effect never makes, but `useFormSync`'s. */
const FIELD_WRITES = new Set(["setValue", "resetField", "reset"]);

/** The theme's font weights, as `sx` finds them (a CSS word, `"bold"`, would bypass the theme) */
const FONT_WEIGHTS = new Set(["fontWeightBold", "fontWeightMedium", "fontWeightRegular"]);

/** The style keys that set a gap between a flex or a grid container's children */
const GAP_KEYS = new Set(["columnGap", "gap", "rowGap"]);

/**
 * The gaps between blocks, a step per what they space: the lines of one item (0.5), the items of a list or a row
 * (1), the panels or cards of a group (2), a panel's blocks (3: a section's, a dialog's, a form's, a card's) and a
 * page's (4)
 */
const GAPS = new Set([0.5, 1, 2, 3, 4]);

/** The colors a heading may take: a state's, or what its banner gives it */
const HEADING_COLORS = new Set(["common.white", "error.main", "inherit"]);

/** The style keys that set a text's size and weight */
const HEADING_FONT_KEYS = new Set(["fontSize", "fontWeight", "typography"]);

/** The variant each heading level takes: a page's title, a section's, a subsection's, a group's */
const HEADING_VARIANTS = { h1: "h3", h2: "h5", h3: "h6", h4: "subtitle1" };

/** A hex alpha appended to a color: the text that follows `${color}` in `${color}40` */
const HEX_ALPHA_SUFFIX = /^[0-9a-f]{2}(?![\w])/i;

/** A color written out: a hex color, or an `rgb()` / `hsl()` of numbers (`rgba(var(--…))` reads the theme's) */
const HEX_COLOR = /(?<![\w&])#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i;

/** TypeScript's and React's type builders: a props type built with one in a component's signature is written in place */
const IN_PLACE_TYPES = new Set([
  "ComponentProps",
  "ComponentPropsWithRef",
  "ComponentPropsWithoutRef",
  "Omit",
  "Partial",
  "Pick",
  "Readonly",
  "Required",
]);

/** `Intl`'s date formatters */
const INTL_DATE_FORMATS = new Set(["DateTimeFormat", "RelativeTimeFormat"]);

/** The props that hold an action's label or a dialog's title */
const LABEL_PROPS = new Set(["backLabel", "confirmLabel", "label", "submitLabel"]);

/** The elements whose text is an action's label: a button, a menu item */
const LABELLED = new Set(["ActionMenuItem", "Button", "MenuItem"]);

/** The fields, besides the bound ones, whose `label` names them */
const LABELLED_FIELDS = new Set(["FormControlLabel", "SwitchField", "TextField"]);

/** The elements that only lay out what they hold, which a toggle's leading arrow sits in */
const LAYOUT_WRAPPERS = new Set(["Box", "span", "Stack", "TableCell"]);

/** The style keys that set a box's margin, on any side */
const MARGINS = new Set([
  "m",
  "margin",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "marginTop",
  "mb",
  "ml",
  "mr",
  "mt",
  "mx",
  "my",
]);

/** What a `Menu` holds: its items, and the dividers between them */
const MENU_CHILDREN = new Set(["ActionMenuItem", "Divider", "MenuItem"]);

/** A time or an easing written out: `200ms`, `0.3s`, `ease-in-out`, `cubic-bezier(…)` */
const MOTION_LITERAL = /\d(?:\.\d+)?m?s\b|\b(?:ease(?:-in|-out|-in-out)?|linear|steps)\b|cubic-bezier\(/;

/** The style properties that time a change */
const MOTION_PROPERTIES = new Set([
  "animation",
  "animationDelay",
  "animationDuration",
  "animationTimingFunction",
  "transition",
  "transitionDelay",
  "transitionDuration",
  "transitionTimingFunction",
]);

/** The props MUI gives a value by default, which a component leaves out: `<Chip>` is `variant="filled"` */
const MUI_DEFAULTS = {
  Button: { color: "primary", size: "medium", variant: "text" },
  Chip: { color: "default", size: "medium", variant: "filled" },
  IconButton: { size: "medium" },
  Stack: { direction: "column" },
  TextField: { size: "medium" },
  Tooltip: { placement: "bottom" },
  Typography: { variant: "body1" },
};

/** MUI's transitions a component never runs itself: a page fades in with `PageTransition`, a block opens with `Collapse` */
const MUI_TRANSITIONS = new Set(["Fade", "Grow", "Slide", "Zoom"]);

/** The checks the browser makes of an input, which a `noValidate` form skips: a bound field's are its `rules` */
const NATIVE_CHECKS = new Set(["max", "min", "pattern", "required"]);

/**
 * The paddings that change with the screen, one per role: a surface's (`{ xs: 2, sm: 3 }`: a section, a card, a page's
 * header), a page's (`{ xs: 2, sm: 4 }`, `PageBody`'s) and an empty or a loading region's (`{ xs: 4, sm: 8 }`)
 */
const PADDING_SHAPES = new Set(["2/3", "2/4", "4/8"]);

/** The style keys that pad a box, on any side */
const PADDINGS = new Set([
  "p",
  "padding",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "paddingX",
  "paddingY",
  "pb",
  "pl",
  "pr",
  "pt",
  "px",
  "py",
]);

/** The surfaces a group lays side by side or stacks, 2 apart (a page's `Section`s are its blocks, 4 apart) */
const PANELS = new Set(["Accordion", "ListCard", "Paper", "StyledCard"]);

/** The calls that hand an Autocomplete's picked value its chip's props */
const PICKED_VALUE_PROPS = new Set(["getItemProps", "getTagProps"]);

/** The requests an `rpc` endpoint makes. */
const REQUEST_METHODS = new Set(["$get", "$post", "$put", "$patch", "$delete"]);

/** What a row of items holds, 1 apart: buttons and chips (icon buttons are one control's parts, 0.5 apart) */
const ROW_ITEMS = new Set(["Button", "ChoiceChip", "TagChip"]);

/** The shadow keys, and the helpers of `theme/shadows.ts` that give each one (a `filter`'s is `iconGlow`) */
const SHADOW_HELPERS = {
  boxShadow: new Set(["glow", "ring"]),
  textShadow: new Set(["textLift"]),
};

/** The words a Title Case label leaves lowercase */
const SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "vs",
  "with",
]);

/** The theme-spaced style keys, which take its units (`mt: 2`), never pixels */
const SPACING_KEYS = new Set([
  "gap",
  "m",
  "mb",
  "ml",
  "mr",
  "mt",
  "mx",
  "my",
  "p",
  "pb",
  "pl",
  "pr",
  "pt",
  "px",
  "py",
  "margin",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "marginTop",
  "padding",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
]);

/** The packages that export MUI's `styled` */
const STYLED_SOURCES = new Set(["@mui/material", "@mui/material/styles", "@mui/system"]);

/** The style keys that size a text */
const TEXT_SIZE_KEYS = new Set(["fontSize", "typography"]);

/** The props the theme sets for every instance of a component (`MuiTooltip`'s and `MuiCollapse`'s `defaultProps`) */
const THEME_DEFAULTS = {
  Collapse: new Set(["timeout"]),
  Dialog: new Set(["transitionDuration"]),
  DialogContentText: new Set(["variant"]),
  Stack: new Set(["useFlexGap"]),
  Tooltip: new Set(["arrow", "enterDelay", "enterNextDelay"]),
};

/** The style keys that move a box down from what's above it */
const TOP_SPACING = new Set(["marginTop", "mt", "my", "paddingTop", "pt"]);

/** The props an input takes its value through. */
const VALUE_PROPS = new Set(["value", "values", "checked", "digits", "selected"]);

/** Whether a margin only aligns (`auto`) or resets (`0`), on every side and screen it names */
function alignsOrResets(value) {
  if (value.type === "ObjectExpression")
    return value.properties.every((p) => p.type === "Property" && alignsOrResets(p.value));
  if (value.type !== "Literal") return false;
  return value.value === 0 || (typeof value.value === "string" && /^(0|auto)( (0|auto)){0,3}$/.test(value.value));
}

/** The string a JSX attribute holds, when it's written out (`variant="outlined"`). */
function attributeText(element, name) {
  const attribute = element.openingElement.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === name);
  if (!attribute) return undefined;
  return attribute.value?.type === "Literal" ? attribute.value.value : null;
}

/** The strings a JSX attribute may hold: written out, or each branch of a condition (`variant={dialog ? "h5" : "h6"}`). */
function attributeTexts(element, name) {
  const attribute = element.openingElement.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === name);
  const value = attribute?.value?.type === "JSXExpressionContainer" ? attribute.value.expression : attribute?.value;
  if (!value) return [];
  return styleValues(value)
    .filter((v) => v.type === "Literal" && typeof v.value === "string")
    .map((v) => v.value);
}

/** A call's name: `setValue` for `setValue(…)`, `form.setValue(…)` and `field.onChange?.(…)`. */
function calleeName(node) {
  const callee = node.callee.type === "ChainExpression" ? node.callee.expression : node.callee;
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && !callee.computed) return callee.property.name;
  return null;
}

/** Whether a field takes a check from the browser (`slotProps={{ htmlInput: { min: 0 } }}`), which a `noValidate` form skips */
function checksNatively(element) {
  const attribute = element.openingElement.attributes.find(
    (a) => a.type === "JSXAttribute" && a.name.name === "slotProps",
  );
  const slots = attribute?.value?.type === "JSXExpressionContainer" ? attribute.value.expression : null;
  const input =
    slots?.type === "ObjectExpression"
      ? slots.properties.find((p) => p.type === "Property" && p.key.name === "htmlInput")?.value
      : null;
  return (
    input?.type === "ObjectExpression" &&
    input.properties.some((p) => p.type === "Property" && NATIVE_CHECKS.has(p.key.name ?? p.key.value))
  );
}

/** The elements a JSX element renders as its children: written out, in a fragment, or behind a condition. */
function childElements(node) {
  return node.children.flatMap((child) => {
    if (child.type === "JSXElement") return [child];
    if (child.type === "JSXFragment") return childElements(child);
    if (child.type !== "JSXExpressionContainer") return [];
    const { expression } = child;
    const branches =
      expression.type === "LogicalExpression"
        ? [expression.right]
        : expression.type === "ConditionalExpression"
          ? [expression.consequent, expression.alternate]
          : expression.type === "CallExpression" && expression.callee.property?.name === "map"
            ? mappedElements(expression.arguments[0])
            : [expression];
    return branches.filter((branch) => branch.type === "JSXElement");
  });
}

function createAccessibleIconButtons(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "IconButton") return;
      if (hasAttribute(node, "aria-label") || hasAttribute(node, "aria-labelledby")) return;
      // A tooltip names its child, but not with `describeChild`, which makes its title a description.
      const parent = parentElement(node);
      if (parent && elementName(parent) === "Tooltip" && !hasAttribute(parent, "describeChild")) return;
      context.report({
        node: node.openingElement,
        message:
          "An icon-only `IconButton` takes an `aria-label`, or a `Tooltip` right around it (not around a `<span>`).",
      });
    },
  };
}

function createApiCallsInQueries(context) {
  if (!inClient(context)) return {};
  return {
    CallExpression(node) {
      const callee = node.callee;
      if (callee.type !== "MemberExpression" || callee.computed || !REQUEST_METHODS.has(callee.property.name)) return;
      if (!fromRpc(callee) || inQueryFunction(node)) return;
      context.report({
        node,
        message:
          "The API is called through TanStack Query: make this request in a function a query or a mutation runs, named " +
          "`…Fn` (a `queryFn`, a `mutationFn`, or a hook's `createFn` that becomes one), never on its own.",
      });
    },
  };
}

function createBorders(context) {
  if (!inClient(context) || repoPath(context.filename).startsWith("client/src/theme/")) return {};
  return {
    Property(node) {
      const key = node.key.type === "Identifier" ? node.key.name : null;
      if (BORDER_SIDES.has(key)) {
        const written = styleValues(node.value).some(
          (value) =>
            (value.type === "Literal" && typeof value.value === "string" && value.value !== "none") ||
            value.type === "TemplateLiteral",
        );
        if (written) {
          context.report({
            node: node.value,
            message:
              "A border is the theme's shorthand: a width (`border: 1`, `borderLeft: 3`), its color in `borderColor`, " +
              'its style in `borderStyle`: never `"1px solid …"`.',
          });
        }
      }
      const surface = node.parent.type === "ObjectExpression" ? sxElement(node.parent) : null;
      if (ELEVATED.has(surface) && (key === "border" || key === "borderWidth" || key === "borderStyle")) {
        context.report({
          node,
          message:
            'A `Paper`, a `Card` or an `Accordion` is outlined by `variant="outlined"` (or the theme\'s card), never an ' +
            "`sx` border.",
        });
      }
    },
  };
}

function createBrowserStorage(context) {
  if (!inClient(context) || repoPath(context.filename).startsWith("client/src/stores/")) return {};
  return {
    Identifier(node) {
      if (node.name !== "localStorage" && node.name !== "sessionStorage") return;
      const isKey = node.parent.type === "Property" && node.parent.key === node && !node.parent.computed;
      const member = node.parent.type === "MemberExpression" && node.parent.property === node ? node.parent : null;
      // `window.localStorage` is the browser's; `x.localStorage`, some object's own
      const ofGlobal =
        member?.object.type === "Identifier" && ["globalThis", "self", "window"].includes(member.object.name);
      if (isKey || (member && !ofGlobal)) return;
      context.report({
        node,
        message:
          "What the browser keeps is a store's (`client/src/stores/`, persisted through zustand's `persist`): never " +
          "`localStorage` or `sessionStorage` elsewhere.",
      });
    },
  };
}

function createButtonIntents(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "Button") return;
      const label = node.children
        .filter((child) => child.type === "JSXText")
        .map((child) => child.value.trim())
        .join(" ")
        .trim();
      const verb = label.split(/\s+/)[0];
      const intent = BUTTON_INTENTS.find((row) => row.verbs.includes(verb));
      if (!intent) return;
      const variant = attributeText(node, "variant");
      const color = attributeText(node, "color");
      // A computed variant or color is the component's own choice, made elsewhere
      if (variant === null || color === null) return;
      if ((variant ?? "text") === intent.variant && (color ?? "primary") === intent.color) return;
      context.report({
        node: node.openingElement,
        message:
          `A "${verb}" button is \`variant="${intent.variant}" color="${intent.color}"\` (\`docs/ui-buttons.md\`), ` +
          "the same everywhere, whether or not it confirms first.",
      });
    },
  };
}

function createButtonSizes(context) {
  if (!inClient(context)) return {};
  const pageAction = repoPath(context.filename) === "client/src/components/common/PageActionButton.tsx";
  const listPage = context.sourceCode.text.includes("<PageHeader");
  const step = repoPath(context.filename).endsWith("Step.tsx");
  return {
    JSXElement(node) {
      const name = elementName(node);
      const size = attributeText(node, "size");
      const sizes = attributeTexts(node, "size");
      if (name === "IconButton" && (sizes.length === 0 || sizes.some((s) => s !== "small" && s !== "large"))) {
        context.report({
          node: node.openingElement,
          message:
            'An icon button writes its size, `size="small"` or `size="large"` (a condition\'s branches count, a ' +
            "spread doesn't): large in the app bar and a page header's corners, small anywhere else.",
        });
      }
      if (name === "LoadMoreButton") {
        const place = listPage ? "large" : step || inDialog(node) ? "small" : undefined;
        if ((size ?? undefined) !== place) {
          context.report({
            node: node.openingElement,
            message:
              'Load More is sized by its place, as a button is: `size="large"` on a list page (its `PageHeader`), ' +
              '`size="small"` in a dialog or a wizard step, MUI\'s own size anywhere else.',
          });
        }
      }
      if (name === "Button" && sxSetsAny(node, PADDINGS)) {
        context.report({
          node: node.openingElement,
          message: "A button's padding is its size's, which the theme sets: `size`, never an `sx` padding.",
        });
      }
      if (name !== "Button" || size !== "large" || pageAction) return;
      const attribute = node.parent?.type === "JSXExpressionContainer" ? node.parent.parent : null;
      const headerAction =
        attribute?.type === "JSXAttribute" &&
        attribute.name.name === "action" &&
        elementName(attribute.parent.parent) === "PageHeader";
      if (headerAction) return;
      context.report({
        node: node.openingElement,
        message:
          "A large button is a page's action: a `PageActionButton`, or a `PageHeader`'s `action`. A section's, a " +
          "form's, a dialog's and an empty state's take MUI's own size.",
      });
    },
  };
}

function createClientApis(context) {
  if (!inClient(context)) return {};
  const muiNamespaces = new Set();
  return {
    CallExpression(node) {
      if (node.callee.type === "MemberExpression" && node.callee.property.name === "mutateAsync") {
        context.report({
          node,
          message: "Run a mutation with `.mutate()` and its `onSuccess` / `onError`, not `.mutateAsync()`.",
        });
      }
    },
    // const { mutateAsync } = useMutation(…)
    Property(node) {
      if (node.parent?.type === "ObjectPattern" && node.key.type === "Identifier" && node.key.name === "mutateAsync") {
        context.report({
          node,
          message: "Run a mutation with `.mutate()` and its `onSuccess` / `onError`, not `.mutateAsync()`.",
        });
      }
    },
    // <Mui.CircularProgress />
    JSXMemberExpression(node) {
      if (node.property.name === "CircularProgress" && muiNamespaces.has(node.object.name)) {
        context.report({
          node,
          message: "A loader is a `DiceSpinner` (`components/common`), never `CircularProgress`.",
        });
      }
    },
    ImportDeclaration(node) {
      if (!String(node.source.value).startsWith("@mui/material")) return;
      for (const s of node.specifiers ?? []) if (s.type === "ImportNamespaceSpecifier") muiNamespaces.add(s.local.name);
      const named = (node.specifiers ?? []).some(
        (s) => s.type === "ImportSpecifier" && s.imported.name === "CircularProgress",
      );
      if (named || node.source.value === "@mui/material/CircularProgress") {
        context.report({
          node,
          message: "A loader is a `DiceSpinner` (`components/common`), never `CircularProgress`.",
        });
      }
    },
  };
}

function createComponentDefaults(context) {
  if (!inClient(context)) return {};
  return {
    JSXAttribute(node) {
      const element = elementName(node.parent.parent);
      const prop = node.name.name;
      const themes = THEME_DEFAULTS[element]?.has(prop);
      const value = node.value?.type === "JSXExpressionContainer" ? node.value.expression : node.value;
      const mui = value?.type === "Literal" && MUI_DEFAULTS[element]?.[prop] === value.value;
      if (!themes && !mui) return;
      const { text } = context.sourceCode;
      let start = rangeOf(node)[0];
      while (/\s/.test(text[start - 1])) start--;
      context.report({
        node,
        message: themes
          ? `A \`${element}\`'s \`${prop}\` is the theme's default, the same for every one: never set here.`
          : `\`${prop}="${value.value}"\` is a \`${element}\`'s default: left out.`,
        fix: (fixer) => fixer.removeRange([start, rangeOf(node)[1]]),
      });
    },
  };
}

function createComponentProps(context) {
  if (!inClient(context)) return {};
  const check = (fn) => {
    const type = fn.params[0]?.typeAnnotation?.typeAnnotation;
    if (!type || (type.type === "TSTypeReference" && !IN_PLACE_TYPES.has(referenceName(type.typeName)))) return;
    context.report({
      node: type,
      message:
        "A component's props are one named type: its own (`interface XProps`, `type XProps = Omit<…>`) or one its " +
        "family shares (`RulesetSectionProps`), never written in place.",
    });
  };
  return {
    FunctionDeclaration(node) {
      if (/^[A-Z]/.test(node.id?.name ?? "")) check(node);
    },
    CallExpression(node) {
      const callee = node.callee.type === "MemberExpression" ? node.callee.property : node.callee;
      const component = node.arguments[0];
      const isFunction = component?.type === "FunctionExpression" || component?.type === "ArrowFunctionExpression";
      if (callee.type === "Identifier" && COMPONENT_WRAPPERS.has(callee.name) && isFunction) check(component);
    },
  };
}

function createConfirmWording(context) {
  if (!inClient(context)) return {};
  return {
    JSXAttribute(node) {
      if (node.name.name !== "message") return;
      const element = elementName(node.parent.parent);
      if (element !== "ConfirmDialog" && element !== "DeleteDialog") return;
      const value = node.value?.type === "JSXExpressionContainer" ? node.value.expression : node.value;
      const text =
        value?.type === "Literal" && typeof value.value === "string"
          ? value.value
          : value?.type === "TemplateLiteral"
            ? value.quasis.map((quasi) => quasi.value.cooked).join("…")
            : null;
      if (text === null) return;
      const asks = /^Are you sure you want to [^?]+\?/.test(text);
      const final = element !== "DeleteDialog" || text.endsWith("This action cannot be undone.");
      if (asks && final) return;
      context.report({
        node,
        message:
          'A confirmation asks "Are you sure you want to …?", then says what follows; a deletion ends "This action ' +
          'cannot be undone."',
      });
    },
  };
}

function createControlledInputs(context) {
  if (!inClient(context)) return {};
  // What a file reads with `watch`, held in a variable
  const watched = new Set();
  return {
    ImportSpecifier(node) {
      if (node.parent.source.value !== "react-hook-form" || node.imported.name !== "useForm") return;
      if (repoPath(context.filename) === "client/src/hooks/useFormWith.ts") return;
      context.report({
        node,
        message:
          "A form starts every field with a value: make it with `useFormWith(defaultValues)` (`client/src/hooks`), " +
          "whose values TypeScript checks are whole, not `useForm`.",
      });
    },
    CallExpression(node) {
      const callee = node.callee;
      const isRegister =
        (callee.type === "Identifier" && callee.name === "register") ||
        (callee.type === "MemberExpression" && callee.property.name === "register");
      if (!isRegister) return;
      context.report({
        node,
        message:
          "A form's field is bound through `useController` (the shared fields, `FormTextField`, `Controller`), never " +
          "`register`: every input is controlled.",
      });
    },
    VariableDeclarator(node) {
      if (node.id.type === "Identifier" && readsWatch(node.init)) watched.add(node.id.name);
    },
    JSXSpreadAttribute(node) {
      if (node.argument.type !== "Identifier" || !spreadsWholeField(node, node.argument.name)) return;
      context.report({
        node,
        message:
          "A form's field reaches its input through `inputRef` (`field: { ref, ...field }`, as `FormTextField` and " +
          "`SelectField` take it): spread whole, its `ref` lands on the component's root, so a failed submit can't " +
          "focus the input.",
      });
    },
    JSXAttribute(node) {
      if (node.name.type !== "JSXIdentifier" || !VALUE_PROPS.has(node.name.name)) return;
      const expression = node.value?.type === "JSXExpressionContainer" ? node.value.expression : null;
      if (!expression || !(readsWatch(expression) || namesOne(expression, watched))) return;
      context.report({
        node,
        message:
          "An input's value is its field's (`useController`), never one `watch` reads: the field binds its value and " +
          "its change.",
      });
    },
  };
}

function createDateFormats(context) {
  if (!inClient(context) || repoPath(context.filename) === "client/src/lib/formatDate.ts") return {};
  const report = (node) =>
    context.report({
      node,
      message:
        "A date is shown through `lib/formatDate.ts` (`formatDate`, `formatDateTime`, `formatRelativeTime`): one " +
        "locale, three forms.",
    });
  return {
    CallExpression(node) {
      const callee = node.callee;
      if (callee.type !== "MemberExpression" || callee.computed) return;
      // A number has `toLocaleString` too: a date's is known where the date is built in place
      const ofNewDate = callee.object.type === "NewExpression" && callee.object.callee.name === "Date";
      if (DATE_FORMATTERS.has(callee.property.name) || (callee.property.name === "toLocaleString" && ofNewDate)) {
        report(node);
      }
    },
    MemberExpression(node) {
      const ofIntl = !node.computed && node.object.type === "Identifier" && node.object.name === "Intl";
      if (ofIntl && INTL_DATE_FORMATS.has(node.property.name)) report(node);
    },
    VariableDeclarator(node) {
      if (node.init?.type !== "Identifier" || node.init.name !== "Intl" || node.id.type !== "ObjectPattern") return;
      if (node.id.properties.some((p) => p.type === "Property" && INTL_DATE_FORMATS.has(p.key.name))) report(node);
    },
  };
}

function createDialogConventions(context) {
  if (!inClient(context)) return {};
  return {
    Property(node) {
      const key = node.key.type === "Literal" ? node.key.value : null;
      if (typeof key === "string" && key.includes(".MuiDialog-paper")) {
        context.report({ node, message: "A dialog's paper is styled through `slotProps={{ paper: { sx } }}`." });
      }
    },
    JSXElement(node) {
      const name = elementName(node);
      if (name === "Dialog" && !hasAttribute(node, "fullScreen")) {
        context.report({
          node: node.openingElement,
          message: "A `Dialog` goes full screen on a phone: `fullScreen={isMobile}`.",
        });
      }
      const parent = parentElement(node);
      if (name === "Toolbar" && /(Dialog|^Modal)$/.test(elementName(parent) ?? "")) {
        context.report({
          node: node.openingElement,
          message: "A dialog's header is its `DialogTitle`, and its actions sit in its content or its `DialogActions`.",
        });
      }
      const closeLabel = node.openingElement.attributes.find(
        (a) => a.type === "JSXAttribute" && a.name.name === "aria-label" && a.value?.value === "Close",
      );
      if (name === "IconButton" && closeLabel) {
        context.report({
          node: node.openingElement,
          message: 'A dialog closes with its Close button in `DialogActions` (`variant="outlined" color="inherit"`).',
        });
      }
      if (name === "DialogTitle") {
        const decorated = hasAttribute(node, "sx");
        const extra = childElements(node).some((child) => elementName(child) !== "HelpLabel");
        if (decorated || extra) {
          context.report({
            node: node.openingElement,
            message:
              "A dialog's title is its text, styled by the theme: a `HelpLabel` when it has help, never an icon.",
          });
        }
      }
      if (name === "DialogContent") reportDialogContent(context, node);
      // component="form", or component={"form"}
      const valueOf = (a) => (a.value?.type === "JSXExpressionContainer" ? a.value.expression.value : a.value?.value);
      const isForm =
        name === "form" ||
        node.openingElement.attributes.some(
          (a) => a.type === "JSXAttribute" && a.name.name === "component" && valueOf(a) === "form",
        );
      if (!isForm) return;
      for (let p = parentElement(node); p; p = parentElement(p)) {
        if (elementName(p) === "Modal") {
          context.report({
            node: node.openingElement,
            message:
              "A form goes in a `FormDialog` (or `CreateDialog` / `EditDialog`), never a `Modal`: it would close and lose a dirty form.",
          });
          return;
        }
      }
    },
  };
}

function createEffectWrites(context) {
  if (!inClient(context)) return {};
  const syncsForms = repoPath(context.filename) === "client/src/hooks/useFormSync.ts";
  // A write taken under another name: `const { setValue: setPick } = form`
  const writes = new Set(FIELD_WRITES);
  return {
    Property(node) {
      if (node.parent.type !== "ObjectPattern" || node.key.type !== "Identifier") return;
      if (FIELD_WRITES.has(node.key.name) && node.value.type === "Identifier") writes.add(node.value.name);
    },
    CallExpression(node) {
      const name = calleeName(node);
      if (!name || !inEffect(node)) return;
      if (writes.has(name) && !syncsForms) {
        context.report({
          node,
          message:
            "An effect never writes a form's field: write it in the event that causes the change, derive what follows " +
            "from data as the component renders, and sync a form with the server through `useFormSync`.",
        });
      } else if (name === "navigate") {
        context.report({
          node,
          message:
            "An effect never navigates: a redirect is rendered (`<Navigate to={…} replace />`), and a move the user " +
            "makes happens in its event.",
        });
      } else if (/^on[A-Z]/.test(name) || name === "current") {
        context.report({
          node,
          message:
            "An effect never calls back its owner (an `on…` prop, a callback a ref holds): call it in the event that " +
            "causes it, or let the owner derive what it needs.",
        });
      }
    },
  };
}

function createErrorAlerts(context) {
  if (!inClient(context) || ERROR_ALERT_FILES.has(repoPath(context.filename))) return {};
  return {
    JSXElement(node) {
      if (!["Alert", "AnimatedAlert"].includes(elementName(node))) return;
      const colors = node.openingElement.attributes.filter(
        (a) => a.type === "JSXAttribute" && ["severity", "color"].includes(a.name.name),
      );
      if (!colors.some((a) => (writtenString(a) ?? "error") === "error")) return;
      context.report({
        node,
        message:
          "An error reaches the user one way per kind: a load failure is a `LoadError`, a page that can't show a " +
          "`PageError`, a failed action a toast (`snackbar.error`), a wrong value its field's error: never an error " +
          "`Alert` of its own. An `Alert` writes out its `severity` and `color`, so this can read them.",
      });
    },
  };
}

function createExpandArrows(context) {
  if (!inClient(context) || repoPath(context.filename) === "client/src/components/common/ExpandArrow.tsx") return {};
  return {
    JSXIdentifier(node) {
      if (!EXPAND_ARROWS.has(node.name) || node.parent.type !== "JSXOpeningElement") return;
      for (let p = node.parent; p; p = p.parent) {
        if (p.type === "JSXAttribute" && EXPAND_ICON_PROPS.has(p.name.name)) return;
      }
      context.report({
        node,
        message:
          "A row or a header that shows or hides what's under it is the toggle (`toggleProps(open, onToggle)`), and " +
          "shows it with `ExpandArrow`: one arrow, turned up while open.",
      });
    },
    JSXSpreadAttribute(node) {
      const call = node.argument.type === "LogicalExpression" ? node.argument.right : node.argument;
      if (call.type !== "CallExpression" || calleeName(call) !== "toggleProps") return;
      const role = call.arguments[2]?.type === "Literal" ? call.arguments[2].value : "button";
      const toggle = node.parent.parent;
      if ((elementName(toggle) === "TableRow") !== (role === "row")) {
        context.report({
          node,
          message:
            'A toggle is a button, but a table row keeps its role: `toggleProps(open, onToggle, "row")` on a `TableRow` alone.',
        });
      }
      if (role !== "row" && repoPath(context.filename) !== "client/src/components/common/Subsection.tsx") {
        context.report({
          node,
          message:
            'A titled group that opens and closes is a `Subsection` (`open`, `onToggle`); a row that does, a `TableRow` (`toggleProps(open, onToggle, "row")`).',
        });
      }
      if (leadingElement(toggle) !== "ExpandArrow") {
        context.report({
          node,
          message: "A toggle's arrow leads it: `ExpandArrow` before its label, in its first cell.",
        });
      }
    },
  };
}

function createFlexLayout(context) {
  if (!inClient(context)) return {};
  return {
    Property(node) {
      const key = node.key.type === "Identifier" ? node.key.name : null;
      if (key !== "display" && !GAP_KEYS.has(key) && key !== "flexDirection") return;
      const owner = node.parent.type === "ObjectExpression" ? sxOwner(node.parent) : null;
      if (owner && owner !== "Stack" && key === "display" && showsFlex(node.value)) {
        context.report({
          node,
          message:
            "A flex container is a `Stack` (`direction`, `spacing`; the rest in `sx`), never another element with a " +
            "flex `display`: a surface (`Paper`, `Card`, `DialogContent`) holds one.",
        });
      }
      if (owner === "Stack" && key !== "display") {
        context.report({ node, message: "A `Stack` takes its `direction` and `spacing` as props, never `sx`." });
      }
    },
  };
}

function createForms(context) {
  if (!inClient(context)) return {};
  return {
    JSXAttribute(node) {
      if (node.name.name !== "margin") return;
      context.report({
        node,
        message:
          "A field sets no `margin`: its form's `Stack` spaces its fields (`spacing={3}`), a `FieldRow` those side by side.",
      });
    },
    JSXElement(node) {
      const name = elementName(node);
      const report = (message) => context.report({ node: node.openingElement, message });
      if (name === "form") report('A form is a `Stack component="form" noValidate`.');
      if (attributeText(node, "component") === "form" && !hasAttribute(node, "noValidate")) {
        report("A form is `noValidate`: its rules check its fields and say why, never the browser.");
      }
      if (name === "FormTextField" && hasAttribute(node, "select")) report("A form's select is a `SelectField`.");
      const isSelectField = repoPath(context.filename) === "client/src/components/common/FormFields.tsx";
      if (name === "TextField" && hasAttribute(node, "select") && hasAttribute(node, "inputRef") && !isSelectField) {
        report("A select bound to a form's field is a `SelectField`.");
      }
      if (BOUND_FIELDS.has(name) && hasAttribute(node, "size")) report("A form's field is one size, MUI's default.");
      if (BOUND_FIELDS.has(name) && checksNatively(node)) {
        report(
          "A bound field's bounds are its `rules` (`wholeNumberRules(min, required, max)`): a `noValidate` form's " +
            "browser checks no `min`, `max`, `pattern` or `required`.",
        );
      }
      const fullWidth = BOUND_FIELDS.has(name)
        ? node.openingElement.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "fullWidth")
        : null;
      if (fullWidth) {
        const { text } = context.sourceCode;
        let start = rangeOf(fullWidth)[0];
        while (/\s/.test(text[start - 1])) start--;
        context.report({
          node: fullWidth,
          message: "A form's field fills its width already: it takes no `fullWidth`.",
          fix: (fixer) => fixer.removeRange([start, rangeOf(fullWidth)[1]]),
        });
      }
      if ((name === "TextField" || BOUND_FIELDS.has(name)) && hasAttribute(node, "variant")) {
        report("A field is outlined, MUI's default, the one look: it sets no `variant`.");
      }
      if (name !== "Stack" || !childElements(node).some((child) => BOUND_FIELDS.has(elementName(child)))) return;
      if (hasAttribute(node, "direction")) report("Fields side by side are a `FieldRow`.");
      else if (numberAttribute(node, "spacing") !== 3) report("A form's fields stack `spacing={3}` apart.");
    },
  };
}

function createHeadings(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "Typography") return;
      const report = (message) => context.report({ node: node.openingElement, message });
      const component = attributeText(node, "component");
      const variant = attributeText(node, "variant");
      if (component && /^h[1-6]$/.test(component)) {
        const expected = HEADING_VARIANTS[component];
        if (!expected) report("A page's outline stops at `h4`: a page, its sections, their subsections, their groups.");
        else if (variant !== expected) {
          report(`An \`${component}\` is \`variant="${expected}"\`: one look per level, the theme's.`);
        }
        if (sxSetsAny(node, HEADING_FONT_KEYS)) {
          report(
            "A heading's size and weight are its level's, from the theme: no `typography`, `fontSize` or `fontWeight`.",
          );
        }
        const color = sxString(node, "color");
        if (color !== null && !HEADING_COLORS.has(color)) {
          report("A heading takes the text's color: only a state colors one (`error.main`), or the banner it sits on.");
        }
        return;
      }
      const sx = node.openingElement.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "sx")?.value;
      const sxObject = sx?.type === "JSXExpressionContainer" ? sx.expression : null;
      // A subtitle is an h6 to MUI, whatever it holds
      const sized =
        attributeTexts(node, "variant").some((v) => /^(h[1-6]|subtitle[12])$/.test(v)) ||
        headingVariants(sxObject).length > 0;
      if (hasAttribute(node, "component") || !sized) return;
      report(
        'A `Typography` sized as a heading or a subtitle says what it is: `component="h1"` for a page\'s title, `h2` ' +
          "for its sections and cards, `h3` within those and in a dialog, `h4` for a group, `p` when it isn't one.",
      );
    },
  };
}

function createIcons(context) {
  if (!inClient(context) || repoPath(context.filename).startsWith("client/src/components/icons/")) return {};
  return {
    ImportDeclaration(node) {
      if (!node.source.value.startsWith("@mui/icons-material")) return;
      context.report({
        node,
        message:
          "An icon comes from `components/icons`, named for what it means (`ContributorsIcon`), so a meaning has one " +
          "icon: never from `@mui/icons-material`.",
      });
    },
  };
}

function createLabelCase(context) {
  if (!inClient(context)) return {};
  const report = (node, text) =>
    context.report({
      node,
      message: `A button's, a menu item's, a field's and a dialog's words are in Title Case ("Mark All as Read"): "${text.trim()}".`,
    });
  return {
    JSXText(node) {
      const parent = node.parent;
      const owner = parent.type === "JSXElement" ? elementName(parent) : null;
      const labels = LABELLED.has(owner) || owner === "DialogTitle";
      if (labels && /[a-z]/i.test(node.value) && !inTitleCase(node.value)) report(node, node.value);
    },
    JSXAttribute(node) {
      if (node.value?.type !== "Literal" || typeof node.value.value !== "string") return;
      const element = elementName(node.parent.parent) ?? "";
      const dialogTitle = node.name.name === "title" && /(Dialog|^Modal)$/.test(element);
      const labelled = LABELLED.has(element) || LABELLED_FIELDS.has(element) || BOUND_FIELDS.has(element);
      const label = LABEL_PROPS.has(node.name.name) && (labelled || /(Dialog|^Modal)$/.test(element));
      if ((dialogTitle || label) && !inTitleCase(node.value.value)) report(node, node.value.value);
    },
  };
}

function createMenus(context) {
  if (!inClient(context) || repoPath(context.filename) === "client/src/components/common/ActionMenuItem.tsx") return {};
  return {
    JSXElement(node) {
      const name = elementName(node);
      if (name === "Menu") {
        const panel = childElements(node).some((child) => !MENU_CHILDREN.has(elementName(child)));
        if (panel) {
          context.report({
            node: node.openingElement,
            message: "A menu lists its items alone: a panel that opens from a button is a `Popover`.",
          });
        }
      }
      if (name !== "MenuItem" || hasAttribute(node, "selected")) return;
      for (let p = parentElement(node); p; p = parentElement(p)) {
        if (elementName(p) !== "Menu") continue;
        context.report({
          node: node.openingElement,
          message:
            "A menu's action is an `ActionMenuItem` (its icon, its label, its intent); a `MenuItem` is one of " +
            "several to choose, marked `selected`.",
        });
        return;
      }
    },
  };
}

function createMotion(context) {
  if (!inClient(context) || repoPath(context.filename) === "client/src/lib/animations.ts") return {};
  const report = (node) =>
    context.report({
      node,
      message:
        "Motion is timed in `lib/animations.ts`: an animation it names (`ANIMATIONS.diceRoll`), a transition of its " +
        'tokens (`transitionOf(["opacity"], DURATION.fast)`), or a template of `DURATION` / `EASING`. No time, ' +
        "easing or keyframes written elsewhere.",
    });
  return {
    ImportSpecifier(node) {
      if (node.imported.name === "keyframes") report(node);
      const inTheme = repoPath(context.filename).startsWith("client/src/theme/");
      if (MUI_TRANSITIONS.has(node.imported.name) && node.parent.source.value === "@mui/material" && !inTheme)
        report(node);
    },
    Literal(node) {
      if (typeof node.value === "string" && node.value.includes("cubic-bezier(")) report(node);
    },
    Property(node) {
      const key = node.key.type === "Identifier" ? node.key.name : node.key.type === "Literal" ? node.key.value : null;
      if (typeof key === "string" && key.startsWith("@keyframes")) return report(node);
      if (!MOTION_PROPERTIES.has(key)) return;
      const value = node.value;
      if (value.type === "Literal" && typeof value.value === "string" && value.value !== "none") report(value);
      if (value.type === "TemplateLiteral" && timesItself(value, context.sourceCode)) report(value);
    },
  };
}

function createNavLinks(context) {
  if (!inClient(context)) return {};
  return {
    JSXAttribute(node) {
      if (node.name.name !== "onClick" || CARDS.has(elementName(node.parent.parent))) return;
      if (node.value?.type !== "JSXExpressionContainer" || !onlyNavigates(node.value.expression)) return;
      context.report({
        node,
        message:
          "A control that navigates is a link: `component={Link} to=\"…\"` (a page's way back too: `backTo`), its click only closing what it's in, " +
          "so it opens in a new tab and reads as a link. A card, which holds content of its own, opens on click.",
      });
    },
    ImportSpecifier(node) {
      if (node.imported.name !== "Link") return;
      const source = node.parent.source.value;
      const expected = source === "@mui/material" ? "MuiLink" : source === "react-router-dom" ? "Link" : null;
      if (!expected || node.local.name === expected) return;
      context.report({
        node,
        message: "React Router's `Link` is imported as `Link`, MUI's as `MuiLink`: one name for each, in every file.",
      });
    },
  };
}

function createPageErrors(context) {
  if (!inClient(context)) return {};
  return {
    JSXAttribute(node) {
      const element = elementName(node.parent.parent);
      if (node.name.name !== "message" || (element !== "PageError" && element !== "EntityPageError")) return;
      const value = node.value?.type === "JSXExpressionContainer" ? node.value.expression : node.value;
      if (worded(value)) return;
      context.report({
        node,
        message:
          "A page that couldn't load says why in `loadFailureMessage`'s words (`loadFailureMessage(\"Campaign\", " +
          "error)`): not found, no access, or failed.",
      });
    },
  };
}

function createPendingButtons(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      const name = elementName(node);
      if (name !== "Button" && name !== "IconButton") return;
      const attribute = (key) =>
        node.openingElement.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === key);
      const onClick = attribute("onClick");
      const disabled = attribute("disabled");
      if (!onClick || !disabled) return;
      const mutates = context.sourceCode.getText(onClick).includes(".mutate(");
      const waits = context.sourceCode.getText(disabled).includes("isPending");
      if (!mutates || !waits || holdsSpinner(node)) return;
      context.report({
        node: node.openingElement,
        message:
          'A button that starts a request shows it running: its label in `<DiceSpinner size="small" loading={…}>`, ' +
          "disabled the while.",
      });
    },
  };
}

function createQueryKeyRule(context) {
  if (!inClient(context) || repoPath(context.filename) === "client/src/lib/queryKeys.ts") return {};
  return {
    Property(node) {
      if (node.key.type !== "Identifier" || node.key.name !== "queryKey" || node.value.type !== "ArrayExpression")
        return;
      if (node.value.elements[0]?.type === "SpreadElement") return;
      context.report({
        node: node.value,
        message: "A query key comes from `lib/queryKeys.ts`: spread one first (`[...queryKeys.x.y(id), filter]`).",
      });
    },
  };
}

function createSearchFields(context) {
  if (!inClient(context) || repoPath(context.filename) === "client/src/components/common/SearchField.tsx") return {};
  return {
    JSXAttribute(node) {
      if (node.name.name !== "placeholder" || elementName(node.parent.parent) !== "TextField") return;
      const value = node.value?.type === "JSXExpressionContainer" ? node.value.expression : node.value;
      const text =
        value?.type === "Literal"
          ? String(value.value)
          : value?.type === "TemplateLiteral"
            ? value.quasis[0].value.cooked
            : "";
      if (!/^Search\b/.test(text ?? "")) return;
      // An `Autocomplete`'s input is a picker's combobox, not a search box
      for (let p = node.parent; p; p = p.parent) {
        if (p.type === "JSXAttribute" && p.name.name === "renderInput") return;
      }
      context.report({
        node,
        message:
          "A search box is a `SearchField` (`components/common`): its icon, its size, its placeholder as its name.",
      });
    },
  };
}

function createShadows(context) {
  if (!inClient(context) || repoPath(context.filename).startsWith("client/src/theme/")) return {};
  const messages = {
    boxShadow:
      "A shadow is the theme's: an elevation (`boxShadow: 2`, `0` for none), or a colored one from " +
      "`theme/shadows.ts` (`glow(color)`, `ring(color)`), never written out.",
    filter: "A logo's or an icon's shadow is `iconGlow(color)` (`theme/shadows.ts`), never a written `drop-shadow`.",
    textShadow:
      "A text's shadow is `textLift` (`theme/shadows.ts`), or `\"none\"` over the theme's, never written out.",
  };
  return {
    Property(node) {
      const key = node.key.type === "Identifier" ? node.key.name : null;
      if (key !== "filter" && !Object.hasOwn(SHADOW_HELPERS, key)) return;
      const surface = node.parent.type === "ObjectExpression" ? sxElement(node.parent) : null;
      if (key === "boxShadow" && ELEVATED.has(surface)) {
        context.report({
          node,
          message: "A `Paper`, a `Card` or an `Accordion` takes its depth as `elevation`, never `sx` `boxShadow`.",
        });
        return;
      }
      for (const value of styleValues(node.value)) {
        if (writesShadow(key, value)) context.report({ node: value, message: messages[key] });
      }
    },
  };
}

function createShape(context) {
  if (!inClient(context) || repoPath(context.filename).startsWith("client/src/theme/")) return {};
  return {
    Property(node) {
      const key = node.key.type === "Identifier" ? node.key.name : null;
      const value = node.value.type === "Literal" ? node.value.value : undefined;
      if (key === "borderRadius" && typeof value === "string" && value !== "50%") {
        context.report({
          node: node.value,
          message:
            'A corner is the theme\'s: `borderRadius` in its units (`1` is `shape.borderRadius`), a circle `"50%"`, ' +
            "and one corner `0` beside it (`borderBottomLeftRadius: 0`).",
        });
      }
      if (SPACING_KEYS.has(key) && typeof value === "string" && /\dpx\b/.test(value)) {
        context.report({ node: node.value, message: "Spacing is in the theme's units (`mt: 2`), never pixels." });
      }
      if (key === "zIndex" && typeof value === "number" && value > 1) {
        context.report({
          node: node.value,
          message: "A layer is the theme's (`theme.zIndex.drawer + 1`); a number orders siblings only (`0`, `1`).",
        });
      }
    },
  };
}

function createSpacing(context) {
  if (!inClient(context) || repoPath(context.filename).startsWith("client/src/theme/")) return {};
  const inSubsection = repoPath(context.filename) === "client/src/components/common/Subsection.tsx";
  const ladder =
    "A gap is a step of the ladder, by what it spaces: the parts of one item 0.5, the items of a list or a row 1, " +
    "a card's blocks and the panels or cards of a group 2, a panel's blocks 3 (a section's, a dialog's, a form's), a " +
    "page's 4 (`PageBody`). Never a step between them, one per screen size, or `spacing={0}`, a `Stack`'s own.";
  return {
    JSXAttribute(node) {
      if (node.name.name !== "spacing" || node.value?.type !== "JSXExpressionContainer") return;
      if (offLadder(node.value.expression)) context.report({ node, message: ladder });
    },
    JSXElement(node) {
      const name = elementName(node);
      const column = !hasAttribute(node, "direction");
      if ((name === "Stack" || name === "Box") && column && !inSubsection && titlesBlock(node)) {
        context.report({
          node: node.openingElement,
          message:
            "A heading and what it titles are a `Subsection` (its title, an action beside it, its content 1 apart; " +
            "`open` and `onToggle` when it opens and closes), never a heading over its block by hand.",
        });
      }
      if (name !== "Stack") return;
      const surface = parentElement(node);
      const surfaceName = surface && elementName(surface);
      const surfaceStep = CARD_SURFACES.has(surfaceName)
        ? 2
        : surfaceName === "AccordionDetails" ||
            (surfaceName === "Paper" && attributeText(surface, "variant") !== "outlined")
          ? 3
          : null;
      if (
        column &&
        surfaceStep !== null &&
        hasAttribute(node, "spacing") &&
        numberAttribute(node, "spacing") !== surfaceStep
      ) {
        context.report({
          node: node.openingElement,
          message:
            surfaceStep === 2
              ? "A card's blocks are `spacing={2}` apart."
              : "A panel's blocks (a `Paper`'s, an accordion's) are `spacing={3}` apart.",
        });
      }
      const kids = childElements(node).map((child) => elementName(child));
      const mapped = node.children.some(
        (c) => c.type === "JSXExpressionContainer" && c.expression.callee?.property?.name === "map",
      );
      if (kids.length === 0 || (kids.length === 1 && !mapped)) return;
      const row = attributeText(node, "direction") === "row";
      const step =
        row && kids.every((k) => k === "IconButton")
          ? 0.5
          : row && kids.every((k) => ROW_ITEMS.has(k))
            ? 1
            : kids.every((k) => PANELS.has(k))
              ? 2
              : kids.every((k) => k === "Section")
                ? 4
                : null;
      if (step === null || numberAttribute(node, "spacing") === step) return;
      const messages = {
        0.5: "Icon buttons side by side are one control's parts: `spacing={0.5}`.",
        1: "A row of buttons or chips holds items: `spacing={1}`.",
        2: "Panels or cards of a group are `spacing={2}` apart.",
        4: "A page's sections are its blocks: `spacing={4}`, as `PageBody` spaces them.",
      };
      context.report({ node: node.openingElement, message: messages[step] });
    },
    Property(node) {
      const key = node.key.type === "Identifier" ? node.key.name : null;
      if (GAP_KEYS.has(key) && node.parent.type === "ObjectExpression" && offLadder(node.value)) {
        context.report({ node, message: ladder });
      }
      const padded = PADDINGS.has(key) && node.parent.type === "ObjectExpression" && inSx(node.parent);
      if (padded && styleValues(node.value).some((value) => !onPaddingLadder(key, value))) {
        context.report({
          node,
          message:
            "A padding is a step of the ladder (0.5, 1, 2, 3, 4), an indent `pl: 6` (a child row under its parent's " +
            "label), or the one per screen its role takes: a surface's `{ xs: 2, sm: 3 }`, a page's `{ xs: 2, sm: 4 }`, " +
            "an empty or a loading region's `{ xs: 4, sm: 8 }`. A button's is its size's.",
        });
      }
      if (!MARGINS.has(key) || node.parent.type !== "ObjectExpression" || !inSx(node.parent)) return;
      if (alignsOrResets(node.value)) return;
      context.report({
        node,
        message:
          "The gap between blocks is their `Stack`'s `spacing` (a page's blocks are a `PageBody`'s, a row's its " +
          "`spacing` or a flex component's `gap`), never a block's own margin; an indent is padding, a heading's " +
          "gutter `gutterBottom`. A margin only aligns (`auto`) or resets (`0`).",
      });
    },
  };
}

function createSurfaces(context) {
  if (!inClient(context) || repoPath(context.filename) === "client/src/components/common/StyledCard.tsx") return {};
  const holdsActionArea = (node) =>
    node.children.some(
      (child) => child.type === "JSXElement" && (elementName(child) === "CardActionArea" || holdsActionArea(child)),
    );
  return {
    JSXElement(node) {
      if (elementName(node) !== "Card" || holdsActionArea(node)) return;
      context.report({
        node: node.openingElement,
        message:
          "A `Card` is a card one opens (`StyledCard`, a `CardActionArea` in it): a panel is a `Section`, a surface a `Paper`.",
      });
    },
  };
}

function createSxStyles(context) {
  if (!inClient(context)) return {};
  const report = (node) =>
    context.report({
      node,
      message:
        "A style is written with `sx`: never `styled()`, no stylesheet but the fonts `main.tsx` loads (the page's own are the theme's `MuiCssBaseline`), and " +
        "`style` only passes on one a component is given (`{ ...props.style }`).",
    });
  // What a file imports MUI's packages whole as (`import * as M from "@mui/material"`), whose `M.styled` it reports
  const namespaces = new Set();
  return {
    ImportDeclaration(node) {
      const source = node.source.value;
      const font = repoPath(context.filename) === "client/src/main.tsx" && source.startsWith("@fontsource");
      const stylesheet = source.endsWith(".css") && !font;
      const styled = node.specifiers.some((s) => s.type === "ImportSpecifier" && s.imported.name === "styled");
      if (stylesheet || source === "@emotion/styled" || (STYLED_SOURCES.has(source) && styled)) report(node);
      if (!STYLED_SOURCES.has(source)) return;
      for (const specifier of node.specifiers) {
        if (specifier.type !== "ImportSpecifier") namespaces.add(specifier.local.name);
      }
    },
    MemberExpression(node) {
      const ofNamespace = node.object.type === "Identifier" && namespaces.has(node.object.name);
      if (ofNamespace && !node.computed && node.property.name === "styled") report(node);
    },
    JSXAttribute(node) {
      if (node.name.type !== "JSXIdentifier" || node.name.name !== "style") return;
      const value = node.value?.type === "JSXExpressionContainer" ? node.value.expression : null;
      if (!passesStyleOn(value)) report(node);
    },
    Property(node) {
      if (node.key.type !== "Identifier" || node.key.name !== "style" || passesStyleOn(node.value)) return;
      for (let p = node.parent; p; p = p.parent) {
        if (p.type === "JSXAttribute") return report(node);
      }
    },
  };
}

function createTagChips(context) {
  const file = repoPath(context.filename);
  if (!inClient(context) || file === "client/src/components/common/TagChip.tsx") return {};
  const choices = file === "client/src/components/common/ChoiceChip.tsx";
  return {
    JSXElement(node) {
      if (elementName(node) !== "Chip" || choices) return;
      const picked = node.openingElement.attributes.some(
        (a) => a.type === "JSXSpreadAttribute" && spreadsPickedValue(a),
      );
      if (!picked) {
        context.report({
          node: node.openingElement,
          message:
            "A chip is a `TagChip` (a role, a status, a fact, a pick to remove: its words, its color), a " +
            "`ChoiceChip` (one of several to choose), or an Autocomplete's picked value (`{...getItemProps({ index })}`).",
        });
      } else if (
        ["color", "variant", "icon"].some((name) => hasAttribute(node, name)) ||
        attributeText(node, "size") !== "small"
      ) {
        context.report({
          node: node.openingElement,
          message:
            "An Autocomplete's picked value is MUI's own chip: `size=\"small\"`, no color, variant or icon of its own.",
        });
      }
    },
    Property(node) {
      const key = node.key.type === "Identifier" ? node.key.name : null;
      if (!CHIP_COLOR_KEYS.has(key) || node.parent.type !== "ObjectExpression" || sxOwner(node.parent) !== "Chip")
        return;
      context.report({ node, message: "A chip's color is its `color` prop, never `sx`." });
    },
  };
}

function createThemeColors(context) {
  if (!inClient(context) || repoPath(context.filename).startsWith("client/src/theme/")) return {};
  const report = (node) =>
    context.report({
      node,
      message:
        'A color is the theme\'s (`client/src/theme/`): use a palette token (`"text.secondary"`, ' +
        "`theme.palette.shadow`), translucent through `alpha()`, never a color written out or a hex alpha appended.",
    });
  return {
    ImportDeclaration(node) {
      if (node.source.value.startsWith("@mui/material/colors")) report(node);
    },
    MemberExpression(node) {
      const ofPalette = node.object.type === "MemberExpression" && node.object.property.name === "palette";
      if (ofPalette && !node.computed && node.property.name === "grey") report(node);
    },
    Literal(node) {
      if (typeof node.value !== "string") return;
      const attribute = node.parent.type === "JSXAttribute" ? node.parent.name.name : null;
      const hex = HEX_COLOR.test(node.value) && (attribute === null || COLOR_ATTRIBUTES.has(attribute));
      if (hex || COLOR_FUNCTION.test(node.value)) report(node);
    },
    TemplateLiteral(node) {
      const texts = node.quasis.map((quasi) => quasi.value.cooked ?? "");
      if (texts.some((text) => HEX_COLOR.test(text) || COLOR_FUNCTION.test(text))) return report(node);
      const css = COLOR_CONTEXT.test(texts.join(""));
      const suffixed = node.expressions.some(
        (expression, index) =>
          HEX_ALPHA_SUFFIX.test(texts[index + 1]) &&
          (css || context.sourceCode.getText(expression).includes("palette")),
      );
      if (suffixed) report(node);
    },
    Property(node) {
      const key = node.key.type === "Identifier" ? node.key.name : null;
      if (!COLOR_PROPERTIES.has(key)) return;
      const texts =
        node.value.type === "Literal" && typeof node.value.value === "string"
          ? [node.value.value]
          : node.value.type === "TemplateLiteral"
            ? node.value.quasis.map((quasi) => quasi.value.cooked ?? "")
            : [];
      // A palette token's path (`common.white`) names the theme's color, not CSS's
      // The grey scale is MUI's raw palette: the theme's neutrals are its text, background and action tokens
      if (texts.some((text) => /^grey\.\d+$/.test(text))) report(node.value);
      const words = texts.flatMap(
        (text) =>
          text
            .replace(/[\w-]+(?:\.[\w-]+)+/g, " ")
            .toLowerCase()
            .match(/[a-z]+/g) ?? [],
      );
      if (words.some((word) => CSS_COLOR_NAMES.has(word))) report(node.value);
    },
  };
}

function createToastWording(context) {
  if (!inClient(context)) return {};
  return {
    CallExpression(node) {
      const callee = node.callee;
      const isToast =
        callee.type === "MemberExpression" &&
        callee.object.type === "Identifier" &&
        callee.object.name === "snackbar" &&
        ["error", "info", "success", "warning"].includes(callee.property.name);
      if (!isToast) return;
      const errorFallback = callee.property.name === "error" && node.arguments.length > 1;
      const texts = node.arguments.flatMap(toastTexts);
      const bad = texts.find(
        (text) => /[.!]$/.test(text.trim()) || /\bsuccessfully\b/i.test(text) || /^Please\b/.test(text),
      );
      const unnamed = errorFallback && toastTexts(node.arguments[1]).some((text) => !/^Failed to\b/.test(text));
      if (!bad && !unnamed) return;
      context.report({
        node,
        message:
          'A toast is a phrase: "Ruleset archived", "This export expired: generate a new one", no final period ' +
          'or "!", no "successfully"; an error\'s fallback names what failed ("Failed to remove item").',
      });
    },
  };
}

function createTypeScale(context) {
  if (!inClient(context) || repoPath(context.filename).startsWith("client/src/theme/")) return {};
  return {
    Property(node) {
      const key = node.key.type === "Identifier" ? node.key.name : null;
      if (key === "fontSize" && writtenSize(node.value)) {
        return context.report({
          node: node.value,
          message:
            'A size is the theme\'s: text takes a typography variant (`variant="caption"`, `typography: "body2"`), ' +
            'an icon its size (`fontSize="tiny"`, the theme\'s `compact`, `hero`…): never a size written out.',
        });
      }
      const weights = key === "fontWeight" ? styleValues(node.value) : [];
      const written = weights.find((value) => value.type === "Literal" && !FONT_WEIGHTS.has(value.value));
      if (written) {
        return context.report({
          node: written,
          message:
            'A font weight is the theme\'s: `fontWeight: "fontWeightBold"`, `"fontWeightMedium"` or `"fontWeightRegular"`, never a number or a CSS word.',
        });
      }
      const leading =
        key === "lineHeight" && styleValues(node.value).some((v) => v.type !== "Literal" || v.value !== 1);
      if (key === "letterSpacing" || leading) {
        return context.report({
          node: node.value,
          message:
            "A text's leading and tracking are its variant's: no `letterSpacing`, and a `lineHeight` only `1`, a " +
            "glyph set in its box (a score, a count).",
        });
      }
      const fixedVariant = key === "typography" && node.value.type === "Literal";
      if (fixedVariant && node.parent.type === "ObjectExpression" && sxElement(node.parent) === "Typography") {
        context.report({
          node,
          message:
            'A `Typography`\'s variant is its `variant`: `sx` takes a responsive one (`{ xs: "body1", sm: "h6" }`).',
        });
      }
    },
  };
}

/** A JSX element's name: `IconButton`, `Dialog`. */
function elementName(node) {
  return node.openingElement.name.type === "JSXIdentifier" ? node.openingElement.name.name : null;
}

/**
 * How `pattern` binds `name`: "whole" for a form's field taken whole, its `ref` with it (`{ field }`), "bound" for any
 * other binding (`{ field: { ref, ...field } }`, a parameter), null when it doesn't bind it.
 */
function fieldBinding(pattern, name) {
  if (!pattern) return null;
  switch (pattern.type) {
    case "Identifier":
      return pattern.name === name ? "bound" : null;
    case "AssignmentPattern":
      return fieldBinding(pattern.left, name);
    case "RestElement":
      return fieldBinding(pattern.argument, name);
    case "ArrayPattern":
      return pattern.elements.map((element) => fieldBinding(element, name)).find(Boolean) ?? null;
    case "ObjectPattern":
      for (const property of pattern.properties) {
        const value = property.type === "RestElement" ? property : property.value;
        const isField = property.type === "Property" && !property.computed && property.key.name === "field";
        if (isField && value.type === "Identifier" && value.name === name) return "whole";
        const binding = fieldBinding(value, name);
        if (binding) return binding;
      }
      return null;
    default:
      return null;
  }
}

/** Whether a member chain starts at `rpc`: `rpc.api.rulesets[":id"].$get`. */
function fromRpc(node) {
  let object = node;
  while (object.type === "MemberExpression") object = object.object;
  return object.type === "Identifier" && object.name === "rpc";
}

/** Whether a JSX element has the attribute `name`. */
function hasAttribute(node, name) {
  return node.openingElement.attributes.some((a) => a.type === "JSXAttribute" && a.name.name === name);
}

/** The heading variants a style object's `typography` takes, responsive ones included (`{ xs: "h6", sm: "h5" }`). */
function headingVariants(object) {
  const typography =
    object?.type === "ObjectExpression"
      ? object.properties.find(
          (p) => p.type === "Property" && p.key.type === "Identifier" && p.key.name === "typography",
        )
      : null;
  if (!typography) return [];
  const values =
    typography.value.type === "ObjectExpression" ? typography.value.properties.map((p) => p.value) : [typography.value];
  return values.filter((v) => v?.type === "Literal" && /^h[1-6]$/.test(v.value));
}

/** Whether a JSX element holds a `DiceSpinner` somewhere inside it. */
function holdsSpinner(element) {
  return element.children.some(
    (child) => child.type === "JSXElement" && (elementName(child) === "DiceSpinner" || holdsSpinner(child)),
  );
}

function inClient(context) {
  return repoPath(context.filename).startsWith("client/src/");
}

/** Whether an element sits in a dialog's content */
function inDialog(element) {
  for (let p = parentElement(element); p; p = parentElement(p)) if (elementName(p) === "DialogContent") return true;
  return false;
}

/**
 * Whether `node` runs as an effect runs: in its callback (`useEffect(() => …)`, `useLayoutEffect`), not in a function
 * it hands on (a subscription's handler, a timer's callback, which an event calls).
 */
function inEffect(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === "ArrowFunctionExpression" || p.type === "FunctionExpression" || p.type === "FunctionDeclaration") {
      const call = p.parent;
      return call?.type === "CallExpression" && call.arguments[0] === p && EFFECTS.has(calleeName(call));
    }
  }
  return false;
}

/**
 * Whether `node` is in a function a query or a mutation runs: one a property or a prop named `…Fn` holds (`queryFn`,
 * `mutationFn`, or a hook's or a component's that becomes one, as `useRulesetSection`'s `createFn`).
 */
function inQueryFunction(node) {
  for (let p = node.parent; p; p = p.parent) {
    const name =
      p.type === "Property" && p.key.type === "Identifier"
        ? p.key.name
        : p.type === "JSXAttribute" && p.name.type === "JSXIdentifier"
          ? p.name.name
          : null;
    if (name?.endsWith("Fn")) return true;
  }
  return false;
}

/**
 * Whether a style object sits in an `sx`, at any depth: its own, a nested selector's (`"& .MuiTab-root": {…}`), a
 * breakpoint's, a branch of a condition, or what its theme callback returns.
 */
function inSx(object) {
  for (let node = object, parent = node.parent; parent; node = parent, parent = parent.parent) {
    if (parent.type === "JSXExpressionContainer") {
      return parent.parent?.type === "JSXAttribute" && parent.parent.name.name === "sx";
    }
    const passes =
      parent.type === "ObjectExpression" ||
      parent.type === "ArrayExpression" ||
      parent.type === "SpreadElement" ||
      parent.type === "ConditionalExpression" ||
      parent.type === "LogicalExpression" ||
      parent.type === "ReturnStatement" ||
      parent.type === "BlockStatement" ||
      (parent.type === "Property" && parent.value === node) ||
      (parent.type === "ArrowFunctionExpression" && parent.body === node);
    if (!passes) return false;
  }
  return false;
}

/** Whether a label is in Title Case: every word but the small ones starts with a capital (`Mark All as Read`). */
function inTitleCase(text) {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((word) => /^[a-z]/i.test(word));
  return words.every((word, index) => /^[A-Z0-9]/.test(word) || (index > 0 && SMALL_WORDS.has(word.toLowerCase())));
}

/**
 * What a toggle renders first, through the containers that hold it (a row's first cell, a `Stack`): an element's
 * name, or `#text` when words lead it.
 */
function leadingElement(element) {
  for (const child of element.children) {
    if (child.type === "JSXText") {
      if (child.value.trim()) return "#text";
      continue;
    }
    if (child.type === "JSXExpressionContainer") {
      const { expression } = child;
      if (expression.type === "JSXEmptyExpression") continue;
      if (expression.type !== "JSXElement") return "#text";
      if (!LAYOUT_WRAPPERS.has(elementName(expression))) return elementName(expression);
      const inner = leadingElement(expression);
      if (inner) return inner;
      continue;
    }
    if (child.type === "JSXFragment") {
      const inner = leadingElement(child);
      if (inner) return inner;
      continue;
    }
    if (child.type !== "JSXElement") continue;
    if (!LAYOUT_WRAPPERS.has(elementName(child))) return elementName(child);
    const inner = leadingElement(child);
    if (inner) return inner;
  }
  return null;
}

/** The elements a `.map()` callback returns: its body, or what its block returns (`items.map((i) => <Box />)`). */
function mappedElements(callback) {
  if (callback?.type !== "ArrowFunctionExpression" && callback?.type !== "FunctionExpression") return [];
  if (callback.body.type !== "BlockStatement") return [callback.body];
  return callback.body.body.flatMap((statement) =>
    statement.type === "ReturnStatement" && statement.argument ? [statement.argument] : [],
  );
}

/** Whether `node` names one of `names`. */
function namesOne(node, names) {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some((child) => namesOne(child, names));
  if (node.type === "Identifier" && names.has(node.name)) return true;
  return Object.entries(node).some(
    ([key, child]) => key !== "parent" && child && typeof child === "object" && namesOne(child, names),
  );
}

/** The number a JSX attribute holds, when it's written out (`spacing={3}`). */
function numberAttribute(element, name) {
  const attribute = element.openingElement.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === name);
  const value = attribute?.value?.type === "JSXExpressionContainer" ? attribute.value.expression : null;
  return value?.type === "Literal" && typeof value.value === "number" ? value.value : null;
}

/** Whether a gap is off the ladder: a step between its steps, one per screen size, or none at all (`0`) but as a branch */
function offLadder(value) {
  const values = styleValues(value);
  return values.some((v) => v.type !== "Literal" || !(GAPS.has(v.value) || (v.value === 0 && values.length > 1)));
}

/** Whether a handler navigates to a path, besides closing what it's in: `() => { close(); navigate(path); }` (not `navigate(-1)`, which goes back in history). */
function onlyNavigates(handler) {
  if (handler?.type !== "ArrowFunctionExpression") return false;
  const body = handler.body;
  const calls =
    body.type === "BlockStatement"
      ? body.body.map((statement) => (statement.type === "ExpressionStatement" ? statement.expression : null))
      : [body];
  if (calls.some((call) => call?.type !== "CallExpression")) return false;
  const navigation = calls.find((call) => calleeName(call) === "navigate" && call.arguments.length === 1);
  const [to] = navigation?.arguments ?? [];
  return !!to && !(to.type === "Literal" && typeof to.value === "number") && to.type !== "UnaryExpression";
}

/** Whether a padding is on the ladder: a step, an indent (`pl: 6`), a role's per-screen shape, or derived from data */
function onPaddingLadder(key, value) {
  if (value.type === "Literal") {
    return GAPS.has(value.value) || value.value === 0 || (value.value === 6 && (key === "pl" || key === "paddingLeft"));
  }
  // A value derived from data (`actions.length * 5`) is the data's; a constant, a template or a call
  // (`theme.spacing(2.5)`) hides a step
  if (value.type !== "ObjectExpression") return value.type === "BinaryExpression";
  const steps = Object.fromEntries(
    value.properties.map((p) => [p.key?.name, p.value?.type === "Literal" ? p.value.value : null]),
  );
  return Object.keys(steps).length === 2 && PADDING_SHAPES.has(`${steps.xs}/${steps.sm}`);
}

/** The nearest JSX element around `node`. */
function parentElement(node) {
  for (let p = node.parent; p; p = p.parent) if (p.type === "JSXElement") return p;
  return null;
}

/** Whether a style object passes on one its component was given: `{ ...props.style, … }`. */
function passesStyleOn(value) {
  return (
    value?.type === "ObjectExpression" &&
    value.properties.some(
      (p) =>
        p.type === "SpreadElement" &&
        p.argument.type === "MemberExpression" &&
        !p.argument.computed &&
        p.argument.property.name === "style",
    )
  );
}

/** A node's start and end in its file. */
function rangeOf(node) {
  return node.range ?? [node.start, node.end];
}

/** Whether `node` reads a form's values: `watch(…)`, `form.watch(…)`, `useWatch(…)`. */
function readsWatch(node) {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some(readsWatch);
  if (node.type === "CallExpression") {
    const callee = node.callee;
    const name =
      callee.type === "Identifier" ? callee.name : callee.type === "MemberExpression" ? callee.property.name : null;
    if (name === "watch" || name === "useWatch") return true;
  }
  return Object.entries(node).some(
    ([key, child]) => key !== "parent" && child && typeof child === "object" && readsWatch(child),
  );
}

/** The name a type reference names: `Omit` in `Omit<…>`, `ComponentProps` in `React.ComponentProps<…>`. */
function referenceName(typeName) {
  return typeName.type === "TSQualifiedName" ? typeName.right.name : typeName.name;
}

/** A dialog's content as the theme lays it out: no dividers, no gap under the title, one column, its prose a `DialogContentText`. */
function reportDialogContent(context, node) {
  const report = (element, message) => context.report({ node: element.openingElement, message });
  const column = childElements(node);
  if (hasAttribute(node, "dividers")) report(node, "A dialog's content has no `dividers`: one look for every dialog.");
  if (column[0] && sxSetsAny(column[0], TOP_SPACING)) {
    report(
      column[0],
      "The theme spaces a dialog's content from its title: its first element sets no top margin or padding.",
    );
  }
  const stack = column.length === 1 && elementName(column[0]) === "Stack" && !hasAttribute(column[0], "direction");
  const spacing = stack ? numberAttribute(column[0], "spacing") : null;
  if (column.length > 1 || (spacing !== null && spacing !== 3)) {
    report(node, "A dialog's content is one column, a `Stack spacing={3}`.");
  }
  const prose = [node, ...column.filter((child) => elementName(child) === "Stack")]
    .flatMap(childElements)
    .filter(
      (child) => elementName(child) === "Typography" && /^body[12]$/.test(attributeText(child, "variant") ?? "body1"),
    );
  for (const text of prose) report(text, "A dialog's prose is a `DialogContentText`.");
}

/** Whether a `display` value lays out as flex: `"flex"`, `"inline-flex"`, or one of a responsive object's. */
function showsFlex(value) {
  if (value.type === "Literal") return value.value === "flex" || value.value === "inline-flex";
  if (value.type === "ObjectExpression")
    return value.properties.some((p) => p.type === "Property" && showsFlex(p.value));
  return false;
}

/**
 * Whether a spread hands a chip an Autocomplete's picked value: `{...getItemProps({ index })}`, or what the block it
 * sits in destructured from that call (`const { key, ...tagProps } = getItemProps({ index })`).
 */
function spreadsPickedValue(spread) {
  const { argument } = spread;
  if (argument.type === "CallExpression") return PICKED_VALUE_PROPS.has(calleeName(argument));
  if (argument.type !== "Identifier") return false;
  for (let node = spread.parent; node; node = node.parent) {
    if (node.type !== "BlockStatement") continue;
    const declared = node.body.some(
      (statement) =>
        statement.type === "VariableDeclaration" &&
        statement.declarations.some(
          (d) =>
            d.init?.type === "CallExpression" &&
            PICKED_VALUE_PROPS.has(calleeName(d.init)) &&
            d.id.type === "ObjectPattern" &&
            d.id.properties.some((p) => p.type === "RestElement" && p.argument.name === argument.name),
        ),
    );
    if (declared) return true;
  }
  return false;
}

/** Whether `name`, spread at `node`, is a form's field taken whole: bound by the nearest function or declaration that binds it. */
function spreadsWholeField(node, name) {
  for (let scope = node.parent; scope; scope = scope.parent) {
    const declarations =
      scope.type === "BlockStatement" || scope.type === "Program"
        ? scope.body.flatMap((statement) => (statement.type === "VariableDeclaration" ? statement.declarations : []))
        : [];
    for (const declaration of declarations) {
      const binding = fieldBinding(declaration.id, name);
      if (binding) return binding === "whole";
    }
    const params = /Function/.test(scope.type) ? scope.params : [];
    for (const param of params) {
      const binding = fieldBinding(param, name);
      if (binding) return binding === "whole";
    }
  }
  return false;
}

/** The values a style property takes: the branches of a condition (`showRing ? 4 : 2`) and what a theme callback returns. */
function styleValues(value) {
  if (value.type === "ConditionalExpression")
    return [...styleValues(value.consequent), ...styleValues(value.alternate)];
  if (value.type === "ArrowFunctionExpression" && value.body.type !== "BlockStatement") return styleValues(value.body);
  return [value];
}

/** The JSX element a style object is the `sx` of, written right in the attribute (`sx={{…}}`, `sx={[{…}, sx]}`). */
function sxElement(object) {
  const container = object.parent?.type === "ArrayExpression" ? object.parent.parent : object.parent;
  const attribute = container?.parent;
  if (container?.type !== "JSXExpressionContainer" || attribute?.type !== "JSXAttribute") return null;
  return attribute.name.name === "sx" ? elementName(attribute.parent.parent) : null;
}

/**
 * The JSX element whose own `sx` a style object is: right in the attribute, in its array, a branch of a condition, or
 * what its theme callback returns. A nested selector's object (`"&:hover": {…}`) styles something else.
 */
function sxOwner(object) {
  let node = object;
  for (let parent = node.parent; parent; node = parent, parent = parent.parent) {
    if (parent.type === "JSXExpressionContainer") {
      const attribute = parent.parent;
      return attribute?.type === "JSXAttribute" && attribute.name.name === "sx"
        ? elementName(attribute.parent.parent)
        : null;
    }
    const passes =
      parent.type === "ArrayExpression" ||
      parent.type === "SpreadElement" ||
      (parent.type === "ObjectExpression" && node.type === "SpreadElement") ||
      parent.type === "ConditionalExpression" ||
      parent.type === "LogicalExpression" ||
      parent.type === "ReturnStatement" ||
      parent.type === "BlockStatement" ||
      (parent.type === "ArrowFunctionExpression" && parent.body === node);
    if (!passes) return null;
  }
  return null;
}

/** Whether an element's own `sx`, written as an object, sets one of `keys`. */
function sxSetsAny(element, keys) {
  const attribute = element.openingElement.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "sx");
  const value = attribute?.value?.type === "JSXExpressionContainer" ? attribute.value.expression : null;
  if (value?.type !== "ObjectExpression") return false;
  return value.properties.some((p) => p.type === "Property" && p.key.type === "Identifier" && keys.has(p.key.name));
}

/** The string an element's own `sx`, written as an object, gives `key` (`color: "error.main"`), when it's written out. */
function sxString(element, key) {
  const attribute = element.openingElement.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "sx");
  const value = attribute?.value?.type === "JSXExpressionContainer" ? attribute.value.expression : null;
  if (value?.type !== "ObjectExpression") return null;
  const property = value.properties.find(
    (p) => p.type === "Property" && p.key.type === "Identifier" && p.key.name === key,
  );
  return property?.value.type === "Literal" && typeof property.value.value === "string" ? property.value.value : null;
}

/** Whether a template literal times something by its own numbers: a literal time, or a time no `DURATION` gives (`${i * 80}ms`). */
function timesItself(template, sourceCode) {
  const texts = template.quasis.map((quasi) => quasi.value.cooked ?? "");
  if (texts.some((text) => MOTION_LITERAL.test(text))) return true;
  return template.expressions.some(
    (expression, index) => /^m?s\b/.test(texts[index + 1]) && !sourceCode.getText(expression).includes("DURATION."),
  );
}

/**
 * Whether a column opens with a heading over the rest of its block: an `h3` or an `h4` first, or a row that starts
 * with one (a title and its action), which a `Subsection` lays out.
 */
function titlesBlock(column) {
  const kids = childElements(column);
  if (kids.length < 2) return false;
  // Plain text set bold is a heading by its look; a label with a variant or a size of its own (a score's, a field's) is
  // one item's part
  const minorHeading = (element) =>
    element &&
    elementName(element) === "Typography" &&
    (["h3", "h4"].includes(attributeText(element, "component")) ||
      (!hasAttribute(element, "component") &&
        !hasAttribute(element, "variant") &&
        !sxSetsAny(element, TEXT_SIZE_KEYS) &&
        sxString(element, "fontWeight") === "fontWeightBold"));
  const [first] = kids;
  if (minorHeading(first)) return true;
  return (
    elementName(first) === "Stack" &&
    attributeText(first, "direction") === "row" &&
    minorHeading(childElements(first)[0])
  );
}

/** The texts a toast's argument can show: a string, a template's text, a condition's branches. */
function toastTexts(argument) {
  if (!argument) return [];
  if (argument.type === "Literal" && typeof argument.value === "string") return [argument.value];
  if (argument.type === "TemplateLiteral") return [argument.quasis.map((quasi) => quasi.value.cooked).join("…")];
  if (argument.type === "ConditionalExpression")
    return [...toastTexts(argument.consequent), ...toastTexts(argument.alternate)];
  return [];
}

/** Whether a message is `loadFailureMessage`'s: its call, or a condition whose branches are. */
function worded(value) {
  if (value?.type === "ConditionalExpression") return worded(value.consequent) && worded(value.alternate);
  return value?.type === "CallExpression" && calleeName(value) === "loadFailureMessage";
}

/**
 * Whether a shadow key's value is written out, rather than the theme's: an elevation (`boxShadow: 2`), a helper of
 * `theme/shadows.ts` (`glow(color)`, `textShadow: textLift`), the reset of a text's (`"none"`), or a filter that
 * casts no shadow (`blur(…)`).
 */
function writesShadow(key, value) {
  if (key === "filter") {
    const text = value.type === "TemplateLiteral" ? value.quasis.map((q) => q.value.raw).join("") : value.value;
    return typeof text === "string" && text.includes("drop-shadow");
  }
  const helpers = SHADOW_HELPERS[key];
  if (value.type === "CallExpression" && value.callee.type === "Identifier") return !helpers.has(value.callee.name);
  if (value.type === "Identifier") return !helpers.has(value.name);
  if (value.type !== "Literal") return true;
  return key === "boxShadow" ? typeof value.value !== "number" : value.value !== "none";
}

/** Whether a style value is a size written out: `14`, `"0.75rem"`, `{ xs: 48, sm: 64 }` (not `"inherit"`, not computed). */
function writtenSize(value) {
  if (value.type === "Literal")
    return typeof value.value === "number" || (typeof value.value === "string" && value.value !== "inherit");
  if (value.type === "TemplateLiteral") return value.expressions.length === 0;
  if (value.type === "ObjectExpression") {
    return value.properties.length > 0 && value.properties.every((p) => p.type === "Property" && writtenSize(p.value));
  }
  return false;
}

/** What a JSX attribute's value says when it's written out (`"error"`, `{"error"}`, `` {`error`} ``), else null. */
function writtenString(attribute) {
  const value = attribute.value?.type === "JSXExpressionContainer" ? attribute.value.expression : attribute.value;
  if (value?.type === "Literal" && typeof value.value === "string") return value.value;
  if (value?.type === "TemplateLiteral" && value.expressions.length === 0) return value.quasis[0].value.cooked;
  return null;
}

export default {
  "accessible-icon-buttons": { meta: { type: "problem" }, create: createAccessibleIconButtons },
  "dialog-conventions": { meta: { type: "problem" }, create: createDialogConventions },
  "query-keys": { meta: { type: "suggestion" }, create: createQueryKeyRule },
  "client-apis": { meta: { type: "suggestion" }, create: createClientApis },
  "controlled-inputs": { meta: { type: "problem" }, create: createControlledInputs },
  "effect-writes": { meta: { type: "problem" }, create: createEffectWrites },
  "api-calls-in-queries": { meta: { type: "problem" }, create: createApiCallsInQueries },
  "error-alerts": { meta: { type: "suggestion" }, create: createErrorAlerts },
  "sx-styles": { meta: { type: "suggestion" }, create: createSxStyles },
  "date-formats": { meta: { type: "suggestion" }, create: createDateFormats },
  "theme-colors": { meta: { type: "suggestion" }, create: createThemeColors },
  "component-props": { meta: { type: "suggestion" }, create: createComponentProps },
  icons: { meta: { type: "suggestion" }, create: createIcons },
  "nav-links": { meta: { type: "suggestion" }, create: createNavLinks },
  "browser-storage": { meta: { type: "suggestion" }, create: createBrowserStorage },
  menus: { meta: { type: "suggestion" }, create: createMenus },
  motion: { meta: { type: "suggestion" }, create: createMotion },
  "type-scale": { meta: { type: "suggestion" }, create: createTypeScale },
  shape: { meta: { type: "suggestion" }, create: createShape },
  borders: { meta: { type: "suggestion" }, create: createBorders },
  "flex-layout": { meta: { type: "suggestion" }, create: createFlexLayout },
  forms: { meta: { type: "suggestion", fixable: "code" }, create: createForms },
  "component-defaults": { meta: { type: "suggestion", fixable: "code" }, create: createComponentDefaults },
  "label-case": { meta: { type: "suggestion" }, create: createLabelCase },
  "search-fields": { meta: { type: "suggestion" }, create: createSearchFields },
  "button-intents": { meta: { type: "suggestion" }, create: createButtonIntents },
  "button-sizes": { meta: { type: "suggestion" }, create: createButtonSizes },
  headings: { meta: { type: "suggestion" }, create: createHeadings },
  "toast-wording": { meta: { type: "suggestion" }, create: createToastWording },
  "confirm-wording": { meta: { type: "suggestion" }, create: createConfirmWording },
  "page-errors": { meta: { type: "suggestion" }, create: createPageErrors },
  spacing: { meta: { type: "suggestion" }, create: createSpacing },
  surfaces: { meta: { type: "suggestion" }, create: createSurfaces },
  shadows: { meta: { type: "suggestion" }, create: createShadows },
  "tag-chips": { meta: { type: "suggestion" }, create: createTagChips },
  "expand-arrows": { meta: { type: "suggestion" }, create: createExpandArrows },
  "pending-buttons": { meta: { type: "suggestion" }, create: createPendingButtons },
};
