/**
 * The client's conventions (docs/frontend.md), as rules:
 *
 * - `accessible-icon-buttons`: an `IconButton` is named by its `aria-label` (or `aria-labelledby`), written out (a
 *   spread doesn't count), whether or not a `Tooltip` shows its name.
 * - `dialog-conventions`: a `Dialog` goes full screen on a phone (`fullScreen={isMobile}`), and a form is never in a
 *   `Modal`, which skips the guard that keeps a dirty form open (`FormDialog`, `CreateDialog` and `EditDialog` have it).
 * - `query-keys`: every query key comes from `lib/queryKeys.ts`: a key written as an array starts by spreading one
 *   (`[...QUERY_KEYS.rulesets.section(id, "feats"), search]`).
 * - `client-apis`: a mutation runs with `.mutate()` and its callbacks, never `.mutateAsync()`, and a loader is a
 *   `DiceSpinner`, never MUI's `CircularProgress`.
 * - `controlled-inputs`: every input is controlled, and a form's field is bound one way: through `useController` (the
 *   shared fields, `FormTextField`, `Controller`), never `register` (uncontrolled), and never a value `watch` reads
 *   with a `setValue` for its change. A form starts every field with a value: it's made with `useFormWith` (a whole
 *   `defaultValues`), never react-hook-form's `useForm`, which takes some. A field written in the user's event (what
 *   follows from a pick) is marked dirty as its input would: `setValue(name, value, { shouldDirty: true })`. A field's
 *   error shows where its binding puts it (`fieldState.error`), never read from `formState.errors`.
 * - `effect-writes`: an effect synchronizes with what's outside React, and never does what an event or a render does: it
 *   never writes a form's field (`setValue`, `resetField`, `reset`, but `useFormSync`'s, which follows the server),
 *   navigates (a redirect is a rendered `<Navigate>`) nor calls back its owner (an `on…` prop, or a callback a ref
 *   holds). A change happens in the event that causes it, and
 *   what follows from data is derived as it renders.
 * - `api-calls-in-queries`: the API is called through TanStack Query only: an `rpc` request (`$get`, `$post`…, off
 *   `rpc` or a part of it a variable holds) is made in a function a query or a mutation runs, which caches, dedupes and
 *   reports it. Such a function is named `…Fn`, as TanStack's `queryFn` and `mutationFn` are, wherever it's handed
 *   (`useRulesetSection`'s `createFn`, an editor's `saveFn`, a `const exportFn` handed to `usePdfExport`, a module's
 *   `function deleteEntityFn`); a queries module's (`…Queries.ts`) helpers are its queries'.
 * - `load-errors`: a list, a section or a step that failed to load says so with `LoadError` (`components/common`), in
 *   `loadFailureMessage`'s words: an error `Alert` never writes its own "Failed to load…".
 * - `component-props`: a component destructures its props in its signature, typed by one named type: its own
 *   (`interface CardProps`, `type CardProps = Omit<…>`) or one its family shares (`RulesetSectionProps`), never written
 *   in place (an object type, an intersection, `Omit<…>`, `Pick<…>`, `ComponentProps<…>`).
 * - `jsx-conditionals`: what shows on a condition only is `cond && <X />`, never `cond ? <X /> : null`; a chain of
 *   alternatives (`a ? <A /> : b ? <B /> : null`) ends in null.
 * - `component-files`: a PascalCase `.tsx` file exports a component of its name (`Card.tsx`, `Card`), or, named in
 *   the plural, the family its name says (`FormFields.tsx`: `NameField`, `EmailField`); a camelCase file exports no
 *   component. A page is `XPage.tsx`, under `pages/`, whose default export is `function XPage`; a default export is
 *   the declaration itself, never a name exported after it.
 * - `hook-files`: a hook (`useX`) is the one function `useX.ts` exports, and a module declares no other hook; what
 *   it gives is an object (`{ value, setValue }`), never a tuple.
 * - `handler-names`: a component's own handler is `handleX`; `onX` names a prop, never a function of its own.
 * - `constant-names`: a module's constant built from a literal (a string, a number, an array or an object literal,
 *   whatever it holds) is named in SCREAMING_CASE, and one a style's `sx` takes ends in `_SX`.
 * - `queries`: a query's options come from a `queryOptions` factory in a `…Queries.ts` module (or `lib/queries.ts`);
 *   one that can't run yet passes `skipToken` (`enabled` is a plain switch); it keeps its previous data with
 *   `keepPreviousData`, and its durations are named. The cache is written in a mutation's callbacks, and an infinite
 *   query's items are `pageItems(data)`.
 * - `parsed-responses`: a request's answer is read with `parseResponse(…)`.
 * - `dot-notation`: a member named by an identifier is read with a dot (`rpc.api.characters.share.$post`); brackets are
 *   for a name that isn't one (`[":id"]`, `["class-levels"]`).
 * - `error-reads`: an error shows through `errorMessage`, never its raw `message` (its toast names what failed:
 *   `snackbar.error(error, "Failed to …")`, whose fallback TypeScript requires).
 * - `browser-storage`: what the browser keeps is a store's (`client/src/stores/`, zustand's `persist`).
 * - `date-formats`: a date is shown through `lib/formatDate.ts`, in the viewer's language.
 * - `navigation`: a control that only navigates is a link (`component={Link} to`), an external link an anchor, never
 *   `window.open`; the URL's search params are read through the shared hooks; React Router's `Link` is `Link`, MUI's
 *   `MuiLink`.
 * - `clickable-elements`: an element that opens or expands on click spreads `clickableProps` (and `CLICKABLE_SX`).
 * - `tooltips`: a `Tooltip` around a control that can be disabled wraps it in a `<span>`; one on a control its own
 *   text names takes `describeChild`.
 * - `form-fields`: a number field is `FormTextField number`, without a `type`; a field's rules are named
 *   (`lib/validation.ts`), never written in place.
 * - `icons`: an icon comes from `components/icons`, where every icon the app shows is named, never from
 *   `@mui/icons-material`.
 * - `react-imports`: React's types and functions are named imports (`import { type ReactNode, StrictMode } from
 *   "react"`), never read through a `React.` namespace or a default `React` import; a component takes its `ref` as a
 *   prop, never through `forwardRef`.
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import path from "node:path";

import { calleeName, elementName, hasAttribute, inClient, parentElement } from "./jsx.mjs";
import { repoPath } from "./paths.mjs";

/** What a card renders: a container that opens on click and holds content of its own, so it can't be a link */
const CARDS = new Set(["ListCard", "StatCard", "StyledCard"]);

/** The wrappers a component's function is handed to */
const COMPONENT_WRAPPERS = new Set(["forwardRef", "memo"]);

/** A date's own formatters, which a date never goes through outside `lib/formatDate.ts` */
const DATE_FORMATTERS = new Set(["toLocaleDateString", "toLocaleTimeString"]);

/** The hooks whose callback is an effect. */
const EFFECTS = new Set(["useEffect", "useLayoutEffect"]);

/** The form writes an effect never makes, but `useFormSync`'s. */
const FIELD_WRITES = new Set(["setValue", "resetField", "reset"]);

/** The types that write a component's props in place, rather than name them */
const IN_PLACE_TYPES = new Set([
  "ComponentProps",
  "ComponentPropsWithRef",
  "ComponentPropsWithoutRef",
  "Omit",
  "Partial",
  "Pick",
  "PropsWithChildren",
  "Readonly",
  "Required",
]);

/** `Intl`'s date formatters */
const INTL_DATE_FORMATS = new Set(["DateTimeFormat", "RelativeTimeFormat"]);

/** A mutation's callbacks, where its writes to the cache go */
const MUTATION_CALLBACKS = new Set(["onError", "onMutate", "onSettled", "onSuccess"]);

/** The elements a click doesn't reach from the keyboard, unless they spread `clickableProps` */
const NON_INTERACTIVE = new Set([
  "Avatar",
  "Box",
  "Card",
  "CardContent",
  "ListItem",
  "Paper",
  "Stack",
  "TableCell",
  "TableRow",
  "Typography",
  "div",
  "li",
  "p",
  "span",
  "td",
  "tr",
]);

/** The requests an `rpc` endpoint makes. */
const REQUEST_METHODS = new Set(["$get", "$post", "$put", "$patch", "$delete"]);

/** The elements whose text names them, which a `Tooltip` describes rather than names (`describeChild`) */
const TEXT_CONTROLS = new Set([
  "Button",
  "Chip",
  "ListItemButton",
  "MenuItem",
  "TagChip",
  "ToggleButton",
  "Typography",
]);

/** The props an input takes its value through. */
const VALUE_PROPS = new Set(["value", "values", "checked", "digits", "selected"]);

/** Whether a spread is `clickableProps(…)`'s, maybe on a condition (`interactive && clickableProps(pick)`) */
function callsClickableProps(node) {
  if (node.type === "CallExpression") return calleeName(node) === "clickableProps";
  if (node.type === "LogicalExpression") return callsClickableProps(node.right);
  if (node.type === "ConditionalExpression")
    return callsClickableProps(node.consequent) || callsClickableProps(node.alternate);
  return false;
}

/** Whether `name` is an error something caught: a `catch`'s, or the parameter of an `onError` or a `.catch()` callback */
function caughtError(name) {
  for (let p = name.parent; p; p = p.parent) {
    if (p.type === "CatchClause" && p.param?.type === "Identifier" && p.param.name === name.name) return true;
    const isFunction = p.type === "ArrowFunctionExpression" || p.type === "FunctionExpression";
    if (!isFunction || !p.params.some((param) => param.type === "Identifier" && param.name === name.name)) continue;
    const holder = p.parent;
    if (holder?.type === "Property" && holder.key.type === "Identifier" && holder.key.name === "onError") return true;
    if (
      holder?.type === "CallExpression" &&
      holder.arguments.includes(p) &&
      ["catch", "then"].includes(calleeName(holder))
    )
      return true;
    return false;
  }
  return false;
}

function createAccessibleIconButtons(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "IconButton") return;
      if (hasAttribute(node, "aria-label") || hasAttribute(node, "aria-labelledby")) return;
      context.report({
        node: node.openingElement,
        message: "An icon-only `IconButton` is named by its `aria-label`, whether or not a `Tooltip` shows its name.",
      });
    },
  };
}

function createApiCallsInQueries(context) {
  if (!inClient(context)) return {};
  const queriesModule = isQueriesModule(context);
  return {
    CallExpression(node) {
      if (!requestMethod(node.callee) || inQueryFunction(node) || queriesModule) return;
      context.report({
        node,
        message:
          "The API is called through TanStack Query: make this request in a function a query or a mutation runs, named " +
          "`…Fn` (a `queryFn`, a `mutationFn`, or a hook's `createFn` that becomes one), never on its own.",
      });
    },
  };
}

function createBrowserStorage(context) {
  if (!inClient(context) || repoPath(context.filename).startsWith("client/src/stores/")) return {};
  return {
    Identifier(node) {
      if (node.name !== "localStorage" && node.name !== "sessionStorage") return;
      const isKey =
        (node.parent.type === "Property" || node.parent.type === "TSPropertySignature") &&
        node.parent.key === node &&
        !node.parent.computed;
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

function createClickableElements(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      const name = elementName(node);
      if (!NON_INTERACTIVE.has(name) || !hasAttribute(node, "onClick")) return;
      const spreadsClickable = node.openingElement.attributes.some(
        (a) => a.type === "JSXSpreadAttribute" && callsClickableProps(a.argument),
      );
      if (spreadsClickable) return;
      context.report({
        node: node.openingElement,
        message:
          "An element that opens or expands on click spreads `clickableProps(onActivate)` and puts `CLICKABLE_SX` in its " +
          "`sx`, so the keyboard reaches it: never a bare `onClick`.",
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
    // const { mutate } = useMutation(…): a mutation is held whole, `saveMutation.mutate(…)`, `saveMutation.isPending`
    VariableDeclarator(node) {
      const call = node.init?.type === "AwaitExpression" ? node.init.argument : node.init;
      if (node.id.type !== "ObjectPattern" || call?.type !== "CallExpression" || calleeName(call) !== "useMutation")
        return;
      context.report({
        node: node.id,
        message:
          "A mutation is held whole (`const saveMutation = useMutation(…)`): read `.mutate` and `.isPending` off it.",
      });
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

function createComponentFiles(context) {
  const file = repoPath(context.filename);
  if (!file.startsWith("client/src/") || !file.endsWith(".tsx")) return {};
  const base = path.posix.basename(file, ".tsx");
  const components = [];
  let defaultName = null;
  return {
    "Program > ExportNamedDeclaration > FunctionDeclaration, Program > ExportNamedDeclaration > ClassDeclaration"(
      node,
    ) {
      if (/^[A-Z]/.test(node.id.name)) components.push(node.id.name);
    },
    ExportDefaultDeclaration(node) {
      const declaration = node.declaration;
      if (declaration.type !== "FunctionDeclaration" && declaration.type !== "ClassDeclaration") {
        context.report({
          node,
          message: "A default export is the declaration itself (`export default function XPage`).",
        });
        return;
      }
      defaultName = declaration.id?.name ?? null;
      if (defaultName) components.push(defaultName);
    },
    "Program:exit"(node) {
      const report = (message) => context.report({ node, message });
      if (file.startsWith("client/src/pages/") && defaultName && (!base.endsWith("Page") || defaultName !== base)) {
        report(
          `A page is \`XPage.tsx\`, its default export \`function XPage\`: not \`${defaultName}\` in \`${base}.tsx\`.`,
        );
        return;
      }
      if (/^[a-z]/.test(base)) {
        if (components.length) {
          report(
            `A camelCase module exports no component: \`${components.join("`, `")}\` belongs in a file of its name.`,
          );
        }
        return;
      }
      if (!components.length || components.includes(base)) return;
      // A plural name holds a family: FormFields.tsx's *Field, StandardDialogs.tsx's *Dialog
      const family = base.match(/([A-Z][a-z0-9]*)s$/)?.[1];
      if (family && components.every((name) => name.endsWith(family))) return;
      report(`A component file is named for what it exports: \`${base}.tsx\` exports \`${components.join("`, `")}\`.`);
    },
  };
}

function createComponentProps(context) {
  if (!inClient(context)) return {};
  const check = (fn) => {
    const param = fn.params[0];
    if (!param) return;
    const type = param.typeAnnotation?.typeAnnotation;
    if (param.type === "ObjectPattern" && type?.type === "TSTypeReference" && !inPlace(type)) return;
    context.report({
      node: param,
      message:
        "A component destructures its props in its signature, typed by one named type: its own (`interface " +
        "CardProps`, `type CardProps = Omit<…>`) or one its family shares (`RulesetSectionProps`), never written in place.",
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

function createConstantNames(context) {
  if (!inClient(context)) return {};
  const constants = new Map();
  const asSx = new Set();
  const unwrap = (node) => {
    let value = node;
    while (value?.type === "TSAsExpression" || value?.type === "TSSatisfiesExpression") value = value.expression;
    return value;
  };
  // Built from a literal: a string, a number, a regex, a template, or an array or object literal, whatever it holds
  const isData = (node) => {
    const value = unwrap(node);
    if (!value) return false;
    if (value.type === "Literal") return true;
    if (value.type === "TemplateLiteral") return value.expressions.length === 0;
    if (value.type === "UnaryExpression") return value.operator === "-" && value.argument.type === "Literal";
    return value.type === "ArrayExpression" || value.type === "ObjectExpression";
  };
  const sxNames = (expression) => {
    const value = unwrap(expression);
    if (value?.type === "Identifier") return [value.name];
    if (value?.type === "ArrayExpression")
      return value.elements.flatMap((e) => (e ? sxNames(e.type === "SpreadElement" ? e.argument : e) : []));
    if (value?.type === "ObjectExpression")
      return value.properties.flatMap((p) => (p.type === "SpreadElement" ? sxNames(p.argument) : []));
    return [];
  };
  return {
    "Program > VariableDeclaration, Program > ExportNamedDeclaration > VariableDeclaration"(node) {
      if (node.kind !== "const") return;
      for (const d of node.declarations)
        if (d.id.type === "Identifier" && d.init && isData(d.init)) constants.set(d.id.name, d.id);
    },
    JSXAttribute(node) {
      if (node.name.name === "sx" && node.value?.type === "JSXExpressionContainer")
        for (const name of sxNames(node.value.expression)) asSx.add(name);
    },
    "Program:exit"() {
      for (const [name, id] of constants) {
        if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
          context.report({
            node: id,
            message: `A constant built from a literal is named in SCREAMING_CASE: \`${name}\`.`,
          });
        } else if (asSx.has(name) && !name.endsWith("_SX")) {
          context.report({ node: id, message: `A constant a style's \`sx\` takes ends in \`_SX\`: \`${name}\`.` });
        }
      }
    },
  };
}

function createControlledInputs(context) {
  if (!inClient(context)) return {};
  // What a file reads with `watch`, held in a variable
  const watched = new Set();
  const reportErrorsRead = (node) =>
    context.report({
      node,
      message:
        "A field's error shows where its binding puts it (`fieldState.error`; the shared fields say it under " +
        "themselves), never read from `formState.errors` beside it.",
    });
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
      const name = callee.type === "Identifier" ? callee.name : callee.property?.name;
      if (name === "setValue" && writesField(node) && !marksDirty(node.arguments[2])) {
        context.report({
          node,
          message:
            "A field written in the user's event is marked dirty, `setValue(name, value, { shouldDirty: true })`, as " +
            "its own input marks it: the form's Save and its close guard see the change.",
        });
      }
      if (name !== "register") return;
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
    // `form.formState.errors`
    MemberExpression(node) {
      if (node.property.name === "errors" && node.object.property?.name === "formState") reportErrorsRead(node);
    },
    // `const { formState: { errors } } = form`
    Property(node) {
      const pattern = node.parent;
      if (pattern.type !== "ObjectPattern" || node.key.name !== "errors") return;
      if (pattern.parent.type === "Property" && pattern.parent.key.name === "formState") reportErrorsRead(node);
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
        "A date is shown through `lib/formatDate.ts` (`formatDate`, `formatDateTime`, `formatRelativeTime`), in the " +
        "viewer's language: never `toLocaleDateString`, `toLocaleTimeString` or `Intl`'s date formats elsewhere.",
    });
  return {
    CallExpression(node) {
      const callee = node.callee;
      if (callee.type !== "MemberExpression" || callee.computed) return;
      // A number has `toLocaleString` too: a date's is known where the date is built in place
      const ofNewDate = callee.object.type === "NewExpression" && callee.object.callee.name === "Date";
      if (DATE_FORMATTERS.has(callee.property.name) || (callee.property.name === "toLocaleString" && ofNewDate))
        report(node);
    },
    MemberExpression(node) {
      const ofIntl = !node.computed && node.object.type === "Identifier" && node.object.name === "Intl";
      if (ofIntl && INTL_DATE_FORMATS.has(node.property.name)) report(node);
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

function createDotNotation(context) {
  if (!inClient(context)) return {};
  return {
    MemberExpression(node) {
      const key = node.property;
      if (!node.computed || key.type !== "Literal" || typeof key.value !== "string") return;
      if (!/^[A-Za-z_$][\w$]*$/.test(key.value)) return;
      context.report({
        node: key,
        message:
          "A member named by an identifier is read with a dot (`rpc.api.characters.share.$post`); brackets are for " +
          'a name that isn\'t one (`[":id"]`, `["class-levels"]`).',
      });
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

function createErrorReads(context) {
  if (!inClient(context)) return {};
  return {
    MemberExpression(node) {
      if (node.computed || node.property.name !== "message") return;
      if (node.object.type === "Identifier" && caughtError(node.object)) {
        context.report({
          node,
          message:
            'An error is shown through `errorMessage(error, "Failed to …")` (`lib/errorMessage.ts`), never its raw `message`, and told apart by `errorName`, never its words.',
        });
      }
    },
  };
}

function createFormFields(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      if (elementName(node) === "FormTextField" && hasAttribute(node, "number") && hasAttribute(node, "type")) {
        context.report({
          node: node.openingElement,
          message: "A number field is `FormTextField number`, which sets its type: never `type` again.",
        });
      }
    },
    JSXAttribute(node) {
      if (node.name.name !== "rules" || node.value?.type !== "JSXExpressionContainer") return;
      if (node.value.expression.type === "ObjectExpression") {
        context.report({
          node,
          message:
            'A field\'s rules are named (`lib/validation.ts`: `requiredRules("Name is required")`, `NAME_RULES`…), never ' +
            "written in place.",
        });
      }
    },
  };
}

function createHandlerNames(context) {
  if (!inClient(context)) return {};
  const report = (node, name) =>
    context.report({
      node,
      message: `A component's own handler is \`handle…\` (\`${name.replace(/^on/, "handle")}\`): \`on…\` names a prop.`,
    });
  const inComponent = (node) => {
    for (let p = node.parent; p; p = p.parent)
      if (p.type === "FunctionDeclaration" && /^[A-Z]/.test(p.id?.name ?? "")) return true;
    return false;
  };
  return {
    VariableDeclarator(node) {
      const init = node.init;
      const isFunction =
        init?.type === "ArrowFunctionExpression" ||
        init?.type === "FunctionExpression" ||
        (init?.type === "CallExpression" && calleeName(init) === "useCallback");
      if (node.id.type === "Identifier" && /^on[A-Z]/.test(node.id.name) && isFunction && inComponent(node))
        report(node.id, node.id.name);
    },
    FunctionDeclaration(node) {
      if (/^on[A-Z]/.test(node.id?.name ?? "") && inComponent(node)) report(node.id, node.id.name);
    },
  };
}

function createHookFiles(context) {
  const file = repoPath(context.filename);
  if (!file.startsWith("client/src/")) return {};
  const base = path.posix.basename(file).replace(/\.tsx?$/, "");
  const hooks = [];
  return {
    "Program > FunctionDeclaration, Program > ExportNamedDeclaration > FunctionDeclaration"(node) {
      if (/^use[A-Z]/.test(node.id?.name ?? "")) hooks.push(node);
    },
    ReturnStatement(node) {
      let fn = node.parent;
      while (
        fn &&
        fn.type !== "FunctionDeclaration" &&
        fn.type !== "ArrowFunctionExpression" &&
        fn.type !== "FunctionExpression"
      )
        fn = fn.parent;
      if (
        fn?.type !== "FunctionDeclaration" ||
        !/^use[A-Z]/.test(fn.id?.name ?? "") ||
        fn.parent.type === "BlockStatement"
      )
        return;
      let value = node.argument;
      while (value?.type === "TSAsExpression") value = value.expression;
      if (value?.type === "ArrayExpression")
        context.report({ node, message: "A hook gives an object (`{ value, setValue }`), never a tuple." });
    },
    "Program:exit"() {
      for (const hook of hooks) {
        if (hook.id.name === base) continue;
        context.report({
          node: hook.id,
          message: `A hook is the one function its own module exports: \`${hook.id.name}\` belongs in \`${hook.id.name}.ts\`.`,
        });
      }
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
          "An icon comes from `components/icons`, where every icon the app shows is named: never from `@mui/icons-material`.",
      });
    },
  };
}

function createJsxConditionals(context) {
  if (!inClient(context)) return {};
  const isNull = (node) => node.type === "Literal" && node.value === null && node.raw === "null";
  return {
    ConditionalExpression(node) {
      if (!isNull(node.alternate) && !isNull(node.consequent)) return;
      // A chain of alternatives (`a ? <A /> : b ? <B /> : null`) ends in null
      if (node.parent.type === "ConditionalExpression" && node.parent.alternate === node) return;
      const other = isNull(node.alternate) ? node.consequent : node.alternate;
      if (other.type !== "JSXElement" && other.type !== "JSXFragment") return;
      context.report({
        node,
        message: "What shows on a condition only is `cond && <X />`, never a ternary with a `null` side.",
      });
    },
  };
}

function createLoadErrors(context) {
  if (!inClient(context) || repoPath(context.filename) === "client/src/components/common/LoadError.tsx") return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "Alert") return;
      const severity = node.openingElement.attributes.find(
        (a) => a.type === "JSXAttribute" && a.name.name === "severity",
      );
      if (severity?.value?.type !== "Literal" || severity.value.value !== "error") return;
      const saysLoad = node.children.some(
        (child) =>
          (child.type === "JSXText" && /\bload(ing|ed)?\b/i.test(child.value)) ||
          (child.type === "JSXExpressionContainer" &&
            child.expression.type === "CallExpression" &&
            calleeName(child.expression) === "loadFailureMessage"),
      );
      if (!saysLoad) return;
      context.report({
        node,
        message:
          'A failure to load is a `LoadError` (`components/common`): `<LoadError what="Feats" error={error} />` says ' +
          "it in `loadFailureMessage`'s words.",
      });
    },
  };
}

function createNavigation(context) {
  if (!inClient(context)) return {};
  const file = repoPath(context.filename);
  return {
    JSXAttribute(node) {
      if (node.name.name !== "onClick" || CARDS.has(elementName(node.parent.parent))) return;
      if (node.value?.type !== "JSXExpressionContainer" || !onlyNavigates(node.value.expression)) return;
      context.report({
        node,
        message:
          'A control that only navigates is a link: `component={Link} to="…"`, so it opens in a new tab and reads as ' +
          "a link. A card, which holds content of its own, opens on click.",
      });
    },
    CallExpression(node) {
      const callee = node.callee;
      const opensWindow =
        callee.type === "MemberExpression" &&
        callee.object.type === "Identifier" &&
        callee.object.name === "window" &&
        callee.property.name === "open";
      if (opensWindow) {
        context.report({
          node,
          message:
            'An external link is an anchor (`component="a" href target="_blank" rel="noopener noreferrer"`), never ' +
            "`window.open`.",
        });
      }
    },
    ImportSpecifier(node) {
      const source = node.parent.source.value;
      if (
        node.imported.name === "useSearchParams" &&
        source.startsWith("react-router") &&
        !file.startsWith("client/src/hooks/")
      ) {
        context.report({
          node,
          message:
            "The URL's search params are read through the shared hooks (`useSearchParam`, `useListParams`, " +
            "`useSearchText`, `useUpdateSearchParams`), never `useSearchParams` elsewhere.",
        });
      }
      if (node.imported.name !== "Link") return;
      const expected = source === "@mui/material" ? "MuiLink" : source === "react-router-dom" ? "Link" : null;
      if (!expected || node.local.name === expected) return;
      context.report({
        node,
        message: "React Router's `Link` is imported as `Link`, MUI's as `MuiLink`: one name for each, in every file.",
      });
    },
  };
}

function createParsedResponses(context) {
  if (!inClient(context)) return {};
  const queriesModule = isQueriesModule(context);
  return {
    CallExpression(node) {
      if (!requestMethod(node.callee) || !(inQueryFunction(node) || queriesModule)) return;
      let parent = node.parent;
      while (parent?.type === "AwaitExpression") parent = parent.parent;
      if (
        parent?.type === "CallExpression" &&
        calleeName(parent) === "parseResponse" &&
        parent.arguments[0] !== undefined
      )
        return;
      // A file's body is read as a blob: `(await rpc.….$get(…)).blob()`
      if (parent?.type === "MemberExpression" && parent.property.name === "blob") return;
      context.report({
        node,
        message:
          "A request's answer is read with `parseResponse(rpc.api.….$get(…))`, which narrows it to its success; a " +
          "file's, as a blob: `(await rpc.api.….$get(…)).blob()`.",
      });
    },
  };
}

function createQueries(context) {
  const file = repoPath(context.filename);
  if (!file.startsWith("client/src/")) return {};
  const factory = /(^|\/)(queries|\w+Queries)\.ts$/.test(file);
  const report = (node, message) => context.report({ node, message });
  return {
    Property(node) {
      if (node.key.type !== "Identifier" || node.parent.type !== "ObjectExpression") return;
      const value = node.value;
      switch (node.key.name) {
        case "queryFn":
          if (!factory) {
            report(
              node,
              "A query's options come from a `queryOptions` factory in a `…Queries.ts` module (or `lib/queries.ts`), never written where it runs.",
            );
          }
          break;
        case "enabled":
          if (gatesOnValue(value)) {
            report(
              node,
              "A query that can't run yet passes `skipToken` as its `queryFn`; `enabled` is a plain on/off switch.",
            );
          }
          break;
        case "placeholderData":
          if (value.type !== "Identifier")
            report(node, "A query keeps its previous data with `keepPreviousData`, or a named function.");
          break;
        case "staleTime":
        case "gcTime":
        case "refetchInterval":
          if (value.type === "Literal" || value.type === "BinaryExpression") {
            report(
              node,
              `A query's \`${node.key.name}\` is a named duration (\`lib/queryTimes.ts\`), never a number written in place.`,
            );
          }
          break;
      }
    },
    CallExpression(node) {
      const name = calleeName(node);
      if (name === "setQueryData" && !factory && !inMutationCallback(node)) {
        report(
          node,
          "The cache is written in a mutation's callback (`onMutate`, `onSuccess`, `onError`, `onSettled`), or by its query's own module (`seed…`), never elsewhere.",
        );
      }
    },
    MemberExpression(node) {
      if (
        node.property.type === "Identifier" &&
        node.property.name === "pages" &&
        !node.computed &&
        file !== "client/src/lib/pageItems.ts"
      ) {
        report(
          node,
          "An infinite query's items are `pageItems(data)` (`lib/pageItems.ts`), its first page `firstPage(data)`, never read from its `pages`.",
        );
      }
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
        message: "A query key comes from `lib/queryKeys.ts`: spread one first (`[...QUERY_KEYS.x.y(id), filter]`).",
      });
    },
  };
}

function createReactImports(context) {
  if (!inClient(context)) return {};
  const report = (node) =>
    context.report({
      node,
      message:
        'React\'s types and functions are named imports (`import { type ReactNode, StrictMode } from "react"`), ' +
        "never read through `React.` or a default `React` import.",
    });
  return {
    ImportDeclaration(node) {
      if (node.source.value !== "react") return;
      if (node.specifiers.some((s) => s.type !== "ImportSpecifier")) report(node);
      const forwardRef = node.specifiers.find((s) => s.type === "ImportSpecifier" && s.imported.name === "forwardRef");
      if (forwardRef) {
        context.report({
          node: forwardRef,
          message: "A component takes its `ref` as a prop (React 19), never through `forwardRef`.",
        });
      }
    },
    MemberExpression(node) {
      if (node.object.type === "Identifier" && node.object.name === "React") report(node);
    },
    TSQualifiedName(node) {
      if (node.left.type === "Identifier" && node.left.name === "React") report(node);
    },
  };
}

function createTooltips(context) {
  if (!inClient(context)) return {};
  return {
    JSXElement(node) {
      if (elementName(node) !== "Tooltip") return;
      const child = node.children.find((c) => c.type === "JSXElement");
      if (!child) return;
      if (hasAttribute(child, "disabled")) {
        context.report({
          node: node.openingElement,
          message:
            "A `Tooltip` around a control that can be disabled wraps it in a `<span>`, which still takes the pointer.",
        });
      }
      const named =
        TEXT_CONTROLS.has(elementName(child)) &&
        child.children.some((c) => (c.type === "JSXText" ? c.value.trim() : c.type === "JSXExpressionContainer"));
      if (named && !hasAttribute(node, "describeChild")) {
        context.report({
          node: node.openingElement,
          message: "A `Tooltip` on a control its own text names takes `describeChild`: its title describes it.",
        });
      }
    },
  };
}

/** Whether `enabled` tests a value the query needs (`!!id`, `Boolean(id)`, `id !== undefined`) */
function gatesOnValue(node) {
  if (
    node.type === "UnaryExpression" &&
    node.operator === "!" &&
    node.argument.type === "UnaryExpression" &&
    node.argument.operator === "!"
  )
    return true;
  if (node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "Boolean")
    return true;
  if (node.type === "BinaryExpression" && ["!==", "!="].includes(node.operator)) {
    return [node.left, node.right].some(
      (side) =>
        (side.type === "Identifier" && side.name === "undefined") || (side.type === "Literal" && side.value === null),
    );
  }
  if (node.type === "LogicalExpression" && node.operator === "&&")
    return gatesOnValue(node.left) || gatesOnValue(node.right);
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

/** Whether `node` runs in a mutation's callback: a function a property named onMutate, onSuccess… holds */
function inMutationCallback(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === "Property" && p.key.type === "Identifier" && MUTATION_CALLBACKS.has(p.key.name)) return true;
    if (p.type === "JSXAttribute" && MUTATION_CALLBACKS.has(p.name.name)) return true;
  }
  return false;
}

/** Whether a type writes a component's props in place: `Omit<…>`, `Pick<…>`, `ComponentProps<…>` */
function inPlace(type) {
  const name = type.typeName.type === "TSQualifiedName" ? type.typeName.right.name : type.typeName.name;
  return IN_PLACE_TYPES.has(name);
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
          : p.type === "VariableDeclarator" && p.id.type === "Identifier"
            ? p.id.name
            : p.type === "FunctionDeclaration" && p.id
              ? p.id.name
              : null;
    if (name?.endsWith("Fn")) return true;
  }
  return false;
}

/** Whether the linted file is a queries module (`…Queries.ts`, `lib/queries.ts`), whose every request a query makes. */
function isQueriesModule(context) {
  return /(^|\/)(queries|\w+Queries)\.ts$/.test(repoPath(context.filename));
}

/** The function a component declares under `name`, in a block around `node`: `const handleX = () => {…}`. */
function localFunction(name, node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type !== "BlockStatement" && p.type !== "Program") continue;
    for (const statement of p.body) {
      if (statement.type === "FunctionDeclaration" && statement.id?.name === name) return statement;
      if (statement.type !== "VariableDeclaration") continue;
      const found = statement.declarations.find((d) => d.id.type === "Identifier" && d.id.name === name);
      if (found) return found.init;
    }
  }
  return null;
}

/** Whether `setValue`'s options mark the field dirty: `{ shouldDirty: true }`. */
function marksDirty(options) {
  return (
    options?.type === "ObjectExpression" &&
    options.properties.some(
      (p) => p.type === "Property" && p.key.name === "shouldDirty" && p.value.type === "Literal" && p.value.value,
    )
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

/** Whether a click handler only navigates: `() => navigate("/x")`, not back (`navigate(-1)`) */
function onlyNavigates(handler, from = handler) {
  // A handler the component declares (`const handleProfile = () => {…}`), read where it's declared
  if (handler?.type === "Identifier") return onlyNavigates(localFunction(handler.name, from), from);
  // A menu's item: `menu.closeMenuAnd(() => navigate(…))`
  if (handler?.type === "CallExpression" && calleeName(handler) === "closeMenuAnd")
    return onlyNavigates(handler.arguments[0], from);
  const isFunction = /^(ArrowFunctionExpression|FunctionExpression|FunctionDeclaration)$/.test(handler?.type ?? "");
  if (!isFunction || handler.params.length > 0) return false;
  let calls = [handler.body];
  if (handler.body.type === "BlockStatement") {
    if (!handler.body.body.every((statement) => statement.type === "ExpressionStatement")) return false;
    calls = handler.body.body.map((statement) => statement.expression);
  }
  // Closing the menu it sits in first, then navigating
  const [last] = calls.slice(-1);
  const closes = calls.slice(0, -1).every((call) => call.type === "CallExpression" && calleeName(call) === "closeMenu");
  const isNavigate = last?.type === "CallExpression" && calleeName(last) === "navigate" && last.arguments.length === 1;
  const [to] = last?.arguments ?? [];
  return (
    closes && isNavigate && !(to.type === "Literal" && typeof to.value === "number") && to.type !== "UnaryExpression"
  );
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

/** The request a call makes (`$get`…`$delete`), read off its callee, a dot's or a bracket's; null for any other call. */
function requestMethod(callee) {
  if (callee.type !== "MemberExpression") return null;
  const name = callee.computed ? callee.property.value : callee.property.name;
  return REQUEST_METHODS.has(name) ? name : null;
}

/** Whether a `setValue` call writes a form's field: react-hook-form's takes its path first, a state setter its value alone. */
function writesField(node) {
  const [path, value] = node.arguments;
  return !!value && (path.type === "Literal" || path.type === "TemplateLiteral");
}

export default {
  "accessible-icon-buttons": { meta: { type: "problem" }, create: createAccessibleIconButtons },
  "dialog-conventions": { meta: { type: "problem" }, create: createDialogConventions },
  "query-keys": { meta: { type: "suggestion" }, create: createQueryKeyRule },
  "client-apis": { meta: { type: "suggestion" }, create: createClientApis },
  "controlled-inputs": { meta: { type: "problem" }, create: createControlledInputs },
  "effect-writes": { meta: { type: "problem" }, create: createEffectWrites },
  "api-calls-in-queries": { meta: { type: "problem" }, create: createApiCallsInQueries },
  "load-errors": { meta: { type: "suggestion" }, create: createLoadErrors },
  "component-props": { meta: { type: "suggestion" }, create: createComponentProps },
  "react-imports": { meta: { type: "suggestion" }, create: createReactImports },
  icons: { meta: { type: "suggestion" }, create: createIcons },
  "jsx-conditionals": { meta: { type: "suggestion" }, create: createJsxConditionals },
  "component-files": { meta: { type: "suggestion" }, create: createComponentFiles },
  "hook-files": { meta: { type: "suggestion" }, create: createHookFiles },
  "handler-names": { meta: { type: "suggestion" }, create: createHandlerNames },
  "constant-names": { meta: { type: "suggestion" }, create: createConstantNames },
  queries: { meta: { type: "suggestion" }, create: createQueries },
  "parsed-responses": { meta: { type: "suggestion" }, create: createParsedResponses },
  "dot-notation": { meta: { type: "suggestion" }, create: createDotNotation },
  "error-reads": { meta: { type: "suggestion" }, create: createErrorReads },
  "browser-storage": { meta: { type: "suggestion" }, create: createBrowserStorage },
  "date-formats": { meta: { type: "suggestion" }, create: createDateFormats },
  navigation: { meta: { type: "suggestion" }, create: createNavigation },
  "clickable-elements": { meta: { type: "suggestion" }, create: createClickableElements },
  tooltips: { meta: { type: "suggestion" }, create: createTooltips },
  "form-fields": { meta: { type: "suggestion" }, create: createFormFields },
};
