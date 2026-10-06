/** Types for memberOrder.mjs, which stays plain JS for oxlint to load. */

declare const plugin: { meta: { name: string }; rules: Record<string, unknown> };

export function compareRoutes(a: { method: string; path: string }, b: { method: string; path: string }): number;
export default plugin;
