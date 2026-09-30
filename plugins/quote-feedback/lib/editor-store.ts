import type { FeedbackItem, Selection } from "../contract";

export type QuoteEditorRequest =
  | { mode: "create"; selection: Selection }
  | { mode: "edit"; threadId: string; item: FeedbackItem };

let current: QuoteEditorRequest | null = null;
const listeners = new Set<() => void>();

export const quoteEditorStore = {
  getSnapshot: () => current,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  open(request: QuoteEditorRequest) {
    current = request;
    for (const listener of listeners) listener();
  },
  close() {
    if (current === null) return;
    current = null;
    for (const listener of listeners) listener();
  },
};
