import type { ClientResponse } from "hono/client";

import { saveBlob } from "@/client/src/lib/download.ts";

export async function downloadPdf(
  fetchResponse: () => Promise<ClientResponse<unknown>>,
  characterName: string | undefined,
  onError: (msg: string) => void,
): Promise<void> {
  try {
    const response = await fetchResponse();
    const safeName = (characterName || "character").replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200);
    saveBlob(await response.blob(), `${safeName}-sheet.pdf`);
  } catch {
    onError("Failed to download PDF");
  }
}
