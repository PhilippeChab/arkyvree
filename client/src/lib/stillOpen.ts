/**
 * For async callbacks that navigate, like following a copy-on-write after a
 * save: whether the page is still on `path` (e.g. `/rulesets/R/feats/A`),
 * itself or a sub-route of it. Reads the address bar, which moves as soon as
 * the user navigates, even while the router keeps the old page on screen
 * until the next one has loaded. Match the full path, ruleset included: an
 * inherited entity keeps its id in every fork.
 */
export const isStillOpen = (path: string) => {
  const current = window.location.pathname;
  return current === path || current.startsWith(`${path}/`);
};
