import { AsyncLocalStorage } from "node:async_hooks";

/**
 * What a request noted, to push once it's answered: the users its notifications go to, and those who see a change to a
 * campaign's documents (`campaignDocuments`).
 */
interface Noted {
  campaignDocuments: Set<string>;
  notified: Set<string>;
}

const notedThisRequest = new AsyncLocalStorage<Noted>();

/**
 * Records users the current request changed a campaign's documents for (`userIds`): what they see of its tree, which
 * their pages refresh once it's answered.
 */
export function noteDocumentsChanged(userIds: Iterable<string>) {
  const noted = notedThisRequest.getStore();
  if (noted) for (const userId of userIds) noted.campaignDocuments.add(userId);
}

/** Records users the current request notified. Outside a request (the worker), whoever notifies pushes itself. */
export function noteNotified(userIds: Iterable<string>) {
  const noted = notedThisRequest.getStore();
  if (noted) for (const userId of userIds) noted.notified.add(userId);
}

/**
 * Runs a request, collecting the users its notifications go to (`noteNotified`) and those who see a change to a
 * campaign's documents (`noteDocumentsChanged`), to push to once it's answered.
 */
export async function collectNotified(run: () => Promise<void>): Promise<Noted> {
  const noted: Noted = { campaignDocuments: new Set(), notified: new Set() };
  await notedThisRequest.run(noted, run);
  return noted;
}
