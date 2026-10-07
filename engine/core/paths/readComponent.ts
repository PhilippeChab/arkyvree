import type { Component } from "@/engine/core/types.ts";

/**
 * What a component's method `name` returns, called on it: the getter a path category names for its data (checked
 * against the ruleset's components, `ComponentSpec`), or a component's `updateAvailables` after a modifier writes to it.
 * Undefined when it has no such method: a partial set of components (a race's eligibility, a test's) passes plain
 * objects.
 */
export function readComponent(component: Component, name: string): unknown {
  const method: unknown = Reflect.get(component, name);
  return typeof method === "function" ? method.call(component) : undefined;
}
