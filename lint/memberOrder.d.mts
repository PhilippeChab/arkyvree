declare const plugin: { meta: { name: string }; rules: Record<string, unknown> };/** Types for memberOrder.mjs, which stays plain JS for oxlint to load. */
export function verbGroup(name: string): number;
export function lifecycleStep(name: string): number;
export function compareRoutes(a: { method: string; path: string }, b: { method: string; path: string }): number;
export default plugin;
