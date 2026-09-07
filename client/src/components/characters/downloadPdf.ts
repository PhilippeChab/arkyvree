export async function downloadPdf(
  fetchResponse: () => Promise<Response>,
  characterName: string | undefined,
  onError: (msg: string) => void,
): Promise<void> {
  try {
    const response = await fetchResponse();
    if (!response.ok) {
      onError("Failed to download PDF");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(characterName || "character").replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200)}-sheet.pdf`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch {
    onError("Failed to download PDF");
  }
}
