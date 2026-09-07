export const pingWorker = () => {
  const url = process.env.WORKER_FLYCAST_URL;
  if (!url) return;
  fetch(url, { signal: AbortSignal.timeout(500) }).catch(() => {});
};
