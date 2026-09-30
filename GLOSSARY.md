# Glossary

Domain terms for the bb-plugins repo. Canonical vocabulary; use these terms in code, UI copy, issues, and discussion.

## Inline Feedback (plugins/inline-feedback)

A BB plugin that turns passages from an assistant response into one clear revision request. Rebuild of the bb-community "Inline Review" plugin (which requires BB 0.43.x) for current BB, renamed.

- **Passage** — the exact quoted assistant-message text a feedback item attaches to.
- **Feedback item** — one staged annotation: a Comment or a Removal, attached to a passage.
- **Comment** — a feedback item asking the agent to revise the passage.
- **Removal** — a feedback item asking the agent to omit or disregard the passage. It never deletes text from thread history.
- **Draft** — the per-thread, server-side collection of staged feedback items plus overall feedback. Survives navigation, reloads, and BB restarts.
- **Overall feedback** — freeform text about the response as a whole, not attached to a passage. Typed in the thread's normal message input box and swept into the draft when the revision request is sent; Enter in the input box still sends a normal message.
- **Highlight** — the visible mark on a staged passage: yellow underline for a Comment, red strike-through for a Removal. Restored after navigation only when exactly one unique visible match exists; ambiguous passages stay stored but unhighlighted.
- **Revision request** — the single numbered message delivered to the same thread when the user sends the draft: quotations plus instructions, plus any overall feedback.
