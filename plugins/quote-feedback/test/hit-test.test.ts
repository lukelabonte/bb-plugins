import { describe, expect, it } from "vitest";
import { hitTestQuotes, type HitRect } from "../lib/hit-test";

const rect = (
  top: number,
  left: number,
  right: number,
  bottom: number,
): HitRect => ({ top, left, right, bottom });

describe("hitTestQuotes", () => {
  it("returns the quote whose rect contains the point", () => {
    const quotes = new Map<string, HitRect[]>([
      ["a", [rect(10, 10, 100, 30)]],
      ["b", [rect(50, 10, 100, 70)]],
    ]);
    expect(hitTestQuotes({ x: 50, y: 20 }, quotes)).toBe("a");
    expect(hitTestQuotes({ x: 50, y: 60 }, quotes)).toBe("b");
  });

  it("returns null when no rect contains the point", () => {
    const quotes = new Map<string, HitRect[]>([["a", [rect(10, 10, 100, 30)]]]);
    expect(hitTestQuotes({ x: 5, y: 20 }, quotes)).toBeNull();
    expect(hitTestQuotes({ x: 50, y: 40 }, quotes)).toBeNull();
  });

  it("hits any of a multi-line quote's client rects", () => {
    const quotes = new Map<string, HitRect[]>([
      ["a", [rect(10, 10, 100, 30), rect(30, 10, 60, 50)]],
    ]);
    expect(hitTestQuotes({ x: 20, y: 40 }, quotes)).toBe("a");
  });

  it("resolves overlapping quotes to the smallest containing rect", () => {
    // "outer" wraps a passage; "inner" quotes one phrase inside it.
    const quotes = new Map<string, HitRect[]>([
      ["outer", [rect(10, 10, 300, 90)]],
      ["inner", [rect(30, 40, 120, 50)]],
    ]);
    expect(hitTestQuotes({ x: 60, y: 40 }, quotes)).toBe("inner");
    expect(hitTestQuotes({ x: 200, y: 40 }, quotes)).toBe("outer");
  });

  it("breaks exact ties by earliest insertion order", () => {
    const quotes = new Map<string, HitRect[]>([
      ["first", [rect(10, 10, 100, 30)]],
      ["second", [rect(10, 10, 100, 30)]],
    ]);
    expect(hitTestQuotes({ x: 50, y: 20 }, quotes)).toBe("first");
  });

  it("treats rect edges as inside", () => {
    const quotes = new Map<string, HitRect[]>([["a", [rect(10, 10, 100, 30)]]]);
    expect(hitTestQuotes({ x: 10, y: 10 }, quotes)).toBe("a");
    expect(hitTestQuotes({ x: 100, y: 30 }, quotes)).toBe("a");
  });
});
