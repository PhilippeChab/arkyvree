/** The key an export's job is queued under: what reads whether the job is still to run. */
export function toExportJobKey(exportId: string) {
  return `export:${exportId}`;
}
