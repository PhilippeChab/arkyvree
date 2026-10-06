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
 *   `defaultValues`), never react-hook-form's `useForm`, which takes some.
 * - `effect-writes`: an effect synchronizes with what's outside React, and never does what an event or a render does: it
 *   never writes a form's field (`setValue`, `resetField`, `reset`, but `useFormSync`'s, which follows the server),
 *   navigates (a redirect is a rendered `<Navigate>`) nor calls back its owner (an `on…` prop, or a callback a ref
 *   holds). A change happens in the event that causes it, and
 *   what follows from data is derived as it renders.
 * - `api-calls-in-queries`: the API is called through TanStack Query only: an `rpc` request (`$get`, `$post`…) is made in
 *   a function a query or a mutation runs, which caches, dedupes and reports it. Such a function is named `…Fn`, as
 *   TanStack's `queryFn` and `mutationFn` are, wherever it's handed (`useRulesetSection`'s `createFn`, an editor's
 *   `saveFn`).
 * - `load-errors`: a list, a section or a step that failed to load says so with `LoadError` (`components/common`), in
 *   `loadFailureMessage`'s words: an error `Alert` never writes its own "Failed to load…".
 *
 * Plain JS: oxlint loads its plugins without a TypeScript step.
 */

import { repoPath } from "./paths.mjs";

/** The hooks whose callback is an effect. */
const EFFECTS = new Set(["useEffect", "useLayoutEffect"]);

/** The form writes an effect never makes, but `useFormSync`'s. */
const FIELD_WRITES = new Set(["setValue", "resetField", "reset"]);

/** The requests an `rpc` endpoint makes. */
const REQUEST_METHODS = new Set(["$get", "$post", "$put", "$patch", "$delete"]);

/** The props an input takes its value through. */
const VALUE_PROPS = new Set(["value", "values", "checked", "digits", "selected"]);

/** A call's name: `setValue` for `setValue(…)`, `form.setValue(…)` and `field.onChange?.(…)`. */
function calleeName(node) {
  const callee = node.callee.type === "ChainExpression" ? node.callee.expression : node.callee;
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && !callee.computed) return callee.property.name;
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

/** A JSX element's name: `IconButton`, `Dialog`. */
function elementName(node) {
  return node.openingElement.name.type === "JSXIdentifier" ? node.openingElement.name.name : null;
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

function inClient(context) {
  return repoPath(context.filename).startsWith("client/src/");
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

export default {
  "accessible-icon-buttons": { meta: { type: "problem" }, create: createAccessibleIconButtons },
  "dialog-conventions": { meta: { type: "problem" }, create: createDialogConventions },
  "query-keys": { meta: { type: "suggestion" }, create: createQueryKeyRule },
  "client-apis": { meta: { type: "suggestion" }, create: createClientApis },
  "controlled-inputs": { meta: { type: "problem" }, create: createControlledInputs },
  "effect-writes": { meta: { type: "problem" }, create: createEffectWrites },
  "api-calls-in-queries": { meta: { type: "problem" }, create: createApiCallsInQueries },
  "load-errors": { meta: { type: "suggestion" }, create: createLoadErrors },
};
