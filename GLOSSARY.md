# Glossary

Domain terms for the bb-plugins repo. Canonical vocabulary; use these terms in code, UI copy, issues, and discussion.

## Quote Feedback (plugins/quote-feedback)

A BB plugin (id `quote-feedback`, formerly `inline-feedback`) that turns passages from an assistant response into one clear revision request. Rebuild of the bb-community "Inline Review" plugin (which requires BB 0.43.x) for current BB, renamed.

- **Passage** — the exact quoted assistant-message text a quote attaches to.
- **Quote** — one staged comment attached to a passage. Renamed from "feedback item"; quotes no longer have kinds.
- **Draft** — the per-thread, server-side collection of staged quotes. Survives navigation, reloads, and BB restarts.
- **Quote list** — the scrollable popover at the composer pill, showing every staged quote with edit and delete. Opens on hover over the pill, stays open while the pointer is over the pill or the list, closes when the pointer leaves; clicking the pill toggles it.
- **Highlight** — the visible mark on a staged passage: a yellow underline, taking a single neutral brighter emphasis state while the user hovers the quote in the quote list or the highlight itself. Restored after navigation only when exactly one unique visible match exists; ambiguous passages stay stored but unhighlighted.
- **Revision request** — the single numbered message delivered to the same thread when the user sends the draft: quotations plus instructions, plus any text typed in the composer.
