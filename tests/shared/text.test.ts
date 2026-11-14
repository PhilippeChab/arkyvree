import { describe, expect, test } from "bun:test";

import { isOneOf } from "@/shared/isOneOf.ts";
import { isRecord } from "@/shared/isRecord.ts";
import {
  capitalize,
  formatSigned,
  sanitizeName,
  sanitizeText,
  SLUG_CHARACTER,
  stripSeparators,
  stripSeparatorsDroppingAccents,
  toSentenceCase,
} from "@/shared/text.ts";

describe("Text", () => {
  test("is capitalized by its first letter only", () => {
    expect(capitalize("medium load")).toBe("Medium load");
    expect(capitalize("iOS")).toBe("IOS");
    expect(capitalize("")).toBe("");
  });

  test("is written in a sentence's case from a label's Title Case", () => {
    expect(toSentenceCase("Owned Step")).toBe("Owned step");
    expect(toSentenceCase("Gizmo")).toBe("Gizmo");
    expect(toSentenceCase("")).toBe("");
  });

  test("carries a bonus's sign, a missing one +0", () => {
    expect([formatSigned(2), formatSigned(-1), formatSigned(0), formatSigned(null)]).toEqual(["+2", "-1", "+0", "+0"]);
  });

  test("is stored trimmed and Unicode-normalized", () => {
    expect(sanitizeText("  ﬁre\u00A0ball  ")).toBe("fire ball");
  });

  test("is a record's name as it's stored: as written, trimmed and canonically composed, never folded", () => {
    expect(sanitizeName("  Kai²  ")).toBe("Kai²");
    expect(sanitizeName("Ｚｅｌｄａ ﬁre")).toBe("Ｚｅｌｄａ ﬁre");
    expect(sanitizeName("Ame\u0301lie")).toBe("Am\u00E9lie");
    expect(sanitizeName(" \u00A0 ")).toBe("");
  });

  test("is a slug of its letters and digits, lowercased", () => {
    expect(stripSeparators("Steady Hand: Longsword")).toBe("steadyhandlongsword");
    expect(stripSeparators("Knowledge (the planes)")).toBe("knowledgetheplanes");
    expect(stripSeparators("Two-Bladed Sword +1")).toBe("twobladedsword1");
  });

  test("keeps a plain ASCII name's slug as it always was, and leaves out a sign every script shares", () => {
    const names = [
      "Weapon Focus: Longsword",
      "Knowledge (the planes)",
      "Spell Focus (Evocation)",
      "Two-Bladed Sword +1",
    ];
    for (const name of names) expect(stripSeparators(name)).toBe(stripSeparatorsDroppingAccents(name));
    expect(stripSeparators("Potion ½ (Kai²)")).toBe("potionkai");
  });

  test("keeps an accented Latin letter, lowercased, in French, German, Spanish, Polish and Vietnamese names", () => {
    expect(stripSeparators("Discrétion")).toBe("discrétion");
    expect(stripSeparators("Arme de prédilection (Épée longue)")).toBe("armedeprédilectionépéelongue");
    expect(stripSeparators("Überlebenskunst")).toBe("überlebenskunst");
    expect(stripSeparators("Fertigkeitsfokus: Schlösser öffnen")).toBe("fertigkeitsfokusschlösseröffnen");
    expect(stripSeparators("Señuelo (Niño)")).toBe("señueloniño");
    expect(stripSeparators("Żółć Łódź")).toBe("żółćłódź");
    expect(stripSeparators("Tiếng Việt")).toBe("tiếngviệt");
    // Names that differ by an accent alone have keys of their own
    expect(stripSeparators("Résistance")).not.toBe(stripSeparators("Resistance"));
  });

  test("is one key however an accented letter is written: whole, or a letter and its accent apart", () => {
    expect(stripSeparators("Discre\u0301tion")).toBe(stripSeparators("Discr\u00E9tion"));
    expect(stripSeparators("Tie\u0302\u0301ng")).toBe(stripSeparators("Tiếng"));
    expect(stripSeparators("DISCRÉTION")).toBe("discrétion");
  });

  test("keeps a letter of its own and a ligature as letters, lowercased", () => {
    const keys = ["Straße", "ẞ", "Æsir", "Œuvre", "Ørn", "Đạo", "ı", "İ"].map(stripSeparators);
    expect(keys).toEqual(["straße", "ß", "æsir", "œuvre", "ørn", "đạo", "ı", "i\u0307"]);
    expect(stripSeparators("Straße")).not.toBe(stripSeparators("Strasse"));
  });

  test("keeps a Latin name's accented letters beside another script's", () => {
    expect(stripSeparators("Épée Лазание ΟΔΟΣ")).toBe("épéeлазаниеοδος");
    expect(stripSeparators("Bàrd 火球")).toBe("bàrd火球");
  });

  test("is written in the characters a path's grammar reads, and is its own key", () => {
    const pattern = new RegExp(`^${SLUG_CHARACTER}+$`, "u");
    const names = ["Discrétion", "Straße", "İ", "Đạo", "Ｚｅｌｄａ", "x\u0304", "Лазание", "ΟΔΟΣ", "कला", "ビール"];
    for (const name of names) {
      const key = stripSeparators(name);
      expect(pattern.test(key)).toBe(true);
      expect(stripSeparators(key)).toBe(key);
    }
  });

  test("had a key that left accented Latin letters out, which the rules saved before then still hold", () => {
    expect(stripSeparatorsDroppingAccents("Discrétion")).toBe("discrtion");
    expect(stripSeparatorsDroppingAccents("Discre\u0301tion")).toBe("discretion");
    expect(stripSeparatorsDroppingAccents("Лазание")).toBe("лазание");
  });

  test("keeps a letter of another script, lowercased, so each name has a slug of its own", () => {
    const names = ["Лазание", "Плавание", "Прыжок", "Πήδημα", "火球"];
    const slugs = names.map(stripSeparators);
    expect(slugs).toEqual(["лазание", "плавание", "прыжок", "πήδημα", "火球"]);
    expect(new Set(slugs).size).toBe(names.length);
    expect(stripSeparators("ЛАЗАНИЕ")).toBe(stripSeparators("лазание"));
    expect(stripSeparators("Лазание (Скалы)")).toBe("лазаниескалы");
  });

  test("keeps another script's marks and signs, so names that differ by them have keys of their own", () => {
    const pairs = [
      ["कला", "काल"],
      ["กิน", "กน"],
      ["ビール", "ビル"],
    ];
    for (const [one, other] of pairs) expect(stripSeparators(one)).not.toBe(stripSeparators(other));
    expect(stripSeparators("ビール")).toBe("ビール");
  });

  test("lowercases a word of another script whole: a Greek name's final sigma is one letter, however it's cased", () => {
    expect(stripSeparators("ΟΔΟΣ")).toBe(stripSeparators("Οδος"));
    expect(stripSeparators("Οδος Ήλιου")).toBe(stripSeparators("ΟΔΟΣ ΉΛΙΟΥ"));
  });
});

describe("A value", () => {
  test("is one of a fixed set of texts or numbers, compared exactly", () => {
    expect(isOneOf("Large", ["Small", "Large"])).toBe(true);
    expect(isOneOf("large", ["Small", "Large"])).toBe(false);
    expect(isOneOf(8, [4, 6, 8])).toBe(true);
    expect(isOneOf("8", [4, 6, 8])).toBe(false);
    expect(isOneOf(null, ["Small"])).toBe(false);
    expect(isOneOf(undefined, [4])).toBe(false);
  });

  test("is a record when it's an object whose keys can be read, not an array or null", () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord({})).toBe(true);
    for (const other of [[], null, undefined, "text", 1, true]) expect(isRecord(other)).toBe(false);
  });
});
