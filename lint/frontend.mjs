/**
 * The client's conventions (AGENTS.md's Frontend Architecture), as rules:
 *
 * - `accessible-icon-buttons`: an `IconButton` has an accessible name: an `aria-label` (or `aria-labelledby`), or a
 *   `Tooltip` right around it. A tooltip around a `<span>` (a disabled button's), or one with `describeChild`, doesn't
 *   name the button. The attributes are written out: a spread (`{...buttonProps}`) doesn't count, whatever it holds.
 * - `dialog-conventions`: a `Dialog` goes full screen on a phone (`fullScreen={isMobile}`), and a form is never in a
 *   `Modal`, which skips the guard that keeps a dirty form open (`FormDialog`, `CreateDialog` and `EditDialog` have it).
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
 * - `sx-styles`: a style is written with `sx`, by the theme's scale: never `styled()` (nor `M.styled`), never a stylesheet but the global
 *   one `main.tsx` loads (`index.css`, the fonts), and `style` only passes on one a component is given
 *   (`{ ...props.style, … }`, as MUI hands a list option), on an element or in a prop's object (`slotProps`).
 * - `error-alerts`: an error reaches the user one way per kind: a list, a section or a step that failed to load is a
 *   `LoadError` (`loadFailureMessage`'s words), a page that can't show is a `PageError`, a failed action is a toast
 *   (`snackbar.error`, which names what failed), a wrong value is its field's error, and the auth pages show their
 *   form's error. So an error `Alert` sits only in `LoadError`, the auth pages' layout and the toast, and every other
 *   `Alert` writes out its `severity` and `color`, so the rule can read them.
 * - `theme-colors`: a color is the theme's (`client/src/theme/`): elsewhere it's a palette token (`"text.secondary"`,
 *   `theme.palette.shadow`), translucent through `alpha()`. No hex, `rgb()` or `hsl()` literal, no CSS color name
 *   (`"white"`), and no hex alpha appended to a color (`${theme.palette.primary.main}40`).
 * - `component-props`: a component's props are one named type, its own (`interface XProps`, `type XProps = Omit<…>`)
 *   or one its family shares (`RulesetSectionProps`, `EditorProps<Feat>`), never written in place: an object type, an
 *   intersection, `Omit<…>` / `Pick<…>` / `ComponentProps<…>` (a `memo` or `forwardRef` component too).
 * - `icons`: an icon comes from `components/icons`, named for what it means, so a meaning has one icon.
 * - `nav-links`: a control that only navigates is a link (`component={Link} to`), never an `onClick` that calls
 *   `navigate`; a card holds content of its own and opens on click. React Router's `Link` is `Link`, MUI's `MuiLink`.
 * - `browser-storage`: what the browser keeps is a store's (`client/src/stores/`, zustand's `persist`).
 * - `type-scale`: a size is the theme's: text takes a typography variant, an icon its size (`fontSize="tiny"`); a
 *   font weight is a number, and a `Typography` takes a fixed variant as its `variant`.
 * - `shape`: a corner is in the theme's units (`borderRadius: 1`) or a circle (`"50%"`), and a layer above the page is
 *   the theme's (`theme.zIndex`); a `zIndex` number orders siblings only (`0`, `1`).
 * - `borders`: a border is the theme's shorthand (`border: 1`), its color `borderColor`, its style `borderStyle`; a
 *   `Paper` or `Card` takes its elevation and its outline as props (`elevation`, `variant="outlined"`).
 * - `flex-layout`: a flex container is a `Stack`, its `direction` and `spacing` props (`useFlexGap`, the theme's
 *   default, makes `spacing` a gap), never a `Box` with a flex `display`.
 * - `component-defaults`: what the theme sets for every instance (a tooltip's arrow and delay, `Collapse`'s timeout)
 *   isn't set again on one.
 * - `label-case`: a button's, a menu item's and a dialog's words are in Title Case ("Mark All as Read").
 * - `search-fields`: a search box is a `SearchField`, never a `TextField` of its own.
 * - `button-intents`: a button is styled by its intent, as `docs/ui-buttons.md` sets it: the verb its label starts with
 *   (Delete, Archive, Publish, Cancel…) picks its variant and color.
 * - `headings`: a `Typography` sized as a heading (`variant="h6"`, `typography: { xs: "h6" }`) declares its element
 *   (`component="h2"`, `"p"`), so the page's outline is a hierarchy.
 * - `motion`: motion is timed in `lib/animations.ts`: an animation it names (`ANIMATIONS`), a transition of its tokens
 *   (`transitionOf`), or a template of `DURATION` / `EASING`; keyframes are defined there alone.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { repoPath } from "./paths.mjs";

/** The props an input takes its value through. */
const VALUE_PROPS = new Set(["value", "values", "checked", "digits", "selected"]);

/** The hooks whose callback is an effect. */
const EFFECTS = new Set(["useEffect", "useLayoutEffect"]);

/** The form writes an effect never makes, but `useFormSync`'s. */
const FIELD_WRITES = new Set(["setValue", "resetField", "reset"]);

/** The requests an `rpc` endpoint makes. */
const REQUEST_METHODS = new Set(["$get", "$post", "$put", "$patch", "$delete"]);

/** The ways to write a date that `lib/formatDate.ts` keeps to itself. */
const DATE_FORMATTERS = new Set(["toLocaleDateString", "toLocaleTimeString"]);

/** The packages that export MUI's `styled` */
const STYLED_SOURCES = new Set(["@mui/material", "@mui/material/styles", "@mui/system"]);

/** The components that show an error in an `Alert`: a load failure, the auth pages' form error, and the toast. */
const ERROR_ALERT_FILES = new Set([
  "client/src/components/common/LoadError.tsx",
  "client/src/components/auth/AuthLayout.tsx",
  "client/src/contexts/ToastContext.tsx",
]);

/** A color written out: a hex color, or an `rgb()` / `hsl()` of numbers (`rgba(var(--…))` reads the theme's) */
const HEX_COLOR = /(?<![\w&])#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i;

/** A color function of written values (`rgba(0, 0, 0, 0.3)`, `oklch(…)`, `color(srgb …)`); `rgba(var(--…))` reads the theme's */
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[\d.]|\bcolor\(\s*[a-z-]+\s+[\d.]/i;

/** A style value that holds a color: a gradient, a shadow, a border */
const COLOR_CONTEXT = /gradient\(|shadow\(|\bsolid\b|\bdashed\b|\dpx\b/;

/** The JSX attributes that take a color (`<path fill="…">`): any other attribute's hex text isn't one (`href="#add"`) */
const COLOR_ATTRIBUTES = new Set(["bgcolor", "color", "fill", "stopColor", "stroke"]);

/** A hex alpha appended to a color: the text that follows `${color}` in `${color}40` */
const HEX_ALPHA_SUFFIX = /^[0-9a-f]{2}(?![\w])/i;

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

/** The wrappers a component is declared in (`memo(function Row(…) {…})`) */
const COMPONENT_WRAPPERS = new Set(["forwardRef", "memo"]);

/** What a card renders: a container that opens on click and holds content of its own, so it can't be a link */
const CARDS = new Set(["ListCard", "StyledCard"]);

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

/** A time or an easing written out: `200ms`, `0.3s`, `ease-in-out`, `cubic-bezier(…)` */
const MOTION_LITERAL = /\d(?:\.\d+)?m?s\b|\b(?:ease(?:-in|-out|-in-out)?|linear|steps)\b|cubic-bezier\(/;

/** The border shorthands, which the theme writes from a width (`border: 1` is `1px solid`) */
const BORDER_SIDES = new Set(["border", "borderBottom", "borderLeft", "borderRight", "borderTop"]);

/** The props the theme sets for every instance of a component (`MuiTooltip`'s and `MuiCollapse`'s `defaultProps`) */
const THEME_DEFAULTS = { Collapse: new Set(["timeout"]), Tooltip: new Set(["arrow", "enterDelay", "enterNextDelay"]) };

/** MUI's transitions a component never runs itself: a page fades in with `PageTransition`, a block opens with `Collapse` */
const MUI_TRANSITIONS = new Set(["Fade", "Grow", "Slide", "Zoom"]);

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

/** The elements whose text is an action's label: a button, a menu item */
const LABELLED = new Set(["ActionMenuItem", "Button", "MenuItem"]);

/** The props that hold an action's label or a dialog's title */
const LABEL_PROPS = new Set(["backLabel", "confirmLabel", "label", "submitLabel"]);

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

/** A button's look by its intent, as `docs/ui-buttons.md` sets it: the verb its label starts with picks the row */
// oxfmt-ignore
const BUTTON_INTENTS = [
  { verbs: ["Delete", "Remove", "Reject", "Revoke", "Unsubscribe", "Unlink"], variant: "contained", color: "error" },
  { verbs: ["Archive", "Leave"], variant: "contained", color: "warning" },
  { verbs: ["Publish", "Accept", "Unarchive", "Restore"], variant: "contained", color: "success" },
  { verbs: ["Cancel", "Close", "Dismiss"], variant: "outlined", color: "inherit" },
];

/** `Intl`'s date formatters */
const INTL_DATE_FORMATS = new Set(["DateTimeFormat", "RelativeTimeFormat"]);

/** Whether a JSX element has the attribute `name`. */
function hasAttribute(node, name) {
  return node.openingElement.attributes.some((a) => a.type === "JSXAttribute" && a.name.name === name);
}

/** The string a JSX attribute holds, when it's written out (`variant="outlined"`). */
function attributeText(element, name) {
  const attribute = element.openingElement.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === name);
  if (!attribute) return undefined;
  return attribute.value?.type === "Literal" ? attribute.value.value : null;
}

/** A call's name: `setValue` for `setValue(…)`, `form.setValue(…)` and `field.onChange?.(…)`. */
function calleeName(node) {
  const callee = node.callee.type === "ChainExpression" ? node.callee.expression : node.callee;
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && !callee.computed) return callee.property.name;
  return null;
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

function inClient(context) {
  return repoPath(context.filename).startsWith("client/src/");
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
      if (!THEME_DEFAULTS[element]?.has(node.name.name)) return;
      context.report({
        node,
        message: `A \`${element}\`'s \`${node.name.name}\` is the theme's default, the same for every one: never set here.`,
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

function createHeadings(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "Typography") return;
      const attributes = node.openingElement.attributes.filter((a) => a.type === "JSXAttribute");
      if (attributes.some((a) => a.name.name === "component")) return;
      const variant = attributes.find((a) => a.name.name === "variant")?.value;
      const sx = attributes.find((a) => a.name.name === "sx")?.value;
      const sxObject = sx?.type === "JSXExpressionContainer" ? sx.expression : null;
      const looksLikeHeading =
        (variant?.type === "Literal" && /^h[1-6]$/.test(variant.value)) || headingVariants(sxObject).length > 0;
      if (!looksLikeHeading) return;
      context.report({
        node: node.openingElement,
        message:
          'A `Typography` sized as a heading says what it is: `component="h1"` for a page\'s title, `h2` for its ' +
          "sections and list cards, `h3` within those and in a dialog, `p` when it isn't one.",
      });
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

/** Whether a label is in Title Case: every word but the small ones starts with a capital (`Mark All as Read`). */
function inTitleCase(text) {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((word) => /^[a-z]/i.test(word));
  return words.every((word, index) => /^[A-Z0-9]/.test(word) || (index > 0 && SMALL_WORDS.has(word.toLowerCase())));
}

function createLabelCase(context) {
  if (!inClient(context)) return {};
  const report = (node, text) =>
    context.report({
      node,
      message: `A button's, a menu item's and a dialog's words are in Title Case ("Mark All as Read"): "${text.trim()}".`,
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
      const label = LABEL_PROPS.has(node.name.name) && (LABELLED.has(element) || /(Dialog|^Modal)$/.test(element));
      if ((dialogTitle || label) && !inTitleCase(node.value.value)) report(node, node.value.value);
    },
  };
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

/** Whether a handler only navigates to a path: `() => navigate(path)` (not `navigate(-1)`, which goes back in history). */
function onlyNavigates(handler) {
  if (handler?.type !== "ArrowFunctionExpression" || handler.params.length > 0) return false;
  let call = handler.body;
  if (call.type === "BlockStatement") {
    if (call.body.length !== 1 || call.body[0].type !== "ExpressionStatement") return false;
    call = call.body[0].expression;
  }
  const isNavigate = call.type === "CallExpression" && calleeName(call) === "navigate" && call.arguments.length === 1;
  const [to] = call.arguments ?? [];
  return isNavigate && !(to.type === "Literal" && typeof to.value === "number") && to.type !== "UnaryExpression";
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
          'A control that only navigates is a link: `component={Link} to="…"` (a page\'s way back too: `backTo`), ' +
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

/** The nearest JSX element around `node`. */
function parentElement(node) {
  for (let p = node.parent; p; p = p.parent) if (p.type === "JSXElement") return p;
  return null;
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

function createDialogConventions(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      const name = elementName(node);
      if (name === "Dialog" && !hasAttribute(node, "fullScreen")) {
        context.report({
          node: node.openingElement,
          message: "A `Dialog` goes full screen on a phone: `fullScreen={isMobile}`.",
        });
      }
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

function createSxStyles(context) {
  if (!inClient(context)) return {};
  const report = (node) =>
    context.report({
      node,
      message:
        "A style is written with `sx`: never `styled()`, no stylesheet but the global one `main.tsx` loads, and " +
        "`style` only passes on one a component is given (`{ ...props.style }`).",
    });
  // What a file imports MUI's packages whole as (`import * as M from "@mui/material"`), whose `M.styled` it reports
  const namespaces = new Set();
  return {
    ImportDeclaration(node) {
      const source = node.source.value;
      const stylesheet = source.endsWith(".css") && repoPath(context.filename) !== "client/src/main.tsx";
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

/** Whether a `display` value lays out as flex: `"flex"`, `"inline-flex"`, or one of a responsive object's. */
function showsFlex(value) {
  if (value.type === "Literal") return value.value === "flex" || value.value === "inline-flex";
  if (value.type === "ObjectExpression")
    return value.properties.some((p) => p.type === "Property" && showsFlex(p.value));
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
      if (surface !== "Paper" && surface !== "Card") return;
      if (key === "boxShadow" && node.value.type === "Literal" && typeof node.value.value === "number") {
        context.report({
          node,
          message: "A `Paper` or a `Card` takes its elevation as `elevation`, never `sx` `boxShadow`.",
        });
      }
      if (key === "border") {
        context.report({
          node,
          message:
            'A `Paper` or a `Card` is outlined by `variant="outlined"` (or the theme\'s card), never an `sx` border.',
        });
      }
    },
  };
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
      parent.type === "ConditionalExpression" ||
      parent.type === "LogicalExpression" ||
      parent.type === "ReturnStatement" ||
      parent.type === "BlockStatement" ||
      (parent.type === "ArrowFunctionExpression" && parent.body === node);
    if (!passes) return null;
  }
  return null;
}

function createFlexLayout(context) {
  if (!inClient(context)) return {};
  return {
    Property(node) {
      const key = node.key.type === "Identifier" ? node.key.name : null;
      if (key !== "display" && key !== "gap" && key !== "flexDirection") return;
      const owner = node.parent.type === "ObjectExpression" ? sxOwner(node.parent) : null;
      if (owner === "Box" && key === "display" && showsFlex(node.value)) {
        context.report({
          node,
          message:
            "A flex container is a `Stack` (`direction`, `spacing`; the rest in `sx`), never a `Box` with a flex " +
            "`display`.",
        });
      }
      if (owner === "Stack" && key !== "display") {
        context.report({ node, message: "A `Stack` takes its `direction` and `spacing` as props, never `sx`." });
      }
    },
  };
}

/** Whether a template literal times something by its own numbers: a literal time, or a time no `DURATION` gives (`${i * 80}ms`). */
function timesItself(template, sourceCode) {
  const texts = template.quasis.map((quasi) => quasi.value.cooked ?? "");
  if (texts.some((text) => MOTION_LITERAL.test(text))) return true;
  return template.expressions.some(
    (expression, index) => /^m?s\b/.test(texts[index + 1]) && !sourceCode.getText(expression).includes("DURATION."),
  );
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
      if (key === "fontWeight" && node.value.type === "Literal" && typeof node.value.value === "string") {
        return context.report({
          node: node.value,
          message: "A font weight is a number (`fontWeight: 700`), never a word.",
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

/** What a JSX attribute's value says when it's written out (`"error"`, `{"error"}`, `` {`error`} ``), else null. */
function writtenString(attribute) {
  const value = attribute.value?.type === "JSXExpressionContainer" ? attribute.value.expression : attribute.value;
  if (value?.type === "Literal" && typeof value.value === "string") return value.value;
  if (value?.type === "TemplateLiteral" && value.expressions.length === 0) return value.quasis[0].value.cooked;
  return null;
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
  motion: { meta: { type: "suggestion" }, create: createMotion },
  "type-scale": { meta: { type: "suggestion" }, create: createTypeScale },
  shape: { meta: { type: "suggestion" }, create: createShape },
  borders: { meta: { type: "suggestion" }, create: createBorders },
  "flex-layout": { meta: { type: "suggestion" }, create: createFlexLayout },
  "component-defaults": { meta: { type: "suggestion" }, create: createComponentDefaults },
  "label-case": { meta: { type: "suggestion" }, create: createLabelCase },
  "search-fields": { meta: { type: "suggestion" }, create: createSearchFields },
  "button-intents": { meta: { type: "suggestion" }, create: createButtonIntents },
  headings: { meta: { type: "suggestion" }, create: createHeadings },
};
