import { describe, expect, test } from "bun:test";

import PcgenFile from "@/engine/core/imports/pcgen/PcgenFile.ts";
import { readPcgenFile } from "@/tests/support/dnd3.5/pcgenFiles.ts";

describe("PcgenFile", () => {
  test("reads a file PCGen saved: it opens on its format, and names its version", async () => {
    expect(PcgenFile.reads(await readPcgenFile("brannoc"))).toBe(true);
    expect(PcgenFile.reads("VERSION:6.09\nPCGVERSION:2.0")).toBe(false);
    expect(PcgenFile.reads("PCGVERSION:2.0\nCHARACTERNAME:Nobody")).toBe(false);
    // As its lines are read: after a byte order mark, never after a space
    expect(PcgenFile.reads("\uFEFFPCGVERSION:2.0\nVERSION:6.09")).toBe(true);
    expect(PcgenFile.reads("  PCGVERSION:2.0\nVERSION:6.09")).toBe(false);
  });

  test("says what it is: its format, the PCGen version that saved it, and its character's game mode", async () => {
    expect(PcgenFile.describe(await readPcgenFile("brannoc"))).toEqual({
      format: "2.0",
      rules: "35e",
      version: "6.09.08.RC1",
    });
    expect(PcgenFile.describe("PCGVERSION:2.0\r\nGAMEMODE:Pathfinder_RPG\r\nVERSION:6.09")).toEqual({
      format: "2.0",
      rules: "Pathfinder_RPG",
      version: "6.09",
    });
    expect(PcgenFile.describe("PCGVERSION:2.0\nVERSION:6.09")).toEqual({ format: "2.0", version: "6.09" });
    // A byte order mark an editor saved it with, and a space after its format, as its reader reads them
    expect(PcgenFile.describe("\uFEFFPCGVERSION:2.0 \nVERSION:6.09").format).toBe("2.0");
    expect(new PcgenFile("\uFEFFPCGVERSION:2.0 \nVERSION:6.09").read().source.format).toBe("2.0");
    expect(PcgenFile.readsFormat("2.0")).toBe(true);
    expect(PcgenFile.readsFormat("3.0")).toBe(false);
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
