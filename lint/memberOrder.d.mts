/** Types for memberOrder.mjs, which stays plain JS for oxlint to load. */
export function verbGroup(name: string): number;
export function memberRank(member: unknown): [number, number, number, string];
export function lifecycleStep(name: string): number;
export function compareRoutes(a: { method: string; path: string }, b: { method: string; path: string }): number;
declare const plugin: { meta: { name: string }; rules: Record<string, unknown> };
export default plugin;
