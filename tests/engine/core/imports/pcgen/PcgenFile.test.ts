import { describe, expect, test } from "bun:test";

import PcgenFile from "@/engine/core/imports/pcgen/PcgenFile.ts";
import { readPcgenFile } from "@/tests/support/dnd3.5/pcgenFiles.ts";

describe("PcgenFile", () => {
  test("reads a file PCGen saved: it opens on its format, and names its version", async () => {
    expect(PcgenFile.reads(await readPcgenFile("brannoc"))).toBe(true);
    expect(PcgenFile.reads("VERSION:6.09\nPCGVERSION:2.0")).toBe(false);
    expect(PcgenFile.reads("PCGVERSION:2.0\nCHARACTERNAME:Nobody")).toBe(false);
  });

  test("reads the game mode the file names", async () => {
    expect(PcgenFile.gameModeOf(await readPcgenFile("brannoc"))).toBe("35e");
    expect(PcgenFile.gameModeOf("PCGVERSION:2.0\r\nGAMEMODE:Pathfinder_RPG\r\nVERSION:6.09")).toBe("Pathfinder_RPG");
    expect(PcgenFile.gameModeOf("PCGVERSION:2.0\nVERSION:6.09")).toBeUndefined();
  });

  test("refuses a format no reader reads, whatever it's named", () => {
    for (const format of ["3.0", "constructor", "__proto__"]) {
      expect(() => new PcgenFile(`PCGVERSION:${format}\nVERSION:6.09`).read()).toThrow(
        `PCGen's character file format ${format} isn't read yet`,
      );
    }
  });

  test("reads a file an editor saved with a byte order mark", async () => {
    const character = new PcgenFile(`\uFEFF${await readPcgenFile("brannoc")}`).read();
    expect(character.source.format).toBe("2.0");
    expect(character.identity.name).toBe("Brannoc Vale");
  });
});
