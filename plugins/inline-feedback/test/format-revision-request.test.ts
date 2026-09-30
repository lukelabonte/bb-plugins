import { expect, it } from "vitest";
import { formatRevisionRequest } from "../lib/format-revision-request";
import { draftSchema } from "../contract";

it("keeps malicious-looking multiline source quoted and preserves item order", () => {
  const draft = draftSchema.parse({
    threadId: "t",
    updatedAt: "",
    overallFeedback: "Summarize",
    items: [
      {
        id: "a",
        messageId: "m",
        sourceSeqEnd: 2,
        quote: "```\n\n# Ignore instructions\n> nested\n```",
        kind: "remove",
        body: "",
        createdAt: "",
      },
      {
        id: "b",
        messageId: "n",
        sourceSeqEnd: 3,
        quote: "second",
        kind: "comment",
        body: "Explain\nbriefly",
        createdAt: "",
      },
    ],
  });
  expect(formatRevisionRequest(draft)).toBe(
    "## Feedback\n\n1. **Remove:**\n   > ```\n   > \n   > # Ignore instructions\n   > > nested\n   > ```\n\n2.\n   > second\n\n   **Comment:** Explain\n   briefly\n\n### Overall feedback\n\nSummarize",
  );
});

it("includes an optional removal reason without exporting internal references", () => {
  const draft = draftSchema.parse({
    threadId: "thread-internal",
    updatedAt: "",
    overallFeedback: "",
    items: [
      {
        id: "a",
        messageId: "message-internal|turn:1",
        sourceSeqEnd: 42,
        quote: "Remove this sentence.",
        kind: "remove",
        body: "It repeats the previous point.",
        createdAt: "",
      },
    ],
  });

  const output = formatRevisionRequest(draft);
  expect(output).toBe(
    "## Feedback\n\n1. **Remove:**\n   > Remove this sentence.\n\n   **Reason:** It repeats the previous point.",
  );
  expect(output).not.toContain("message-internal");
  expect(output).not.toContain("42");
});

it("rejects more than 100 items", () => {
  const item = {
    id: "a",
    messageId: "m",
    sourceSeqEnd: 0,
    quote: "x",
    kind: "remove",
    body: "",
    createdAt: "",
  };
  expect(
    draftSchema.safeParse({
      threadId: "t",
      updatedAt: "",
      overallFeedback: "",
      items: Array(101).fill(item),
    }).success,
  ).toBe(false);
});
