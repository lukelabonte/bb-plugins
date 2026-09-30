# Inline Feedback

Turn passages from an assistant response into one clear revision request. Mark comments and removals while you read, keep them highlighted across navigation, add overall feedback, and send the full batch to the same thread. Drafts stay on your BB server; no external service or account is required.

## Review as you read

Select exact text in an assistant response and choose **Feedback** from BB's native selection menu. Add a **Comment** or mark the passage for **Remove** without leaving the thread. Return saves a comment, while Shift+Return inserts a new line.

## Keep the source visible

Staged comments remain marked with a yellow underline and removals with a red strike-through. The compact feedback editor leaves the surrounding response visible. After navigation or a page reload, Inline Feedback restores a highlight only when it finds one unique visible assistant-text match, while tolerating Markdown layout whitespace. Ambiguous quotes remain safely stored in the draft without highlighting the wrong passage.

## Build one revision request

The collapsed **Feedback** banner appears after the first item. Expand it to edit or remove items, clear the draft, or send everything together. Overall feedback is typed in the thread's normal message box: the expanded banner previews it, and **Send feedback** includes it in one numbered message to the same thread, then clears both the draft and the message box. (Enter in the message box still sends a normal message; overall feedback only joins the batch via **Send feedback**.)

## Storage and requirements

Each thread has its own server-side draft. Drafts survive navigation, browser reloads, and BB restarts. Inline Feedback uses no external service and requires no additional account. It supports BB 0.44+.

## Focused scope

Inline Feedback annotates assistant-message text. It does not annotate user messages or files, and it never changes the original response. A **Remove** item asks the agent to omit or disregard the quoted material in its revision; it does not delete text from thread history. Browsers without the CSS Custom Highlight API retain feedback capture, persistence, review, and delivery without passage coloring.
