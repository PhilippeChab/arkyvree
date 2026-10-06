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
 *   intersection, `Omit<…>` / `Pick<…>` / `ComponentProps<…>`.
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
const COLOR_LITERAL = /(?<![\w&])#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|\b(?:rgba?|hsla?)\(\s*[\d.]/i;

/** A hex alpha appended to a color: the text that follows `${color}` in `${color}40` */
const HEX_ALPHA_SUFFIX = /^[0-9a-f]{2}(?![\w])/i;

/** The style properties that take a color */
const COLOR_PROPERTIES = new Set([
  "background",
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

/** Whether a JSX element has the attribute `name`. */
function hasAttribute(node, name) {
  return node.openingElement.attributes.some((a) => a.type === "JSXAttribute" && a.name.name === name);
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

function inClient(context) {
  return repoPath(context.filename).startsWith("client/src/");
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
    Literal(node) {
      if (typeof node.value === "string" && COLOR_LITERAL.test(node.value)) report(node);
    },
    TemplateLiteral(node) {
      if (node.quasis.some((quasi) => COLOR_LITERAL.test(quasi.value.cooked ?? ""))) return report(node);
      if (node.quasis.slice(1).some((quasi) => HEX_ALPHA_SUFFIX.test(quasi.value.cooked ?? ""))) report(node);
    },
    Property(node) {
      const key = node.key.type === "Identifier" ? node.key.name : null;
      const value = node.value.type === "Literal" ? node.value.value : null;
      if (COLOR_PROPERTIES.has(key) && typeof value === "string" && CSS_COLOR_NAMES.has(value.toLowerCase())) {
        report(node.value);
      }
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

/** Whether `node` names one of `names`. */
function namesOne(node, names) {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some((child) => namesOne(child, names));
  if (node.type === "Identifier" && names.has(node.name)) return true;
  return Object.entries(node).some(
    ([key, child]) => key !== "parent" && child && typeof child === "object" && namesOne(child, names),
  );
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
  return {
    FunctionDeclaration(node) {
      if (!/^[A-Z]/.test(node.id?.name ?? "")) return;
      const type = node.params[0]?.typeAnnotation?.typeAnnotation;
      if (!type || (type.type === "TSTypeReference" && !IN_PLACE_TYPES.has(referenceName(type.typeName)))) return;
      context.report({
        node: type,
        message:
          "A component's props are one named type: its own (`interface XProps`, `type XProps = Omit<…>`) or one its " +
          "family shares (`RulesetSectionProps`), never written in place.",
      });
    },
  };
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
};
