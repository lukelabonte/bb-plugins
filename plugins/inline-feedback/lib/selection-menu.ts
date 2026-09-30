/**
 * Hides BB's built-in "Add to chat" entry in the assistant-text selection
 * popover. The SDK offers no selection-menu customization surface, so this
 * works at the DOM level from the plugin's content script.
 *
 * The same label also appears in each message's hover action bar; that one
 * stays. The popover is portaled to `body` inside a `role="dialog"`
 * container, while the action bar lives inside the message group — the
 * matcher keys on that difference.
 *
 * Popover structure (BB 0.44): the dialog's children are one flex cell per
 * entry; every cell but the first carries its own leading divider span
 * (`span.h-4.w-px.bg-border`). Hiding only the button leaves an empty cell
 * plus the next cell's orphaned divider, so the whole cell is hidden and the
 * first surviving cell's divider goes with it.
 */
export function hideAddToChatInSelectionPopover(root: ParentNode = document) {
  for (const button of root.querySelectorAll("button")) {
    const label =
      button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "";
    if (label !== "Add to chat") continue;
    const dialog = button.closest('[role="dialog"]');
    if (!dialog || button.closest('[class*="group/message"]')) continue;

    const cell: HTMLElement =
      button.parentElement && button.parentElement.parentElement === dialog
        ? button.parentElement
        : button;
    cell.hidden = true;
    cell.style.display = "none";

    const firstVisible = [...dialog.children].find(
      (child): child is HTMLElement =>
        child instanceof HTMLElement &&
        !child.hidden &&
        child.style.display !== "none",
    );
    const divider = firstVisible?.firstElementChild;
    if (
      divider instanceof HTMLElement &&
      divider.tagName === "SPAN" &&
      !divider.textContent?.trim()
    ) {
      divider.style.display = "none";
    }
  }
}
