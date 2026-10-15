import { describe, expect, it } from "vitest";
import { customAlphabet } from "nanoid";

import * as Cairn from "./index.js";
import {
  ADJECTIVES,
  ALPHABET,
  DEFAULT,
  LONG,
  NOUNS,
  SHORT,
  nanoid,
  words,
} from "./index.js";

describe("@fungi.computer/cairn public seam", () => {
  it("exports opaque nanoids with the documented sizes and alphabet", () => {
    expect(nanoid()).toHaveLength(DEFAULT);
    expect(nanoid(SHORT)).toHaveLength(SHORT);
    expect(nanoid(LONG)).toHaveLength(LONG);
    expect(
      nanoid(SHORT)
        .split("")
        .every((character) => ALPHABET.includes(character)),
    ).toBe(true);
  });

  it("accepts the documented ordinary boundaries", () => {
    expect(nanoid(1)).toHaveLength(1);
    expect(nanoid(LONG)).toHaveLength(LONG);
    expect(words({ count: 1 }).split("-")).toHaveLength(1);
  });

  it("generates adjective-first candidate names through the package root", () => {
    for (let i = 0; i < 50; i++) {
      const candidate = words();
      expect(candidate).toMatch(/^[a-z]+-[a-z]+$/);
      const [adjective, noun] = candidate.split("-");
      expect(ADJECTIVES).toContain(adjective);
      expect(NOUNS).toContain(noun);
    }
  });

  it("uses nouns for additional candidate-name entropy", () => {
    for (let i = 0; i < 20; i++) {
      const [adjective, ...nouns] = words({ count: 4 }).split("-");
      expect(ADJECTIVES).toContain(adjective);
      expect(nouns).toHaveLength(3);
      for (const noun of nouns) expect(NOUNS).toContain(noun);
    }
  });

  it("respects a custom separator", () => {
    const candidate = words({ count: 3, separator: "_" });
    expect(candidate.split("_")).toHaveLength(3);
    expect(candidate).not.toContain("-");
  });

  it("keeps the default candidate space above its documented entropy floor", () => {
    expect(ADJECTIVES.length * NOUNS.length).toBeGreaterThanOrEqual(30_000);
  });

  it("exports only lowercase separator-safe vocabulary", () => {
    for (const vocabulary of [ADJECTIVES, NOUNS])
      for (const word of vocabulary) expect(word).toMatch(/^[a-z]+$/);
  });

  it("retains the intentionally broad mycological vocabulary", () => {
    expect(NOUNS).toEqual(expect.arrayContaining(["microdose", "trip"]));
    expect(ADJECTIVES).toEqual(
      expect.arrayContaining(["microdosed", "tripping"]),
    );
  });
});

it("preserves terminating raw identifier behavior while bounding nonterminating infinities", () => {
  expect(() => nanoid(Number.NaN)).not.toThrow();
  expect(nanoid(Number.NaN)).toHaveLength(0);
  expect(() => nanoid(0)).not.toThrow();
  expect(nanoid(0)).toHaveLength(0);
  expect(() => nanoid(0.5)).not.toThrow();
  const upstreamFiniteEdge = customAlphabet(ALPHABET, 0.5)();
  expect(nanoid(0.5)).toHaveLength(upstreamFiniteEdge.length);
  expect(() => nanoid(-1)).toThrow(RangeError);
  expect(() => nanoid(33)).not.toThrow();
  expect(nanoid(33)).toHaveLength(33);
  expect(() => nanoid(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  expect(() => nanoid(Number.NEGATIVE_INFINITY)).toThrow(RangeError);

  for (const count of [Number.NaN, 0, 0.5, -1, Number.NEGATIVE_INFINITY]) {
    expect(() => words({ count })).not.toThrow();
    expect(words({ count }).split("-")).toHaveLength(1);
  }
  expect(() => words({ count: 9 })).not.toThrow();
  expect(words({ count: 9 }).split("-")).toHaveLength(9);
  expect(() => words({ count: Number.POSITIVE_INFINITY })).toThrow(RangeError);
  expect("MAX_WORD_COUNT" in Cairn).toBe(false);
});
