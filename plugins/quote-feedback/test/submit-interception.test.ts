import { describe, expect, it } from "vitest";
import {
  shouldInterceptSubmit,
  type SubmitEventShape,
} from "../lib/submit-interception";

const enter: SubmitEventShape = {
  kind: "keydown",
  key: "Enter",
  shiftKey: false,
  isComposing: false,
};

describe("shouldInterceptSubmit", () => {
  it("intercepts plain Enter while quotes are staged", () => {
    expect(shouldInterceptSubmit(enter, 1)).toBe(true);
  });

  it("intercepts a send-button click while quotes are staged", () => {
    expect(shouldInterceptSubmit({ kind: "send-button-click" }, 3)).toBe(true);
  });

  it("intercepts Enter with an empty composer — quotes travel alone", () => {
    // The composer text is read at intercept time; the decision itself does
    // not depend on it, so staged + Enter intercepts regardless.
    expect(shouldInterceptSubmit(enter, 2)).toBe(true);
  });

  it("passes Shift+Enter through to insert a newline", () => {
    expect(
      shouldInterceptSubmit({ ...enter, shiftKey: true }, 2),
    ).toBe(false);
  });

  it("passes Enter during IME composition", () => {
    expect(
      shouldInterceptSubmit({ ...enter, isComposing: true }, 2),
    ).toBe(false);
  });

  it("passes other keys through", () => {
    expect(
      shouldInterceptSubmit({ ...enter, key: "a" }, 2),
    ).toBe(false);
  });

  it("passes everything when nothing is staged — stock BB behavior", () => {
    expect(shouldInterceptSubmit(enter, 0)).toBe(false);
    expect(shouldInterceptSubmit({ kind: "send-button-click" }, 0)).toBe(false);
  });

  it("passes unrecognized event shapes through", () => {
    expect(
      shouldInterceptSubmit({ kind: "mystery" } as unknown as SubmitEventShape, 2),
    ).toBe(false);
  });
});
