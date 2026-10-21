import { describe, expect, test } from "bun:test";

import { buildFileHeaders } from "@/server/routers/fileHeaders.ts";

describe("buildFileHeaders", () => {
  test("names a file in ASCII and whole, a character in any script, a quote or a backslash replaced in ASCII", () => {
    expect(
      buildFileHeaders({ disposition: "attachment", fileName: 'Ryū "龍"\\.pdf', mimeType: "application/pdf" }),
    ).toEqual({
      "Content-Disposition": `attachment; filename="Ry_ ____.pdf"; filename*=UTF-8''Ry%C5%AB%20%22%E9%BE%8D%22%5C.pdf`,
      "Content-Type": "application/pdf",
    });
    expect(
      buildFileHeaders({ disposition: "attachment", fileName: "Ryū's (Blade)!.pdf", mimeType: "application/pdf" })[
        "Content-Disposition"
      ],
    ).toEndWith(`filename*=UTF-8''Ry%C5%AB%27s%20%28Blade%29%21.pdf`);
    expect(
      buildFileHeaders({ disposition: "inline", fileName: "sheet.pdf", mimeType: "application/pdf" }),
    ).toMatchObject({
      "Content-Disposition": `inline; filename="sheet.pdf"; filename*=UTF-8''sheet.pdf`,
    });
  });
});
