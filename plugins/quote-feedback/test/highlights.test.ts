// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { FeedbackDraft } from "../contract";
import { quoteHighlights, findUniqueAssistantRange } from "../lib/highlights";

const assistant = (html: string) => `
  <div data-message-column class="group/message">
    <div data-sidebar-swipe-selectable="true">
      <div data-markdown-preview>${html}</div>
    </div>
  </div>`;

afterEach(() => {
  quoteHighlights.deactivateThread("thread-1");
  document.body.replaceChildren();
  document.head
    .querySelectorAll("[data-quote-feedback-highlights]")
    .forEach((node) => node.remove());
});

describe("rendered assistant quote matching", () => {
  it("matches a unique quote across inline Markdown nodes and ignores user messages", () => {
    document.body.innerHTML = `
      ${assistant("<p>Keep <strong>this exact</strong> passage.</p>")}
      <div data-message-column><p>Keep this exact passage.</p></div>`;

    const range = findUniqueAssistantRange("Keep this exact passage.");
    expect(range?.toString()).toBe("Keep this exact passage.");
  });

  it("returns no range when assistant messages contain the quote more than once", () => {
    document.body.innerHTML = `
      ${assistant("<p>Repeat this sentence.</p>")}
      ${assistant("<p>Repeat this sentence.</p>")}`;

    expect(findUniqueAssistantRange("Repeat this sentence.")).toBeNull();
  });

  it("maps a unique selection across Markdown blocks with browser whitespace", () => {
    document.body.innerHTML = assistant(`
      <h2>Implementation plan</h2>
      <ul>
        <li>Keep the <strong>first step</strong> focused.</li>
        <li>Ship the second step safely.</li>
      </ul>`);

    const quote =
      "Implementation plan\n\nKeep the first step focused.\nShip the second step safely.";
    const range = findUniqueAssistantRange(quote);
    expect(range).not.toBeNull();
    expect(range?.toString().replace(/\s/gu, "")).toBe(
      quote.replace(/\s/gu, ""),
    );
  });

  it("still rejects normalized block text that occurs more than once", () => {
    document.body.innerHTML = `
      ${assistant("<p>First line</p><p>Second line</p>")}
      ${assistant("<p>First line</p><p>Second line</p>")}`;

    expect(findUniqueAssistantRange("First line\nSecond line")).toBeNull();
  });

  it("ignores a retained copy inside an inactive BB tab", () => {
    document.body.innerHTML = `
      <section hidden>${assistant("<p>Unique tab passage.</p>")}</section>
      <section>${assistant("<p>Unique tab passage.</p>")}</section>`;

    expect(findUniqueAssistantRange("Unique tab passage.")?.toString()).toBe(
      "Unique tab passage.",
    );
  });
});

it("restores the active draft when BB remounts the content script", () => {
  document.body.innerHTML = assistant(
    "<h2>Implementation plan</h2><p>Keep <em>this exact</em> passage.</p>",
  );
  const originalCss = globalThis.CSS;
  const originalHighlight = globalThis.Highlight;
  const registry = new Map<string, Highlight>();
  class FakeHighlight {
    readonly ranges: readonly AbstractRange[];
    constructor(...ranges: AbstractRange[]) {
      this.ranges = ranges;
    }
  }
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { ...(originalCss ?? {}), highlights: registry },
  });
  Object.defineProperty(globalThis, "Highlight", {
    configurable: true,
    value: FakeHighlight,
  });

  const cleanupFirstMount = quoteHighlights.mount(9);
  let cleanupActiveMount = cleanupFirstMount;
  try {
    const selectionRange = document.createRange();
    const heading = document.querySelector("h2")?.firstChild;
    const paragraph = document.querySelector("p");
    if (!heading || !paragraph?.lastChild)
      throw new Error("Missing selection fixture");
    selectionRange.setStart(heading, 0);
    selectionRange.setEnd(
      paragraph.lastChild,
      paragraph.lastChild.textContent?.length ?? 0,
    );
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(selectionRange);
    const quote = "Implementation plan\nKeep this exact passage.";
    quoteHighlights.captureSelection("item-1", "thread-1", quote);

    const draft: FeedbackDraft = {
      threadId: "thread-1",
      overallFeedback: "",
      updatedAt: new Date(0).toISOString(),
      items: [
        {
          id: "item-1",
          messageId: "message-1",
          sourceSeqEnd: 1,
          quote,
          body: "Retain this.",
          createdAt: new Date(0).toISOString(),
        },
      ],
    };
    const before = document.querySelector("[data-markdown-preview]")?.innerHTML;
    quoteHighlights.setDraft(draft);

    const highlight = registry.get(
      "quote-feedback-quote-9",
    ) as unknown as FakeHighlight;
    expect(highlight.ranges).toHaveLength(1);
    expect((highlight.ranges[0] as Range).toString().replace(/\s/gu, "")).toBe(
      quote.replace(/\s/gu, ""),
    );
    // Single resting style: the red strike-through registry is gone.
    expect([...registry.keys()]).toEqual(["quote-feedback-quote-9"]);
    expect(
      document.querySelector("[data-quote-feedback-highlights]")?.textContent,
    ).not.toContain("line-through");
    expect(document.querySelector("[data-markdown-preview]")?.innerHTML).toBe(
      before,
    );

    cleanupFirstMount();
    cleanupActiveMount = quoteHighlights.mount(10);
    const restored = registry.get(
      "quote-feedback-quote-10",
    ) as unknown as FakeHighlight;
    expect(restored.ranges).toHaveLength(1);
    expect((restored.ranges[0] as Range).toString().replace(/\s/gu, "")).toBe(
      quote.replace(/\s/gu, ""),
    );

    quoteHighlights.setDraft({ ...draft, items: [] });
    expect(registry.size).toBe(0);
  } finally {
    cleanupActiveMount();
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      value: originalCss,
    });
    Object.defineProperty(globalThis, "Highlight", {
      configurable: true,
      value: originalHighlight,
    });
  }
  expect(
    document.querySelector("[data-quote-feedback-highlights]"),
  ).toBeNull();
});
