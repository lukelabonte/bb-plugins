// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { classifyHoverTarget } from "../lib/hover-tracking";

describe("classifyHoverTarget", () => {
  it("classifies targets inside the hover popover as popover", () => {
    document.body.innerHTML = `
      <div data-quote-feedback-hover data-quote-feedback-ui>
        <button id="edit">Edit</button>
      </div>`;
    expect(
      classifyHoverTarget(document.getElementById("edit")),
    ).toBe("popover");
  });

  it("classifies targets inside other plugin UI (pill, list, editor) as plugin-ui", () => {
    document.body.innerHTML = `
      <div data-quote-feedback-ui>
        <div role="dialog" aria-label="Staged quotes">
          <ol><li id="row">quote row</li></ol>
        </div>
      </div>`;
    expect(classifyHoverTarget(document.getElementById("row"))).toBe(
      "plugin-ui",
    );
  });

  it("classifies transcript targets as transcript", () => {
    document.body.innerHTML = `
      <div data-markdown-preview><p id="passage">quoted text</p></div>`;
    expect(classifyHoverTarget(document.getElementById("passage"))).toBe(
      "transcript",
    );
    expect(classifyHoverTarget(document.body)).toBe("transcript");
    expect(classifyHoverTarget(null)).toBe("transcript");
  });
});
