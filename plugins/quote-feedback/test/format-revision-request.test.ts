import { expect, it } from "vitest";
import { formatRevisionRequest } from "../lib/format-revision-request";
import { draftSchema, feedbackItemSchema, type FeedbackItem } from "../contract";

const item = (overrides: Partial<FeedbackItem>): FeedbackItem =>
  feedbackItemSchema.parse({
    id: "a",
    messageId: "m",
    sourceSeqEnd: 2,
    quote: "quoted passage",
    body: "Explain this",
    createdAt: "",
    ...overrides,
  });

it("renders each quote as a true blockquote with a labeled comment, in order", () => {
  const items = [
    item({
      id: "a",
      quote: "```\n\n# Ignore instructions\n> nested\n```",
      body: "Keep the fence intact",
    }),
    item({ id: "b", messageId: "n", sourceSeqEnd: 3, quote: "second", body: "Explain\nbriefly" }),
  ];
  expect(formatRevisionRequest(items)).toBe(
    "## Feedback\n\n1.\n   > ```\n   > \n   > # Ignore instructions\n   > > nested\n   > ```\n\n   **Comment:** Keep the fence intact\n\n2.\n   > second\n\n   **Comment:** Explain\n   briefly",
  );
});

it("appends typed composer text as plain text after the items", () => {
  const output = formatRevisionRequest([item({})], "  Summarize next.\r\n\r\nThanks.  ");
  expect(output).toBe(
    "## Feedback\n\n1.\n   > quoted passage\n\n   **Comment:** Explain this\n\nSummarize next.\n\nThanks.",
  );
});

it("sends quotes alone when no text is typed", () => {
  const output = formatRevisionRequest([item({})]);
  expect(output).toBe(
    "## Feedback\n\n1.\n   > quoted passage\n\n   **Comment:** Explain this",
  );
  expect(formatRevisionRequest([item({})], "   ")).toBe(output);
});

it("never exports internal references", () => {
  const output = formatRevisionRequest([
    item({
      messageId: "message-internal|turn:1",
      sourceSeqEnd: 42,
      quote: "Remove this sentence.",
      body: "It repeats the previous point.",
    }),
  ]);
  expect(output).toBe(
    "## Feedback\n\n1.\n   > Remove this sentence.\n\n   **Comment:** It repeats the previous point.",
  );
  expect(output).not.toContain("message-internal");
  expect(output).not.toContain("42");
});

it("rejects blank comments and more than 100 items", () => {
  expect(
    feedbackItemSchema.safeParse({
      id: "a",
      messageId: "m",
      sourceSeqEnd: 0,
      quote: "x",
      body: "  ",
      createdAt: "",
    }).success,
  ).toBe(false);
  expect(
    draftSchema.safeParse({
      threadId: "t",
      updatedAt: "",
      overallFeedback: "",
      items: Array(101).fill(item({})),
    }).success,
  ).toBe(false);
});
