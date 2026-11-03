import { AsyncLocalStorage } from "node:async_hooks";

const notifiedThisRequest = new AsyncLocalStorage<Set<string>>();

/** Records users the current request notified. Outside a request (the worker), whoever notifies pushes itself. */
export function noteNotified(userIds: Iterable<string>) {
  const notified = notifiedThisRequest.getStore();
  if (notified) for (const userId of userIds) notified.add(userId);
}

/** Runs a request, collecting the users its notifications go to (`noteNotified`), to push to once it's answered. */
export async function collectNotified(run: () => Promise<void>) {
  const notified = new Set<string>();
  await notifiedThisRequest.run(notified, run);
  return notified;
}
