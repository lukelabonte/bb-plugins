/**
 * Hides BB's built-in "Add to chat" entry in the assistant-text selection
 * popover. The SDK offers no selection-menu customization surface, so this
 * works at the DOM level from the plugin's content script.
 *
 * The same label also appears in each message's hover action bar; that one
 * stays. The popover is portaled to `body` inside a `role="dialog"`
 * container, while the action bar lives inside the message group — the
 * matcher keys on that difference.
 */
export function hideAddToChatInSelectionPopover(root: ParentNode = document) {
  for (const button of root.querySelectorAll("button")) {
    const label =
      button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "";
    if (label !== "Add to chat") continue;
    if (!button.closest('[role="dialog"]')) continue;
    if (button.closest('[class*="group/message"]')) continue;
    button.style.display = "none";
  }
}
