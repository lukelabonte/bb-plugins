import type { FeedbackDraft } from "../contract";

/**
 * Renders a draft as the single numbered revision request delivered to the
 * thread. The selected source stays visibly quoted: every line is indented
 * under the item as a blockquote, so blank lines, headings, and Markdown
 * fences in the passage cannot break out of the quote.
 */
export function formatRevisionRequest(draft: FeedbackDraft): string {
  const sections = ["## Feedback"];
  draft.items.forEach((item, index) => {
    const quote = item.quote
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => `   > ${line}`)
      .join("\n");
    const body = item.body.trim().replace(/\r\n?/g, "\n").replace(/\n/g, "\n   ");

    if (item.kind === "comment") {
      sections.push(`${index + 1}.\n${quote}\n\n   **Comment:** ${body}`);
      return;
    }

    sections.push(
      `${index + 1}. **Remove:**\n${quote}${body ? `\n\n   **Reason:** ${body}` : ""}`,
    );
  });
  if (draft.overallFeedback.trim())
    sections.push(`### Overall feedback\n\n${draft.overallFeedback.trim()}`);
  return sections.join("\n\n");
}
