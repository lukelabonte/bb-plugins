import type { FeedbackItem } from "../contract";

/**
 * Renders staged quotes as the single numbered revision request delivered to
 * the thread. Each passage stays visibly quoted: every line is indented under
 * the item as a blockquote, so blank lines, headings, and Markdown fences in
 * the passage cannot break out of the quote. Typed composer text follows the
 * items as plain prompt text; with nothing typed the quotes travel alone.
 */
export function formatRevisionRequest(
  items: readonly FeedbackItem[],
  typedText = "",
): string {
  const sections = ["## Feedback"];
  items.forEach((item, index) => {
    const quote = item.quote
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => `   > ${line}`)
      .join("\n");
    const body = item.body.trim().replace(/\r\n?/g, "\n").replace(/\n/g, "\n   ");
    sections.push(`${index + 1}.\n${quote}\n\n   **Comment:** ${body}`);
  });
  const typed = typedText.trim().replace(/\r\n?/g, "\n");
  if (typed) sections.push(typed);
  return sections.join("\n\n");
}
