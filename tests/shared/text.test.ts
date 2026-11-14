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

  test("keeps the key it had for every character but a Latin-script letter or digit past ASCII, beside Latin and another", () => {
    const latinPastAscii = /^(?=\p{scx=Latin})[\p{L}\p{N}]$/u;
    const changed: string[] = [];
    // Every plane a script is written in: the Basic and Supplementary ones (CJK's) and the special purpose one (tags,
    // variation selectors), past the planes left unassigned and those kept for private use
    for (let codePoint = 0x80; codePoint <= 0xeffff; codePoint++) {
      if (codePoint === 0x40000) codePoint = 0xe0000;
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue;
      const character = String.fromCodePoint(codePoint);
      if (latinPastAscii.test(character)) continue;
      const name = `Ab${character}c Лазание${character}`;
      if (stripSeparators(name) !== stripSeparatorsDroppingAccents(name)) changed.push(codePoint.toString(16));
    }
    expect(changed).toEqual([]);
  });

  test("keeps the key a name in another script had, whole or mixed with plain Latin letters", () => {
    const names = [
      "Лазание (Скалы)",
      "й",
      "и\u0306",
      "ΟΔΟΣ Ήλιου",
      "कला",
      "กิน",
      "ビール",
      "火球",
      "Climb Лазание",
      "Spot 火球 +2",
      "ΟΔΟΣ of Kai²",
    ];
    for (const name of names) expect(stripSeparators(name)).toBe(stripSeparatorsDroppingAccents(name));
    // Cyrillic's "й" is no "и", Japanese's "ビ" no "ヒ": only Latin letters lose their accents
    expect(stripSeparators("Йод")).not.toBe(stripSeparators("Иод"));
    expect(stripSeparators("ビル")).not.toBe(stripSeparators("ヒル"));
    expect(stripSeparators("Άλμα")).toBe("άλμα");
  });

  test("reads an accented Latin letter as its plain letter, in French, German, Spanish, Polish and Vietnamese names", () => {
    expect(stripSeparators("Discrétion")).toBe("discretion");
    expect(stripSeparators("Élan")).toBe("elan");
    expect(stripSeparators("Écouter")).toBe("ecouter");
    expect(stripSeparators("Arme de prédilection (Épée longue)")).toBe("armedepredilectionepeelongue");
    expect(stripSeparators("Überlebenskunst")).toBe("uberlebenskunst");
    expect(stripSeparators("Fertigkeitsfokus: Schlösser öffnen")).toBe("fertigkeitsfokusschlosseroffnen");
    expect(stripSeparators("Señuelo (Niño)")).toBe("senuelonino");
    expect(stripSeparators("Żółć Łódź")).toBe("zolclodz");
    expect(stripSeparators("Tiếng Việt")).toBe("tiengviet");
    // So a path names a name with its accents or without, and names that differ by an accent alone share a key
    expect(stripSeparators("skills.discrétion.misc")).toBe(stripSeparators("skills.discretion.misc"));
    expect(stripSeparators("Côte")).toBe(stripSeparators("Cote"));
  });

  test("is one key however an accented letter is written: whole, or a letter and its accent apart", () => {
    expect(stripSeparators("Discre\u0301tion")).toBe(stripSeparators("Discr\u00E9tion"));
    expect(stripSeparators("Tie\u0302\u0301ng")).toBe(stripSeparators("Tiếng"));
    expect(stripSeparators("\u00D8\u0301")).toBe(stripSeparators("\u01FE"));
    expect(stripSeparators("DISCRÉTION")).toBe("discretion");
  });

  test("reads a letter of its own and a ligature as its plain letters, a capital as its small letter", () => {
    const names = ["Straße", "ẞ", "Æsir", "Œuvre", "Ørn", "Łuk", "Đạo", "Ðór", "Þór", "ı", "İ", "Ħal", "Ŧa", "ȷ"];
    expect(names.map(stripSeparators)).toEqual([
      "strasse",
      "ss",
      "aesir",
      "oeuvre",
      "orn",
      "luk",
      "dao",
      "dor",
      "thor",
      "i",
      "i",
      "hal",
      "ta",
      "j",
    ]);
    expect(["æ", "œ", "ø", "ł", "đ", "ð", "þ"].map((letter) => stripSeparators(letter.toUpperCase()))).toEqual([
      "ae",
      "oe",
      "o",
      "l",
      "d",
      "d",
      "th",
    ]);
    // A compatibility form, a ligature, a numeral and an ordinal are taken apart; a letter none reduces stays, lowercased
    expect(["Ｚｅｌｄａ", "ĳssel", "ﬁre", "ǅemal", "Ŀlum", "Rank Ⅳ", "1ª", "Ŋ", "Ə"].map(stripSeparators)).toEqual([
      "zelda",
      "ijssel",
      "fire",
      "dzemal",
      "llum",
      "rankiv",
      "1a",
      "ŋ",
      "ə",
    ]);
    // Which a key once left out
    expect(["Rank Ⅳ", "1ª", "Ｚｅｌｄａ"].map(stripSeparatorsDroppingAccents)).toEqual(["rank", "1", ""]);
  });

  test("reads a Latin name's accented letters as plain beside another script's, which keeps its own", () => {
    expect(stripSeparators("Épée Лазание ΟΔΟΣ")).toBe("epeeлазаниеοδος");
    expect(stripSeparators("Bàrd 火球 ビール")).toBe("bard火球ビール");
  });

  test("is written in the characters a path's grammar reads, and is its own key", () => {
    const pattern = new RegExp(`^${SLUG_CHARACTER}+$`, "u");
    const names = [
      "Discrétion",
      "Straße",
      "İ",
      "Đạo",
      "Ｚｅｌｄａ",
      "x\u0304",
      "Ŋ",
      "Лазание",
      "ΟΔΟΣ",
      "कला",
      "ビール",
    ];
    for (const name of names) {
      const key = stripSeparators(name);
      expect(pattern.test(key)).toBe(true);
      expect(stripSeparators(key)).toBe(key);
    }
  });

  test("is read in a time that grows with the name, however many accents and marks it holds", () => {
    const started = performance.now();
    stripSeparators("e\u0301\u0302\u0303".repeat(20_000) + "Лазание\u0306".repeat(20_000));
    expect(performance.now() - started).toBeLessThan(2000);
  });

  test("had a key that left accented Latin letters out, which the rules saved before then still hold", () => {
    expect(stripSeparatorsDroppingAccents("Discrétion")).toBe("discrtion");
    expect(stripSeparatorsDroppingAccents("Élan")).toBe("lan");
    expect(stripSeparatorsDroppingAccents("Straße")).toBe("strae");
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
