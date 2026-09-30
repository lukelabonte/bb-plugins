# Inline Feedback

Turn passages from an assistant response into one clear revision request. Mark comments and removals while you read, keep them highlighted across navigation, add overall feedback, and send the full batch to the same thread.

A from-scratch rebuild of the bb-community plugin [Inline Review](https://github.com/rdanhau/bb-plugin-inline-review) (MIT, rdanhau), which is gated to BB 0.43.x. This rebuild targets BB 0.44+ with feature parity; credit for the original design goes to the upstream author.

## Use it

1. Select exact text in an assistant response and choose **Feedback** from BB's selection menu. (The plugin also trims the native **Add to chat** entry from that popover; the per-message hover action bar is untouched.)

Note: the Plugin SDK has no selection-menu customization API, so the trim works at the DOM level from the plugin's content script, keyed off the popover's `role="dialog"` portal container. If a BB update changes that markup, the entry simply reappears.
2. Add a **Comment** (Return saves, Shift+Return inserts a new line) or mark the passage for **Remove**.
3. Staged comments keep a yellow underline and removals a red strike-through. After navigation or a reload, a highlight restores only when the passage has one unique visible match; ambiguous quotes stay stored without highlighting the wrong passage.
4. Expand the collapsed **Feedback** banner above the composer to edit or remove items, clear the draft (confirmed), or send. Type overall feedback in the thread's normal message box — the expanded banner previews it, and it joins the batch when you send. (Enter in the message box still sends a normal message; overall feedback only joins the batch via **Send feedback**.)
5. **Send feedback** delivers one numbered message to the same thread, clears the draft, and clears the message box.

Each thread has its own server-side draft. Drafts survive navigation, browser reloads, and BB restarts. No external service or account is required. Browsers without the CSS Custom Highlight API retain capture, persistence, review, and delivery without passage coloring.

## Scope

Inline Feedback annotates assistant-message text. It does not annotate user messages or files, and it never changes the original response. A **Remove** item asks the agent to omit the quoted material in its revision; it does not delete text from thread history.

## Develop

```sh
npm install
npm test          # vitest: format, highlights, server
npm run typecheck # tsc --noEmit (strict)
npm run sdk:check # bb plugin types --check
npm run build     # bb plugin build
bb plugin install . --yes
bb plugin dev     # rebuild + reload on save
```
