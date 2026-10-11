/**
 * A page a site answered with an error status (`HttpClient.fetchHtml`): asked again only when the site was busy or
 * failed (`retryable`), never when it refused or has no such page, which a scraper can tell by its `status` (a 404).
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    statusText: string,
    url: string,
  ) {
    super(`HTTP ${status}: ${statusText} — ${url}`);
  }

  /** Whether asking again may get the page: the site was busy (429) or failed (5xx). */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}
